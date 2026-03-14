// openclaw-runner.js - Install & run OpenClaw Gateway di Railway
require('dotenv').config();
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const zlib = require('zlib');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const DEEPSEK_API_KEY = process.env.DEEPSEK_API_KEY;
const PORT = process.env.PORT || 3000;
const HOME = os.homedir();
const CONFIG_DIR = path.join(HOME, '.openclaw');
const OPENCLAW_DIR = '/app/.openclaw-bin';

function run(cmd, opts = {}) {
    console.log(`$ ${cmd.substring(0, 80)}`);
    return execSync(cmd, { stdio: 'inherit', ...opts });
}

// Download dengan Node.js native https (handle redirect)
function downloadBuffer(url, redirects = 0) {
    return new Promise((resolve, reject) => {
        if (redirects > 10) return reject(new Error('Too many redirects'));
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 Node.js' } }, (res) => {
            if ([301,302,307,308].includes(res.statusCode)) {
                return resolve(downloadBuffer(res.headers.location, redirects + 1));
            }
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

function downloadFile(url, dest) {
    return downloadBuffer(url).then(buf => { fs.writeFileSync(dest, buf); });
}

// Extract tar.gz pakai Node.js (pure JS, no external tools)
function extractTarGz(buffer, destDir) {
    fs.mkdirSync(destDir, { recursive: true });
    const tar = zlib.gunzipSync(buffer);

    let offset = 0;
    let extracted = 0;

    while (offset < tar.length - 1024) {
        const header = tar.slice(offset, offset + 512);
        if (header.every(b => b === 0)) break;

        const name = header.slice(0, 100).toString('utf8').replace(/\0/g, '').trim();
        const sizeStr = header.slice(124, 136).toString('utf8').replace(/\0/g, '').trim();
        const typeFlag = header.slice(156, 157).toString('utf8');
        const size = parseInt(sizeStr, 8) || 0;

        offset += 512;

        if (name && typeFlag !== '5') {
            const parts = name.split('/');
            const relPath = parts.slice(1).join('/');
            if (relPath) {
                const fullPath = path.join(destDir, relPath);
                fs.mkdirSync(path.dirname(fullPath), { recursive: true });
                if (typeFlag === '' || typeFlag === '0') {
                    fs.writeFileSync(fullPath, tar.slice(offset, offset + size));
                    extracted++;
                }
            }
        }
        offset += Math.ceil(size / 512) * 512;
    }
    console.log(`✅ Extracted ${extracted} files`);
}

async function installOpenClaw() {
    // Cek apakah sudah ada
    const clawBin = path.join(OPENCLAW_DIR, 'bin', 'openclaw');
    if (fs.existsSync(clawBin)) {
        console.log('✅ OpenClaw already installed');
        return clawBin;
    }

    console.log('📦 Installing OpenClaw from GitHub releases...');
    fs.mkdirSync(OPENCLAW_DIR, { recursive: true });

    // Cari release terbaru via GitHub API
    console.log('🔍 Fetching latest release info...');
    const releaseData = await downloadBuffer('https://api.github.com/repos/steipete/OpenClaw/releases/latest');
    const release = JSON.parse(releaseData.toString());
    console.log('📌 Latest release:', release.tag_name);

    // Cari asset untuk Linux x64
    const assets = release.assets || [];
    console.log('📦 Available assets:', assets.map(a => a.name).join(', '));

    let downloadUrl = null;
    let isScript = false;

    // Cari binary linux
    for (const asset of assets) {
        const name = asset.name.toLowerCase();
        if (name.includes('linux') && (name.includes('x64') || name.includes('amd64'))) {
            downloadUrl = asset.browser_download_url;
            break;
        }
    }

    // Fallback: cari .tar.gz atau .zip apapun
    if (!downloadUrl) {
        for (const asset of assets) {
            const name = asset.name.toLowerCase();
            if (name.endsWith('.tar.gz') || name.endsWith('.tgz')) {
                downloadUrl = asset.browser_download_url;
                break;
            }
        }
    }

    // Fallback: install script
    if (!downloadUrl) {
        console.log('⚠️ No binary found, trying install script...');
        const scriptBuf = await downloadBuffer('https://openclaw.ai/install.sh');
        const scriptPath = '/tmp/openclaw-install.sh';
        fs.writeFileSync(scriptPath, scriptBuf);
        fs.chmodSync(scriptPath, '755');

        // Buat fake curl/wget yang pakai Node.js
        const fakeCurl = `#!/bin/bash
node -e "
const https = require('https');
const fs = require('fs');
const url = process.argv[1];
function get(u, r=0) {
  https.get(u, {headers:{'User-Agent':'curl/7.0'}}, res => {
    if([301,302,307,308].includes(res.statusCode)) return get(res.headers.location, r+1);
    const out = process.argv[2] === '-o' ? fs.createWriteStream(process.argv[3]) : process.stdout;
    res.pipe(out);
  });
}
get(url);
" -- "\$@"`;

        fs.writeFileSync('/usr/local/bin/curl', fakeCurl);
        fs.chmodSync('/usr/local/bin/curl', '755');
        fs.writeFileSync('/usr/local/bin/wget', fakeCurl);
        fs.chmodSync('/usr/local/bin/wget', '755');

        run(`bash ${scriptPath} --yes --no-daemon || true`, {
            env: { ...process.env, HOME, CI: '1', NONINTERACTIVE: '1' }
        });
        isScript = true;
    }

    if (downloadUrl && !isScript) {
        console.log('⬇️ Downloading:', downloadUrl);
        const buf = await downloadBuffer(downloadUrl);
        console.log(`✅ Downloaded ${(buf.length/1024/1024).toFixed(1)} MB`);

        if (downloadUrl.endsWith('.tar.gz') || downloadUrl.endsWith('.tgz')) {
            extractTarGz(buf, OPENCLAW_DIR);
        } else if (downloadUrl.endsWith('.zip')) {
            const zipPath = '/tmp/openclaw.zip';
            fs.writeFileSync(zipPath, buf);
            run(`cd ${OPENCLAW_DIR} && node -e "
const zlib=require('zlib'),fs=require('fs');
// unzip not available, use python fallback
" || python3 -c "import zipfile; zipfile.ZipFile('/tmp/openclaw.zip').extractall('${OPENCLAW_DIR}')" || true`);
        } else {
            // Mungkin binary langsung
            const binPath = path.join(OPENCLAW_DIR, 'openclaw');
            fs.writeFileSync(binPath, buf);
            fs.chmodSync(binPath, '755');
        }
    }

    // Cari binary setelah install
    try {
        const found = execSync(`find ${OPENCLAW_DIR} /root/.local /usr/local/bin -name "openclaw" -type f 2>/dev/null | head -1`, { stdio: 'pipe' }).toString().trim();
        if (found) {
            fs.mkdirSync(path.join(OPENCLAW_DIR, 'bin'), { recursive: true });
            if (found !== clawBin) run(`ln -sf ${found} ${clawBin} || cp ${found} ${clawBin}`);
            fs.chmodSync(found, '755');
            console.log('✅ OpenClaw binary:', found);
            return found;
        }
    } catch {}

    // Debug: list semua file
    try {
        const files = execSync(`find ${OPENCLAW_DIR} -type f 2>/dev/null | head -20`, { stdio: 'pipe' }).toString();
        console.log('📁 Files in openclaw dir:\n', files || 'empty');
    } catch {}

    throw new Error('OpenClaw binary tidak ditemukan setelah install');
}

function writeConfig() {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });

    let modelConfig = {};
    if (DEEPSEK_API_KEY) {
        modelConfig = { provider: 'deepseek', apiKey: DEEPSEK_API_KEY, model: 'deepseek-chat' };
    } else if (ANTHROPIC_API_KEY) {
        modelConfig = { provider: 'anthropic', apiKey: ANTHROPIC_API_KEY, model: 'claude-sonnet-4-20250514' };
    } else if (GROQ_API_KEY) {
        modelConfig = { provider: 'groq', apiKey: GROQ_API_KEY, model: 'llama-3.3-70b-versatile' };
    }

    const config = {
        gateway: { port: parseInt(PORT), bind: '0.0.0.0' },
        model: modelConfig,
        channels: {
            telegram: {
                enabled: !!TELEGRAM_BOT_TOKEN,
                botToken: TELEGRAM_BOT_TOKEN || '',
                dmPolicy: 'open',
            }
        }
    };

    fs.writeFileSync(path.join(CONFIG_DIR, 'config.json'), JSON.stringify(config, null, 2));
    console.log('✅ Config written | Provider:', modelConfig.provider || 'none');
    console.log('   Telegram:', TELEGRAM_BOT_TOKEN ? 'enabled ✅' : 'disabled ⚠️');
}

async function startGateway(binPath) {
    console.log('\n🚀 Starting OpenClaw Gateway on port', PORT);
    process.env.PATH = `${path.dirname(binPath)}:/root/.local/bin:/usr/local/bin:${process.env.PATH}`;

    const child = spawn(binPath, ['gateway', '--port', String(PORT), '--bind', '0.0.0.0'], {
        stdio: 'inherit',
        env: { ...process.env, HOME, OPENCLAW_CONFIG_DIR: CONFIG_DIR }
    });

    child.on('error', err => { console.error('❌ Gateway error:', err.message); process.exit(1); });
    child.on('close', code => {
        console.log(`⚠️ Gateway exited (${code}), restarting in 10s...`);
        setTimeout(() => startGateway(binPath), 10000);
    });
}

(async () => {
    console.log('🦞 OpenClaw Gateway - Railway');
    console.log('==============================');

    if (!DEEPSEK_API_KEY && !ANTHROPIC_API_KEY && !GROQ_API_KEY) {
        console.error('❌ Set salah satu: DEEPSEK_API_KEY, ANTHROPIC_API_KEY, atau GROQ_API_KEY');
        process.exit(1);
    }

    try {
        const binPath = await installOpenClaw();
        writeConfig();
        await startGateway(binPath);
    } catch (err) {
        console.error('❌ Fatal:', err.message);
        process.exit(1);
    }
})();