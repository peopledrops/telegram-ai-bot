#!/usr/bin/env node
// lobmoney-runner.js - LobMoney AI Player Runner for Railway
// Menjalankan AI player dari repo resmi: https://github.com/fungame2026/gameplay
// Deploy ini sebagai SERVICE TERPISAH di Railway (bukan di bot Telegram)

require('dotenv').config();
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.LOBMONEY_API_KEY;
const SERVER = process.env.LOBMONEY_SERVER || 'as'; // 'as' = Asia, 'na' = North America
const REPO_URL = 'https://github.com/fungame2026/gameplay.git';
const WORK_DIR = '/app/gameplay';

async function apiCall(endpoint, method = 'GET', body = null) {
    const res = await fetch(`https://lobmoney.org${endpoint}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`,
        },
        body: body ? JSON.stringify(body) : null,
    });
    return res.json();
}

async function setup() {
    console.log('🎮 LobMoney AI Player - Railway Runner');
    console.log('=====================================');

    if (!API_KEY) {
        console.error('❌ LOBMONEY_API_KEY tidak diset!');
        console.error('Set di Railway Variables: LOBMONEY_API_KEY=your_key');
        process.exit(1);
    }

    // Cek akun
    console.log('🔍 Checking account...');
    const info = await apiCall('/api/agent/account_info');
    if (!info.success) {
        console.error('❌ API Key tidak valid:', info.error || 'Unknown error');
        process.exit(1);
    }
    console.log(`✅ Account: ${info.data.nickname || 'Unnamed'}`);
    console.log(`💰 Balance: ${info.data.balance} LOBCOIN`);
    console.log(`⛏️ Gold this epoch: ${info.data.gold_balance}`);

    // Download repo via zip (tidak butuh git)
    if (!fs.existsSync(WORK_DIR)) {
        console.log('📥 Downloading gameplay repo...');
        const zipUrl = 'https://github.com/fungame2026/gameplay/archive/refs/heads/main.zip';
        const zipPath = '/tmp/gameplay.zip';

        // Download zip
        execSync(`wget -O ${zipPath} "${zipUrl}" || curl -L -o ${zipPath} "${zipUrl}"`, { stdio: 'inherit' });

        // Extract
        execSync(`mkdir -p ${WORK_DIR} && unzip -o ${zipPath} -d /tmp/gameplay_extract && mv /tmp/gameplay_extract/gameplay-main/* ${WORK_DIR}/`, { stdio: 'inherit' });
        console.log('✅ Repo downloaded and extracted');
    } else {
        console.log('📁 Gameplay repo already exists, skipping download');
    }

    // Install dependencies
    console.log('📦 Installing dependencies...');
    execSync('npm install -g pnpm', { stdio: 'inherit' });
    execSync(`cd ${WORK_DIR} && pnpm install`, { stdio: 'inherit' });
    execSync(`cd ${WORK_DIR} && pnpm build`, { stdio: 'inherit' });

    // Setup config.json dengan API key
    const configDir = path.join(WORK_DIR, 'ai-player', 'data');
    const configFile = path.join(configDir, 'config.json');

    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }

    if (!fs.existsSync(configFile)) {
        console.log('⚙️ Creating config.json...');
        // Buat config dengan API key yang sudah ada
        const config = {
            api_key: API_KEY,
            server: SERVER === 'as' ? 'https://as.lobmoney.org' : 'https://us.lobmoney.org',
        };
        fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
        console.log('✅ Config created');
    } else {
        // Update API key di config yang ada
        const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
        config.api_key = API_KEY;
        fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
        console.log('✅ Config updated');
    }

    return true;
}

async function runMiner() {
    console.log(`\n🚀 Starting AI Player on server: ${SERVER}...`);

    const aiPlayerDir = path.join(WORK_DIR, 'ai-player');

    // Jalankan run.sh
    const runScript = path.join(aiPlayerDir, 'run.sh');
    if (!fs.existsSync(runScript)) {
        console.error('❌ run.sh tidak ditemukan di', runScript);
        process.exit(1);
    }

    // Make executable
    execSync(`chmod +x ${runScript}`);

    const child = spawn('bash', [runScript, SERVER], {
        cwd: aiPlayerDir,
        stdio: 'inherit',
        env: {
            ...process.env,
            LOBMONEY_API_KEY: API_KEY,
        }
    });

    child.on('close', (code) => {
        console.log(`\n⚠️ AI Player exited with code ${code}`);
        console.log('🔄 Restarting in 10 seconds...');
        setTimeout(runMiner, 10000);
    });

    child.on('error', (err) => {
        console.error('❌ AI Player error:', err.message);
        console.log('🔄 Restarting in 10 seconds...');
        setTimeout(runMiner, 10000);
    });

    // Status reporter setiap 5 menit
    setInterval(async () => {
        try {
            const info = await apiCall('/api/agent/account_info');
            if (info.success) {
                console.log(`\n📊 Status [${new Date().toLocaleTimeString('id-ID')}]`);
                console.log(`💰 LOBCOIN: ${info.data.balance}`);
                console.log(`⛏️ Gold Epoch: ${info.data.gold_balance}`);
            }
        } catch (e) {
            console.warn('⚠️ Status check failed:', e.message);
        }
    }, 5 * 60 * 1000);
}

// Main
(async () => {
    try {
        await setup();
        await runMiner();
    } catch (err) {
        console.error('❌ Fatal error:', err.message);
        process.exit(1);
    }
})();