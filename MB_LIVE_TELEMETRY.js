// ============ LIVE TELEMETRY SYSTEM ============
// Simule la mission en temps réel et affiche tous les paramètres

const telemetryState = {
    isRunning: false,
    currentTime: 0,
    currentWaypoint: 0,
    batteryPercent: 100,
    batteryWh: 345.6,
    events: [],
    timeline: [],
    speedCurrent: 0,
    altitudeCurrent: 0,
    distanceTraveled: 0,
    distanceRemaining: 0
};

function startLiveTelemetry() {
    if (missionBuilderState.waypoints.length < 2) {
        alert('❌ Au moins 2 waypoints requis!');
        return;
    }

    // Reset telemetry state
    telemetryState.isRunning = true;
    telemetryState.currentTime = 0;
    telemetryState.currentWaypoint = 0;
    telemetryState.batteryPercent = 100;
    telemetryState.batteryWh = BATTERY_CAPACITY_WH;
    telemetryState.events = [];
    telemetryState.timeline = [];
    telemetryState.distanceTraveled = 0;
    telemetryState.distanceRemaining = calculateTotalDistance();

    // Show live telemetry view
    document.getElementById('mb-result').style.display = 'block';
    document.querySelectorAll('.mb-step').forEach(s => s.style.display = 'none');
    document.getElementById('mb-result').style.display = 'block';

    // Hide old report, show live telemetry
    document.getElementById('mb-report-content').style.display = 'none';
    document.getElementById('mb-live-telemetry').style.display = 'block';

    // Start simulation loop
    simulationLoop();
}

function calculateTotalDistance() {
    let total = 0;
    for (let i = 1; i < missionBuilderState.waypoints.length; i++) {
        const prev = missionBuilderState.waypoints[i - 1];
        const curr = missionBuilderState.waypoints[i];
        total += haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);
    }
    // Add RTH
    if (missionBuilderState.waypoints.length > 1) {
        const last = missionBuilderState.waypoints[missionBuilderState.waypoints.length - 1];
        const home = missionBuilderState.waypoints[0];
        total += haversineDistance(last.lat, last.lng, home.lat, home.lng);
    }
    return total;
}

function simulationLoop() {
    if (!telemetryState.isRunning) return;

    // Simulate for current waypoint
    const currentWp = missionBuilderState.waypoints[telemetryState.currentWaypoint];
    if (!currentWp) {
        endSimulation();
        return;
    }

    if (telemetryState.currentWaypoint === 0) {
        // At home base
        if (telemetryState.currentTime === 0) {
            addEvent('DÉCOLLAGE DE LA BASE', 'info');
            telemetryState.currentWaypoint = 1;
            setTimeout(simulationLoop, 100);
        }
        return;
    }

    const prevWp = missionBuilderState.waypoints[telemetryState.currentWaypoint - 1];
    const distance = haversineDistance(prevWp.lat, prevWp.lng, currentWp.lat, currentWp.lng);
    const timeNeeded = (distance / (currentWp.speed / 60)); // minutes

    // Update current position along segment
    const basePower = airPowerForSpeed(currentWp.speed);
    const adjustedPower = adjustPowerForWind(adjustPowerForTemp(basePower, missionBuilderState.conditions.tempWater), missionBuilderState.conditions.wind);
    const energyPerSecond = adjustedPower / 3600; // Wh per second

    // Simulate one step (1 second)
    telemetryState.currentTime++;
    telemetryState.batteryWh -= energyPerSecond;
    telemetryState.batteryPercent = batteryWattHourToPercent(telemetryState.batteryWh);
    telemetryState.distanceTraveled += (currentWp.speed / 3600); // km per second
    telemetryState.distanceRemaining = Math.max(0, calculateTotalDistance() - telemetryState.distanceTraveled);

    telemetryState.speedCurrent = currentWp.speed;
    telemetryState.altitudeCurrent = currentWp.altitude;

    // Check if actions are happening at this waypoint
    const segmentProgress = telemetryState.distanceTraveled % distance;
    if (segmentProgress < currentWp.speed / 3600 && telemetryState.currentTime % 10 === 0) {
        const actions = missionBuilderState.actions[telemetryState.currentWaypoint];
        if (actions) {
            Object.entries(actions).forEach(([key, active]) => {
                if (active && actionDefinitions[key]) {
                    addEvent(`${actionDefinitions[key].name} - ${actionDefinitions[key].duration}${actionDefinitions[key].unit}`, 'action');
                }
            });
        }
    }

    // Check if reached next waypoint
    if (telemetryState.distanceTraveled >= (distance * (telemetryState.currentWaypoint))) {
        addEvent(`ARRIVÉE WP${telemetryState.currentWaypoint}`, 'success');
        telemetryState.currentWaypoint++;
        if (telemetryState.currentWaypoint >= missionBuilderState.waypoints.length) {
            addEvent('RETOUR À LA BASE (RTH)', 'info');
            telemetryState.currentWaypoint = 0;
        }
    }

    // Check battery
    if (telemetryState.batteryPercent < 5) {
        addEvent('⚠️ BATTERIE CRITIQUE!', 'warning');
        endSimulation();
        return;
    }

    // Update UI every 500ms
    if (telemetryState.currentTime % 50 === 0) {
        updateTelemetryDisplay();
    }

    // Continue simulation (max 60 seconds real time = 3600 seconds simulated)
    if (telemetryState.currentTime < 3600 && telemetryState.batteryPercent > 0) {
        setTimeout(simulationLoop, 50);
    } else {
        endSimulation();
    }
}

function addEvent(message, type = 'info') {
    const event = {
        time: formatTime(telemetryState.currentTime),
        message: message,
        type: type,
        battery: telemetryState.batteryPercent.toFixed(1),
        distance: telemetryState.distanceTraveled.toFixed(2)
    };
    telemetryState.events.push(event);
}

function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function updateTelemetryDisplay() {
    // Update main metrics
    const timeStr = formatTime(telemetryState.currentTime);
    document.getElementById('telem-time').textContent = timeStr;
    document.getElementById('telem-battery').textContent = telemetryState.batteryPercent.toFixed(1) + '%';
    document.getElementById('telem-speed').textContent = telemetryState.speedCurrent + ' km/h';
    document.getElementById('telem-altitude').textContent = telemetryState.altitudeCurrent + ' m';
    document.getElementById('telem-distance').textContent = telemetryState.distanceTraveled.toFixed(2) + ' km';
    document.getElementById('telem-remaining').textContent = telemetryState.distanceRemaining.toFixed(2) + ' km';
    document.getElementById('telem-waypoint').textContent = `WP${telemetryState.currentWaypoint}`;

    // Update battery bar
    const batteryBar = document.getElementById('telem-battery-bar');
    if (batteryBar) {
        const percent = telemetryState.batteryPercent;
        const color = percent > 20 ? '#00ff88' : percent > 10 ? '#ffd166' : '#ff6b6b';
        batteryBar.style.width = percent + '%';
        batteryBar.style.backgroundColor = color;
    }

    // Update progress bar
    const progressBar = document.getElementById('telem-progress-bar');
    if (progressBar) {
        const totalDist = calculateTotalDistance();
        const progress = (telemetryState.distanceTraveled / totalDist) * 100;
        progressBar.style.width = Math.min(progress, 100) + '%';
    }

    // Update events log
    updateEventsLog();

    // Update mission parameters display
    updateMissionParameters();
}

function updateEventsLog() {
    const logContainer = document.getElementById('telem-events-log');
    if (!logContainer) return;

    let html = '';
    const recentEvents = telemetryState.events.slice(-10); // Last 10 events
    recentEvents.forEach(evt => {
        const bgColor = evt.type === 'success' ? 'rgba(0,255,136,0.1)' :
            evt.type === 'warning' ? 'rgba(255,107,107,0.1)' :
                evt.type === 'action' ? 'rgba(124,92,255,0.1)' : 'rgba(0,229,255,0.1)';

        html += `<div style="padding:8px;margin-bottom:4px;background:${bgColor};border-radius:4px;font-size:11px;border-left:3px solid ${evt.type === 'success' ? '#00ff88' : evt.type === 'warning' ? '#ff6b6b' : '#7c5cff'};">`;
        html += `<strong>${evt.time}</strong> | ${evt.message}<br>`;
        html += `<span style="color:var(--muted);font-size:10px;">🔋 ${evt.battery}% | 📏 ${evt.distance}km</span>`;
        html += `</div>`;
    });

    logContainer.innerHTML = html || '<div style="color:var(--muted);text-align:center;padding:20px;">En attente d\'événements...</div>';
}

function updateMissionParameters() {
    const paramContainer = document.getElementById('telem-mission-params');
    if (!paramContainer) return;

    const cfg = droneConfigs[missionBuilderState.config];
    const cond = missionBuilderState.conditions;

    let html = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:12px;">`;

    html += `<div style="background:rgba(124,92,255,0.1);padding:8px;border-radius:6px;">`;
    html += `<strong>🚁 DRONE</strong><br>`;
    html += `${cfg.name}<br>`;
    html += `Autonomie: ${cfg.autonomy}min`;
    html += `</div>`;

    html += `<div style="background:rgba(0,229,255,0.1);padding:8px;border-radius:6px;">`;
    html += `<strong>🌍 CONDITIONS</strong><br>`;
    html += `Vent: ${cond.wind}km/h | Temp: ${cond.tempWater}°C<br>`;
    html += `Visibilité: ${cond.visibility}m`;
    html += `</div>`;

    html += `<div style="background:rgba(255,209,102,0.1);padding:8px;border-radius:6px;">`;
    html += `<strong>📍 MISSION</strong><br>`;
    html += `Total: ${calculateTotalDistance().toFixed(1)}km<br>`;
    html += `Waypoints: ${missionBuilderState.waypoints.length}`;
    html += `</div>`;

    html += `<div style="background:rgba(255,107,107,0.1);padding:8px;border-radius:6px;">`;
    html += `<strong>⚡ ÉNERGIE</strong><br>`;
    html += `Capacité: ${BATTERY_CAPACITY_WH}Wh<br>`;
    html += `Restante: ${telemetryState.batteryWh.toFixed(1)}Wh`;
    html += `</div>`;

    html += `</div>`;
    paramContainer.innerHTML = html;
}

function endSimulation() {
    telemetryState.isRunning = false;
    addEvent('SIMULATION TERMINÉE', 'success');
    updateTelemetryDisplay();

    // Show end summary
    const summaryDiv = document.getElementById('telem-summary');
    if (summaryDiv) {
        let status = '✅ MISSION RÉUSSIE';
        let statusColor = '#00ff88';

        if (telemetryState.batteryPercent < 5) {
            status = '⚠️ BATTERIE DÉCHARGÉE - URGENCE';
            statusColor = '#ff6b6b';
        } else if (telemetryState.batteryPercent < 20) {
            status = '⚠️ BATTERIE FAIBLE';
            statusColor = '#ffd166';
        }

        summaryDiv.innerHTML = `
            <div style="background:linear-gradient(135deg,rgba(0,229,255,0.1),rgba(124,92,255,0.1));padding:16px;border-radius:12px;border-left:4px solid ${statusColor};">
                <h3 style="margin:0;color:${statusColor};">${status}</h3>
                <p style="margin:8px 0 0 0;font-size:13px;">
                    Durée: ${formatTime(telemetryState.currentTime)} | 
                    Distance: ${telemetryState.distanceTraveled.toFixed(1)}km | 
                    Batterie finale: ${telemetryState.batteryPercent.toFixed(1)}%
                </p>
            </div>
        `;
    }
}

// Rendre disponible globalement
window.startLiveTelemetry = startLiveTelemetry;
window.telemetryState = telemetryState;
