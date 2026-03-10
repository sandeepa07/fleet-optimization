const map = L.map('map').setView([15, 65], 3);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 10
}).addTo(map);

let ports = [];
let markers = {};
let origin = null;
let dest = null;
let otherLayers = [];
let charts = {};

// --------------------------------------------------
// Load Ports
// --------------------------------------------------

fetch('/api/ports')
.then(r => r.json())
.then(data => {

    ports = data;

    ports.forEach(p => {

        const m = L.circleMarker([p.lat, p.lon], {
            radius: 6,
            fillColor: '#1976D2',
            color: '#0d47a1',
            weight: 2,
            opacity: 0.9,
            fillOpacity: 0.85
        }).addTo(map);

        const popupText = `${p.name} (${p.region || 'Unknown'})`;

        m.bindPopup(popupText);

        m.on('click', () => onPortClick(p));

        markers[p.id] = m;
    });
});


// --------------------------------------------------
// Port Selection
// --------------------------------------------------

function onPortClick(p) {

    if (!origin) {

        origin = p.id;

        markers[p.id].setStyle({
            fillColor: '#4CAF50',
            color: '#2E7D32',
            radius: 8,
            weight: 3,
            fillOpacity: 0.95
        });

        markers[p.id].bindPopup(`🟢 Origin: ${p.name}`).openPopup();

        updateInfo();
    }

    else if (!dest && p.id !== origin) {

        dest = p.id;

        markers[p.id].setStyle({
            fillColor: '#F44336',
            color: '#C62828',
            radius: 8,
            weight: 3,
            fillOpacity: 0.95
        });

        markers[p.id].bindPopup(`🔴 Destination: ${p.name}`).openPopup();

        updateInfo();

        requestRoutes();
    }

    else {

        clearSelection();
        updateInfo();
    }
}


// --------------------------------------------------
// Reset Selection
// --------------------------------------------------

function clearSelection() {

    origin = null;
    dest = null;

    for (let id in markers) {

        markers[id].closePopup();

        markers[id].setStyle({
            fillColor: '#1976D2',
            color: '#0d47a1',
            radius: 6,
            weight: 2,
            fillOpacity: 0.85
        });
    }

    otherLayers.forEach(l => map.removeLayer(l));

    otherLayers = [];

    Object.values(charts).forEach(c => {
        if (c) c.destroy();
    });

    charts = {};
}


// --------------------------------------------------
// Update Origin/Destination UI
// --------------------------------------------------

function updateInfo() {

    const info = document.getElementById('info');

    const originName =
        origin ? ports.find(p => p.id == origin)?.name : '—';

    const destName =
        dest ? ports.find(p => p.id == dest)?.name : '—';

    info.innerHTML =
        `<b>Origin:</b> ${originName}<br><b>Destination:</b> ${destName}`;
}


// --------------------------------------------------
// Fetch Routes
// --------------------------------------------------

function requestRoutes() {

    fetch(`/api/routes?origin=${origin}&dest=${dest}`)

    .then(r => r.json())

    .then(showRoutes)

    .catch(e => alert('Error: ' + e));
}


// --------------------------------------------------
// Draw Routes
// --------------------------------------------------

function showRoutes(data) {

    if (!data) return;

    otherLayers.forEach(l => map.removeLayer(l));
    otherLayers = [];

    const drawPath = (coords, opts) => {

        if (!coords) return;

        const latlngs = coords.map(c => [
            Number(c[0]),
            Number(c[1])
        ]);

        const pl = L.polyline(latlngs, opts).addTo(map);

        otherLayers.push(pl);
    };

    // candidate routes
    (data.candidates_coords || []).forEach(c => {

        drawPath(c, {
            color: '#e0e0e0',
            weight: 1.2,
            opacity: 0.15
        });
    });

    // classical route
    drawPath(data?.classical?.coords, {
        color: '#1976D2',
        weight: 5,
        opacity: 0.95
    });

    // qaoa route
    drawPath(data?.qaoa?.coords, {
        color: '#7B1FA2',
        weight: 4.5,
        opacity: 0.9,
        dashArray: '6,3'
    });

    displayComparisons(data);

    displayRouteDetails(data);
}


// --------------------------------------------------
// Comparison Summary
// --------------------------------------------------

function displayComparisons(data) {

    const classical = data?.classical || {};
    const qaoa = data?.qaoa || {};

    const classicalCost = classical.cost ?? 0;
    const qaoaCost = qaoa.cost ?? 0;

    const costSavings = Math.abs(classicalCost - qaoaCost);

    const container = document.getElementById('comparisons');

    container.innerHTML = `
    <div class="comparison-section">

        <h4>Optimization Summary</h4>

        <div>Classical Distance: ${classicalCost.toFixed(0)} km</div>

        <div>QAOA Distance: ${qaoaCost.toFixed(0)} km</div>

        <div>Difference: ${costSavings.toFixed(0)} km</div>

    </div>
    `;

    if (data.metric_comparison)
        displayMetricComparison(data.metric_comparison, data);
}


// --------------------------------------------------
// Route Details
// --------------------------------------------------

function displayRouteDetails(data) {

    if (!data) return;

    const container = document.getElementById('routeDetails');

    const minCost = data.min_cost ?? 0;
    const maxCost = data.max_cost ?? 0;

    const path = data?.classical?.path_summary?.path_ids || [];

    const names = path.map(id => {

        const p = ports.find(x => x.id == id);

        return p ? p.name : `ID:${id}`;
    });

    container.innerHTML = `
    <h4>Route Details</h4>

    <div><b>From:</b> ${data.origin_port || '-'}</div>

    <div><b>To:</b> ${data.dest_port || '-'}</div>

    <div><b>Cost Range:</b>
        ${minCost.toFixed(0)} — ${maxCost.toFixed(0)} km
    </div>

    <div><b>Path:</b> ${names.join(' → ')}</div>
    `;
}


// --------------------------------------------------
// Metrics Table
// --------------------------------------------------

function displayMetricComparison(metricComparison, data) {

    const container =
        document.getElementById('metricsComparisonContainer') ||
        document.createElement('div');

    container.id = 'metricsComparisonContainer';

    let html = '<h4>Metrics Comparison</h4>';

    for (const [metric, comparison] of Object.entries(metricComparison || {})) {

        const c = comparison?.classical ?? 0;
        const q = comparison?.qaoa ?? 0;
        const d = comparison?.qaoa_delta_pct ?? 0;

        html += `
        <div>

            <b>${metric}</b>

            <div>Classical: ${c.toFixed(2)}</div>

            <div>QAOA: ${q.toFixed(2)}</div>

            <div>Δ: ${d.toFixed(2)}%</div>

        </div>
        `;
    }

    container.innerHTML = html;

    document.getElementById('comparisons').appendChild(container);
}