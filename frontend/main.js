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
let currentData = null;


// --------------------------------------------------
// LOAD PORTS
// --------------------------------------------------

fetch('/api/ports')
.then(r => r.json())
.then(data => {

    ports = data || [];

    ports.forEach(p => {

        const m = L.circleMarker([p.lat, p.lon], {
            radius: 6,
            fillColor: '#1976D2',
            color: '#0d47a1',
            weight: 2,
            opacity: 0.9,
            fillOpacity: 0.85
        }).addTo(map);

        m.bindPopup(`${p.name} (${p.region || 'Unknown'})`);

        m.on('click', () => onPortClick(p));

        markers[p.id] = m;
    });

});


// --------------------------------------------------
// PORT SELECTION
// --------------------------------------------------

function onPortClick(p){

    if(!origin){

        origin = p.id;

        markers[p.id].setStyle({
            fillColor:'#4CAF50',
            color:'#2E7D32',
            radius:8,
            weight:3
        });

        markers[p.id].bindPopup(`🟢 Origin: ${p.name}`).openPopup();

        updateInfo();
    }

    else if(!dest && p.id !== origin){

        dest = p.id;

        markers[p.id].setStyle({
            fillColor:'#F44336',
            color:'#C62828',
            radius:8,
            weight:3
        });

        markers[p.id].bindPopup(`🔴 Destination: ${p.name}`).openPopup();

        updateInfo();

        requestRoutes();
    }

    else{

        clearSelection();
        updateInfo();
    }
}


// --------------------------------------------------
// RESET SELECTION
// --------------------------------------------------

function clearSelection(){

    origin = null;
    dest = null;

    for(let id in markers){

        markers[id].closePopup();

        markers[id].setStyle({
            fillColor:'#1976D2',
            color:'#0d47a1',
            radius:6,
            weight:2
        });
    }

    otherLayers.forEach(l => map.removeLayer(l));
    otherLayers = [];

    Object.values(charts).forEach(c=>{
        if(c) c.destroy();
    });

    charts = {};
}


// --------------------------------------------------
// INFO PANEL
// --------------------------------------------------

function updateInfo(){

    const info = document.getElementById("info");

    const originName =
        origin ? ports.find(p=>p.id==origin)?.name : "—";

    const destName =
        dest ? ports.find(p=>p.id==dest)?.name : "—";

    info.innerHTML = `
        <b>Origin:</b> ${originName}<br>
        <b>Destination:</b> ${destName}
    `;
}


// --------------------------------------------------
// FETCH ROUTES
// --------------------------------------------------

function requestRoutes(){

    fetch(`/api/routes?origin=${origin}&dest=${dest}`)
    .then(r=>r.json())
    .then(showRoutes)
    .catch(e=>console.error("Route error:",e));
}


// --------------------------------------------------
// DRAW ROUTES
// --------------------------------------------------

function showRoutes(data){

    if(!data) return;

    otherLayers.forEach(l=>map.removeLayer(l));
    otherLayers=[];
    animateShip(data?.qaoa?.coords);
    (data.candidates_coords || []).forEach(c=>{
        drawPath(c,{
            color:'#e0e0e0',
            weight:1.2,
            opacity:0.2
        });
    });

    drawPath(data?.classical?.coords,{
        color:'#1976D2',
        weight:5
    });

    drawPath(data?.qaoa?.coords,{
        color:'#7B1FA2',
        weight:4,
        dashArray:'6,3'
    });

    displayComparisons(data);
    displayRouteDetails(data);
}


// --------------------------------------------------
// ANIMATED PATH
// --------------------------------------------------

function drawPath(coords, opts){

    if(!coords || coords.length === 0) return;

    const latlngs = coords.map(c=>[
        Number(c[0]),
        Number(c[1])
    ]);

    let polyline = L.polyline([],opts).addTo(map);

    let i=0;

    const interval=setInterval(()=>{

        polyline.addLatLng(latlngs[i]);

        i++;

        if(i>=latlngs.length){
            clearInterval(interval);
        }

    },80);

    otherLayers.push(polyline);
}


// --------------------------------------------------
// COMPARISON DASHBOARD
// --------------------------------------------------

function displayComparisons(data){

    currentData = data;

    const classical = data.classical || {};
    const qaoa = data.qaoa || {};

    const cm = classical.metrics || {};
    const qm = qaoa.metrics || {};

    const distanceC = classical.cost || 0;
    const distanceQ = qaoa.cost || 0;

    const fuelC = cm.fuel_consumption_kg || 0;
    const fuelQ = qm.fuel_consumption_kg || 0;

    const carbonC = cm.carbon_emissions_kg_co2 || 0;
    const carbonQ = qm.carbon_emissions_kg_co2 || 0;

    const timeC = cm.travel_time_hours || 0;
    const timeQ = qm.travel_time_hours || 0;

    function improvement(c,q){
        if(c === 0) return 0;
        return ((c-q)/c*100).toFixed(2);
    }

    const container = document.getElementById("comparisons");

    container.innerHTML = `

    <h3 style="margin-bottom:10px;">Optimization Analysis Dashboard</h3>

    <table style="
        width:100%;
        border-collapse:collapse;
        font-size:14px;
        text-align:center;
    ">

    <tr style="background:#1976D2;color:white;">
        <th style="padding:8px;">Metric</th>
        <th>Classical</th>
        <th>QAOA</th>
        <th>Improvement</th>
    </tr>

    <tr>
        <td><b>Distance (km)</b></td>
        <td>${distanceC.toFixed(2)}</td>
        <td>${distanceQ.toFixed(2)}</td>
        <td style="color:green;">${improvement(distanceC,distanceQ)}%</td>
    </tr>

    <tr style="background:#f5f5f5;">
        <td><b>Fuel Consumption (kg)</b></td>
        <td>${fuelC.toFixed(2)}</td>
        <td>${fuelQ.toFixed(2)}</td>
        <td style="color:green;">${improvement(fuelC,fuelQ)}%</td>
    </tr>

    <tr>
        <td><b>Carbon Emissions (kg CO₂)</b></td>
        <td>${carbonC.toFixed(2)}</td>
        <td>${carbonQ.toFixed(2)}</td>
        <td style="color:green;">${improvement(carbonC,carbonQ)}%</td>
    </tr>

    <tr style="background:#f5f5f5;">
        <td><b>Travel Time (hours)</b></td>
        <td>${timeC.toFixed(2)}</td>
        <td>${timeQ.toFixed(2)}</td>
        <td style="color:green;">${improvement(timeC,timeQ)}%</td>
    </tr>

    </table>

    <div style="margin-top:20px;">
        <canvas id="metricChart"></canvas>
    </div>

    `;

    drawMetricChartFull(
        distanceC,distanceQ,
        fuelC,fuelQ,
        carbonC,carbonQ,
        timeC,timeQ
    );
}
function drawMetricChartFull(
    distanceC,distanceQ,
    fuelC,fuelQ,
    carbonC,carbonQ,
    timeC,timeQ
){

    const ctx=document.getElementById("metricChart");

    if(charts.metric){
        charts.metric.destroy();
    }

    charts.metric=new Chart(ctx,{

        type:"bar",

        data:{

            labels:[
                "Distance",
                "Fuel",
                "Carbon",
                "Travel Time"
            ],

            datasets:[
            {
                label:"Classical",
                data:[
                    distanceC,
                    fuelC,
                    carbonC,
                    timeC
                ],
                backgroundColor:"#1976D2"
            },

            {
                label:"QAOA",
                data:[
                    distanceQ,
                    fuelQ,
                    carbonQ,
                    timeQ
                ],
                backgroundColor:"#7B1FA2"
            }

            ]

        },

        options:{
            responsive:true,
            plugins:{
                legend:{
                    position:"top"
                }
            },
            scales:{
                y:{
                    beginAtZero:true
                }
            }
        }

    });
}
//
//live ship route animation
//
function animateShip(coords){

    if(!coords || coords.length === 0) return;

    const shipIcon = L.icon({
        iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
        iconSize: [30,30]
    });

    const latlngs = coords.map(c=>[
        Number(c[0]),
        Number(c[1])
    ]);

    let shipMarker = L.marker(latlngs[0],{icon:shipIcon}).addTo(map);

    let i = 0;

    const interval = setInterval(()=>{

        shipMarker.setLatLng(latlngs[i]);

        i++;

        if(i >= latlngs.length){
            clearInterval(interval);
        }

    },200);

    otherLayers.push(shipMarker);
}

// --------------------------------------------------
// METRIC SWITCHER
// --------------------------------------------------

function renderMetricChart(metric){

    if(!currentData) return;

    const classical=currentData.classical || {};
    const qaoa=currentData.qaoa || {};

    const cm=classical.metrics || {};
    const qm=qaoa.metrics || {};

    let classicalVal=0;
    let qaoaVal=0;
    let label="";

    if(metric==="distance"){
        classicalVal=classical.cost || 0;
        qaoaVal=qaoa.cost || 0;
        label="Distance (km)";
    }

    if(metric==="fuel"){
        classicalVal=cm.fuel_consumption_kg || 0;
        qaoaVal=qm.fuel_consumption_kg || 0;
        label="Fuel Consumption (kg)";
    }

    if(metric==="carbon"){
        classicalVal=cm.carbon_emissions_kg_co2 || 0;
        qaoaVal=qm.carbon_emissions_kg_co2 || 0;
        label="Carbon Emissions (kg CO2)";
    }

    if(metric==="time"){
        classicalVal=cm.travel_time_hours || 0;
        qaoaVal=qm.travel_time_hours || 0;
        label="Travel Time (hours)";
    }

    drawMetricChart(label,classicalVal,qaoaVal);
}


// --------------------------------------------------
// DRAW CHART
// --------------------------------------------------

function drawMetricChart(label,classicalVal,qaoaVal){

    const ctx=document.getElementById("metricChart");

    if(charts.metric){
        charts.metric.destroy();
    }

    charts.metric=new Chart(ctx,{
        type:"bar",
        data:{
            labels:["Classical","QAOA"],
            datasets:[{
                label:label,
                data:[classicalVal,qaoaVal],
                backgroundColor:["#1976D2","#7B1FA2"]
            }]
        },
        options:{
            responsive:true,
            plugins:{
                legend:{display:false}
            },
            scales:{
                y:{beginAtZero:true}
            }
        }
    });
}


// --------------------------------------------------
// QUANTUM OPTIMIZATION SCORE
// --------------------------------------------------

function updateQuantumScore(data){

    const cm = data?.classical?.metrics || {};
    const qm = data?.qaoa?.metrics || {};

    const metrics = [
        "fuel_consumption_kg",
        "carbon_emissions_kg_co2",
        "travel_time_hours"
    ];

    let score = 0;

    metrics.forEach(m=>{
        const c = cm[m] || 0;
        const q = qm[m] || 0;

        if(c > 0){
            score += (c-q)/c;
        }
    });

    score = (score/metrics.length)*100;

    const container = document.getElementById("quantumScore");

    container.innerHTML = `

    <div style="margin-top:10px">

    <b>Quantum Advantage Score</b>

    <div style="
        background:#eee;
        border-radius:10px;
        overflow:hidden;
        height:20px;
        margin-top:6px
    ">

    <div style="
        width:${score}%;
        background:#7B1FA2;
        height:100%;
        color:white;
        text-align:center;
        font-size:12px;
    ">
        ${score.toFixed(2)}%
    </div>

    </div>

    </div>
    `;
}
// --------------------------------------------------
// ROUTE DETAILS
// --------------------------------------------------

function displayRouteDetails(data){

    const container=document.getElementById("routeDetails");

    const path=data?.classical?.path_summary?.path_ids || [];

    const names=path.map(id=>{
        const p=ports.find(x=>x.id==id);
        return p ? p.name : id;
    });

    container.innerHTML=`
        <h4>Route Details</h4>
        <div><b>From:</b> ${data.origin_port || "-"}</div>
        <div><b>To:</b> ${data.dest_port || "-"}</div>
        <div><b>Path:</b> ${names.join(" → ")}</div>
    `;
}
function showShippingHeatmap(){

    const heatPoints = ports.map(p => [
        p.lat,
        p.lon,
        0.5
    ]);

    const heatLayer = L.heatLayer(heatPoints,{
        radius:25,
        blur:15,
        maxZoom:5,
        gradient:{
            0.2:'blue',
            0.4:'cyan',
            0.6:'lime',
            0.8:'yellow',
            1.0:'red'
        }
    });

    heatLayer.addTo(map);

    otherLayers.push(heatLayer);
}
showShippingHeatmap();