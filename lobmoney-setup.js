// lobmoney-setup.js - Dijalankan saat BUILD TIME di Railway
// Download & build gameplay repo saat build, bukan saat runtime
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const WORK_DIR = '/app/gameplay';

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

function extractZip(zipPath, destDir) {
    console.log('📦 Extracting ZIP...');
    const data = fs.readFileSync(zipPath);
    let offset = data.length - 22;
    while (offset >= 0 && data.readUInt32LE(offset) !== 0x06054b50) offset--;
    if (offset < 0) throw new Error('Invalid ZIP');
    const cdOffset = data.readUInt32LE(offset + 16);
    const cdSize = data.readUInt32LE(offset + 12);
    let cdPos = cdOffset;
    const entries = [];
    while (cdPos < cdOffset + cdSize) {
        if (data.readUInt32LE(cdPos) !== 0x02014b50) break;
        const compression = data.readUInt16LE(cdPos + 10);
        const compressedSize = data.readUInt32LE(cdPos + 20);
        const fileNameLen = data.readUInt16LE(cdPos + 28);
        const extraLen = data.readUInt16LE(cdPos + 30);
        const commentLen = data.readUInt16LE(cdPos + 32);
        const localHeaderOffset = data.readUInt32LE(cdPos + 42);
        const fileName = data.slice(cdPos + 46, cdPos + 46 + fileNameLen).toString('utf8');
        entries.push({ fileName, compression, compressedSize, localHeaderOffset });
        cdPos += 46 + fileNameLen + extraLen + commentLen;
    }
    let extracted = 0;
    for (const entry of entries) {
        const lhPos = entry.localHeaderOffset;
        const lhFileNameLen = data.readUInt16LE(lhPos + 26);
        const lhExtraLen = data.readUInt16LE(lhPos + 28);
        const dataStart = lhPos + 30 + lhFileNameLen + lhExtraLen;
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
            const fileData = entry.compression === 0 ? compressedData : zlib.inflateRawSync(compressedData);
            fs.writeFileSync(fullPath, fileData);
            extracted++;
        }
    }
    console.log(`✅ Extracted ${extracted} files`);
}

(async () => {
    console.log('🔧 LobMoney Setup (Build Time)');
    console.log('Node version:', process.version);

    if (fs.existsSync(path.join(WORK_DIR, 'ai-player', 'run.sh'))) {
        console.log('✅ Gameplay already built, skipping');
        return;
    }

    fs.mkdirSync(WORK_DIR, { recursive: true });

    console.log('📥 Downloading gameplay repo...');
    const zipPath = '/tmp/gameplay.zip';
    await downloadFile('https://github.com/fungame2026/gameplay/archive/refs/heads/main.zip', zipPath);
    console.log(`✅ Downloaded (${(fs.statSync(zipPath).size/1024/1024).toFixed(1)} MB)`);

    extractZip(zipPath, WORK_DIR);
    try { fs.unlinkSync(zipPath); } catch(e) {}

    console.log('📦 Installing gameplay dependencies...');
    execSync(`cd ${WORK_DIR} && pnpm install`, { stdio: 'inherit' });

    console.log('🔨 Building gameplay...');
    execSync(`cd ${WORK_DIR} && pnpm build`, { stdio: 'inherit' });

    console.log('✅ Gameplay build complete!');
})().catch(err => {
    console.error('❌ Setup failed:', err.message);
    process.exit(1);
});