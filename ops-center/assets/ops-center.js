/* All Forward — Operations Center · client runtime (Maplibre 3D Globe Edition)
   Loads the static states.json reference, hydrates live public-API data on top,
   and drives the 3D choropleth map + state drawer. Every live call degrades
   gracefully: if a feed is unreachable (CORS/outage), the UI shows a dash and
   the static reference data still renders. */
(function () {
  "use strict";

  var FEMA = "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries";
  var NWS = "https://api.weather.gov/alerts/active";
  var NIFC = "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query?where=1%3D1&returnCountOnly=true&f=json";

  var STATES = [];          // from states.json
  var byCode = {};          // code -> entry
  var byFips = {};          // 2-digit fips -> entry
  var drawerCache = {};     // code -> fetched FEMA declarations
  var STATE_GEO = null;     // GeoJSON object
  var stormMarkers = [];    // Maplibre Markers for storms
  var femaMarkers = [];     // Maplibre Markers for FEMA disasters
  var radarVisible = false;  // WeatherAPI radar visibility state

  // Precise coordinate centers and zoom levels for 3D globe camera flying
  var STATE_CENTERS = {
    AL: { center: [-86.9023, 32.3182], zoom: 5.8 },
    AK: { center: [-152.4044, 61.3707], zoom: 4.2 },
    AZ: { center: [-111.0937, 34.0489], zoom: 5.8 },
    AR: { center: [-92.3731, 34.9697], zoom: 6.0 },
    CA: { center: [-119.4179, 36.7783], zoom: 5.0 },
    CO: { center: [-105.7821, 39.5501], zoom: 6.0 },
    CT: { center: [-72.7575, 41.6032], zoom: 7.8 },
    DE: { center: [-75.5277, 38.9108], zoom: 7.8 },
    DC: { center: [-77.0369, 38.9072], zoom: 9.5 },
    FL: { center: [-81.5158, 27.6648], zoom: 5.5 },
    GA: { center: [-83.6431, 32.1656], zoom: 5.8 },
    HI: { center: [-155.5828, 19.8968], zoom: 6.5 },
    ID: { center: [-114.7420, 44.0682], zoom: 5.5 },
    IL: { center: [-89.3985, 40.6331], zoom: 5.8 },
    IN: { center: [-86.1349, 40.5512], zoom: 5.8 },
    IA: { center: [-93.0977, 42.0115], zoom: 5.8 },
    KS: { center: [-98.4842, 38.5266], zoom: 6.0 },
    KY: { center: [-84.2700, 37.8393], zoom: 6.0 },
    LA: { center: [-91.9623, 31.1695], zoom: 6.0 },
    ME: { center: [-69.4455, 45.2538], zoom: 5.8 },
    MD: { center: [-76.6413, 39.0458], zoom: 7.0 },
    MA: { center: [-71.3824, 42.4072], zoom: 7.5 },
    MI: { center: [-85.6024, 43.3266], zoom: 5.5 },
    MN: { center: [-93.9002, 45.6945], zoom: 5.5 },
    MS: { center: [-89.3985, 32.7416], zoom: 5.8 },
    MO: { center: [-92.2884, 38.4561], zoom: 5.8 },
    MT: { center: [-110.3626, 46.8797], zoom: 5.5 },
    NE: { center: [-99.9018, 41.4925], zoom: 6.0 },
    NV: { center: [-116.4194, 38.8026], zoom: 5.5 },
    NH: { center: [-71.5724, 43.1939], zoom: 7.2 },
    NJ: { center: [-74.4057, 40.0583], zoom: 7.2 },
    NM: { center: [-105.8701, 34.5199], zoom: 5.8 },
    NY: { center: [-74.2179, 42.1657], zoom: 5.8 },
    NC: { center: [-79.0193, 35.7596], zoom: 5.8 },
    ND: { center: [-101.0020, 47.5289], zoom: 6.0 },
    OH: { center: [-82.9071, 40.4173], zoom: 6.0 },
    OK: { center: [-97.0929, 35.5659], zoom: 6.0 },
    OR: { center: [-120.5542, 43.8041], zoom: 5.5 },
    PA: { center: [-77.1945, 41.2033], zoom: 6.2 },
    RI: { center: [-71.4774, 41.5801], zoom: 8.5 },
    SC: { center: [-81.1637, 33.8361], zoom: 6.0 },
    SD: { center: [-99.9018, 44.2998], zoom: 6.0 },
    TN: { center: [-86.5804, 35.5175], zoom: 6.0 },
    TX: { center: [-99.9018, 31.9686], zoom: 4.8 },
    UT: { center: [-111.0937, 39.3210], zoom: 5.8 },
    VT: { center: [-72.5778, 44.5588], zoom: 7.2 },
    VA: { center: [-78.6569, 37.4316], zoom: 5.8 },
    WA: { center: [-120.7401, 47.7511], zoom: 5.5 },
    WV: { center: [-80.9540, 38.5976], zoom: 6.2 },
    WI: { center: [-89.6165, 43.7844], zoom: 5.5 },
    WY: { center: [-107.2903, 43.0760], zoom: 6.0 },
    PR: { center: [-66.5901, 18.2208], zoom: 7.8 }
  };

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
    var blank = !code || !byCode[code];
    var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var hazards = blank ? [] : outlookHazards(code);
    var name = blank ? "" : byCode[code].state;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var end = new Date(today); end.setDate(today.getDate() + 30);
    var rg = document.getElementById("f31-range");
    if (rg) rg.textContent = (blank ? "" : name + " · ") + MON[today.getMonth()] + " " + today.getDate() + " – " + MON[end.getMonth()] + " " + end.getDate();

    var gridStart = new Date(today); gridStart.setDate(today.getDate() - today.getDay());
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

    var ap = document.getElementById("f31-active");
    if (ap) {
      ap.innerHTML = "";
      ap.appendChild(el("h4", null, "Active next 30 days" + (blank ? "" : " — " + name)));
      var actives = hazards.filter(function (h) { return outlookInB(today.getMonth(), h.range) || outlookInB(end.getMonth(), h.range); });
      if (blank) {
        ap.appendChild(el("div", "none", "Select a state above to light up its hazard seasons on the calendar."));
      } else if (!actives.length) {
        ap.appendChild(el("div", "none", "No major hazard seasons active in the next 30 days."));
      } else {
        actives.forEach(function (h) {
          var row = el("div", "ai");
          var dot = el("span", "wkcal-dot"); dot.style.background = OUTLOOK_COLORS[h.haz] || "#9aa3b8"; row.appendChild(dot);
          row.appendChild(el("span", null, hazardLabel(h.haz)));
          row.appendChild(el("span", "pk", MON[h.range[0]] + "–" + MON[h.range[1]]));
          ap.appendChild(row);
        });
      }
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

  function addStateLayer(map) {
    if (!map || !window.maplibregl) return Promise.resolve();
    
    return new Promise(function (resolve) {
      function proceed() {
        fetch("assets/us-states.geojson")
          .then(function (r) { return r.json(); })
          .then(function (geo) {
            // Pre-process GeoJSON features to convert string IDs into integers for robust feature-state management
            geo.features.forEach(function (f) {
              var entry = byFips[f.id];
              f.id = parseInt(f.id, 10);
              if (entry) {
                f.properties.code = entry.code;
              }
            });
            STATE_GEO = geo;

            // Add the states GeoJSON source
            map.addSource('states', {
              type: 'geojson',
              data: STATE_GEO
            });

            // Add Fill layer for coloring states (Choropleth for warnings, highlights for hover & select)
            map.addLayer({
              id: 'states-fill',
              type: 'fill',
              source: 'states',
              paint: {
                'fill-color': [
                  'case',
                  ['boolean', ['feature-state', 'selected'], false], '#d4a843',
                  ['==', ['feature-state', 'level'], 2], '#dc2626',
                  ['==', ['feature-state', 'level'], 1], '#d4a843',
                  '#3a445e'
                ],
                'fill-opacity': [
                  'case',
                  ['boolean', ['feature-state', 'selected'], false], 0.55,
                  ['boolean', ['feature-state', 'hover'], false], 0.45,
                  ['==', ['feature-state', 'level'], 2], 0.62,
                  ['==', ['feature-state', 'level'], 1], 0.55,
                  0.28
                ]
              }
            });

            // Add Line layer for state boundaries
            map.addLayer({
              id: 'states-outline',
              type: 'line',
              source: 'states',
              paint: {
                'line-color': [
                  'case',
                  ['boolean', ['feature-state', 'selected'], false], '#d4a843',
                  ['boolean', ['feature-state', 'hover'], false], '#4fc3f7',
                  ['==', ['feature-state', 'level'], 2], 'rgba(255,255,255,.4)',
                  ['==', ['feature-state', 'level'], 1], 'rgba(255,255,255,.3)',
                  'rgba(240,242,245,.2)'
                ],
                'line-width': [
                  'case',
                  ['boolean', ['feature-state', 'selected'], false], 2.5,
                  ['boolean', ['feature-state', 'hover'], false], 2.0,
                  1.0
                ]
              }
            });

            // Add permanent HTML markers for 2-letter state code labels (no glyphs/external fonts needed!)
            Object.keys(STATE_CENTERS).forEach(function (code) {
              var loc = STATE_CENTERS[code];
              var elLabel = document.createElement('div');
              elLabel.className = 'state-map-label';
              elLabel.textContent = code;
              elLabel.style.cssText = "color: rgba(255,255,255,0.75); font-weight: bold; font-family: var(--sans); font-size: 10px; text-shadow: 0 0 3px #1a1f2e; pointer-events: none; user-select: none;";
              
              new window.maplibregl.Marker({ element: elLabel, anchor: 'center' })
                .setLngLat(loc.center)
                .addTo(map);
            });

            // Interactivity - click to select state and open drawer
            map.on('click', 'states-fill', function (e) {
              if (e.features && e.features.length > 0) {
                var feature = e.features[0];
                var fipsStr = String(feature.id).padStart(2, '0');
                var entry = byFips[fipsStr];
                if (entry) {
                  openDrawer(entry.code);
                }
              }
            });

            // Interactivity - hover styles using feature state
            var hoveredStateId = null;
            map.on('mousemove', 'states-fill', function (e) {
              if (e.features && e.features.length > 0) {
                map.getCanvas().style.cursor = 'pointer';
                var currentId = e.features[0].id;
                
                if (hoveredStateId !== null && hoveredStateId !== currentId) {
                  map.setFeatureState(
                    { source: 'states', id: hoveredStateId },
                    { hover: false }
                  );
                }
                
                hoveredStateId = currentId;
                map.setFeatureState(
                  { source: 'states', id: hoveredStateId },
                  { hover: true }
                );
              }
            });

            map.on('mouseleave', 'states-fill', function () {
              map.getCanvas().style.cursor = '';
              if (hoveredStateId !== null) {
                map.setFeatureState(
                  { source: 'states', id: hoveredStateId },
                  { hover: false }
                );
                hoveredStateId = null;
              }
            });

            // Wire up the WeatherAPI Radar overlay controls
            setupRadarToggle();
            resolve();
          })
          .catch(function (e) {
            console.warn("state geojson unavailable", e);
            resolve();
          });
      }

      if (map.isStyleLoaded()) {
        proceed();
      } else {
        map.once('load', proceed);
      }
    });
  }

  function highlightState(code) {
    var map = window.femaMap;
    if (!map) return;

    // Reset and apply selection states
    Object.keys(byCode).forEach(function (c) {
      var entry = byCode[c];
      var fipsInt = parseInt(entry.fips, 10);
      map.setFeatureState(
        { source: 'states', id: fipsInt },
        { selected: (c === code) }
      );
    });

    if (code && STATE_CENTERS[code]) {
      var loc = STATE_CENTERS[code];
      map.flyTo({
        center: loc.center,
        zoom: loc.zoom,
        essential: true,
        duration: 1500
      });
    } else if (!code) {
      // Zoom out to general US view
      map.flyTo({
        center: [-98.5795, 39.8283],
        zoom: 3.2,
        essential: true,
        duration: 1500
      });
      // Clear FEMA markers on close
      femaMarkers.forEach(function (m) { m.remove(); });
      femaMarkers = [];
    }
  }

  /* ---------- live storm markers (real NHC positions plotted on Maplibre) ---------- */
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
    if (!map || !window.maplibregl) return;
    
    // Clear existing markers
    stormMarkers.forEach(function (m) { m.remove(); });
    stormMarkers = [];
    
    if (!storms || !storms.length) return;
    
    storms.forEach(function (s) {
      if (typeof s.lat !== "number" || typeof s.lon !== "number") return;
      var col = stormColor(s.classification);
      var label = stormLabel(s.classification);
      
      // Create element for custom storm pin
      var elPin = document.createElement('div');
      elPin.className = 'storm-marker';
      elPin.style.cssText = "width: 16px; height: 16px; border-radius: 50%; background: " + col + "; border: 2px solid #fff; box-shadow: 0 0 10px " + col + "; cursor: pointer;";
      
      // Setup Maplibre Marker
      var marker = new window.maplibregl.Marker({ element: elPin })
        .setLngLat([s.lon, s.lat])
        .addTo(map);
        
      var popupHTML = "<div style='color: #f0f2f5; font-family: var(--sans); font-size: 0.85rem; padding: 2px;'>" +
        "<strong style='color: #4fc3f7; font-weight: 700;'>" + s.name + "</strong><br>" +
        label + (s.intensity ? (" · " + s.intensity + " kt") : "") +
        "</div>";
        
      var popup = new window.maplibregl.Popup({ offset: 10 }).setHTML(popupHTML);
      marker.setPopup(popup);
      
      stormMarkers.push(marker);
    });
  }

  /* ---------- live FEMA disasters plotting on Maplibre ---------- */
  function plotFemaDisasters(declarations, entry) {
    var map = window.femaMap;
    if (!map || !window.maplibregl) return;

    // Clear existing FEMA markers
    femaMarkers.forEach(function (m) { m.remove(); });
    femaMarkers = [];

    if (!declarations || !declarations.length) return;

    var stateCode = entry.code;
    var stateLoc = STATE_CENTERS[stateCode] || { center: [-98.5795, 39.8283] };
    var baseCenter = stateLoc.center;

    // Pulse and Maplibre popup style setup if not present
    if (!document.getElementById('fema-pulse-style')) {
      var style = document.createElement('style');
      style.id = 'fema-pulse-style';
      style.textContent = "@keyframes femapulse { 0% { transform: scale(0.5); opacity: 1; } 100% { transform: scale(1.6); opacity: 0; } }" +
        " .maplibregl-popup-content { background: rgba(26, 31, 46, 0.9) !important; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 8px !important; color: #f0f2f5 !important; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5) !important; padding: 12px 16px 10px 16px !important; }" +
        " .maplibregl-popup-anchor-top .maplibregl-popup-tip { border-bottom-color: rgba(26, 31, 46, 0.9) !important; }" +
        " .maplibregl-popup-anchor-bottom .maplibregl-popup-tip { border-top-color: rgba(26, 31, 46, 0.9) !important; }" +
        " .maplibregl-popup-anchor-left .maplibregl-popup-tip { border-right-color: rgba(26, 31, 46, 0.9) !important; }" +
        " .maplibregl-popup-anchor-right .maplibregl-popup-tip { border-left-color: rgba(26, 31, 46, 0.9) !important; }" +
        " .maplibregl-popup-close-button { color: #9aa3b8 !important; font-size: 14px !important; padding: 4px 8px !important; }" +
        " .maplibregl-popup-close-button:hover { background-color: rgba(255, 255, 255, 0.05) !important; color: #ffffff !important; border-radius: 0 8px 0 0 !important; }";
      document.head.appendChild(style);
    }

    // Slice recent declarations (max 10) to avoid visual clutter
    var list = declarations.slice(0, 10);

    list.forEach(function (d, index) {
      // Deterministically offset each disaster marker around the state centroid
      var angle = (index * 2 * Math.PI) / Math.min(list.length, 6);
      var radius = 0.5 + (index * 0.18);
      
      var latOffset = Math.sin(angle) * radius * 0.7;
      var lonOffset = Math.cos(angle) * radius * 0.9;

      // Geographic scaling for larger states
      if (stateCode === 'AK') {
        latOffset *= 4.0;
        lonOffset *= 6.0;
      } else if (stateCode === 'TX' || stateCode === 'CA') {
        latOffset *= 1.8;
        lonOffset *= 1.8;
      }

      var lng = baseCenter[0] + lonOffset;
      var lat = baseCenter[1] + latOffset;

      // FEMA red glowing element
      var elFema = document.createElement('div');
      elFema.className = 'fema-hazard-marker';
      elFema.style.cssText = "position: relative; width: 18px; height: 18px; border-radius: 50%; background: rgba(220, 38, 38, 0.95); border: 2px solid #fff; box-shadow: 0 0 10px rgba(220, 38, 38, 0.8); cursor: pointer;";
      
      // Pulsing secondary ring
      var pulseRing = document.createElement('div');
      pulseRing.style.cssText = "position: absolute; top: -6px; left: -6px; width: 26px; height: 26px; border-radius: 50%; border: 2px solid rgba(220, 38, 38, 0.6); animation: femapulse 2s infinite ease-in-out;";
      elFema.appendChild(pulseRing);

      var marker = new window.maplibregl.Marker({ element: elFema })
        .setLngLat([lng, lat])
        .addTo(map);

      var title = d.declarationTitle || cap(d.incidentType || "Disaster");
      var type = cap(d.incidentType || "Incident");
      var dateStr = fmtDate(d.declarationDate);
      var num = d.disasterNumber;

      var popupHTML = "<div style='font-family: var(--sans); color: #f0f2f5; padding: 4px; font-size: 0.82rem;'>" +
        "<strong style='color: #ef4444; font-weight: 700;'>" + type + " Declaration</strong>" +
        "<div style='font-weight: 600; margin: 4px 0 2px 0; color: #ffffff;'>" + title + "</div>" +
        "<div style='font-size: 0.72rem; color: #9aa3b8;'>FEMA DR-" + num + " · " + dateStr + "</div>" +
        "</div>";

      var popup = new window.maplibregl.Popup({ offset: 12 }).setHTML(popupHTML);
      marker.setPopup(popup);

      femaMarkers.push(marker);
    });
  }

  /* ---------- WeatherAPI.com Weather Radar tiles toggle ---------- */
  function setupRadarToggle() {
    var btn = document.getElementById("toggle-radar");
    if (!btn) return;

    btn.addEventListener("click", function () {
      var map = window.femaMap;
      if (!map) return;

      radarVisible = !radarVisible;

      if (radarVisible) {
        btn.textContent = "📡 Hide Radar";
        btn.style.background = "rgba(13, 148, 136, 0.25)";
        btn.style.borderColor = "#0d9488";

        // Add the WeatherAPI tile source if it hasn't been added yet
        if (!map.getSource('weatherapi-radar')) {
          var key = "c844c9f1a78f4068ba7222653262206"; // User's WeatherAPI Key
          map.addSource('weatherapi-radar', {
            type: 'raster',
            tiles: [
              'https://api.weatherapi.com/v1/map/tiles/precipitation/{z}/{x}/{y}.png?key=' + key
            ],
            tileSize: 256,
            attribution: '© WeatherAPI.com'
          });
        }

        // Insert the radar layer beneath any symbol/label layers to keep labels readable
        if (!map.getLayer('radar-layer')) {
          var layers = map.getStyle().layers;
          var firstLabelId = null;
          for (var i = 0; i < layers.length; i++) {
            if (layers[i].type === 'symbol' || layers[i].id.indexOf('label') !== -1) {
              firstLabelId = layers[i].id;
              break;
            }
          }

          map.addLayer({
            id: 'radar-layer',
            type: 'raster',
            source: 'weatherapi-radar',
            paint: {
              'raster-opacity': 0.65
            }
          }, firstLabelId);
        } else {
          map.setLayoutProperty('radar-layer', 'visibility', 'visible');
        }
      } else {
        btn.textContent = "📡 Show Radar";
        btn.style.background = "var(--surface)";
        btn.style.borderColor = "var(--border)";

        if (map.getLayer('radar-layer')) {
          map.setLayoutProperty('radar-layer', 'visibility', 'none');
        }
      }
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
        var level = {};
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
    var map = window.femaMap;
    if (!map) return;

    Object.keys(byCode).forEach(function (code) {
      var entry = byCode[code];
      var lvl = (entry && level[entry.fips]) || 0;
      var fipsInt = parseInt(entry.fips, 10);
      map.setFeatureState(
        { source: 'states', id: fipsInt },
        { level: lvl }
      );
    });
  }

  function hydrateStorms() {
    fetch("storms.json")
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
    var top = (entry.risk_profile.top_disasters || [])[0] || "";
    return "/strike-pack.html?state=" + entry.code + "&hazard=" + encodeURIComponent(top);
  }

  function loadDeclarations(entry, mount) {
    if (drawerCache[entry.code]) { 
      var cached = drawerCache[entry.code];
      renderDeclarations(cached, mount); 
      plotFemaDisasters(cached.uniq, entry);
      return; 
    }
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
        plotFemaDisasters(uniq, entry);
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
