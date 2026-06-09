/* All Forward — Operations Center · client runtime
   Loads the static states.json reference, hydrates live public-API data on top,
   and drives the choropleth map + state drawer. Every live call degrades
   gracefully: if a feed is unreachable (CORS/outage), the UI shows a dash and
   the static reference data still renders. No API keys are used. */
(function () {
  "use strict";

  var FEMA = "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries";
  var NWS = "https://api.weather.gov/alerts/active";
  var NHC = "https://www.nhc.noaa.gov/CurrentStorms.json";
  var NIFC = "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query?where=1%3D1&returnCountOnly=true&f=json";

  var STATES = [];          // from states.json
  var byCode = {};          // code -> entry
  var byFips = {};          // 2-digit fips -> entry
  var drawerCache = {};     // code -> fetched FEMA declarations
  var STATE_GEO = null;     // L.geoJSON layer (clickable states on the basemap)
  var stateLayers = {};     // code -> Leaflet layer
  var stormLayer = null;    // L.layerGroup of live NHC storm markers

  function $(s, r) { return (r || document).querySelector(s); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function fmtDate(s) { if (!s) return "—"; var d = new Date(s); return isNaN(d) ? "—" : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function hazardLabel(h) { return cap(String(h).replace(/-/g, " ")); }

  /* ---------- boot ---------- */
  function init() {
    startClock();
    buildOutlook(null);
    fetch("states.json")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        STATES = data.states || [];
        STATES.forEach(function (s) { byCode[s.code] = s; byFips[s.fips] = s; });
        exposeStateDrawer();
        populateFormStates();
        renderStateSelector();
        setupOutlookPicker();
        renderFunding();
        return loadMap();
      })
      .then(function () {
        wireMap();
        hydrateLive();
      })
      .catch(function (e) { console.error("ops-center boot failed", e); });

    var ab = $("#drawer-backdrop");
    if (ab) ab.addEventListener("click", closeDrawer);
    var cb = $("#drawer-close");
    if (cb) cb.addEventListener("click", closeDrawer);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });
    document.addEventListener("ops:state-selected", function (e) {
      if (e.detail && e.detail.code) openDrawer(e.detail.code);
    });

    var alertsMod = $('[data-mod="alerts"]');
    if (alertsMod) alertsMod.addEventListener("click", function () {
      var f = $("#alerts");
      if (f) f.scrollIntoView({ behavior: "smooth" });
      var nm = $("#af-name"); if (nm) setTimeout(function () { nm.focus(); }, 450);
    });
  }

  /* ---------- 31-day hazard outlook (week-block calendar, state-aware) ---------- */
  var OUTLOOK_COLORS = { "hurricane": "#dc2626", "tropical-storm": "#dc2626", "wildfire": "#f59e0b", "severe-storm": "#a855f7", "tornado": "#a855f7", "flood": "#0d9488", "drought": "#d4a843", "winter-storm": "#4fc3f7", "mudslide": "#b45309", "earthquake": "#9aa3b8" };
  var OUTLOOK_MIDX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  var OUTLOOK_DEFAULT = { "hurricane": [5, 10], "tropical-storm": [5, 10], "wildfire": [5, 10], "severe-storm": [2, 5], "tornado": [2, 5], "flood": [2, 5], "drought": [5, 8], "winter-storm": [11, 1], "mudslide": [11, 2], "earthquake": null };
  var NATIONAL_SEASONS = [
    { haz: "hurricane", range: [5, 10] }, { haz: "severe-storm", range: [2, 5] },
    { haz: "wildfire", range: [5, 10] }, { haz: "flood", range: [2, 5] },
    { haz: "drought", range: [5, 8] }, { haz: "winter-storm", range: [11, 1] }
  ];
  function outlookInB(m, r) { return r && (r[0] <= r[1] ? (m >= r[0] && m <= r[1]) : (m >= r[0] || m <= r[1])); }
  function outlookParse(str) {
    if (!str) return null;
    var p = String(str).split(/[–-]/).map(function (s) { return s.trim().slice(0, 3).toLowerCase(); });
    var a = OUTLOOK_MIDX[p[0]], b = OUTLOOK_MIDX[p[p.length - 1]];
    return (a == null || b == null) ? null : [a, b];
  }
  function outlookHazards(code) {
    if (code && byCode[code] && byCode[code].risk_profile) {
      var e = byCode[code], pm = e.risk_profile.peak_months || {}, tops = e.risk_profile.top_disasters || Object.keys(pm), seen = {};
      return tops.filter(function (h) { if (seen[h]) return false; seen[h] = 1; return true; })
        .map(function (h) { return { haz: h, range: pm[h] ? outlookParse(pm[h]) : OUTLOOK_DEFAULT[h] }; })
        .filter(function (x) { return x.range; });
    }
    return NATIONAL_SEASONS;
  }
  function buildOutlook(code) {
    var mount = document.getElementById("f31-mount");
    if (!mount) return;
    var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var hazards = outlookHazards(code);
    var name = (code && byCode[code]) ? byCode[code].state : "United States";
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var end = new Date(today); end.setDate(today.getDate() + 30);
    var rg = document.getElementById("f31-range");
    if (rg) rg.textContent = name + " · " + MON[today.getMonth()] + " " + today.getDate() + " – " + MON[end.getMonth()] + " " + end.getDate();

    var gridStart = new Date(today); gridStart.setDate(today.getDate() - today.getDay()); // Sunday of this week
    var weeks = Math.ceil((Math.round((end - gridStart) / 86400000) + 1) / 7);

    var wrap = el("div", "wkcal");
    var hdr = el("div", "wkcal-row wkcal-head");
    ["S", "M", "T", "W", "T", "F", "S"].forEach(function (d) { hdr.appendChild(el("div", "wkcal-wd", d)); });
    wrap.appendChild(hdr);
    for (var w = 0; w < weeks; w++) {
      var row = el("div", "wkcal-row");
      for (var i = 0; i < 7; i++) {
        var d = new Date(gridStart); d.setDate(gridStart.getDate() + w * 7 + i);
        var inWin = d >= today && d <= end, isToday = d.getTime() === today.getTime();
        var cell = el("div", "wkcal-cell" + (inWin ? "" : " out") + (isToday ? " today" : ""));
        cell.appendChild(el("span", "wkcal-dnum", String(d.getDate())));
        if (inWin) {
          var dots = el("div", "wkcal-dots"), m = d.getMonth();
          hazards.forEach(function (h) {
            if (outlookInB(m, h.range)) {
              var dot = el("span", "wkcal-dot"); dot.style.background = OUTLOOK_COLORS[h.haz] || "#9aa3b8"; dot.title = hazardLabel(h.haz); dots.appendChild(dot);
            }
          });
          cell.appendChild(dots);
        }
        row.appendChild(cell);
      }
      wrap.appendChild(row);
    }
    mount.innerHTML = ""; mount.appendChild(wrap);

    var lg = document.getElementById("f31-legend");
    if (lg) {
      lg.innerHTML = "";
      hazards.forEach(function (h) {
        var s = el("span", "f31-lg"); var dot = el("span", "wkcal-dot"); dot.style.background = OUTLOOK_COLORS[h.haz] || "#9aa3b8";
        s.appendChild(dot); s.appendChild(el("span", null, hazardLabel(h.haz))); lg.appendChild(s);
      });
    }
  }
  function setupOutlookPicker() {
    var sel = document.getElementById("f31-state");
    if (!sel) return;
    STATES.forEach(function (s) { var o = el("option", null, s.state); o.value = s.code; sel.appendChild(o); });
    sel.addEventListener("change", function () {
      buildOutlook(sel.value);
      highlightState(sel.value || null);
    });
  }

  /* ---------- header clock ---------- */
  function startClock() {
    var c = $("#ops-clock");
    if (!c) return;
    function tick() {
      var d = new Date();
      c.textContent = d.toLocaleString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) + " ET";
    }
    tick(); setInterval(tick, 1000);
  }

  /* ---------- map load ---------- */
  // The dark basemap is created in fema-hazard-map.js (window.femaMap). We wait for
  // it, then add the clickable states as a real GeoJSON layer so they stay aligned
  // with the basemap on pan/zoom.
  function loadMap() {
    return waitForMap().then(function (map) { if (map) return addStateLayer(map); });
  }

  function waitForMap() {
    return new Promise(function (resolve) {
      if (window.femaMap) return resolve(window.femaMap);
      var done = false;
      function finish() { if (done) return; done = true; resolve(window.femaMap || null); }
      window.addEventListener("fema-map-ready", finish, { once: true });
      var t = setInterval(function () { if (window.femaMap) { clearInterval(t); finish(); } }, 150);
      setTimeout(function () { clearInterval(t); finish(); }, 9000);
    });
  }

  function baseStyle() { return { color: "rgba(240,242,245,.28)", weight: 1, fillColor: "#3a445e", fillOpacity: .3 }; }
  function levelStyle(lvl) {
    if (lvl === 2) return { fillColor: "#dc2626", fillOpacity: .62, color: "rgba(255,255,255,.35)", weight: 1 };
    if (lvl === 1) return { fillColor: "#d4a843", fillOpacity: .55, color: "rgba(255,255,255,.3)", weight: 1 };
    return baseStyle();
  }
  function paintState(layer) {
    if (!layer) return;
    var s = levelStyle(layer._lvl || 0);
    if (layer._selected) s = Object.assign({}, s, { color: "#d4a843", weight: 2.5, fillOpacity: Math.max(s.fillOpacity, .5) });
    layer.setStyle(s);
  }

  function addStateLayer(map) {
    if (!map || !window.L) return Promise.resolve();
    return fetch("assets/us-states.geojson")
      .then(function (r) { return r.json(); })
      .then(function (geo) {
        STATE_GEO = window.L.geoJSON(geo, {
          style: baseStyle,
          onEachFeature: function (feature, layer) {
            var entry = byFips[feature.id];
            if (!entry) { layer.setStyle({ fillOpacity: .1, weight: .5 }); return; } // PR / unmatched
            var code = entry.code;
            layer._code = code; layer._lvl = 0;
            stateLayers[code] = layer;
            // Permanent 2-letter state code, centered in the state.
            layer.bindTooltip(code, { permanent: true, direction: "center", className: "state-label", opacity: 1 });
            layer.on("mouseover", function () { if (!layer._selected) layer.setStyle({ weight: 2, color: "#4fc3f7" }); });
            layer.on("mouseout", function () { paintState(layer); });
            layer.on("click", function () { openDrawer(code); });
          }
        }).addTo(map);
      })
      .catch(function (e) { console.warn("state geojson unavailable", e); });
  }

  function highlightState(code) {
    Object.keys(stateLayers).forEach(function (c) {
      stateLayers[c]._selected = (c === code);
      paintState(stateLayers[c]);
    });
    var ly = stateLayers[code];
    if (ly && ly.bringToFront) ly.bringToFront();
  }

  /* ---------- live storm markers (real NHC positions via the proxy) ---------- */
  function stormColor(c) {
    c = (c || "").toUpperCase();
    if (c === "HU" || c === "MH") return "#dc2626";        // hurricane
    if (c === "TS" || c === "STS") return "#f59e0b";       // tropical/subtropical storm
    return "#2563eb";                                      // depression / potential
  }
  function stormLabel(c) {
    var m = { HU: "Hurricane", MH: "Major Hurricane", TS: "Tropical Storm", TD: "Tropical Depression",
      STS: "Subtropical Storm", SD: "Subtropical Depression", PTC: "Potential Tropical Cyclone", PTS: "Post-Tropical" };
    return m[(c || "").toUpperCase()] || c || "Tropical System";
  }
  function plotStorms(storms) {
    var map = window.femaMap;
    if (!map || !window.L) return;
    if (stormLayer) { map.removeLayer(stormLayer); stormLayer = null; }
    if (!storms || !storms.length) return;
    stormLayer = window.L.layerGroup().addTo(map);
    storms.forEach(function (s) {
      if (typeof s.lat !== "number" || typeof s.lon !== "number") return;
      var col = stormColor(s.classification);
      var label = stormLabel(s.classification);
      window.L.circleMarker([s.lat, s.lon], { radius: 8, color: "#fff", weight: 1.5, fillColor: col, fillOpacity: .95 })
        .addTo(stormLayer)
        .bindTooltip(s.name + " — " + label, { direction: "top" })
        .bindPopup("<strong>" + s.name + "</strong><br>" + label + (s.intensity ? (" · " + s.intensity + " kt") : ""));
    });
  }

  /* ---------- map wiring ---------- */
  function wireMap() {
    exposeStateDrawer();
  }

  function exposeStateDrawer() {
    window.openOpsStateDrawer = openDrawer;
    window.opsStateName = function (code) {
      return byCode[code] ? byCode[code].state : code;
    };
    window.opsFipsToCode = function (fips) {
      return byFips[fips] ? byFips[fips].code : null;
    };
  }

  function renderStateSelector() {
    var head = $(".map-head");
    if (!head || $("#state-brief-select")) return;

    var picker = el("div", "state-brief-picker");
    var label = el("label", null, "State brief");
    label.setAttribute("for", "state-brief-select");

    var controls = el("div", "state-brief-controls");
    var select = document.createElement("select");
    select.id = "state-brief-select";
    select.setAttribute("aria-label", "Select a state recovery brief");

    var empty = el("option", null, "Select a state...");
    empty.value = "";
    select.appendChild(empty);

    STATES.forEach(function (s) {
      var option = el("option", null, s.state);
      option.value = s.code;
      select.appendChild(option);
    });

    var button = el("button", "state-brief-button", "Open brief");
    button.type = "button";

    function openSelected() {
      if (!select.value) {
        select.focus();
        return;
      }
      openDrawer(select.value);
    }

    select.addEventListener("change", openSelected);
    button.addEventListener("click", openSelected);

    controls.appendChild(select);
    controls.appendChild(button);
    picker.appendChild(label);
    picker.appendChild(controls);
    head.appendChild(picker);
  }

  /* ---------- live hydration ---------- */
  function hydrateLive() {
    hydrateAlerts();   // NWS -> choropleth + flood module
    hydrateStorms();   // NHC
    hydrateWildfire(); // NIFC
  }

  function setModule(mod, value, status, isActive) {
    var card = document.querySelector('[data-mod="' + mod + '"]');
    if (!card) return;
    var v = card.querySelector(".value"); if (v) v.innerHTML = value;
    var s = card.querySelector(".status"); if (s && status != null) s.textContent = status;
    if (isActive) card.classList.add("active");
  }

  function hydrateAlerts() {
    fetch(NWS, { headers: { "Accept": "application/geo+json" } })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var feats = j.features || [];
        var level = {};   // fips -> 1 watch, 2 warn
        var floodSevere = 0;
        feats.forEach(function (f) {
          var p = f.properties || {};
          var sev = p.severity || "";
          var warn = (sev === "Extreme" || sev === "Severe");
          var ev = (p.event || "").toLowerCase();
          if (/flood|flash flood|severe|tornado|hurricane|tropical|storm surge/.test(ev)) floodSevere++;
          var same = (p.geocode && p.geocode.SAME) || [];
          var seen = {};
          same.forEach(function (code) {
            var fips = String(code).slice(1, 3);
            if (seen[fips]) return; seen[fips] = 1;
            var lv = warn ? 2 : 1;
            if (!level[fips] || lv > level[fips]) level[fips] = lv;
          });
        });
        applyChoropleth(level);
        setModule("flood", String(floodSevere), floodSevere ? "active flood/severe alerts" : "no active flood/severe alerts");
        var stamp = $("#map-updated");
        if (stamp) stamp.textContent = "Live alert layer · updated " + new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      })
      .catch(function (e) {
        console.warn("NWS alerts unavailable", e);
        setModule("flood", "—", "feed unavailable");
        var stamp = $("#map-updated"); if (stamp) stamp.textContent = "Live alert layer unavailable — showing baseline map";
      });
  }

  function applyChoropleth(level) {
    // level: fips -> 1 (watch) | 2 (warning). Recolor the GeoJSON state layer.
    Object.keys(stateLayers).forEach(function (code) {
      var entry = byCode[code];
      var lvl = (entry && level[entry.fips]) || 0;
      stateLayers[code]._lvl = lvl;
      paintState(stateLayers[code]);
    });
  }

  function hydrateStorms() {
    // NHC blocks browser CORS, so go through our server-side proxy. Real count;
    // genuinely 0 in the off-season (not a failure dash).
    fetch("/.netlify/functions/storms")
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.count == null) throw new Error(j.error || "no count");
        var n = j.count;
        var status = n ? (n + " active tropical system" + (n > 1 ? "s" : "")) : "no active tropical systems";
        setModule("storms", String(n), status, n > 0);
        plotStorms(j.storms || []);
      })
      .catch(function (e) {
        console.warn("storms unavailable", e);
        setModule("storms", "—", "feed unavailable");
      });
  }

  function hydrateWildfire() {
    fetch(NIFC)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var n = (j && (j.count != null ? j.count : (j.features ? j.features.length : null)));
        if (n == null) throw new Error("no count");
        setModule("wildfire", n.toLocaleString(), "active wildland incidents");
      })
      .catch(function (e) {
        console.warn("NIFC unavailable", e);
        setModule("wildfire", "—", "feed unavailable");
      });
  }

  function renderFunding() {
    // Static count: federal recovery programs tracked across jurisdictions.
    var total = 0, cdbg = 0;
    STATES.forEach(function (s) {
      (s.funding_programs || []).forEach(function (p) {
        total++;
        if (/CDBG-DR/i.test(p.program)) cdbg++;
      });
    });
    setModule("funding", total + ' <small>tracked</small>', cdbg + " jurisdictions CDBG-DR eligible");
  }

  /* ---------- drawer ---------- */
  function openDrawer(code) {
    var entry = byCode[code];
    if (!entry) return;
    highlightState(code);
    document.body.classList.add("ops-drawer-open");
    var select = $("#state-brief-select");
    if (select) select.value = code;

    $("#drawer-title").textContent = entry.state;
    $("#drawer-code").textContent = entry.code + " · FIPS " + entry.fips;

    // risk chips
    var hz = $("#d-hazards"); hz.innerHTML = "";
    (entry.risk_profile.top_disasters || []).forEach(function (h) {
      hz.appendChild(el("span", "chip hz", hazardLabel(h)));
    });
    // peak months
    var pk = $("#d-peak"); pk.innerHTML = "";
    var pm = entry.risk_profile.peak_months || {};
    Object.keys(pm).forEach(function (k) {
      var r = el("div", "row");
      r.appendChild(el("span", null, hazardLabel(k)));
      r.appendChild(el("span", "meta", pm[k]));
      pk.appendChild(r);
    });
    // funding
    var fp = $("#d-funding"); fp.innerHTML = "";
    (entry.funding_programs || []).forEach(function (p) {
      var r = el("div", "row");
      var left = el("div");
      left.appendChild(el("div", null, p.program));
      left.appendChild(el("div", "meta", p.agency));
      r.appendChild(left);
      var b = el("span", "badge " + (p.status === "active" ? "active" : "avail"), p.status.replace(/-/g, " "));
      r.appendChild(b);
      fp.appendChild(r);
    });
    // orgs
    var og = $("#d-orgs"); og.innerHTML = "";
    (entry.local_orgs || []).forEach(function (o) {
      var r = el("div", "row");
      var a = el("a", null, o.name); a.href = o.url; a.target = "_blank"; a.rel = "noopener";
      r.appendChild(a);
      og.appendChild(r);
    });
    // CTAs
    var cta = $("#d-cta");
    cta.href = ctaFor(entry);
    var sp = $("#d-statepage");
    sp.href = entry.slug + ".html";
    sp.textContent = "View full " + entry.state + " recovery profile →";
    var cal = $("#d-calendar");
    if (cal) {
      cal.href = "/ops-center/calendar/" + entry.slug + ".html";
      cal.textContent = "View " + entry.state + " hazard & funding calendar →";
    }
    // Sync the 31-day outlook to the selected state.
    buildOutlook(code);
    var fsel = $("#f31-state"); if (fsel) fsel.value = code;

    // live FEMA declarations
    var decl = $("#d-decl");
    decl.innerHTML = '<div class="drawer-loading">Loading FEMA declarations…</div>';
    $("#k-recent").textContent = "—";
    $("#k-total").textContent = "—";
    loadDeclarations(entry, decl);

    $("#drawer").classList.add("open");
    $("#drawer-backdrop").classList.add("open");
  }

  function ctaFor(entry) {
    // Option A routing: send to relevant All Forward manual/service.
    var top = (entry.risk_profile.top_disasters || [])[0] || "";
    // Federal recovery work routes to the Strike Pack offer.
    return "/strike-pack.html?state=" + entry.code + "&hazard=" + encodeURIComponent(top);
  }

  function loadDeclarations(entry, mount) {
    if (drawerCache[entry.code]) { renderDeclarations(drawerCache[entry.code], mount); return; }
    var url = FEMA + "?$filter=" + encodeURIComponent("state eq '" + entry.code + "'") +
      "&$orderby=declarationDate desc&$top=400" +
      "&$select=disasterNumber,declarationType,declarationDate,incidentType,declarationTitle,fyDeclared";
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var rows = (j.DisasterDeclarationsSummaries) || [];
        var seen = {}, uniq = [];
        rows.forEach(function (d) {
          if (seen[d.disasterNumber]) return;
          seen[d.disasterNumber] = 1; uniq.push(d);
        });
        var cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 24);
        var recent = uniq.filter(function (d) { return new Date(d.declarationDate) >= cutoff; });
        var payload = { uniq: uniq, recent: recent };
        drawerCache[entry.code] = payload;
        renderDeclarations(payload, mount);
      })
      .catch(function (e) {
        console.warn("FEMA declarations failed", e);
        mount.innerHTML = '<div class="drawer-loading">FEMA feed unavailable. See the full state profile for stamped historical data.</div>';
      });
  }

  function renderDeclarations(payload, mount) {
    $("#k-recent").textContent = payload.recent.length;
    $("#k-total").textContent = payload.uniq.length;
    mount.innerHTML = "";
    if (!payload.recent.length) {
      mount.innerHTML = '<div class="drawer-loading">No federally declared disasters in the last 24 months.</div>';
      return;
    }
    payload.recent.slice(0, 8).forEach(function (d) {
      var r = el("div", "row");
      var left = el("div");
      left.appendChild(el("div", null, d.declarationTitle || cap(d.incidentType || "Disaster")));
      left.appendChild(el("div", "meta", cap(d.incidentType || "") + " · DR-" + d.disasterNumber + " · " + fmtDate(d.declarationDate)));
      r.appendChild(left);
      r.appendChild(el("span", "badge active", d.declarationType || "DR"));
      mount.appendChild(r);
    });
  }

  function closeDrawer() {
    var d = $("#drawer"); if (d) d.classList.remove("open");
    var b = $("#drawer-backdrop"); if (b) b.classList.remove("open");
    document.body.classList.remove("ops-drawer-open");
    highlightState(null);
  }

  /* ---------- alert form ---------- */
  function populateFormStates() {
    var sel = $("#af-states");
    if (!sel) return;
    STATES.forEach(function (s) {
      var o = el("option", null, s.state); o.value = s.code; sel.appendChild(o);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
