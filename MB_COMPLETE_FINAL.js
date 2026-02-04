// ============ MISSION BUILDER v2.0 - COMPLET ET RÉALISTE ============

// ============ STATE & CONSTANTS ============
const missionBuilderState = {
    selectedScenario: null,
    waypoints: [],
    actions: {},
    map: null,
    markers: {},
    polyline: null,
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
    payloads: { thermal: true },
    missionData: null,
    simulation: { isRunning: false, progress: 0, events: [] }
};

// BATTERY CONSTANTS
const BATTERY_CAPACITY_WH = 345.6;
const BATTERY_USABLE_PERCENT = 0.8;
const BATTERY_USABLE_WH = BATTERY_CAPACITY_WH * BATTERY_USABLE_PERCENT;

// DRONE CONFIGS - RÉALISTE
const droneConfigs = {
    A: {
        name: 'CONFIG A (Léger)',
        basePower: 600,
        weight: 2.05,
        maxWeight: 2.05,
        autonomy: 28,
        autonomyWater: 45,
        price: 2500
    },
    B: {
        name: 'CONFIG B (Standard)',
        basePower: 650,
        weight: 2.1,
        maxWeight: 3.0,
        autonomy: 35,
        autonomyWater: 55,
        price: 3500
    },
    C: {
        name: 'CONFIG C (Lourd)',
        basePower: 700,
        weight: 2.6,
        maxWeight: 4.5,
        autonomy: 45,
        autonomyWater: 75,
        price: 5000
    }
};

// PAYLOADS RÉALISTES VOLTIGE V3
const payloadDefinitions = {
    beacon: { name: 'Beacon + Ballast', weight: 0.2, power: 0, description: 'Système de localisation + ballast eau' },
    camera: { name: 'Caméra HD 4K', weight: 0.15, power: 80, description: 'Résolution 2160p 30fps' },
    sensors: { name: 'Capteurs eau x6', weight: 0.1, power: 0, description: 'pH, TDS, Temp, Conductivity, Turbidity, Salinité' },
    thermal: { name: 'Caméra Thermique', weight: 0.2, power: 0, description: 'Infrarouge 320×256' },
    ledExtra: { name: 'LED supplémentaire', weight: 0.05, power: 40, description: 'Spotlight 2000 lm' }
};

// ACTION DEFINITIONS - RÉALISTE
const actionDefinitions = {
    hover: {
        name: '⏸️ Hover',
        power: 585,
        duration: 30,
        unit: 'sec',
        description: 'Rester en place stable',
        batteryImpact: -1.41
    },
    photo: {
        name: '📸 Photo 4K',
        power: 80,
        duration: 1,
        unit: 'sec',
        description: 'Capture photo unique',
        batteryImpact: -0.01
    },
    video: {
        name: '📹 Vidéo 15s',
        power: 90,
        duration: 15,
        unit: 'sec',
        description: 'Enregistrement vidéo 15 secondes',
        batteryImpact: -0.04
    },
    waterSampling: {
        name: '💧 Prélèvement eau',
        power: 15,
        duration: 20,
        unit: 'sec',
        description: 'Capteurs eau (6 paramètres)',
        batteryImpact: -0.09
    },
    beacon: {
        name: '🔔 Beacon 2min',
        power: 50,
        duration: 120,
        unit: 'sec',
        description: 'Déploiement modem acoustique',
        batteryImpact: -0.48
    },
    thermal: {
        name: '🌡️ Scan thermique',
        power: 80,
        duration: 30,
        unit: 'sec',
        description: 'Balayage infrarouge 30sec',
        batteryImpact: -0.19
    },
    ledSpotlight: {
        name: '💡 LED 5min',
        power: 40,
        duration: 300,
        unit: 'sec',
        description: 'Spotlight 5 minutes',
        batteryImpact: -0.96
    }
};

// ============ BATTERY FORMULAS - RÉALISTE ============

function airPowerForSpeed(speed_kmh) {
    // Interpolation entre points de consommation réelle
    const points = { 50: 600, 70: 700, 100: 800, 160: 900 };
    const speeds = [50, 70, 100, 160];

    if (speed_kmh <= 50) return 600;
    if (speed_kmh >= 160) return 900;

    for (let i = 0; i < speeds.length - 1; i++) {
        const s1 = speeds[i], s2 = speeds[i + 1];
        if (speed_kmh >= s1 && speed_kmh <= s2) {
            const p1 = points[s1], p2 = points[s2];
            return p1 + (speed_kmh - s1) * (p2 - p1) / (s2 - s1);
        }
    }
    return 900;
}

function waterPowerForSpeed(speed_kmh) {
    // Puissance en mode eau/plongée
    const points = { 9: 112, 18: 225, 28: 382 };
    const speeds = [9, 18, 28];

    if (speed_kmh <= 9) return 112;
    if (speed_kmh >= 28) return 382;

    for (let i = 0; i < speeds.length - 1; i++) {
        const s1 = speeds[i], s2 = speeds[i + 1];
        if (speed_kmh >= s1 && speed_kmh <= s2) {
            const p1 = points[s1], p2 = points[s2];
            return p1 + (speed_kmh - s1) * (p2 - p1) / (s2 - s1);
        }
    }
    return 382;
}

function adjustPowerForWind(power, wind_kmh) {
    // Chaque 20 km/h de vent = +8% consommation
    return power * (1 + (wind_kmh / 20) * 0.08);
}

function adjustPowerForTemp(power, temp_celsius) {
    // Batterie froide: -8% d'efficacité si <15°C
    return temp_celsius < 15 ? power * 0.92 : power;
}

function batteryWattHourToPercent(wh) {
    return (wh / BATTERY_CAPACITY_WH) * 100;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.asin(Math.sqrt(a));
    return R * c;
}

function detectionProbability(visibility_m, weather, hasPayload) {
    let prob = 0.5;

    // Visibilité
    if (visibility_m > 500) prob += 0.3;
    else if (visibility_m > 200) prob += 0.15;
    else if (visibility_m > 100) prob += 0.05;

    // Météo
    if (weather === 'clear') prob += 0.25;
    else if (weather === 'cloudy') prob += 0.1;
    else if (weather === 'light-rain') prob -= 0.15;
    else if (weather === 'heavy-rain') prob -= 0.3;

    // Payload thermique
    if (hasPayload) prob += 0.2;

    return Math.min(Math.max(prob, 0), 1.0) * 100;
}

// ============ INITIALIZATION ============

function initMissionBuilder() {
    console.log('🚀 Mission Builder v2.0 RÉALISTE initialized');

    // Show only first step
    document.querySelectorAll('.mb-step').forEach(s => s.style.display = 'none');
    document.getElementById('mb-step1').style.display = 'block';

    // Step 1: Scenario selection
    setupStep1();
    setupStep2();
    setupStep3();
    setupStep4();
    setupStep5();
}

function setupStep1() {
    document.querySelectorAll('.scenario-card').forEach(card => {
        card.addEventListener('click', function () {
            document.querySelectorAll('.scenario-card').forEach(c => c.classList.remove('selected'));
            this.classList.add('selected');
            missionBuilderState.selectedScenario = this.dataset.scenario;
            document.getElementById('mb-continue-step1').disabled = false;
            document.getElementById('mb-continue-step1').style.opacity = '1';
            document.getElementById('mb-continue-step1').style.cursor = 'pointer';
        });
    });

    document.getElementById('mb-continue-step1').addEventListener('click', () => {
        showMBStep(2);
        setTimeout(initMapStep, 100);
    });
}

function setupStep2() {
    document.getElementById('mb-back-step1')?.addEventListener('click', () => showMBStep(1));
    document.getElementById('mb-continue-step2')?.addEventListener('click', () => {
        if (missionBuilderState.waypoints.length < 2) {
            alert('❌ Ajoute au moins 2 waypoints!');
            return;
        }
        showMBStep(3);
        renderActionsStep();
    });
}

function setupStep3() {
    document.getElementById('mb-back-step2')?.addEventListener('click', () => showMBStep(2));
    document.getElementById('mb-continue-step3')?.addEventListener('click', () => showMBStep(4));
}

function setupStep4() {
    // Condition sliders
    ['wind', 'visibility', 'waves', 'temp', 'current'].forEach(param => {
        const elem = document.getElementById(`mb-${param}`);
        if (elem) {
            elem.addEventListener('input', (e) => {
                const key = param === 'temp' ? 'tempWater' : param;
                missionBuilderState.conditions[key] = parseFloat(e.target.value);
                document.getElementById(`mb-${param}-val`).textContent = e.target.value;
                updateConditionsImpact();
            });
        }
    });

    document.getElementById('mb-weather')?.addEventListener('change', (e) => {
        missionBuilderState.conditions.weather = e.target.value;
        updateConditionsImpact();
    });

    document.getElementById('mb-water-type')?.addEventListener('change', (e) => {
        missionBuilderState.conditions.waterType = e.target.value;
        updateConditionsImpact();
    });

    document.getElementById('mb-time')?.addEventListener('change', (e) => {
        missionBuilderState.conditions.time = e.target.value;
        updateConditionsImpact();
    });

    document.getElementById('mb-back-step3')?.addEventListener('click', () => showMBStep(3));
    document.getElementById('mb-continue-step4')?.addEventListener('click', () => showMBStep(5));
}

function setupStep5() {
    document.querySelectorAll('input[name="config"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            missionBuilderState.config = e.target.value;
            updateDroneConfig();
        });
    });

    document.querySelectorAll('.mb-payload').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const payload = e.target.value;
            missionBuilderState.payloads[payload] = e.target.checked;
            updateDroneConfig();
        });
    });

    document.getElementById('mb-back-step4')?.addEventListener('click', () => showMBStep(4));
    document.getElementById('mb-launch-simulation')?.addEventListener('click', launchSimulation);
    document.getElementById('mb-new-mission')?.addEventListener('click', resetMissionBuilder);
    document.getElementById('mb-export-report')?.addEventListener('click', exportReport);
}

function showMBStep(step) {
    document.querySelectorAll('.mb-step').forEach(s => s.style.display = 'none');
    const elem = document.getElementById(`mb-step${step}`);
    if (elem) {
        elem.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// ============ MAP & WAYPOINTS ============

function initMapStep() {
    if (missionBuilderState.map) return;

    const mapContainer = document.getElementById('mb-map');
    if (!mapContainer) return;

    missionBuilderState.map = L.map(mapContainer).setView([47.32, 5.04], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19
    }).addTo(missionBuilderState.map);

    // Add home marker
    const homeMarker = L.circleMarker([47.32, 5.04], {
        radius: 10,
        fillColor: '#00e5ff',
        color: 'white',
        weight: 3,
        opacity: 1,
        fillOpacity: 0.8
    }).addTo(missionBuilderState.map);
    homeMarker.bindPopup('<strong>🏠 Base (Home)</strong>');

    missionBuilderState.waypoints = [{
        id: Date.now(),
        index: 0,
        lat: 47.32,
        lng: 5.04,
        speed: 50,
        altitude: 0,
        type: 'home',
        actions: []
    }];

    missionBuilderState.markers[0] = homeMarker;

    missionBuilderState.map.on('click', (e) => {
        addWaypoint(e.latlng.lat, e.latlng.lng);
    });
}

function addWaypoint(lat, lng) {
    const index = missionBuilderState.waypoints.length;
    const waypoint = {
        id: Date.now(),
        index: index,
        lat: parseFloat(lat.toFixed(6)),
        lng: parseFloat(lng.toFixed(6)),
        speed: 50,
        altitude: 50,
        type: 'air',
        actions: []
    };

    missionBuilderState.waypoints.push(waypoint);
    missionBuilderState.actions[index] = {};

    const marker = L.circleMarker([lat, lng], {
        radius: 8,
        fillColor: '#ff6b6b',
        color: 'white',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
    }).addTo(missionBuilderState.map);

    marker.bindPopup(`
        <div style="font-size:12px;">
            <strong>🎯 WP ${index}</strong><br>
            Lat: ${lat.toFixed(4)}° N<br>
            Lng: ${lng.toFixed(4)}° E<br>
            <button onclick="editWaypoint(${index})" style="padding:4px 8px;margin:4px 0;background:#7c5cff;color:white;border:none;border-radius:3px;cursor:pointer;">✏️ Éditer</button>
            <button onclick="deleteWaypoint(${index})" style="padding:4px 8px;margin:4px 4px 4px 0;background:#ff6b6b;color:white;border:none;border-radius:3px;cursor:pointer;">🗑️ Supprimer</button>
        </div>
    `);

    missionBuilderState.markers[index] = marker;
    updateWaypointsList();
    document.getElementById('mb-continue-step2').disabled = false;
    document.getElementById('mb-continue-step2').style.opacity = '1';
}

function editWaypoint(index) {
    const wp = missionBuilderState.waypoints[index];

    const lat = prompt(`Latitude WP${index}:`, wp.lat);
    if (lat === null) return;
    const lng = prompt(`Longitude WP${index}:`, wp.lng);
    if (lng === null) return;
    const speed = prompt(`Vitesse WP${index} (km/h, 20-160):`, wp.speed);
    if (speed === null) return;
    const altitude = prompt(`Altitude WP${index} (m, 0-150):`, wp.altitude);
    if (altitude === null) return;

    wp.lat = parseFloat(lat);
    wp.lng = parseFloat(lng);
    wp.speed = Math.max(20, Math.min(160, parseFloat(speed)));
    wp.altitude = Math.max(0, Math.min(150, parseFloat(altitude)));

    missionBuilderState.markers[index].setLatLng([wp.lat, wp.lng]);
    updateWaypointsList();
}

function deleteWaypoint(index) {
    if (index === 0) {
        alert('❌ Cannot delete home base!');
        return;
    }

    missionBuilderState.map.removeLayer(missionBuilderState.markers[index]);
    missionBuilderState.waypoints.splice(index, 1);

    // Reindex
    missionBuilderState.waypoints.forEach((wp, i) => {
        wp.index = i;
        if (missionBuilderState.markers[index]) {
            const marker = missionBuilderState.markers[index];
            marker.setPopupContent(`<strong>WP ${i}</strong>`);
        }
    });

    delete missionBuilderState.markers[index];
    delete missionBuilderState.actions[index];

    updateWaypointsList();
}

function updateWaypointsList() {
    const container = document.getElementById('mb-waypoints-list');
    if (!container) return;

    let html = '<table style="width:100%;font-size:11px;border-collapse:collapse;">';
    html += '<thead><tr style="border-bottom:1px solid var(--border);"><th>WP</th><th>Lat/Lng</th><th>Alt</th><th>Spd</th><th>Dist</th><th>Time</th><th>Batt%</th></tr></thead>';
    html += '<tbody>';

    let totalDist = 0, totalTime = 0, totalBatt = 0;

    missionBuilderState.waypoints.forEach((wp, i) => {
        if (i === 0) {
            html += `<tr style="border-bottom:1px solid var(--border);"><td>${i}</td><td>${wp.lat.toFixed(3)}°/${wp.lng.toFixed(3)}°</td><td>🏠</td><td>-</td><td>-</td><td>START</td><td>100%</td></tr>`;
            return;
        }

        const prev = missionBuilderState.waypoints[i - 1];
        const dist = haversineDistance(prev.lat, prev.lng, wp.lat, wp.lng);
        const timeMin = (dist / (wp.speed / 60));

        const basePower = airPowerForSpeed(wp.speed);
        const windAdjusted = adjustPowerForWind(basePower, missionBuilderState.conditions.wind);
        const tempAdjusted = adjustPowerForTemp(windAdjusted, missionBuilderState.conditions.tempWater);
        const energy = (tempAdjusted * timeMin) / 60; // Wh
        const battPercent = batteryWattHourToPercent(energy);

        totalDist += dist;
        totalTime += timeMin;
        totalBatt += battPercent;

        html += `<tr style="border-bottom:1px solid var(--border);"><td>${i}</td><td>${wp.lat.toFixed(3)}°/${wp.lng.toFixed(3)}°</td><td>${wp.altitude}m</td><td>${wp.speed}km/h</td><td>${dist.toFixed(2)}km</td><td>${Math.floor(timeMin)}m</td><td>${battPercent.toFixed(1)}%</td></tr>`;
    });

    // RTH segment
    if (missionBuilderState.waypoints.length > 1) {
        const last = missionBuilderState.waypoints[missionBuilderState.waypoints.length - 1];
        const home = missionBuilderState.waypoints[0];
        const rthDist = haversineDistance(last.lat, last.lng, home.lat, home.lng);
        const rthTime = (rthDist / (50 / 60));
        const rthEnergy = (600 * rthTime) / 60;
        const rthBatt = batteryWattHourToPercent(rthEnergy);

        totalDist += rthDist;
        totalTime += rthTime;
        totalBatt += rthBatt;

        html += `<tr style="background:rgba(255,107,107,0.1);border-bottom:1px solid var(--border);"><td>RTH</td><td>HOME</td><td>-</td><td>50km/h</td><td>${rthDist.toFixed(2)}km</td><td>${Math.floor(rthTime)}m</td><td>${rthBatt.toFixed(1)}%</td></tr>`;
    }

    html += '</tbody></table>';
    html += `<div style="margin-top:12px;padding:8px;background:rgba(124,92,255,0.1);border-radius:6px;font-size:12px;"><strong>TOTAUX:</strong> ${totalDist.toFixed(2)}km | ${Math.floor(totalTime)}min | ${totalBatt.toFixed(1)}% batterie</div>`;

    container.innerHTML = html;

    // Update summary
    document.getElementById('mb-total-distance').textContent = totalDist.toFixed(2);
    document.getElementById('mb-total-time').textContent = `${Math.floor(totalTime)}:${String(Math.round((totalTime % 1) * 60)).padStart(2, '0')}`;
    document.getElementById('mb-total-battery').textContent = totalBatt.toFixed(1) + '%';
    document.getElementById('mb-battery-remaining').textContent = (100 - totalBatt).toFixed(1) + '%';

    // Redraw polyline
    if (missionBuilderState.map) {
        if (missionBuilderState.polyline) missionBuilderState.map.removeLayer(missionBuilderState.polyline);
        const coords = missionBuilderState.waypoints.map(wp => [wp.lat, wp.lng]);
        missionBuilderState.polyline = L.polyline(coords, {
            color: '#7c5cff',
            weight: 2,
            opacity: 0.7
        }).addTo(missionBuilderState.map);
    }
}

// ============ ACTIONS STEP ============

function renderActionsStep() {
    const container = document.getElementById('mb-actions-container');
    if (!container) return;

    let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">';

    missionBuilderState.waypoints.forEach((wp, i) => {
        if (i === 0) return; // Skip home

        html += `<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:16px;">`;
        html += `<h4 style="margin:0 0 12px 0;">🎯 WP ${i}</h4>`;

        Object.entries(actionDefinitions).forEach(([key, def]) => {
            const checked = missionBuilderState.actions[i]?.[key] ? 'checked' : '';
            html += `<label style="display:block;margin-bottom:8px;font-size:13px;">`;
            html += `<input type="checkbox" data-wp="${i}" data-action="${key}" ${checked} onchange="toggleAction(${i},'${key}')"> `;
            html += `${def.name}<br>`;
            html += `<span style="color:var(--muted);font-size:11px;">⚡${def.power}W × ${def.duration}${def.unit === 'sec' ? 's' : def.unit'} = ${(def.power * def.duration / 60 / 60).toFixed(2)}Wh</span>`;
            html += `</label>`;
        });

        html += `</div>`;
    });

    html += '</div>';
    container.innerHTML = html;
}

function toggleAction(wpIndex, actionKey) {
    if (!missionBuilderState.actions[wpIndex]) {
        missionBuilderState.actions[wpIndex] = {};
    }
    const checkbox = document.querySelector(`input[data-wp="${wpIndex}"][data-action="${actionKey}"]`);
    missionBuilderState.actions[wpIndex][actionKey] = checkbox?.checked || false;
    updateConditionsImpact();
}

// ============ CONDITIONS IMPACT ============

function updateConditionsImpact() {
    const analysis = calculateConditionsImpact();

    // Update wind impact
    const windPower = airPowerForSpeed(50) * (1 + (missionBuilderState.conditions.wind / 20) * 0.08);
    const windImpact = ((windPower / airPowerForSpeed(50)) - 1) * 100;
    document.getElementById('mb-wind-impact').textContent = `Impact: +${windImpact.toFixed(1)}% batterie`;

    // Update visibility impact
    const visProb = detectionProbability(missionBuilderState.conditions.visibility, missionBuilderState.conditions.weather, true);
    document.getElementById('mb-visibility-impact').textContent = `Impact: ${visProb.toFixed(0)}% détection`;

    // Update waves impact
    const wavesRisk = missionBuilderState.conditions.waves > 2 ? '⚠️ Risque' : '✓ Stable';
    document.getElementById('mb-waves-impact').textContent = `Impact: ${wavesRisk}`;

    // Update temp impact
    const tempPenalty = missionBuilderState.conditions.tempWater < 15 ? -8 : 0;
    document.getElementById('mb-temp-impact').textContent = `Impact: ${tempPenalty}% batterie`;

    // Update weather impact
    const weatherImpacts = { clear: '+25%', cloudy: '+10%', 'light-rain': '-15%', 'heavy-rain': '-30%' };
    document.getElementById('mb-weather-impact').textContent = `Impact: Détection ${weatherImpacts[missionBuilderState.conditions.weather]}`;

    // Update time impact
    const hour = parseInt(missionBuilderState.conditions.time.split(':')[0]);
    const timeImpact = (hour >= 20 || hour < 6) ? '🌙 Nuit (-80% visibilité)' : '☀️ Jour optimal';
    document.getElementById('mb-time-impact').textContent = `Impact: ${timeImpact}`;

    // Update water type impact
    const waterVis = { fresh: '90%', coastal: '60%', ocean: '85%' };
    document.getElementById('mb-water-type-impact').textContent = `Impact: Visibilité ${waterVis[missionBuilderState.conditions.waterType]}`;

    // Update current impact
    const totalDist = parseFloat(document.getElementById('mb-total-distance').textContent) || 0;
    const driftM = (missionBuilderState.conditions.current * totalDist * 1000) / 100;
    document.getElementById('mb-current-impact').textContent = `Impact: Dérive ${driftM.toFixed(0)}m`;

    // Update main analysis
    updateMainAnalysis(analysis);
}

function calculateConditionsImpact() {
    const cond = missionBuilderState.conditions;
    const visProb = detectionProbability(cond.visibility, cond.weather, true);

    let risks = [];
    if (cond.wind > 20) risks.push('⚠️ Vent élevé');
    if (cond.visibility < 50) risks.push('⚠️ Visibilité critique');
    if (cond.waves > 2.5) risks.push('⚠️ Vagues importantes');
    if (cond.tempWater < 5) risks.push('❌ Température critique');

    const baseBatt = parseFloat(document.getElementById('mb-total-battery').textContent) || 0;
    const tempPenalty = cond.tempWater < 15 ? 0.92 : 1.0;
    const windMult = (600 + (600 * (cond.wind / 20) * 0.08)) / 600;
    const adjustedBatt = baseBatt * windMult * tempPenalty;

    return {
        baseBattery: baseBatt,
        adjustedBattery: adjustedBatt,
        detectionProb: visProb,
        risks: risks,
        isNight: parseInt(cond.time.split(':')[0]) >= 20 || parseInt(cond.time.split(':')[0]) < 6
    };
}

function updateMainAnalysis(analysis) {
    const battChange = analysis.adjustedBattery - analysis.baseBattery;
    const battColor = battChange < 0 ? '#ff6b6b' : '#00ff88';

    const detQuality = analysis.detectionProb > 80 ? 'Excellent' :
        analysis.detectionProb > 60 ? 'Bon' :
            analysis.detectionProb > 40 ? 'Moyen' : 'Faible';

    document.getElementById('mb-analysis-battery').innerHTML =
        `${analysis.baseBattery.toFixed(1)}% → <span style="color:${battColor};">${analysis.adjustedBattery.toFixed(1)}%</span> (${battChange > 0 ? '+' : ''}${battChange.toFixed(1)}%)`;

    document.getElementById('mb-analysis-detection').textContent =
        `${analysis.detectionProb.toFixed(0)}% (${detQuality})`;

    const timeStr = document.getElementById('mb-total-time').textContent || '0:00';
    document.getElementById('mb-analysis-time').textContent = timeStr;

    const riskText = analysis.risks.length > 0 ? analysis.risks.join(' | ') : '✅ Aucun risque majeur';
    document.getElementById('mb-analysis-risks').textContent = riskText;

    const rec = analysis.isNight ? '💡 LED spotlight recommandée (nuit)' :
        analysis.risks.length > 0 ? '⚠️ Vérifier conditions de sécurité' :
            '✓ Conditions optimales - Mission faisable';
    document.getElementById('mb-analysis-recommendations').textContent = rec;
}

// ============ DRONE CONFIG ============

function updateDroneConfig() {
    const cfg = droneConfigs[missionBuilderState.config];
    let weight = cfg.weight;
    let payloadStr = 'Défaut (Beacon, Caméra, Capteurs): 0.45kg';
    let totalPayload = 0.45;

    // Add optional payloads
    if (missionBuilderState.payloads.thermal) {
        weight += 0.2;
        totalPayload += 0.2;
    }
    if (missionBuilderState.payloads['extra-led']) {
        weight += 0.05;
        totalPayload += 0.05;
    }

    const totalWeight = weight;
    const isValid = totalWeight <= cfg.maxWeight;

    let html = `<div style="padding:12px;background:var(--card-bg);border-radius:6px;">`;
    html += `<p style="margin:0 0 8px 0;"><strong>Drone:</strong> ${cfg.name}</p>`;
    html += `<p style="margin:0 0 8px 0;"><strong>Poids drone:</strong> ${cfg.weight}kg</p>`;
    html += `<p style="margin:0 0 8px 0;"><strong>Payload:</strong> ${totalPayload.toFixed(2)}kg</p>`;
    html += `<p style="margin:0 0 12px 0;"><strong>Total:</strong> ${totalWeight.toFixed(2)}kg / ${cfg.maxWeight}kg ${isValid ? '✅' : '❌'}</p>`;

    html += `<hr style="border:none;border-top:1px solid var(--border);margin:12px 0;">`;
    html += `<p style="margin:0 0 8px 0;"><strong>Autonomie théorique:</strong> ${cfg.autonomy}min</p>`;

    const missionMinutes = (parseFloat(document.getElementById('mb-total-time').textContent.split(':')[0]) || 0) +
        (parseFloat(document.getElementById('mb-total-time').textContent.split(':')[1]) || 0) / 60;
    const margin = cfg.autonomy - missionMinutes;
    const marginColor = margin < 5 ? '#ff6b6b' : '#00ff88';

    html += `<p style="margin:0 0 8px 0;"><strong>Durée mission:</strong> ${Math.floor(missionMinutes)}min</p>`;
    html += `<p style="margin:0;color:${marginColor};"><strong>Marge batterie:</strong> ${margin.toFixed(1)}min</p>`;

    if (!isValid) html += `<p style="color:#ff6b6b;margin:12px 0 0 0;">⚠️ DÉPASSE LE POIDS MAX!</p>`;
    if (margin < 5) html += `<p style="color:#ff6b6b;margin:12px 0 0 0;">⚠️ MARGE BATTERIE FAIBLE!</p>`;

    html += `</div>`;

    document.getElementById('mb-config-summary').innerHTML = html;

    // Update weights display
    document.getElementById('mb-drone-weight').textContent = cfg.weight.toFixed(2);
    document.getElementById('mb-payload-weight').textContent = totalPayload.toFixed(2);
    document.getElementById('mb-total-weight').textContent = totalWeight.toFixed(2);
    document.getElementById('mb-autonomy-theo').textContent = cfg.autonomy;
    document.getElementById('mb-autonomy-mission').textContent = Math.max(0, Math.round(cfg.autonomy - (totalPayload * 2)));
    document.getElementById('mb-flight-duration').textContent = missionMinutes.toFixed(1);
    document.getElementById('mb-battery-margin').textContent = margin.toFixed(1) + 'min';
    document.getElementById('mb-battery-margin').style.color = marginColor;
}

// ============ SIMULATION & REPORT ============

function launchSimulation() {
    if (missionBuilderState.waypoints.length < 2) {
        alert('❌ Ajoute au moins 2 waypoints!');
        return;
    }

    showMBStep('result');
    document.getElementById('mb-simulation-container').style.display = 'block';
    document.getElementById('mb-report-content').style.display = 'none';

    generateMissionReport();
}

function generateMissionReport() {
    const cfg = droneConfigs[missionBuilderState.config];
    const cond = missionBuilderState.conditions;

    let report = `════════════════════════════════════════════════\n`;
    report += `📋 RAPPORT MISSION RÉALISTE\n`;
    report += `════════════════════════════════════════════════\n\n`;
    report += `🎯 SCÉNARIO: ${missionBuilderState.selectedScenario}\n`;
    report += `🚁 DRONE: ${cfg.name}\n`;
    report += `📅 DATE: ${new Date().toLocaleString('fr-FR')}\n\n`;

    report += `🌍 CONDITIONS:\n`;
    report += `├─ Vent: ${cond.wind} km/h\n`;
    report += `├─ Visibilité: ${cond.visibility}m\n`;
    report += `├─ Vagues: ${cond.waves}m\n`;
    report += `├─ Température eau: ${cond.tempWater}°C\n`;
    report += `├─ Météo: ${cond.weather}\n`;
    report += `├─ Heure: ${cond.time}\n`;
    report += `├─ Type eau: ${cond.waterType}\n`;
    report += `└─ Courant: ${cond.current} km/h\n\n`;

    report += `📍 WAYPOINTS & TRAJET:\n`;
    let totalDist = 0, totalTime = 0, totalBatt = 0;

    missionBuilderState.waypoints.forEach((wp, i) => {
        if (i === 0) {
            report += `├─ WP0 (HOME): [${wp.lat.toFixed(4)}°N, ${wp.lng.toFixed(4)}°E]\n`;
            return;
        }

        const prev = missionBuilderState.waypoints[i - 1];
        const dist = haversineDistance(prev.lat, prev.lng, wp.lat, wp.lng);
        const timeMin = (dist / (wp.speed / 60));
        const basePower = airPowerForSpeed(wp.speed);
        const tempPower = adjustPowerForTemp(basePower, cond.tempWater);
        const windPower = adjustPowerForWind(tempPower, cond.wind);
        const energy = (windPower * timeMin) / 60;
        const battPercent = batteryWattHourToPercent(energy);

        totalDist += dist;
        totalTime += timeMin;
        totalBatt += battPercent;

        report += `├─ WP${i}: [${wp.lat.toFixed(4)}°N, ${wp.lng.toFixed(4)}°E]\n`;
        report += `│  ├─ Distance: ${dist.toFixed(2)}km à ${wp.speed}km/h\n`;
        report += `│  ├─ Durée: ${Math.floor(timeMin)}min ${Math.round((timeMin % 1) * 60)}sec\n`;
        report += `│  ├─ Puissance: ${windPower.toFixed(0)}W\n`;
        report += `│  └─ Batterie: ${battPercent.toFixed(2)}% (${energy.toFixed(1)}Wh)\n`;

        // Actions
        const actions = missionBuilderState.actions[i];
        if (actions && Object.keys(actions).some(k => actions[k])) {
            report += `│  Actions:\n`;
            Object.entries(actions).forEach(([key, active]) => {
                if (active) {
                    const def = actionDefinitions[key];
                    report += `│  └─ ${def.name} (${def.power}W × ${def.duration}${def.unit})\n`;
                }
            });
        }
    });

    // RTH
    if (missionBuilderState.waypoints.length > 1) {
        const last = missionBuilderState.waypoints[missionBuilderState.waypoints.length - 1];
        const home = missionBuilderState.waypoints[0];
        const rthDist = haversineDistance(last.lat, last.lng, home.lat, home.lng);
        const rthTime = (rthDist / (50 / 60));
        const rthEnergy = (600 * rthTime) / 60;
        const rthBatt = batteryWattHourToPercent(rthEnergy);

        totalDist += rthDist;
        totalTime += rthTime;
        totalBatt += rthBatt;

        report += `└─ RTH (Retour base): ${rthDist.toFixed(2)}km\n`;
        report += `   └─ Batterie: ${rthBatt.toFixed(2)}%\n`;
    }

    report += `\n⚡ BILAN ÉNERGIE:\n`;
    report += `├─ Distance totale: ${totalDist.toFixed(2)}km\n`;
    report += `├─ Durée totale: ${Math.floor(totalTime)}min ${Math.round((totalTime % 1) * 60)}sec\n`;
    report += `├─ Batterie utilisée: ${totalBatt.toFixed(2)}%\n`;
    report += `├─ Batterie restante: ${(100 - totalBatt).toFixed(2)}%\n`;
    report += `└─ Autonomie: ${cfg.autonomy}min (${totalTime < cfg.autonomy ? '✅ OK' : '❌ INSUFFISANT'})\n\n`;

    const analysis = calculateConditionsImpact();
    report += `🎯 DÉTECTION:\n`;
    report += `├─ Probabilité: ${analysis.detectionProb.toFixed(1)}%\n`;
    report += `├─ Risques: ${analysis.risks.length > 0 ? analysis.risks.join(', ') : 'Aucun'}\n`;
    report += `└─ Status: ${totalBatt < 100 && totalTime < cfg.autonomy ? '✅ MISSION POSSIBLE' : '❌ MISSION IMPOSSIBLE'}\n`;

    const reportElem = document.getElementById('mb-report-content');
    if (reportElem) {
        reportElem.innerHTML = `<pre style="overflow-x:auto;white-space:pre-wrap;word-wrap:break-word;font-size:12px;line-height:1.5;">${report}</pre>`;
        reportElem.style.display = 'block';
    }

    document.getElementById('mb-simulation-container').style.display = 'none';
}

function resetMissionBuilder() {
    missionBuilderState.selectedScenario = null;
    missionBuilderState.waypoints = [];
    missionBuilderState.actions = {};
    if (missionBuilderState.map) {
        missionBuilderState.map.remove();
        missionBuilderState.map = null;
    }
    missionBuilderState.markers = {};
    missionBuilderState.polyline = null;

    document.querySelectorAll('.scenario-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('mb-continue-step1').disabled = true;
    document.getElementById('mb-continue-step1').style.opacity = '0.5';

    showMBStep(1);
}

function exportReport() {
    const reportText = document.getElementById('mb-report-content').textContent;
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(reportText));
    element.setAttribute('download', `mission-${Date.now()}.txt`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

// ============ WINDOW EXPORTS ============
window.editWaypoint = editWaypoint;
window.deleteWaypoint = deleteWaypoint;
window.toggleAction = toggleAction;
window.updateDroneConfig = updateDroneConfig;
window.initMissionBuilder = initMissionBuilder;
