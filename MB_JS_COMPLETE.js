// ============ MISSION BUILDER v2.0 - RÉALISTE COMPLET ============

// ============ STATE & CONSTANTS ============
const missionBuilderState = {
    selectedScenario: null,
    waypoints: [],
    actions: {},
    map: null,
    markers: {},
    polyline: null,
    droneMarker: null,
    conditions: {
        wind: 5,
        visibility: 200,
        waves: 1,
        tempWater: 12,
        weather: 'cloudy',
        time: '14:00',
        waterType: 'coastal',
        current: 0.5
    },
    config: 'B',
    payloads: {},
    missionData: null,
    simulation: {
        isRunning: false,
        progress: 0,
        currentSegment: 0,
        events: []
    }
};

// BATTERY & ENERGY CONSTANTS
const BATTERY_CAPACITY_WH = 345.6;
const BATTERY_VOLTAGE = 21.6;

// POWER CONSUMPTION (Watts)
const powerConsumption = {
    hover: 585,
    water: 209,
    airPower: { // interpolated
        50: 600, 70: 700, 100: 800, 160: 900
    },
    actions: {
        hover: 585,
        photo: 80,
        video: 90,
        waterSensors: 15,
        beacon: 50,
        thermal: 80,
        ledSpotlight: 40
    }
};

// DRONE CONFIGS
const droneConfigs = {
    A: { weight: 2.05, maxWeight: 2.05, autonomy: 28, price: 2500 },
    B: { weight: 2.1, maxWeight: 3.0, autonomy: 35, price: 3500 },
    C: { weight: 2.6, maxWeight: 4.5, autonomy: 45, price: 5000 }
};

// ACTION DEFINITIONS
const actionDefinitions = {
    hover: { name: 'Hover', power: 585, duration: 30, unit: 'sec', impact: -1.41 },
    photo: { name: 'Photo 4K', power: 80, duration: 1, unit: 'sec', impact: -0.01 },
    video: { name: 'Vidéo 15s', power: 90, duration: 15, unit: 'sec', impact: -0.04 },
    waterSensors: { name: 'Prélèvement eau', power: 15, duration: 20, unit: 'sec', impact: -0.09 },
    beacon: { name: 'Beacon 2min', power: 50, duration: 120, unit: 'sec', impact: -0.48 },
    thermal: { name: 'Scan thermique', power: 80, duration: 30, unit: 'sec', impact: -0.19 },
    ledSpotlight: { name: 'LED 5min', power: 40, duration: 300, unit: 'sec', impact: -0.96 }
};

// ============ BATTERY FORMULAS ============
function airPowerForSpeed(speed_kmh) {
    if (speed_kmh <= 50) return 600;
    if (speed_kmh <= 70) return 600 + (speed_kmh - 50) * 5;
    if (speed_kmh <= 100) return 700 + (speed_kmh - 70) * (100 / 30);
    return 800 + (speed_kmh - 100) * (100 / 60);
}

function waterPowerForSpeed(speed_kmh) {
    if (speed_kmh <= 9) return 112;
    if (speed_kmh <= 19) return 112 + (speed_kmh - 9) * 9.7;
    return 209 + (speed_kmh - 19) * 19.2;
}

function adjustPowerForWind(power, wind_kmh) {
    const windFactor = wind_kmh / 20;
    return power * (1 + windFactor * 0.08);
}

function adjustPowerForTemp(power, temp_celsius) {
    if (temp_celsius < 5) return power / 0.98;
    if (temp_celsius < 15) return power / 0.92;
    return power;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function energyConsumed(power_W, duration_minutes) {
    return power_W * (duration_minutes / 60);
}

function batteryPercent(energy_Wh, available = BATTERY_CAPACITY_WH) {
    return (energy_Wh / available) * 100;
}

// ============ DETECTION PROBABILITY ============
function detectionProbability(visibility_m, weatherType, hasCamera, hasThermal) {
    let prob = 100 * (visibility_m / 200);

    if (weatherType === 'cloudy') prob *= 0.8;
    if (weatherType === 'light-rain') prob *= 0.6;
    if (weatherType === 'heavy-rain') prob *= 0.4;

    if (hasCamera) prob *= 1.15;
    if (hasThermal) prob *= 1.25;

    return Math.min(prob, 100);
}

// ============ INIT MISSION BUILDER ============
function initMissionBuilder() {
    // Scenario selection
    document.querySelectorAll('.scenario-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.scenario-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            missionBuilderState.selectedScenario = card.getAttribute('data-scenario');
            document.getElementById('mb-continue-step1').disabled = false;
            document.getElementById('mb-continue-step1').style.opacity = '1';
            document.getElementById('mb-continue-step1').style.cursor = 'pointer';
        });
    });

    // Step navigation
    document.getElementById('mb-continue-step1').addEventListener('click', () => showMBStep(2));
    document.getElementById('mb-back-step1').addEventListener('click', () => showMBStep(1));
    document.getElementById('mb-continue-step2').addEventListener('click', () => {
        if (missionBuilderState.waypoints.length > 1) showMBStep(3);
    });
    document.getElementById('mb-back-step2').addEventListener('click', () => showMBStep(2));
    document.getElementById('mb-continue-step3').addEventListener('click', () => showMBStep(4));
    document.getElementById('mb-back-step3').addEventListener('click', () => showMBStep(3));
    document.getElementById('mb-continue-step4').addEventListener('click', () => showMBStep(5));
    document.getElementById('mb-back-step4').addEventListener('click', () => showMBStep(4));
    document.getElementById('mb-launch-simulation').addEventListener('click', launchSimulation);
    document.getElementById('mb-new-mission').addEventListener('click', resetMissionBuilder);
    document.getElementById('mb-export-report').addEventListener('click', exportReport);

    // Condition listeners
    ['wind', 'visibility', 'waves', 'temp', 'weather', 'time', 'water-type', 'current'].forEach(param => {
        const el = document.getElementById(`mb-${param}`);
        if (el) el.addEventListener('change', updateConditionsImpact);
        if (el) el.addEventListener('input', updateConditionsImpact);
    });

    // Config selection
    document.querySelectorAll('input[name="config"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            missionBuilderState.config = e.target.value;
            updateDroneConfig();
        });
    });

    // Payload selection
    document.querySelectorAll('.mb-payload').forEach(checkbox => {
        checkbox.addEventListener('change', updateDroneConfig);
    });
}

// ============ STEP NAVIGATION ============
function showMBStep(stepNum) {
    for (let i = 1; i <= 5; i++) {
        const step = document.getElementById(`mb-step${i}`);
        if (step) step.style.display = stepNum === i ? 'block' : 'none';
    }

    if (stepNum === 2) {
        setTimeout(() => initMapStep(), 100);
    } else if (stepNum === 3) {
        renderActionsStep();
    }
}

// ============ MAP STEP ============
function initMapStep() {
    if (missionBuilderState.map) {
        missionBuilderState.map.remove();
    }

    const mapContainer = document.getElementById('mb-map');
    if (!mapContainer) return;

    missionBuilderState.map = L.map(mapContainer).setView([47.32, 5.04], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19
    }).addTo(missionBuilderState.map);

    // Base marker
    const baseMarker = L.circleMarker([47.32, 5.04], {
        radius: 10, color: '#00e5ff', fillColor: '#00e5ff', fillOpacity: 1, weight: 2
    }).bindPopup('Base').addTo(missionBuilderState.map);

    missionBuilderState.markers = {};
    missionBuilderState.markers.base = baseMarker;
    missionBuilderState.waypoints = [{ lat: 47.32, lng: 5.04, index: 0, type: 'base', speed: 50, altitude: 0 }];
    missionBuilderState.actions = { 0: [] };

    // Click to add waypoint
    missionBuilderState.map.on('click', (e) => {
        addWaypoint(e.latlng.lat, e.latlng.lng);
    });

    // Update waypoints display
    updateWaypointsList();
}

function addWaypoint(lat, lng) {
    const index = missionBuilderState.waypoints.length;
    const waypoint = { lat, lng, index, speed: 60, altitude: 45, type: 'waypoint' };
    missionBuilderState.waypoints.push(waypoint);
    missionBuilderState.actions[index] = [];

    const marker = L.circleMarker([lat, lng], {
        radius: 8, color: '#7c5cff', fillColor: '#7c5cff', fillOpacity: 0.7, weight: 2
    })
        .bindPopup(`WP${index} <br/> <small style="cursor:pointer;" onclick="window.editWaypoint(${index})">Edit</small>`)
        .addTo(missionBuilderState.map);

    missionBuilderState.markers[index] = marker;
    updatePolyline();
    updateWaypointsList();
}

function editWaypoint(index) {
    const wp = missionBuilderState.waypoints[index];
    const newLat = prompt(`Latitude WP${index}:`, wp.lat);
    if (newLat === null) return;

    wp.lat = parseFloat(newLat);
    missionBuilderState.markers[index].setLatLng([wp.lat, wp.lng]);
    updatePolyline();
    updateWaypointsList();
}

function deleteWaypoint(index) {
    if (index === 0) return; // can't delete base
    missionBuilderState.map.removeLayer(missionBuilderState.markers[index]);
    delete missionBuilderState.markers[index];
    missionBuilderState.waypoints.splice(index, 1);
    delete missionBuilderState.actions[index];

    // Re-index
    for (let i = index; i < missionBuilderState.waypoints.length; i++) {
        missionBuilderState.waypoints[i].index = i;
        missionBuilderState.actions[i] = missionBuilderState.actions[i + 1];
        delete missionBuilderState.actions[i + 1];
    }

    updatePolyline();
    updateWaypointsList();
}

function updatePolyline() {
    if (missionBuilderState.polyline) {
        missionBuilderState.map.removeLayer(missionBuilderState.polyline);
    }

    const coords = missionBuilderState.waypoints.map(wp => [wp.lat, wp.lng]);
    missionBuilderState.polyline = L.polyline(coords, {
        color: '#ff6b6b', weight: 2, opacity: 0.5, dashArray: '5,5'
    }).addTo(missionBuilderState.map);
}

function updateWaypointsList() {
    const list = document.getElementById('mb-waypoints-list');
    if (!list) return;

    let totalDist = 0, totalTime = 0, totalEnergy = 0;
    let html = '<div style="font-size: 11px;">';

    for (let i = 1; i < missionBuilderState.waypoints.length; i++) {
        const wp = missionBuilderState.waypoints[i];
        const prevWp = missionBuilderState.waypoints[i - 1];
        const dist = haversineDistance(prevWp.lat, prevWp.lng, wp.lat, wp.lng);
        const time = (dist / wp.speed) * 60; // minutes
        const power = adjustPowerForWind(airPowerForSpeed(wp.speed), missionBuilderState.conditions.wind);
        const energy = energyConsumed(power, time);

        totalDist += dist;
        totalTime += time;
        totalEnergy += energy;

        html += `<div style="background: rgba(124, 92, 255, 0.05); padding: 8px; border-radius: 6px; margin-bottom: 8px;">
            <strong>WP${i}</strong> ${wp.lat.toFixed(3)}°, ${wp.lng.toFixed(3)}°<br/>
            📏 ${dist.toFixed(1)}km | ⏱️ ${time.toFixed(1)}min | ⚡ ${energy.toFixed(1)}Wh
            <br/><button onclick="window.editWaypoint(${i})" style="font-size:10px; padding:2px 4px;">Edit</button>
            <button onclick="window.deleteWaypoint(${i})" style="font-size:10px; padding:2px 4px;">Del</button>
        </div>`;
    }

    // RTH
    const rthWp = missionBuilderState.waypoints[missionBuilderState.waypoints.length - 1];
    const baseWp = missionBuilderState.waypoints[0];
    const rthDist = haversineDistance(rthWp.lat, rthWp.lng, baseWp.lat, baseWp.lng);
    const rthTime = (rthDist / 50) * 60;
    const rthPower = adjustPowerForWind(airPowerForSpeed(50), missionBuilderState.conditions.wind);
    const rthEnergy = energyConsumed(rthPower, rthTime);

    totalDist += rthDist;
    totalTime += rthTime;
    totalEnergy += rthEnergy;

    html += `<div style="background: rgba(0, 229, 255, 0.05); padding: 8px; border-radius: 6px; margin-bottom: 12px; border-left: 3px solid #00e5ff;">
        <strong>RTH (Auto)</strong><br/>
        📏 ${rthDist.toFixed(1)}km | ⏱️ ${rthTime.toFixed(1)}min | ⚡ ${rthEnergy.toFixed(1)}Wh
    </div>`;

    html += '</div>';
    list.innerHTML = html;

    // Update summary
    document.getElementById('mb-total-distance').textContent = totalDist.toFixed(1);
    const mins = Math.floor(totalTime);
    const secs = Math.floor((totalTime % 1) * 60);
    document.getElementById('mb-total-time').textContent = `${mins}:${String(secs).padStart(2, '0')}`;

    const battUsed = batteryPercent(totalEnergy);
    document.getElementById('mb-total-battery').textContent = battUsed.toFixed(1) + '%';
    document.getElementById('mb-battery-remaining').textContent = (100 - battUsed).toFixed(1) + '%';

    // Enable step2 continue if waypoints exist
    if (missionBuilderState.waypoints.length > 1) {
        document.getElementById('mb-continue-step2').disabled = false;
        document.getElementById('mb-continue-step2').style.opacity = '1';
    }

    // Store for later
    missionBuilderState.totalDistance = totalDist;
    missionBuilderState.totalTime = totalTime;
    missionBuilderState.totalEnergy = totalEnergy;
}

// Make functions global for onclick
window.editWaypoint = editWaypoint;
window.deleteWaypoint = deleteWaypoint;

// ============ ACTIONS STEP ============
function renderActionsStep() {
    const container = document.getElementById('mb-actions-container');
    if (!container) return;

    let html = '';
    for (let i = 1; i < missionBuilderState.waypoints.length; i++) {
        const wp = missionBuilderState.waypoints[i];
        html += `<div style="background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 16px;">
            <h4 style="margin: 0 0 12px 0;">📍 Waypoint ${i}</h4>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 12px;">
                <label><input type="checkbox" data-wp="${i}" data-action="hover"> ⏸️ Hover (30s, -1.4%)</label>
                <label><input type="checkbox" data-wp="${i}" data-action="photo"> 📸 Photo 4K (-0.01%)</label>
                <label><input type="checkbox" data-wp="${i}" data-action="video"> 📹 Vidéo 15s (-0.04%)</label>
                <label><input type="checkbox" data-wp="${i}" data-action="waterSensors"> 💧 Eau (20s, -0.09%)</label>
                <label><input type="checkbox" data-wp="${i}" data-action="beacon"> 🔔 Beacon (2min, -0.48%)</label>
                <label><input type="checkbox" data-wp="${i}" data-action="thermal"> 🌡️ Thermique (30s, -0.19%)</label>
                <label><input type="checkbox" data-wp="${i}" data-action="ledSpotlight"> 💡 LED (5min, -0.96%)</label>
            </div>
        </div>`;
    }

    container.innerHTML = html;

    // Add event listeners
    document.querySelectorAll('input[data-action]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const wp = parseInt(e.target.getAttribute('data-wp'));
            const action = e.target.getAttribute('data-action');
            if (e.target.checked) {
                if (!missionBuilderState.actions[wp]) missionBuilderState.actions[wp] = [];
                missionBuilderState.actions[wp].push(action);
            } else {
                missionBuilderState.actions[wp] = missionBuilderState.actions[wp].filter(a => a !== action);
            }
        });
    });
}

// ============ CONDITIONS IMPACT ============
function updateConditionsImpact() {
    missionBuilderState.conditions.wind = parseFloat(document.getElementById('mb-wind').value);
    missionBuilderState.conditions.visibility = parseFloat(document.getElementById('mb-visibility').value);
    missionBuilderState.conditions.waves = parseFloat(document.getElementById('mb-waves').value);
    missionBuilderState.conditions.tempWater = parseFloat(document.getElementById('mb-temp').value);
    missionBuilderState.conditions.weather = document.getElementById('mb-weather').value;
    missionBuilderState.conditions.time = document.getElementById('mb-time').value;
    missionBuilderState.conditions.waterType = document.getElementById('mb-water-type').value;
    missionBuilderState.conditions.current = parseFloat(document.getElementById('mb-current').value);

    // Update displays
    document.getElementById('mb-wind-val').textContent = missionBuilderState.conditions.wind.toFixed(1);
    document.getElementById('mb-visibility-val').textContent = missionBuilderState.conditions.visibility.toFixed(0);
    document.getElementById('mb-waves-val').textContent = missionBuilderState.conditions.waves.toFixed(1);
    document.getElementById('mb-temp-val').textContent = missionBuilderState.conditions.tempWater.toFixed(0);
    document.getElementById('mb-current-val').textContent = missionBuilderState.conditions.current.toFixed(1);

    // Calculate impacts
    const windImpact = (missionBuilderState.conditions.wind / 20) * 8;
    const tempImpact = missionBuilderState.conditions.tempWater < 15 ? 8 : 0;
    const visibilityImpact = Math.max(0, 40 * (1 - missionBuilderState.conditions.visibility / 200));
    const waveImpact = missionBuilderState.conditions.waves > 2 ? 5 : 0;

    document.getElementById('mb-wind-impact').textContent = `Impact: +${windImpact.toFixed(1)}% batterie`;
    document.getElementById('mb-temp-impact').textContent = `Impact: ${tempImpact > 0 ? '-' : '+'}${tempImpact.toFixed(1)}% batterie`;
    document.getElementById('mb-visibility-impact').textContent = `Impact: ${visibilityImpact.toFixed(0)}% détection`;
    document.getElementById('mb-waves-impact').textContent = `Impact: ${waveImpact > 0 ? 'Risque!' : 'Stable'}`;

    // Analysis
    const baseBatt = 100 - batteryPercent(missionBuilderState.totalEnergy || 0);
    const adjustedBatt = baseBatt - windImpact - tempImpact;
    const detection = detectionProbability(
        missionBuilderState.conditions.visibility,
        missionBuilderState.conditions.weather,
        true, true
    );

    document.getElementById('mb-analysis-battery').textContent = `${(100 - batteryPercent(missionBuilderState.totalEnergy || 0)).toFixed(1)}% → ${adjustedBatt.toFixed(1)}% (${(adjustedBatt - (100 - batteryPercent(missionBuilderState.totalEnergy || 0))).toFixed(1)}%)`;
    document.getElementById('mb-analysis-detection').textContent = `${detection.toFixed(0)}% ${detection > 70 ? '(excellent)' : detection > 50 ? '(bon)' : '(faible)'}`;
    document.getElementById('mb-analysis-time').textContent = `${Math.floor(missionBuilderState.totalTime || 0)}min ${Math.floor((missionBuilderState.totalTime % 1) * 60)}s`;
    document.getElementById('mb-analysis-risks').textContent = waveImpact > 0 ? '⚠️ Vagues élevées' : 'Aucun risque majeur';
}

// ============ DRONE CONFIG ============
function updateDroneConfig() {
    const config = missionBuilderState.config;
    const cfg = droneConfigs[config];

    let payloadWeight = 0.3; // Base: Beacon + Camera + Sensors
    document.querySelectorAll('.mb-payload:checked').forEach(checkbox => {
        payloadWeight += parseFloat(checkbox.getAttribute('data-weight'));
    });

    const totalWeight = cfg.weight + payloadWeight;
    document.getElementById('mb-drone-weight').textContent = cfg.weight.toFixed(2);
    document.getElementById('mb-payload-weight').textContent = payloadWeight.toFixed(2);
    document.getElementById('mb-total-weight').textContent = totalWeight.toFixed(2);
    document.getElementById('mb-autonomy-theo').textContent = cfg.autonomy;

    let warnings = '';
    if (totalWeight > cfg.maxWeight) {
        warnings += `<div style="background: rgba(255, 107, 107, 0.1); border-left: 3px solid #ff6b6b; padding: 8px; border-radius: 4px; margin-bottom: 8px; color: #ff6b6b; font-size: 12px;">
            ❌ Dépassement poids! ${totalWeight.toFixed(2)}kg > ${cfg.maxWeight}kg
        </div>`;
    }
    if (totalWeight > 2.5) {
        warnings += `<div style="background: rgba(255, 209, 102, 0.1); border-left: 3px solid #ffd166; padding: 8px; border-radius: 4px; margin-bottom: 8px; color: #ffd166; font-size: 12px;">
            ⚠️ Drone lourd, autonomie réduite de 15%
        </div>`;
    }

    const effectiveAutonomy = cfg.autonomy * (totalWeight < 2.5 ? 1 : 0.85);
    const missionDuration = (missionBuilderState.totalTime || 0) / 60;
    const margin = effectiveAutonomy - missionDuration;

    document.getElementById('mb-autonomy-mission').textContent = effectiveAutonomy.toFixed(1);
    document.getElementById('mb-flight-duration').textContent = missionDuration.toFixed(1);
    document.getElementById('mb-battery-margin').textContent = margin.toFixed(1) + 'min';

    if (margin < 5) {
        warnings += `<div style="background: rgba(255, 107, 107, 0.1); border-left: 3px solid #ff6b6b; padding: 8px; border-radius: 4px; color: #ff6b6b; font-size: 12px;">
            ❌ Marge batterie insuffisante! ${margin.toFixed(1)}min < 5min
        </div>`;
    }

    document.getElementById('mb-warnings').innerHTML = warnings;
}

// ============ LAUNCH SIMULATION ============
function launchSimulation() {
    missionBuilderState.missionData = calculateMissionProfile();

    // Show result section
    document.getElementById('mb-step5').style.display = 'none';
    document.getElementById('mb-result').style.display = 'block';

    // Show simulation container
    document.getElementById('mb-simulation-container').style.display = 'block';

    // Generate report
    generateMissionReport();
}

function calculateMissionProfile() {
    // Timeline des segments
    const segments = [];
    let totalEnergy = 0, totalTime = 0, currentBattery = 100;

    for (let i = 1; i < missionBuilderState.waypoints.length; i++) {
        const wp = missionBuilderState.waypoints[i];
        const prevWp = missionBuilderState.waypoints[i - 1];
        const dist = haversineDistance(prevWp.lat, prevWp.lng, wp.lat, wp.lng);
        const time = (dist / wp.speed) * 60;
        const power = adjustPowerForWind(airPowerForSpeed(wp.speed), missionBuilderState.conditions.wind);
        const energy = energyConsumed(power, time);

        segments.push({
            type: 'transit',
            wp: i,
            distance: dist,
            time: time,
            power: power,
            energy: energy,
            batteryAfter: currentBattery - batteryPercent(energy)
        });

        totalEnergy += energy;
        totalTime += time;
        currentBattery -= batteryPercent(energy);

        // Add actions for this WP
        if (missionBuilderState.actions[i]) {
            for (let action of missionBuilderState.actions[i]) {
                const def = actionDefinitions[action];
                if (def) {
                    const actionEnergy = energyConsumed(def.power, def.duration / 60);
                    segments.push({
                        type: 'action',
                        action: action,
                        wp: i,
                        time: def.duration / 60,
                        power: def.power,
                        energy: actionEnergy,
                        batteryAfter: currentBattery - batteryPercent(actionEnergy)
                    });
                    totalEnergy += actionEnergy;
                    totalTime += def.duration / 60;
                    currentBattery -= batteryPercent(actionEnergy);
                }
            }
        }
    }

    // RTH
    const rthWp = missionBuilderState.waypoints[missionBuilderState.waypoints.length - 1];
    const baseWp = missionBuilderState.waypoints[0];
    const rthDist = haversineDistance(rthWp.lat, rthWp.lng, baseWp.lat, baseWp.lng);
    const rthTime = (rthDist / 50) * 60;
    const rthPower = adjustPowerForWind(airPowerForSpeed(50), missionBuilderState.conditions.wind);
    const rthEnergy = energyConsumed(rthPower, rthTime);

    segments.push({
        type: 'rth',
        distance: rthDist,
        time: rthTime,
        power: rthPower,
        energy: rthEnergy,
        batteryAfter: currentBattery - batteryPercent(rthEnergy)
    });

    totalEnergy += rthEnergy;
    totalTime += rthTime;
    currentBattery -= batteryPercent(rthEnergy);

    return {
        segments: segments,
        totalDistance: missionBuilderState.totalDistance + rthDist,
        totalTime: totalTime,
        totalEnergy: totalEnergy,
        batteryRemaining: Math.max(0, 100 - batteryPercent(totalEnergy)),
        scenario: missionBuilderState.selectedScenario,
        conditions: missionBuilderState.conditions,
        config: missionBuilderState.config
    };
}

function generateMissionReport() {
    const mission = missionBuilderState.missionData;
    const scenarioNames = {
        maritime: 'Sauvetage Maritime',
        underwater: 'Inspection Sous-marine',
        flooded: 'Zone Inondée',
        research: 'Recherche Scientifique',
        custom: 'Mission Personnalisée'
    };

    const minutes = Math.floor(mission.totalTime);
    const seconds = Math.floor((mission.totalTime % 1) * 60);

    const detection = detectionProbability(
        mission.conditions.visibility,
        mission.conditions.weather,
        true, true
    );

    let html = `<div style="font-family: monospace; font-size: 13px; line-height: 1.6;">
<pre style="background: rgba(0,0,0,0.2); padding: 16px; border-radius: 8px; overflow-x: auto;">
┌─ RAPPORT MISSION ─────────────────────────────┐
│ ${scenarioNames[mission.scenario] || 'Mission'}
│
│ STATUS: ✅ PRÊT À VOLER
├───────────────────────────────────────────────┤
│
│ DURÉE & DISTANCE:
│  • Temps total: ${minutes}min ${seconds}sec
│  • Distance: ${mission.totalDistance.toFixed(1)} km
│  • Waypoints: ${missionBuilderState.waypoints.length - 1}/3
│  • RTH: Automatique
│
│ BATTERIE:
│  • Initiale: 100% (345.6 Wh)
│  • Utilisée: ${batteryPercent(mission.totalEnergy).toFixed(1)}%
│  • Restante: ${mission.batteryRemaining.toFixed(1)}%
│  • Marge: ${mission.batteryRemaining > 30 ? '✅ EXCELLENTE' : '⚠️ ÉTROITE'}
│
│ CONDITIONS:
│  • Vent: ${mission.conditions.wind.toFixed(1)} km/h
│  • Visibilité: ${mission.conditions.visibility.toFixed(0)} m
│  • Vagues: ${mission.conditions.waves.toFixed(1)} m
│  • Détection: ${detection.toFixed(0)}% probable
│  • Temp eau: ${mission.conditions.tempWater.toFixed(0)}°C
│
│ RÉSULTAT: ✅ Mission faisable
│          ${mission.batteryRemaining > 30 ? '✅ Marge confortable' : '⚠️ À surveiller'}
│          ${detection > 70 ? '✅ Détection probable' : '⚠️ Visibilité réduite'}
│
└───────────────────────────────────────────────┘
</pre>
    </div>`;

    document.getElementById('mb-report-content').innerHTML = html;
}

function resetMissionBuilder() {
    missionBuilderState.selectedScenario = null;
    missionBuilderState.waypoints = [];
    missionBuilderState.actions = {};
    missionBuilderState.missionData = null;

    // Hide result, show step 1
    document.getElementById('mb-result').style.display = 'none';
    document.getElementById('mb-step1').style.display = 'block';

    // Reset UI
    document.querySelectorAll('.scenario-card').forEach(c => c.classList.remove('selected'));
}

function exportReport() {
    const mission = missionBuilderState.missionData;
    if (!mission) return;

    const text = `
RAPPORT DE MISSION - MISSION BUILDER RÉALISTE
===============================================

SCÉNARIO: ${mission.scenario}
DURÉE: ${Math.floor(mission.totalTime)}min ${Math.floor((mission.totalTime % 1) * 60)}sec
DISTANCE: ${mission.totalDistance.toFixed(1)} km

BATTERIE:
- Utilisée: ${batteryPercent(mission.totalEnergy).toFixed(1)}%
- Restante: ${mission.batteryRemaining.toFixed(1)}%

CONDITIONS:
- Vent: ${mission.conditions.wind.toFixed(1)} km/h
- Visibilité: ${mission.conditions.visibility.toFixed(0)} m
- Température eau: ${mission.conditions.tempWater.toFixed(0)}°C

RÉSULTAT: Mission faisable ✓
`;

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mission_${Date.now()}.txt`;
    a.click();
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', initMissionBuilder);
