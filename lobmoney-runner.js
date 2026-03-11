// lobmoney-runner.js - Runtime runner (gameplay sudah di-build saat build time)
require('dotenv').config();
const { spawn } = require('child_process');
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

async function runMiner() {
    if (!API_KEY) { console.error('❌ LOBMONEY_API_KEY tidak diset!'); process.exit(1); }

    // Cek akun
    const info = await apiCall('/api/agent/account_info');
    if (!info.success) { console.error('❌ API Key tidak valid'); process.exit(1); }
    console.log(`✅ Account: ${info.data.nickname || info.data.user_id}`);
    console.log(`💰 LOBCOIN: ${info.data.balance} | Gold: ${info.data.gold_balance}`);

    // Write config
    const configDir = path.join(WORK_DIR, 'ai-player', 'data');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ api_key: API_KEY }, null, 2));

    const runScript = path.join(WORK_DIR, 'ai-player', 'run.sh');
    if (!fs.existsSync(runScript)) {
        console.error('❌ run.sh tidak ditemukan. Pastikan lobmoney-setup.js sudah dijalankan saat build.');
        process.exit(1);
    }

    require('child_process').execSync(`chmod +x ${runScript}`);
    console.log(`🚀 Starting AI Player (server: ${SERVER})...`);

    function start() {
        const child = spawn('bash', [runScript, SERVER], {
            cwd: path.join(WORK_DIR, 'ai-player'),
            stdio: 'inherit',
            env: { ...process.env, LOBMONEY_API_KEY: API_KEY }
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

    // Status setiap 5 menit
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