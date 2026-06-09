/* All Forward — FEMA-Inspired Hazard Map (Leaflet Edition)
   Professional GIS interface with dark basemap, layer controls, and live hazard overlays. */

(function () {
  "use strict";

  // Robust initialization with retries
  let initRetries = 0;
  function robustInit() {
    if (window.L) {
      initFemaMap();
    } else if (initRetries < 10) {
      initRetries++;
      console.log(`Leaflet not ready, retry ${initRetries}...`);
      setTimeout(robustInit, 500);
    } else {
      const mapMount = document.getElementById("map-mount");
      if (mapMount) mapMount.innerHTML = '<p style="color: #ef4444; text-align: center; padding-top: 250px;">Failed to load map library. Please refresh.</p>';
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", robustInit);
  } else {
    robustInit();
  }

  function initFemaMap() {
    console.log("Initializing Professional FEMA Hazard Map...");
    const mapMount = document.getElementById("map-mount");
    if (!mapMount) return;

    // Build the map container and controls
    const mapContainer = document.createElement("div");
    mapContainer.id = "fema-map-container";
    mapContainer.style.cssText = "position: relative; width: 100%; height: 600px; background: #1a1f2e; border-radius: 10px; overflow: hidden;";

    const mapEl = document.createElement("div");
    mapEl.id = "leaflet-map";
    mapEl.style.cssText = "width: 100%; height: 100%; min-height: 600px; z-index: 1;";
    mapEl.innerHTML = '<p style="color: #9aa3b8; text-align: center; padding-top: 250px;">Initializing professional GIS map...</p>';
    mapContainer.appendChild(mapEl);

    // Add controls overlay (Legend and Panel)
    const controlsOverlay = document.createElement("div");
    controlsOverlay.className = "fema-map-controls";
    controlsOverlay.style.cssText = "position: absolute; inset: 0; pointer-events: none; z-index: 1000;";
    controlsOverlay.innerHTML = `
      <div class="fema-legend" style="position: absolute; bottom: 20px; right: 20px; background: rgba(36, 43, 61, 0.9); border: 1px solid #343d52; border-radius: 8px; padding: 12px; pointer-events: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.5); color: #f0f2f5; font-family: system-ui, sans-serif; font-size: 0.8rem; width: 220px;">
        <div style="font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #9aa3b8; margin-bottom: 10px; border-bottom: 1px solid #343d52; padding-bottom: 6px;">Hazard Legend</div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;"><span style="width: 12px; height: 12px; background: #dc2626; border-radius: 2px; border: 1px solid rgba(255,255,255,0.2);"></span><span>Active Fire / Danger</span></div>
          <div style="display: flex; align-items: center; gap: 8px;"><span style="width: 12px; height: 12px; background: #f59e0b; border-radius: 2px; border: 1px solid rgba(255,255,255,0.2);"></span><span>Fire Warning / Alert</span></div>
          <div style="display: flex; align-items: center; gap: 8px;"><span style="width: 12px; height: 12px; background: #0d9488; border-radius: 2px; border: 1px solid rgba(255,255,255,0.2);"></span><span>Flood Zone / Alert</span></div>
          <div style="display: flex; align-items: center; gap: 8px;"><span style="width: 12px; height: 12px; background: #2563eb; border-radius: 2px; border: 1px solid rgba(255,255,255,0.2);"></span><span>Tornado / Storm Watch</span></div>
          <div style="display: flex; align-items: center; gap: 8px;"><span style="width: 12px; height: 12px; background: #a855f7; border-radius: 2px; border: 1px solid rgba(255,255,255,0.2);"></span><span>Severe Weather Alert</span></div>
        </div>
      </div>
    `;
    mapContainer.appendChild(controlsOverlay);

    // Replace the map mount content
    mapMount.innerHTML = "";
    mapMount.appendChild(mapContainer);

    // Initialize Leaflet Map
    const map = L.map(mapEl, {
      center: [39.8283, -98.5795], // Center of US
      zoom: 4,
      minZoom: 3,
      maxZoom: 8,
      maxBounds: [[15, -180], [72, -50]],   // keep the US in view (incl. AK / HI / PR)
      maxBoundsViscosity: 0.8,
      zoomControl: false,
      attributionControl: false,
      // Interactive map. The clickable states are a real GeoJSON layer (added in
      // ops-center.js), so they pan/zoom WITH the basemap and stay aligned. Scroll-
      // wheel zoom stays OFF so scrolling the page near the map isn't trapped — pan by
      // dragging, zoom with the +/- buttons or double-click.
      scrollWheelZoom: false,
      dragging: true,
      doubleClickZoom: true,
      boxZoom: false,
      touchZoom: true,
      keyboard: true
    });

    // Add Dark Basemap (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(map);

    L.control.zoom({ position: "topleft" }).addTo(map);

    // Add mock hazard layers (simulating real FEMA GIS feeds)
    addHazardLayers(map);

    // Clickable state GeoJSON layer is added by ops-center.js once states.json loads
    // (it owns the state data, severity choropleth, and recovery drawer).

    console.log("Professional FEMA Hazard Map initialized successfully.");
    
    // Dispatch event for other scripts to know map is ready
    window.femaMap = map;
    window.dispatchEvent(new Event('fema-map-ready'));
  }

  function addHazardLayers(map) {
    // Mock data for professional hazard visualization
    const hazards = [
      // Fires (Red)
      { name: "California Wildfire Complex", coords: [38.5, -121.5], color: "#dc2626", radius: 50000 },
      { name: "Oregon Fire Warning", coords: [44.0, -120.5], color: "#f59e0b", radius: 30000 },
      
      // Floods (Teal)
      { name: "Mississippi Basin Flood Watch", coords: [32.5, -91.0], color: "#0d9488", radius: 80000 },
      { name: "Gulf Coast Surge Alert", coords: [29.5, -94.0], color: "#0d9488", radius: 60000 },

      // Tornadoes (Blue)
      { name: "Midwest Tornado Watch", coords: [38.5, -95.5], color: "#2563eb", radius: 100000 },
      { name: "Oklahoma Storm Cell", coords: [35.5, -97.5], color: "#2563eb", radius: 40000 },

      // Severe Weather (Purple)
      { name: "Northeast Severe Weather", coords: [41.0, -74.0], color: "#a855f7", radius: 70000 }
    ];

    hazards.forEach(h => {
      L.circle(h.coords, {
        color: h.color,
        fillColor: h.color,
        fillOpacity: 0.3,
        weight: 1,
        radius: h.radius
      }).addTo(map).bindPopup(`<strong>${h.name}</strong><br>Status: Active Alert`);

      // Add a smaller pulse point
      L.circleMarker(h.coords, {
        radius: 6,
        color: '#fff',
        weight: 1,
        fillColor: h.color,
        fillOpacity: 1
      }).addTo(map);
    });
  }

})();
