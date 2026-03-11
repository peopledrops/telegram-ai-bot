// lobmoney-runner.js - LobMoney AI Player Runner for Railway
require('dotenv').config();
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = process.env.LOBMONEY_API_KEY;
const SERVER = process.env.LOBMONEY_SERVER || 'as';
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

// Download file pakai Node.js native https (tidak butuh wget/curl/git)
function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        console.log(`📥 Downloading: ${url}`);
        const file = fs.createWriteStream(destPath);

        function doRequest(reqUrl) {
            https.get(reqUrl, (res) => {
                // Handle redirect
                if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
                    file.close();
                    doRequest(res.headers.location);
                    return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }
                res.pipe(file);
                file.on('finish', () => { file.close(); resolve(); });
            }).on('error', (err) => {
                fs.unlink(destPath, () => {});
                reject(err);
            });
        }
        doRequest(url);
    });
}

async function setup() {
    console.log('🎮 LobMoney AI Player - Railway Runner');
    console.log('=====================================');

    if (!API_KEY) {
        console.error('❌ LOBMONEY_API_KEY tidak diset!');
        process.exit(1);
    }

    // Cek akun
    console.log('🔍 Checking account...');
    const info = await apiCall('/api/agent/account_info');
    if (!info.success) {
        console.error('❌ API Key tidak valid:', info.error);
        process.exit(1);
    }
    console.log(`✅ Account: ${info.data.nickname || 'Unnamed'}`);
    console.log(`💰 Balance: ${info.data.balance} LOBCOIN`);
    console.log(`⛏️ Gold this epoch: ${info.data.gold_balance}`);

    // Download repo kalau belum ada
    if (!fs.existsSync(WORK_DIR) || !fs.existsSync(path.join(WORK_DIR, 'package.json'))) {
        console.log('📥 Downloading gameplay repo via Node.js https...');
        const zipPath = '/tmp/gameplay.zip';
        const extractDir = '/tmp/gameplay_extract';

        // Download zip
        await downloadFile(
            'https://github.com/fungame2026/gameplay/archive/refs/heads/main.zip',
            zipPath
        );
        console.log('✅ Downloaded gameplay.zip');

        // Extract pakai Node.js (unzipper module atau fallback ke unzip command)
        fs.mkdirSync(extractDir, { recursive: true });
        fs.mkdirSync(WORK_DIR, { recursive: true });

        try {
            execSync(`unzip -o ${zipPath} -d ${extractDir}`, { stdio: 'inherit' });
        } catch (e) {
            // Fallback: coba python3 unzip
            execSync(`python3 -c "import zipfile; zipfile.ZipFile('${zipPath}').extractall('${extractDir}')"`, { stdio: 'inherit' });
        }

        // Pindahkan isi folder ke WORK_DIR
        const extracted = fs.readdirSync(extractDir)[0];
        execSync(`cp -r ${extractDir}/${extracted}/. ${WORK_DIR}/`, { stdio: 'inherit' });
        console.log('✅ Repo extracted to', WORK_DIR);
    } else {
        console.log('📁 Gameplay repo already exists');
    }

    // Install dependencies
    console.log('📦 Installing pnpm & dependencies...');
    execSync('npm install -g pnpm', { stdio: 'inherit' });
    execSync(`cd ${WORK_DIR} && pnpm install --frozen-lockfile || pnpm install`, { stdio: 'inherit' });
    execSync(`cd ${WORK_DIR} && pnpm build`, { stdio: 'inherit' });
    console.log('✅ Dependencies installed');

    // Setup config
    const configDir = path.join(WORK_DIR, 'ai-player', 'data');
    const configFile = path.join(configDir, 'config.json');
    fs.mkdirSync(configDir, { recursive: true });

    const config = { api_key: API_KEY };
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    console.log('✅ Config written');
}

async function runMiner() {
    console.log(`\n🚀 Starting AI Player (server: ${SERVER})...`);
    const aiPlayerDir = path.join(WORK_DIR, 'ai-player');
    const runScript = path.join(aiPlayerDir, 'run.sh');

    if (!fs.existsSync(runScript)) {
        console.error('❌ run.sh tidak ditemukan:', runScript);
        process.exit(1);
    }

    execSync(`chmod +x ${runScript}`);

    const child = spawn('bash', [runScript, SERVER], {
        cwd: aiPlayerDir,
        stdio: 'inherit',
        env: { ...process.env, LOBMONEY_API_KEY: API_KEY }
    });

    child.on('close', (code) => {
        console.log(`⚠️ AI Player exited (code ${code}), restarting in 10s...`);
        setTimeout(runMiner, 10000);
    });

    child.on('error', (err) => {
        console.error('❌ Error:', err.message);
        setTimeout(runMiner, 10000);
    });

    // Status setiap 5 menit
    setInterval(async () => {
        try {
            const info = await apiCall('/api/agent/account_info');
            if (info.success) {
                console.log(`📊 [${new Date().toLocaleTimeString('id-ID')}] LOBCOIN: ${info.data.balance} | Gold: ${info.data.gold_balance}`);
            }
        } catch (e) {}
    }, 5 * 60 * 1000);
}

(async () => {
    try {
        await setup();
        await runMiner();
    } catch (err) {
        console.error('❌ Fatal error:', err.message);
        process.exit(1);
    }
})();