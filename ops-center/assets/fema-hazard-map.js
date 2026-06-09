/* All Forward — FEMA-Inspired Hazard Map
   Interactive GIS-style disaster operations dashboard with hazard overlays,
   layer controls, legend, search, and responsive design. */

(function () {
  "use strict";

  // Initialize map on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFemaMap);
  } else {
    initFemaMap();
  }

  function initFemaMap() {
    console.log("Initializing FEMA Hazard Map...");
    const mapMount = document.getElementById("map-mount");
    if (!mapMount) {
      console.error("Map mount not found!");
      return;
    }

    // Build the map container and controls
    const mapContainer = document.createElement("div");
    mapContainer.id = "fema-map-container";
    mapContainer.style.cssText = "position: relative; width: 100%; height: 600px; background: #1a1f2e;";

    // Create the canvas-based map
    const canvas = document.createElement("canvas");
    canvas.id = "fema-map-canvas";
    canvas.style.cssText = "display: block; width: 100%; height: 100%;";
    mapContainer.appendChild(canvas);

    // Add controls overlay
    const controlsOverlay = document.createElement("div");
    controlsOverlay.className = "fema-map-controls";
    controlsOverlay.innerHTML = `
      <div class="fema-toolbar">
        <div class="fema-search-bar">
          <input type="text" id="fema-search" placeholder="Search location..." aria-label="Search location">
          <button id="fema-search-btn" aria-label="Search">🔍</button>
        </div>
        <div class="fema-zoom-controls">
          <button id="fema-zoom-in" title="Zoom in">+</button>
          <button id="fema-zoom-out" title="Zoom out">−</button>
        </div>
      </div>
      <div class="fema-layer-panel">
        <div class="fema-panel-header">
          <h4>Hazard Layers</h4>
          <button id="fema-panel-toggle" aria-label="Toggle layers panel">▼</button>
        </div>
        <div class="fema-panel-content">
          <label class="fema-layer-toggle">
            <input type="checkbox" data-layer="active-fires" checked>
            <span>Active Fires</span>
          </label>
          <label class="fema-layer-toggle">
            <input type="checkbox" data-layer="flood-zones" checked>
            <span>Flood Zones</span>
          </label>
          <label class="fema-layer-toggle">
            <input type="checkbox" data-layer="tornado-watches" checked>
            <span>Tornado Watches</span>
          </label>
          <label class="fema-layer-toggle">
            <input type="checkbox" data-layer="severe-weather" checked>
            <span>Severe Weather</span>
          </label>
          <label class="fema-layer-toggle">
            <input type="checkbox" data-layer="hurricane-track" checked>
            <span>Hurricane Tracks</span>
          </label>
        </div>
      </div>
      <div class="fema-legend">
        <div class="fema-legend-header">Legend</div>
        <div class="fema-legend-items">
          <div class="fema-legend-item">
            <span class="fema-legend-swatch" style="background: #dc2626;"></span>
            <span>Active Fire / High Danger</span>
          </div>
          <div class="fema-legend-item">
            <span class="fema-legend-swatch" style="background: #f59e0b;"></span>
            <span>Fire Warning / Alert</span>
          </div>
          <div class="fema-legend-item">
            <span class="fema-legend-swatch" style="background: #0d9488;"></span>
            <span>Flood Zone / Water Alert</span>
          </div>
          <div class="fema-legend-item">
            <span class="fema-legend-swatch" style="background: #2563eb;"></span>
            <span>Tornado Watch / Storm</span>
          </div>
          <div class="fema-legend-item">
            <span class="fema-legend-swatch" style="background: #a855f7;"></span>
            <span>Severe Weather Alert</span>
          </div>
        </div>
      </div>
    `;
    mapContainer.appendChild(controlsOverlay);

    // Replace the map mount content
    mapMount.innerHTML = "";
    mapMount.appendChild(mapContainer);

    // Initialize the map rendering
    renderFemaMap(canvas);
    wireMapControls();
    console.log("FEMA Hazard Map initialized successfully.");
  }

  function renderFemaMap(canvas) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas resolution
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Draw the map
    drawMapBackground(ctx, rect.width, rect.height);
    drawUSMap(ctx, rect.width, rect.height);
    drawHazardOverlays(ctx, rect.width, rect.height);

    // Redraw on resize
    window.addEventListener("resize", () => {
      const newRect = canvas.getBoundingClientRect();
      canvas.width = newRect.width * dpr;
      canvas.height = newRect.height * dpr;
      ctx.scale(dpr, dpr);
      drawMapBackground(ctx, newRect.width, newRect.height);
      drawUSMap(ctx, newRect.width, newRect.height);
      drawHazardOverlays(ctx, newRect.width, newRect.height);
    });
  }

  function drawMapBackground(ctx, width, height) {
    // Dark neutral basemap (FEMA-style)
    ctx.fillStyle = "#2a3142";
    ctx.fillRect(0, 0, width, height);

    // Subtle grid overlay
    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.lineWidth = 1;
    const gridSize = 60;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  function drawUSMap(ctx, width, height) {
    // Simplified US map representation with state boundaries
    ctx.strokeStyle = "#3a445e";
    ctx.lineWidth = 1.5;
    ctx.fillStyle = "#1f2937";

    // Draw simplified US outline (approximate)
    const centerX = width / 2;
    const centerY = height / 2;
    const scale = 0.0018;

    // Simplified US boundary (very approximate)
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, width * 0.35, height * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Add state grid lines (simplified)
    drawStateGridLines(ctx, centerX, centerY, width, height);
  }

  function drawStateGridLines(ctx, centerX, centerY, width, height) {
    ctx.strokeStyle = "rgba(58, 68, 94, 0.6)";
    ctx.lineWidth = 1;

    // Vertical lines (longitude)
    for (let i = 0; i < 8; i++) {
      const x = centerX - width * 0.3 + (width * 0.6 / 8) * i;
      ctx.beginPath();
      ctx.moveTo(x, centerY - height * 0.25);
      ctx.lineTo(x, centerY + height * 0.25);
      ctx.stroke();
    }

    // Horizontal lines (latitude)
    for (let i = 0; i < 6; i++) {
      const y = centerY - height * 0.25 + (height * 0.5 / 6) * i;
      ctx.beginPath();
      ctx.moveTo(centerX - width * 0.3, y);
      ctx.lineTo(centerX + width * 0.3, y);
      ctx.stroke();
    }
  }

  function drawHazardOverlays(ctx, width, height) {
    const centerX = width / 2;
    const centerY = height / 2;

    // Mock hazard data (simulating real FEMA data)
    const hazards = [
      // Active fires (red)
      { type: "fire", x: 0.15, y: 0.25, intensity: 0.9, color: "#dc2626" },
      { type: "fire", x: 0.18, y: 0.28, intensity: 0.7, color: "#f59e0b" },
      { type: "fire", x: 0.12, y: 0.22, intensity: 0.6, color: "#f59e0b" },

      // Flood zones (blue/teal)
      { type: "flood", x: 0.35, y: 0.45, intensity: 0.8, color: "#0d9488" },
      { type: "flood", x: 0.4, y: 0.5, intensity: 0.5, color: "#06b6d4" },
      { type: "flood", x: 0.32, y: 0.48, intensity: 0.6, color: "#0d9488" },

      // Tornado watches (purple)
      { type: "tornado", x: 0.5, y: 0.35, intensity: 0.85, color: "#a855f7" },
      { type: "tornado", x: 0.48, y: 0.38, intensity: 0.6, color: "#c084fc" },

      // Severe weather (yellow/orange)
      { type: "severe", x: 0.65, y: 0.4, intensity: 0.7, color: "#eab308" },
      { type: "severe", x: 0.68, y: 0.42, intensity: 0.5, color: "#fbbf24" },

      // Hurricane track (blue)
      { type: "hurricane", x: 0.75, y: 0.2, intensity: 0.8, color: "#2563eb" },
      { type: "hurricane", x: 0.78, y: 0.25, intensity: 0.6, color: "#60a5fa" },
    ];

    // Draw hazard points with halos
    hazards.forEach((hazard) => {
      const x = centerX - width * 0.3 + width * 0.6 * hazard.x;
      const y = centerY - height * 0.25 + height * 0.5 * hazard.y;

      // Halo effect
      ctx.fillStyle = hazard.color.replace(")", ", 0.15)").replace("rgb", "rgba");
      ctx.beginPath();
      ctx.arc(x, y, 25 * hazard.intensity, 0, Math.PI * 2);
      ctx.fill();

      // Main point
      ctx.fillStyle = hazard.color;
      ctx.beginPath();
      ctx.arc(x, y, 8 * hazard.intensity, 0, Math.PI * 2);
      ctx.fill();

      // Pulse animation (static representation)
      ctx.strokeStyle = hazard.color.replace(")", ", 0.4)").replace("rgb", "rgba");
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 15 * hazard.intensity, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Draw warning zones (semi-transparent regions)
    drawWarningZones(ctx, centerX, centerY, width, height);
  }

  function drawWarningZones(ctx, centerX, centerY, width, height) {
    // Fire warning zone (southwest)
    ctx.fillStyle = "rgba(220, 38, 38, 0.08)";
    ctx.beginPath();
    ctx.ellipse(
      centerX - width * 0.15,
      centerY - height * 0.05,
      width * 0.12,
      height * 0.15,
      -0.3,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Flood warning zone (southeast)
    ctx.fillStyle = "rgba(13, 148, 136, 0.08)";
    ctx.beginPath();
    ctx.ellipse(
      centerX + width * 0.08,
      centerY + height * 0.08,
      width * 0.15,
      height * 0.12,
      0.2,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Tornado warning zone (central)
    ctx.fillStyle = "rgba(168, 85, 247, 0.08)";
    ctx.beginPath();
    ctx.ellipse(
      centerX + width * 0.05,
      centerY - height * 0.08,
      width * 0.1,
      height * 0.1,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  function wireMapControls() {
    // Search functionality
    const searchBtn = document.getElementById("fema-search-btn");
    const searchInput = document.getElementById("fema-search");
    if (searchBtn) {
      searchBtn.addEventListener("click", () => {
        const query = searchInput?.value || "";
        if (query) {
          console.log("Search for:", query);
          // Placeholder for search logic
        }
      });
    }
    if (searchInput) {
      searchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          searchBtn?.click();
        }
      });
    }

    // Zoom controls
    const zoomIn = document.getElementById("fema-zoom-in");
    const zoomOut = document.getElementById("fema-zoom-out");
    if (zoomIn) {
      zoomIn.addEventListener("click", () => {
        console.log("Zoom in");
      });
    }
    if (zoomOut) {
      zoomOut.addEventListener("click", () => {
        console.log("Zoom out");
      });
    }

    // Layer toggles
    const layerToggles = document.querySelectorAll(".fema-layer-toggle input");
    layerToggles.forEach((toggle) => {
      toggle.addEventListener("change", (e) => {
        const layer = e.target.dataset.layer;
        console.log("Toggle layer:", layer, e.target.checked);
      });
    });

    // Panel toggle
    const panelToggle = document.getElementById("fema-panel-toggle");
    const panelContent = document.querySelector(".fema-panel-content");
    if (panelToggle && panelContent) {
      panelToggle.addEventListener("click", () => {
        panelContent.classList.toggle("fema-panel-collapsed");
        panelToggle.textContent = panelContent.classList.contains("fema-panel-collapsed") ? "▶" : "▼";
      });
    }
  }
})();
