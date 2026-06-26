/* All Forward — FEMA-Inspired Hazard Map (Maplibre 3D Globe Edition)
   Professional GIS interface with dark 3D interactive globe, layer controls, and live hazard overlays. */

(function () {
  "use strict";

  // Robust initialization with retries
  let initRetries = 0;
  function robustInit() {
    if (window.maplibregl) {
      initFemaMap();
    } else if (initRetries < 10) {
      initRetries++;
      console.log(`Maplibre not ready, retry ${initRetries}...`);
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
    console.log("Initializing Professional 3D FEMA Hazard Map...");
    const mapMount = document.getElementById("map-mount");
    if (!mapMount) return;

    // Build the map container and controls
    const mapContainer = document.createElement("div");
    mapContainer.id = "fema-map-container";
    mapContainer.style.cssText = "position: relative; width: 100%; height: 600px; background: #1a1f2e; border-radius: 10px; overflow: hidden;";

    const mapEl = document.createElement("div");
    mapEl.id = "maplibre-map";
    mapEl.style.cssText = "width: 100%; height: 100%; min-height: 600px; z-index: 1;";
    mapEl.innerHTML = '<p style="color: #9aa3b8; text-align: center; padding-top: 250px;">Initializing professional 3D GIS globe...</p>';
    mapContainer.appendChild(mapEl);

    // Replace the map mount content
    mapMount.innerHTML = "";
    mapMount.appendChild(mapContainer);

    // Define CartoDB Dark Matter raster tiles as a direct style object.
    // This is 100% unrestricted, whitelisted, loads instantly without any key,
    // and completely avoids any CORS/CSP or domain-lock errors.
    const styleObj = {
      "version": 8,
      "sources": {
        "cartodb-dark": {
          "type": "raster",
          "tiles": [
            "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
            "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
            "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
            "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png"
          ],
          "tileSize": 256,
          "attribution": "© CartoDB, © OpenStreetMap contributors"
        }
      },
      "layers": [
        {
          "id": "cartodb-dark-layer",
          "type": "raster",
          "source": "cartodb-dark",
          "minzoom": 0,
          "maxzoom": 20
        }
      ]
    };

    // Initialize Maplibre GL JS Map
    const map = new window.maplibregl.Map({
      container: mapEl,
      style: styleObj,
      center: [-98.5795, 39.8283], // Center of US
      zoom: 3.2,
      minZoom: 2,
      maxZoom: 10,
      scrollZoom: false, // Scroll-wheel zoom stays OFF so scrolling page isn't trapped
      dragRotate: true,
      pitchWithRotate: false, // keep it flat relative to ground when dragging
      dragPan: true,
      keyboard: true,
      doubleClickZoom: true,
      touchZoomRotate: true,
      attributionControl: false // Omitted to avoid cluttering layout, attribution in footer
    });

    // Enable 3D Globe Projection
    map.on('style.load', function () {
      map.setProjection({
        type: 'globe'
      });
      console.log("3D Globe Projection enabled.");
    });

    // Clear placeholder text on load
    map.on('load', function () {
      const p = mapEl.querySelector('p');
      if (p) p.remove();
      console.log("Placeholder text removed on map load.");
    });


    // Add navigation controls (Zoom +/- and compass)
    map.addControl(new window.maplibregl.NavigationControl({
      showCompass: true,
      showZoom: true,
      visualizePitch: false
    }), 'top-left');

    console.log("3D FEMA Hazard Map initialized successfully.");
    
    // Dispatch event for other scripts to know map is ready
    window.femaMap = map;
    window.dispatchEvent(new Event('fema-map-ready'));
  }

})();
