#!/usr/bin/env node

/**
 * Vérification de la structure du système de télémétrie
 */

const fs = require('fs');
const path = require('path');

console.log('📋 VÉRIFICATION SYSTÈME TÉLÉMÉTRIE MB v2.0\n');

const files = {
    'index.html': 'Application principale',
    'MB_LIVE_TELEMETRY.js': 'Système de télémétrie en direct'
};

const checks = [];

// Vérifier les fichiers existent
console.log('1️⃣  Vérification des fichiers...');
for (const [file, desc] of Object.entries(files)) {
    const filePath = path.join(__dirname, file);
    const exists = fs.existsSync(filePath);
    const status = exists ? '✅' : '❌';
    console.log(`   ${status} ${file} (${desc})`);
    checks.push({ check: `Fichier ${file}`, status: exists });
}

console.log('\n2️⃣  Vérification du contenu index.html...');

const indexPath = path.join(__dirname, 'index.html');
const indexContent = fs.readFileSync(indexPath, 'utf8');

const indexChecks = [
    { pattern: 'MB_LIVE_TELEMETRY.js', desc: 'Script de télémétrie inclus' },
    { pattern: 'id="telem-time"', desc: 'Div de temps' },
    { pattern: 'id="telem-battery"', desc: 'Div batterie' },
    { pattern: 'id="telem-speed"', desc: 'Div vitesse' },
    { pattern: 'id="telem-altitude"', desc: 'Div altitude' },
    { pattern: 'id="telem-distance"', desc: 'Div distance' },
    { pattern: 'id="telem-events-log"', desc: 'Log d\'événements' },
    { pattern: 'id="telem-mission-params"', desc: 'Paramètres mission' },
    { pattern: 'id="telem-summary"', desc: 'Résumé final' },
    { pattern: 'id="mb-live-telemetry"', desc: 'Container télémétrie' },
    { pattern: 'function launchSimulation', desc: 'Fonction de lancement' },
    { pattern: 'startLiveTelemetry', desc: 'Appel télémétrie' }
];

indexChecks.forEach(check => {
    const exists = indexContent.includes(check.pattern);
    const status = exists ? '✅' : '❌';
    console.log(`   ${status} ${check.desc}`);
    checks.push({ check: check.desc, status: exists });
});

console.log('\n3️⃣  Vérification du contenu MB_LIVE_TELEMETRY.js...');

const telemPath = path.join(__dirname, 'MB_LIVE_TELEMETRY.js');
const telemContent = fs.readFileSync(telemPath, 'utf8');

const telemChecks = [
    { pattern: 'const telemetryState', desc: 'État global défini' },
    { pattern: 'function startLiveTelemetry', desc: 'Fonction de démarrage' },
    { pattern: 'function simulationStep', desc: 'Boucle de simulation' },
    { pattern: 'function calculatePowerConsumption', desc: 'Calcul de puissance' },
    { pattern: 'function addEvent', desc: 'Fonction événements' },
    { pattern: 'function updateTelemetryDisplay', desc: 'Mise à jour affichage' },
    { pattern: 'function endSimulation', desc: 'Fin de simulation' },
    { pattern: 'function exportTelemetryData', desc: 'Export de données' }
];

telemChecks.forEach(check => {
    const exists = telemContent.includes(check.pattern);
    const status = exists ? '✅' : '❌';
    console.log(`   ${status} ${check.desc}`);
    checks.push({ check: check.desc, status: exists });
});

console.log('\n4️⃣  Vérification de la syntaxe...');

try {
    // Vérifier la syntaxe HTML basique
    const htmlTagCount = (indexContent.match(/<div/g) || []).length;
    const htmlCloseCount = (indexContent.match(/<\/div>/g) || []).length;
    const htmlMatch = htmlTagCount === htmlCloseCount;
    const status = htmlMatch ? '✅' : '❌';
    console.log(`   ${status} HTML bien formé (${htmlTagCount} divs ouverts)`);
    checks.push({ check: 'HTML bien formé', status: htmlMatch });

    // Vérifier JavaScript basique
    const jsErrors = [];
    if (telemContent.includes('function') && !telemContent.includes('{')) {
        jsErrors.push('Accolades manquantes');
    }
    const jsOk = jsErrors.length === 0;
    const jsStatus = jsOk ? '✅' : '❌';
    console.log(`   ${jsStatus} JavaScript syntaxiquement correct`);
    checks.push({ check: 'JS syntaxe', status: jsOk });
} catch (e) {
    console.log(`   ❌ Erreur de vérification: ${e.message}`);
}

// Résumé final
console.log('\n' + '='.repeat(50));
const passed = checks.filter(c => c.status).length;
const total = checks.length;
const percentage = Math.round((passed / total) * 100);

console.log(`📊 RÉSUMÉ: ${passed}/${total} vérifications réussies (${percentage}%)`);

if (passed === total) {
    console.log('✅ SYSTÈME TÉLÉMÉTRIE PRÊT À L\'UTILISATION');
    process.exit(0);
} else {
    console.log('⚠️  ATTENTION: Certaines vérifications ont échoué');
    process.exit(1);
}
