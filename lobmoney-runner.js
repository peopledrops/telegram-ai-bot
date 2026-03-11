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

function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        console.log(`📥 Downloading: ${url}`);
        const file = fs.createWriteStream(destPath);
        function doRequest(reqUrl) {
            https.get(reqUrl, (res) => {
                if ([301,302,307,308].includes(res.statusCode)) {
                    file.close();
                    fs.unlinkSync(destPath);
                    const newFile = fs.createWriteStream(destPath);
                    // restart with redirect
                    https.get(res.headers.location, (res2) => {
                        res2.pipe(newFile);
                        newFile.on('finish', () => { newFile.close(); resolve(); });
                    }).on('error', reject);
                    return;
                }
                res.pipe(file);
                file.on('finish', () => { file.close(); resolve(); });
            }).on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
        }
        doRequest(url);
    });
}

// Extract zip pakai Python3 (selalu tersedia di Railway)
function extractZip(zipPath, destDir) {
    console.log('📦 Extracting with Python3...');
    const script = `
import zipfile, os, shutil
with zipfile.ZipFile('${zipPath}', 'r') as z:
    z.extractall('${destDir}')
items = os.listdir('${destDir}')
if len(items) == 1:
    src = os.path.join('${destDir}', items[0])
    for item in os.listdir(src):
        shutil.move(os.path.join(src, item), '${destDir}')
    os.rmdir(src)
print('OK')
    `.trim();
    execSync(`python3 -c "${script.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`, { stdio: 'inherit' });
}

async function setup() {
    console.log('🎮 LobMoney AI Player - Railway Runner');
    console.log('=====================================');

    if (!API_KEY) { console.error('❌ LOBMONEY_API_KEY tidak diset!'); process.exit(1); }

    console.log('🔍 Checking account...');
    const info = await apiCall('/api/agent/account_info');
    if (!info.success) { console.error('❌ API Key tidak valid:', info.error); process.exit(1); }
    console.log(`✅ Account: ${info.data.nickname || info.data.user_id}`);
    console.log(`💰 Balance: ${info.data.balance} LOBCOIN`);
    console.log(`⛏️ Gold this epoch: ${info.data.gold_balance}`);

    if (!fs.existsSync(path.join(WORK_DIR, 'ai-player'))) {
        const zipPath = '/tmp/gameplay.zip';
        fs.mkdirSync(WORK_DIR, { recursive: true });

        await downloadFile(
            'https://github.com/fungame2026/gameplay/archive/refs/heads/main.zip',
            zipPath
        );
        console.log(`✅ Downloaded (${(fs.statSync(zipPath).size / 1024 / 1024).toFixed(1)} MB)`);

        extractZip(zipPath, WORK_DIR);
        console.log('✅ Extracted to', WORK_DIR);

        fs.unlinkSync(zipPath);
    } else {
        console.log('📁 Gameplay repo already exists, skipping download');
    }

    // Install dependencies
    console.log('📦 Installing pnpm...');
    execSync('npm install -g pnpm --quiet', { stdio: 'inherit' });
    console.log('📦 Installing gameplay dependencies...');
    execSync(`cd ${WORK_DIR} && pnpm install`, { stdio: 'inherit' });
    console.log('🔨 Building...');
    execSync(`cd ${WORK_DIR} && pnpm build`, { stdio: 'inherit' });
    console.log('✅ Build complete');

    // Write config
    const configDir = path.join(WORK_DIR, 'ai-player', 'data');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ api_key: API_KEY }, null, 2));
    console.log('✅ Config written');
}

async function runMiner() {
    console.log(`\n🚀 Starting AI Player (server: ${SERVER})...`);
    const aiPlayerDir = path.join(WORK_DIR, 'ai-player');
    const runScript = path.join(aiPlayerDir, 'run.sh');

    if (!fs.existsSync(runScript)) {
        // List isi directory untuk debug
        console.log('📁 WORK_DIR contents:', fs.readdirSync(WORK_DIR));
        console.log('📁 ai-player contents:', fs.existsSync(aiPlayerDir) ? fs.readdirSync(aiPlayerDir) : 'NOT FOUND');
        console.error('❌ run.sh tidak ditemukan');
        process.exit(1);
    }

    execSync(`chmod +x ${runScript}`);
    console.log('✅ run.sh found, starting...');

    const child = spawn('bash', [runScript, SERVER], {
        cwd: aiPlayerDir,
        stdio: 'inherit',
        env: { ...process.env, LOBMONEY_API_KEY: API_KEY }
    });

    child.on('close', (code) => {
        console.log(`⚠️ AI Player exited (code ${code}), restarting in 15s...`);
        setTimeout(runMiner, 15000);
    });

    child.on('error', (err) => {
        console.error('❌ Spawn error:', err.message);
        setTimeout(runMiner, 15000);
    });

    // Status report setiap 5 menit
    setInterval(async () => {
        try {
            const i = await apiCall('/api/agent/account_info');
            if (i.success) console.log(`📊 [${new Date().toLocaleTimeString('id-ID')}] LOBCOIN: ${i.data.balance} | Gold: ${i.data.gold_balance}`);
        } catch (e) {}
    }, 5 * 60 * 1000);
}

(async () => {
    try {
        await setup();
        await runMiner();
    } catch (err) {
        console.error('❌ Fatal error:', err.message);
        console.error(err.stack);
        // Jangan exit — tunggu dan coba lagi
        setTimeout(async () => {
            try { await setup(); await runMiner(); } catch(e) { console.error('❌ Retry failed:', e.message); process.exit(1); }
        }, 30000);
    }
})();