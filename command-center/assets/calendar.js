/* All Forward — Command Center Hazard & Funding Calendar.
   Renders national + per-state 12-month hazard season bands from states.json
   (risk_profile.peak_months), plus a "next 30 days" outlook. Evergreen, no APIs. */
(function () {
  "use strict";

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MIDX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  // Fallback typical seasons for hazards a state lists in top_disasters but not in peak_months.
  var DEFAULT_SEASON = {
    "hurricane": "Jun–Nov", "tropical-storm": "Jun–Nov", "wildfire": "Jun–Nov",
    "severe-storm": "Mar–Jun", "tornado": "Mar–Jun", "flood": "Mar–Jun",
    "winter-storm": "Dec–Feb", "drought": "Jun–Sep", "mudslide": "Dec–Mar", "earthquake": ""
  };
  var HAZ_COLOR = {
    "hurricane": "#dc2626", "tropical-storm": "#dc2626", "wildfire": "#f59e0b",
    "severe-storm": "#a855f7", "tornado": "#a855f7", "flood": "#0d9488",
    "winter-storm": "#4fc3f7", "drought": "#d4a843", "mudslide": "#b45309", "earthquake": "#9aa3b8"
  };

  var STATES = [], byCode = {};

  function $(s) { return document.querySelector(s); }
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function label(h) { return String(h).replace(/-/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function color(h) { return HAZ_COLOR[h] || "#9aa3b8"; }

  function parseRange(str) {
    if (!str) return null;
    var parts = String(str).split(/[–-]/).map(function (s) { return s.trim().slice(0, 3).toLowerCase(); });
    if (parts.length === 1) { var m = MIDX[parts[0]]; return m == null ? null : [m, m]; }
    var a = MIDX[parts[0]], b = MIDX[parts[1]];
    if (a == null || b == null) return null;
    return [a, b];
  }
  function inBand(monthIdx, range) {
    if (!range) return false;
    var a = range[0], b = range[1];
    return a <= b ? (monthIdx >= a && monthIdx <= b) : (monthIdx >= a || monthIdx <= b); // wrap (e.g. Nov–Mar)
  }

  // Build the hazard list (with parsed ranges) for a state entry, or national defaults.
  function hazardList(entry) {
    if (entry && entry.risk_profile) {
      var pm = entry.risk_profile.peak_months || {};
      var tops = entry.risk_profile.top_disasters || Object.keys(pm);
      var seen = {};
      return tops.filter(function (h) { if (seen[h]) return false; seen[h] = 1; return true; })
        .map(function (h) {
          var str = pm[h] || DEFAULT_SEASON[h] || "";
          return { haz: h, range: parseRange(str), text: str || "Year-round" };
        });
    }
    return [
      { haz: "hurricane", range: parseRange("Jun–Nov"), text: "Jun–Nov (peak Aug–Oct)" },
      { haz: "severe-storm", range: parseRange("Mar–Jun"), text: "Mar–Jun" },
      { haz: "wildfire", range: parseRange("Jun–Nov"), text: "Jun–Nov (West)" },
      { haz: "flood", range: parseRange("Mar–Jun"), text: "Spring" },
      { haz: "winter-storm", range: parseRange("Dec–Feb"), text: "Dec–Feb" }
    ];
  }

  function renderOutlook(list, nowMonth, isState, name) {
    $("#outlook-title").textContent = "Next 30 days — " + (isState ? name : "National");
    var nm = (nowMonth + 1) % 12;
    var active = list.filter(function (x) { return inBand(nowMonth, x.range) || inBand(nm, x.range); });
    var mount = $("#outlook-list"); mount.innerHTML = "";
    if (!active.length) {
      mount.appendChild(el("span", "outlook-empty", "No major hazard seasons active in the next 30 days for " + (isState ? name : "the U.S.") + "."));
      return;
    }
    active.forEach(function (x) {
      var item = el("div", "outlook-item");
      var d = el("span", "dot"); d.style.background = color(x.haz);
      item.appendChild(d);
      item.appendChild(el("span", null, label(x.haz) + " · " + x.text));
      mount.appendChild(item);
    });
  }

  function renderBands(list, nowMonth, isState, name) {
    $("#bands-title").textContent = isState ? (name + " — hazard seasons") : "12-month hazard seasons";
    var mount = $("#bands-mount"); mount.innerHTML = "";
    if (!list.length) { mount.appendChild(el("span", "outlook-empty", "No seasonal hazards on record.")); return; }

    var table = el("table", "bands");
    var thead = el("thead"), hr = el("tr");
    hr.appendChild(el("th", "haz-h", "Hazard"));
    MONTHS.forEach(function (m, i) {
      var th = el("th", i === nowMonth ? "now-col" : null, m.charAt(0));
      th.title = m;
      hr.appendChild(th);
    });
    hr.appendChild(el("th", null, ""));
    thead.appendChild(hr); table.appendChild(thead);

    var tbody = el("tbody");
    list.forEach(function (x) {
      var tr = el("tr");
      tr.appendChild(el("td", "haz", label(x.haz)));
      for (var i = 0; i < 12; i++) {
        var td = el("td");
        var cell = el("div", "cell" + (i === nowMonth ? " now" : ""));
        if (inBand(i, x.range)) { cell.style.background = color(x.haz); cell.style.opacity = ".82"; }
        td.appendChild(cell);
        tr.appendChild(td);
      }
      tr.appendChild(el("td", "band-range", x.text));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    mount.appendChild(table);
  }

  function render(code) {
    var entry = code ? byCode[code] : null;
    var now = new Date().getMonth();
    var list = hazardList(entry);
    var name = entry ? entry.state : "United States";
    renderOutlook(list, now, !!entry, name);
    renderBands(list, now, !!entry, name);
  }

  function boot() {
    fetch("../states.json")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        STATES = data.states || [];
        STATES.forEach(function (s) { byCode[s.code] = s; });
        var sel = $("#cal-state");
        STATES.forEach(function (s) {
          var o = el("option", null, s.state); o.value = s.code; sel.appendChild(o);
        });
        // Deep-link support: /command-center/calendar/?state=LA
        var q = (location.search.match(/[?&]state=([A-Za-z]{2})/) || [])[1];
        if (q && byCode[q.toUpperCase()]) sel.value = q.toUpperCase();
        sel.addEventListener("change", function () { render(sel.value); });
        render(sel.value);
      })
      .catch(function (e) {
        console.warn("calendar data failed", e);
        $("#outlook-list").innerHTML = '<span class="outlook-empty">Calendar data unavailable.</span>';
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
