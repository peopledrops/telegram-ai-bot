// lobmoney-runner.js
require('dotenv').config();
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.LOBMONEY_API_KEY;
const SERVER = process.env.LOBMONEY_SERVER || 'as';
const WORK_DIR = '/app/gameplay';

async function apiCall(endpoint) {
    const res = await fetch(`https://lobmoney.org${endpoint}`, {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
    });
    return res.json();
}

function patchWebSocket() {
    // Install ws package di ai-player kalau belum ada
    const aiPlayerDir = path.join(WORK_DIR, 'ai-player');
    const wsPath = path.join(aiPlayerDir, 'node_modules', 'ws');
    if (!fs.existsSync(wsPath)) {
        console.log('📦 Installing ws (WebSocket polyfill)...');
        execSync(`cd ${aiPlayerDir} && npm install ws --save`, { stdio: 'inherit' });
    }

    // Patch NetworkManager.ts compiled output untuk inject WebSocket global
    const possibleEntries = [
        path.join(aiPlayerDir, 'dist', 'managers', 'NetworkManager.js'),
        path.join(aiPlayerDir, 'src', 'managers', 'NetworkManager.ts'),
    ];

    // Cari file compiled JS
    const distDir = path.join(aiPlayerDir, 'dist');
    if (fs.existsSync(distDir)) {
        const networkFiles = [];
        function findFiles(dir) {
            for (const f of fs.readdirSync(dir)) {
                const full = path.join(dir, f);
                if (fs.statSync(full).isDirectory()) findFiles(full);
                else if (f.includes('NetworkManager') || f.includes('network')) networkFiles.push(full);
            }
        }
        findFiles(distDir);
        console.log('🔍 Network files found:', networkFiles);

        for (const file of networkFiles) {
            let content = fs.readFileSync(file, 'utf8');
            if (!content.includes('require("ws")') && !content.includes("require('ws')") && content.includes('WebSocket')) {
                const patch = `if (typeof WebSocket === 'undefined') { global.WebSocket = require('ws'); }\n`;
                fs.writeFileSync(file, patch + content);
                console.log(`✅ Patched WebSocket in ${path.basename(file)}`);
            }
        }
    }

    // Juga patch main entry point
    const mainFiles = [];
    function findMain(dir) {
        if (!fs.existsSync(dir)) return;
        for (const f of fs.readdirSync(dir)) {
            const full = path.join(dir, f);
            if (fs.statSync(full).isDirectory()) findMain(full);
            else if (f === 'main.js' || f === 'index.js') mainFiles.push(full);
        }
    }
    if (fs.existsSync(distDir)) findMain(distDir);
    for (const file of mainFiles) {
        let content = fs.readFileSync(file, 'utf8');
        if (!content.includes('require("ws")') && !content.includes("require('ws')")) {
            const patch = `if (typeof WebSocket === 'undefined') { global.WebSocket = require('ws'); }\n`;
            fs.writeFileSync(file, patch + content);
            console.log(`✅ Patched WebSocket in ${path.basename(file)}`);
        }
    }
}

async function runMiner() {
    if (!API_KEY) { console.error('❌ LOBMONEY_API_KEY tidak diset!'); process.exit(1); }

    const info = await apiCall('/api/agent/account_info');
    if (!info.success) { console.error('❌ API Key tidak valid'); process.exit(1); }
    console.log(`✅ Account: ${info.data.nickname || info.data.user_id}`);
    console.log(`💰 LOBCOIN: ${info.data.balance} | Gold: ${info.data.gold_balance}`);

    // Write config
    const configDir = path.join(WORK_DIR, 'ai-player', 'data');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ api_key: API_KEY }, null, 2));

    // Patch WebSocket
    patchWebSocket();

    const runScript = path.join(WORK_DIR, 'ai-player', 'run.sh');
    if (!fs.existsSync(runScript)) {
        console.error('❌ run.sh tidak ditemukan');
        process.exit(1);
    }

    execSync(`chmod +x ${runScript}`);
    console.log(`🚀 Starting AI Player (server: ${SERVER})...`);

    function start() {
        const child = spawn('bash', [runScript, SERVER], {
            cwd: path.join(WORK_DIR, 'ai-player'),
            stdio: 'inherit',
            env: {
                ...process.env,
                LOBMONEY_API_KEY: API_KEY,
                NODE_OPTIONS: '--experimental-websocket', // Node 20 built-in WebSocket
            }
        });
        child.on('close', (code) => {
            console.log(`⚠️ Exited (${code}), restarting in 15s...`);
            setTimeout(start, 15000);
        });
        child.on('error', (err) => {
            console.error('❌ Error:', err.message);
            setTimeout(start, 15000);
        });
    }
    start();

    setInterval(async () => {
        try {
            const i = await apiCall('/api/agent/account_info');
            if (i.success) console.log(`📊 [${new Date().toLocaleTimeString('id-ID')}] LOBCOIN: ${i.data.balance} | Gold: ${i.data.gold_balance}`);
        } catch(e) {}
    }, 5 * 60 * 1000);
}

runMiner().catch(err => {
    console.error('❌ Fatal:', err.message);
    process.exit(1);
});