// lobmoney-runner.js - LobMoney AI Player Runner for Railway
require('dotenv').config();
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const API_KEY = process.env.LOBMONEY_API_KEY;
const SERVER = process.env.LOBMONEY_SERVER || 'as';
const WORK_DIR = '/app/gameplay';

async function apiCall(endpoint, method = 'GET', body = null) {
    const res = await fetch(`https://lobmoney.org${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
        body: body ? JSON.stringify(body) : null,
    });
    return res.json();
}

// Download file dengan handle redirect
function downloadFile(url, destPath, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        if (redirectCount > 5) return reject(new Error('Too many redirects'));
        https.get(url, { headers: { 'User-Agent': 'Node.js' } }, (res) => {
            if ([301,302,307,308].includes(res.statusCode)) {
                return resolve(downloadFile(res.headers.location, destPath, redirectCount + 1));
            }
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
            const file = fs.createWriteStream(destPath);
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
            file.on('error', reject);
        }).on('error', reject);
    });
}

// Extract zip pakai Node.js built-in (pure JS, no dependencies)
function extractZip(zipPath, destDir) {
    console.log('📦 Extracting ZIP with Node.js...');
    const data = fs.readFileSync(zipPath);

    // Parse ZIP file format
    let offset = data.length - 22;
    // Find end of central directory
    while (offset >= 0 && data.readUInt32LE(offset) !== 0x06054b50) offset--;
    if (offset < 0) throw new Error('Invalid ZIP file');

    const cdOffset = data.readUInt32LE(offset + 16);
    const cdSize = data.readUInt32LE(offset + 12);
    let cdPos = cdOffset;
    const entries = [];

    while (cdPos < cdOffset + cdSize) {
        if (data.readUInt32LE(cdPos) !== 0x02014b50) break;
        const compression = data.readUInt16LE(cdPos + 10);
        const compressedSize = data.readUInt32LE(cdPos + 20);
        const uncompressedSize = data.readUInt32LE(cdPos + 24);
        const fileNameLen = data.readUInt16LE(cdPos + 28);
        const extraLen = data.readUInt16LE(cdPos + 30);
        const commentLen = data.readUInt16LE(cdPos + 32);
        const localHeaderOffset = data.readUInt32LE(cdPos + 42);
        const fileName = data.slice(cdPos + 46, cdPos + 46 + fileNameLen).toString('utf8');
        entries.push({ fileName, compression, compressedSize, uncompressedSize, localHeaderOffset });
        cdPos += 46 + fileNameLen + extraLen + commentLen;
    }

    let extracted = 0;
    for (const entry of entries) {
        // Get local file header
        const lhPos = entry.localHeaderOffset;
        const lhFileNameLen = data.readUInt16LE(lhPos + 26);
        const lhExtraLen = data.readUInt16LE(lhPos + 28);
        const dataStart = lhPos + 30 + lhFileNameLen + lhExtraLen;

        // Strip first path component (gameplay-main/)
        const parts = entry.fileName.split('/');
        if (parts.length <= 1) continue;
        const relPath = parts.slice(1).join('/');
        if (!relPath) continue;

        const fullPath = path.join(destDir, relPath);

        if (entry.fileName.endsWith('/')) {
            fs.mkdirSync(fullPath, { recursive: true });
        } else {
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            const compressedData = data.slice(dataStart, dataStart + entry.compressedSize);
            let fileData;
            if (entry.compression === 0) {
                fileData = compressedData;
            } else if (entry.compression === 8) {
                fileData = zlib.inflateRawSync(compressedData);
            } else {
                console.warn(`⚠️ Unsupported compression ${entry.compression} for ${entry.fileName}`);
                continue;
            }
            fs.writeFileSync(fullPath, fileData);
            extracted++;
        }
    }
    console.log(`✅ Extracted ${extracted} files`);
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

        await downloadFile('https://github.com/fungame2026/gameplay/archive/refs/heads/main.zip', zipPath);
        console.log(`✅ Downloaded (${(fs.statSync(zipPath).size/1024/1024).toFixed(1)} MB)`);

        extractZip(zipPath, WORK_DIR);
        try { fs.unlinkSync(zipPath); } catch(e) {}
    } else {
        console.log('📁 Gameplay repo already exists');
    }

    // Install dependencies
    console.log('📦 Installing pnpm...');
    execSync('npm install -g pnpm --quiet', { stdio: 'inherit' });
    console.log('📦 Installing dependencies...');
    execSync(`cd ${WORK_DIR} && pnpm install`, { stdio: 'inherit' });
    console.log('🔨 Building...');
    execSync(`cd ${WORK_DIR} && pnpm build`, { stdio: 'inherit' });

    // Write config
    const configDir = path.join(WORK_DIR, 'ai-player', 'data');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ api_key: API_KEY }, null, 2));
    console.log('✅ Setup complete!');
}

async function runMiner() {
    console.log(`\n🚀 Starting AI Player (server: ${SERVER})...`);
    const aiPlayerDir = path.join(WORK_DIR, 'ai-player');
    const runScript = path.join(aiPlayerDir, 'run.sh');

    if (!fs.existsSync(runScript)) {
        console.log('📁 Contents:', fs.readdirSync(WORK_DIR));
        console.error('❌ run.sh tidak ditemukan');
        process.exit(1);
    }

    execSync(`chmod +x ${runScript}`);

    const child = spawn('bash', [runScript, SERVER], {
        cwd: aiPlayerDir,
        stdio: 'inherit',
        env: { ...process.env, LOBMONEY_API_KEY: API_KEY }
    });

    child.on('close', (code) => {
        console.log(`⚠️ AI Player exited (${code}), restarting in 15s...`);
        setTimeout(runMiner, 15000);
    });

    child.on('error', (err) => {
        console.error('❌ Error:', err.message);
        setTimeout(runMiner, 15000);
    });

    setInterval(async () => {
        try {
            const i = await apiCall('/api/agent/account_info');
            if (i.success) console.log(`📊 [${new Date().toLocaleTimeString('id-ID')}] LOBCOIN: ${i.data.balance} | Gold: ${i.data.gold_balance}`);
        } catch(e) {}
    }, 5 * 60 * 1000);
}

(async () => {
    try {
        await setup();
        await runMiner();
    } catch (err) {
        console.error('❌ Fatal error:', err.message);
        console.error(err.stack);
        setTimeout(async () => {
            try { await setup(); await runMiner(); }
            catch(e) { console.error('❌ Retry failed:', e.message); process.exit(1); }
        }, 30000);
    }
})();