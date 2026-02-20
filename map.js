/**
 * map.js — Biosolids Dataset Inventory
 *
 * Loads US state boundaries (GeoJSON) and a datasets.json file,
 * colors states with available data, and populates a sidebar
 * panel when the user clicks a state.
 * 
 *
 * Each dataset object fields:
 *   name, provider, description, dataType, featureType,
 *   formats (array), temporalExtent,
 *   datasetUrl, metadataUrl, accessNote
 */

(function () {
  "use strict";

  // ── Constants ──────────────────────────────────────────────────
  const GEOJSON_URL = "state_geoms.geojson";
  const DATA_URL    = "datasets.json";

  const STYLE_DEFAULT  = { fillColor: "#ddd9d0", fillOpacity: 0.7, color: "#b8b0a2", weight: 1,   opacity: 1 };
  const STYLE_HAS_DATA = { fillColor: "#3a6b4a", fillOpacity: 0.65, color: "#2d5239", weight: 1,   opacity: 1 };
  const STYLE_HOVER    = { fillColor: "#2d5239", fillOpacity: 0.85, color: "#1e3a27", weight: 1.5, opacity: 1 };
  const STYLE_SELECTED = { fillColor: "#1e3a27", fillOpacity: 0.9,  color: "#0f2018", weight: 2,   opacity: 1 };

  const CONUS_BOUNDS = [[24.5, -124.8], [49.5, -66.9]]; // continental US

  // ── State ──────────────────────────────────────────────────────
  let map, geojsonLayer;
  let datasetsIndex = {};   // { "CA": [...], "TX": [...] }
  let selectedLayer = null;

  // ── Init map ───────────────────────────────────────────────────
  map = L.map("map", {
    center: [38, -96],
    zoom: 4,
    minZoom: 3,
    maxZoom: 10,
    zoomControl: true,
  });

  // CartoDB Positron – clean neutral basemap, no API key needed
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(map);

  // ── Load data then build layer ─────────────────────────────────
  Promise.all([
    fetch(GEOJSON_URL).then(r => r.json()),
    fetch(DATA_URL).then(r => r.json()),
  ])
    .then(([geojson, datasets]) => {
      datasetsIndex = datasets;
      buildLayer(geojson);
    })
    .catch(err => {
      console.error("Failed to load map data:", err);
      const isFileProtocol = window.location.protocol === "file:";
      const msg = isFileProtocol
        ? "You're opening this file directly in a browser (file://).<br><br>Please serve it via a local server or GitHub Pages. Try:<br><code>python3 -m http.server 8000</code>"
        : "Could not load map data. Check the browser console for details.";
      document.getElementById("panel-body").innerHTML =
        `<div class="empty-state"><div class="icon">⚠️</div><p>${msg}</p></div>`;
    });

  // ── Build GeoJSON layer ────────────────────────────────────────
  function buildLayer(geojson) {
    geojsonLayer = L.geoJSON(geojson, {
      style: featureStyle,
      onEachFeature: attachHandlers,
    }).addTo(map);

    map.fitBounds(CONUS_BOUNDS);
  }

  function featureStyle(feature) {
    const abbr = getStateAbbr(feature.properties.name);
    return datasetsIndex[abbr] ? STYLE_HAS_DATA : STYLE_DEFAULT;
  }

  // ── Feature interaction ────────────────────────────────────────
  function attachHandlers(feature, layer) {
    const abbr = getStateAbbr(feature.properties.name);
    const hasData = !!datasetsIndex[abbr];

    layer.on({
      mouseover: function (e) {
        if (layer === selectedLayer) return;
        if (hasData) layer.setStyle(STYLE_HOVER);
        layer.bringToFront();
      },
      mouseout: function (e) {
        if (layer === selectedLayer) return;
        layer.setStyle(hasData ? STYLE_HAS_DATA : STYLE_DEFAULT);
      },
      click: function (e) {
        handleStateClick(feature, layer, abbr, hasData);
      },
    });

    // Simple tooltip with state name
    layer.bindTooltip(feature.properties.name, {
      sticky: true,
      className: "state-tooltip",
      direction: "auto",
    });
  }

  function handleStateClick(feature, layer, abbr, hasData) {
    // Deselect previous
    if (selectedLayer && selectedLayer !== layer) {
      const prevAbbr = getStateAbbr(selectedLayer.feature.properties.name);
      selectedLayer.setStyle(datasetsIndex[prevAbbr] ? STYLE_HAS_DATA : STYLE_DEFAULT);
    }

    // Select this layer
    selectedLayer = layer;
    layer.setStyle(STYLE_SELECTED);
    layer.bringToFront();

    // Zoom to state (with a bit of padding)
    map.fitBounds(layer.getBounds(), { padding: [60, 60], maxZoom: 8 });

    // Update panel
    updatePanel(feature.properties.name, abbr, hasData);
  }

  // ── Sidebar panel ──────────────────────────────────────────────
  function updatePanel(stateName, abbr, hasData) {
    document.getElementById("panel-state-name").textContent = stateName;

    if (!hasData) {
      document.getElementById("panel-hint").textContent = "No dataset available";
      document.getElementById("panel-body").innerHTML = `
        <div class="no-data-state">
          <p>No biosolids dataset has been catalogued for ${stateName} yet.</p>
          <p>If you know of a relevant dataset, please consider contributing to the inventory.</p>
        </div>`;
      return;
    }

    const datasets = datasetsIndex[abbr];
    document.getElementById("panel-hint").textContent =
      `${datasets.length} dataset${datasets.length !== 1 ? "s" : ""} catalogued`;

    const countBadge = `<div class="dataset-count">● ${datasets.length} dataset${datasets.length !== 1 ? "s" : ""}</div>`;
    const cards = datasets.map(renderDatasetCard).join("");
    document.getElementById("panel-body").innerHTML = countBadge + cards;
  }

  function renderDatasetCard(ds) {
    const formatTags = (ds.formats || [])
      .map(f => `<span class="tag">${esc(f)}</span>`)
      .join("");

    const metaLink = ds.metadataUrl
      ? `<a class="btn-link" href="${esc(ds.metadataUrl)}" target="_blank" rel="noopener">↗ Metadata</a>`
      : "";

    const dataLink = ds.datasetUrl
      ? `<a class="btn-link primary" href="${esc(ds.datasetUrl)}" target="_blank" rel="noopener">↓ Access Dataset</a>`
      : "";

    const accessNote = ds.accessNote
      ? `<div class="card-section"><div class="access-note">⚠ ${esc(ds.accessNote)}</div></div>`
      : "";

    return `
    <div class="dataset-card">

      <!-- Title & provider -->
      <div class="card-section">
        <div class="card-title">${esc(ds.name)}</div>
        <div class="card-provider">${esc(ds.provider || "")}</div>
      </div>

      <!-- Description -->
      ${ds.description ? `<div class="card-section"><div class="card-desc">${esc(ds.description)}</div></div>` : ""}

      <!-- Metadata fields -->
      <div class="field-grid">
        ${ds.dataType    ? `<div class="field"><div class="field-label">Data type</div><div class="field-value">${esc(ds.dataType)}</div></div>` : ""}
        ${ds.featureType ? `<div class="field"><div class="field-label">Feature type</div><div class="field-value">${esc(ds.featureType)}</div></div>` : ""}
        ${ds.temporalExtent ? `<div class="field"><div class="field-label">Temporal extent</div><div class="field-value">${esc(ds.temporalExtent)}</div></div>` : ""}
        ${formatTags     ? `<div class="field full"><div class="field-label">Formats</div><div class="field-value">${formatTags}</div></div>` : ""}
      </div>

      <!-- Access note -->
      ${accessNote}

      <!-- Links -->
      ${(dataLink || metaLink) ? `<div class="link-row">${dataLink}${metaLink}</div>` : ""}

    </div>`;
  }

  // ── Helpers ────────────────────────────────────────────────────

  // Escape HTML to prevent XSS from data values
  function esc(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Map full state name → 2-letter abbreviation
  const STATE_ABBR = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
    "California": "CA", "Colorado": "CO", "Connecticut": "CT",
    "Delaware": "DE", "Florida": "FL", "Georgia": "GA", "Hawaii": "HI",
    "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA",
    "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME",
    "Maryland": "MD", "Massachusetts": "MA", "Michigan": "MI",
    "Minnesota": "MN", "Mississippi": "MS", "Missouri": "MO",
    "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
    "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM",
    "New York": "NY", "North Carolina": "NC", "North Dakota": "ND",
    "Ohio": "OH", "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA",
    "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD",
    "Tennessee": "TN", "Texas": "TX", "Utah": "UT", "Vermont": "VT",
    "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
    "Wisconsin": "WI", "Wyoming": "WY",
    "District of Columbia": "DC",
  };

  function getStateAbbr(name) {
    return STATE_ABBR[name] || name;
  }

})();
