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

    // Replace the map mount content
    mapMount.innerHTML = "";
    mapMount.appendChild(mapContainer);

    // Initialize Leaflet Map
    const map = L.map(mapEl, {
      center: [39.8283, -98.5795], // Center of US
      zoom: 4,
      minZoom: 3,
      maxZoom: 8,
      maxBounds: [[5, -180], [72, -50]],    // keep US in view incl. AK/HI/PR + Gulf/EPAC storms
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

    // Real active storms are plotted by ops-center.js (hydrateStorms -> plotStorms)
    // from the live NHC proxy. No mock hazard pins.

    // Clickable state GeoJSON layer is added by ops-center.js once states.json loads
    // (it owns the state data, severity choropleth, and recovery drawer).

    console.log("Professional FEMA Hazard Map initialized successfully.");
    
    // Dispatch event for other scripts to know map is ready
    window.femaMap = map;
    window.dispatchEvent(new Event('fema-map-ready'));
  }

})();
