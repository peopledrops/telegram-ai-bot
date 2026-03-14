// openclaw-runner.js - Install & run OpenClaw Gateway di Railway
require('dotenv').config();
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const DEEPSEK_API_KEY = process.env.DEEPSEK_API_KEY;
const PORT = process.env.PORT || 3000;
const HOME = os.homedir();
const CONFIG_DIR = path.join(HOME, '.openclaw');

function run(cmd, opts = {}) {
    console.log(`$ ${cmd}`);
    return execSync(cmd, { stdio: 'inherit', ...opts });
}

function downloadFile(url, dest, redirects = 0) {
    return new Promise((resolve, reject) => {
        if (redirects > 5) return reject(new Error('Too many redirects'));
        https.get(url, { headers: { 'User-Agent': 'Node.js' } }, (res) => {
            if ([301,302,307,308].includes(res.statusCode)) {
                return resolve(downloadFile(res.headers.location, dest, redirects + 1));
            }
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
            const file = fs.createWriteStream(dest);
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
        }).on('error', reject);
    });
}

async function installOpenClaw() {
    // Cek apakah sudah terinstall
    try {
        const ver = execSync('openclaw --version', { stdio: 'pipe' }).toString().trim();
        console.log('✅ OpenClaw already installed:', ver);
        return;
    } catch {}

    console.log('📦 Installing OpenClaw via installer script...');

    // Download installer
    const installerPath = '/tmp/openclaw-install.sh';
    await downloadFile('https://openclaw.ai/install.sh', installerPath);
    fs.chmodSync(installerPath, '755');

    // Jalankan installer (non-interactive)
    try {
        run(`bash ${installerPath} --yes --no-daemon`, {
            env: { ...process.env, HOME, CI: '1', NONINTERACTIVE: '1' }
        });
    } catch (e) {
        console.log('⚠️ Installer script failed, trying npm install...');
        // Fallback: coba install via npm langsung dari GitHub
        run('npm install -g https://github.com/steipete/OpenClaw/releases/latest/download/openclaw.tgz || npm install -g openclaw || npm install -g @steipete/openclaw');
    }

    // Update PATH
    process.env.PATH = `/root/.local/bin:/root/.npm-global/bin:/usr/local/bin:${process.env.PATH}`;

    try {
        const ver = execSync('openclaw --version', { stdio: 'pipe' }).toString().trim();
        console.log('✅ OpenClaw installed:', ver);
    } catch {
        // Cari binary openclaw
        try {
            const which = execSync('find /root -name "openclaw" -type f 2>/dev/null | head -1', { stdio: 'pipe' }).toString().trim();
            if (which) {
                run(`ln -sf ${which} /usr/local/bin/openclaw`);
                console.log('✅ OpenClaw linked:', which);
            }
        } catch {}
    }
}

function writeConfig() {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });

    // Pilih AI provider
    let modelConfig = {};
    if (DEEPSEK_API_KEY) {
        modelConfig = { provider: 'deepseek', apiKey: DEEPSEK_API_KEY, model: 'deepseek-chat' };
    } else if (ANTHROPIC_API_KEY) {
        modelConfig = { provider: 'anthropic', apiKey: ANTHROPIC_API_KEY, model: 'claude-sonnet-4-20250514' };
    } else if (GROQ_API_KEY) {
        modelConfig = { provider: 'groq', apiKey: GROQ_API_KEY, model: 'llama-3.3-70b-versatile' };
    }

    const config = {
        gateway: {
            port: parseInt(PORT),
            bind: '0.0.0.0',
        },
        model: modelConfig,
        channels: {
            telegram: {
                enabled: !!TELEGRAM_BOT_TOKEN,
                botToken: TELEGRAM_BOT_TOKEN || '',
                dmPolicy: 'open',
            },
            webui: {
                enabled: true,
                port: parseInt(PORT),
            }
        }
    };

    // Tulis config.json
    fs.writeFileSync(path.join(CONFIG_DIR, 'config.json'), JSON.stringify(config, null, 2));
    // Tulis juga config.json5 (format yang OpenClaw prefer)
    fs.writeFileSync(path.join(CONFIG_DIR, 'clawdbot.json'), JSON.stringify(config, null, 2));

    console.log('✅ Config written to', CONFIG_DIR);
    console.log('   Provider:', modelConfig.provider || 'none');
    console.log('   Telegram:', TELEGRAM_BOT_TOKEN ? 'enabled' : 'disabled');
}

async function startGateway() {
    console.log('\n🚀 Starting OpenClaw Gateway...');

    // Update PATH sebelum spawn
    process.env.PATH = `/root/.local/bin:/root/.npm-global/bin:/usr/local/bin:${process.env.PATH}`;

    const child = spawn('openclaw', ['gateway', '--port', String(PORT), '--bind', '0.0.0.0'], {
        stdio: 'inherit',
        env: {
            ...process.env,
            HOME,
            OPENCLAW_CONFIG_DIR: CONFIG_DIR,
        }
    });

    child.on('error', (err) => {
        console.error('❌ Failed to start openclaw gateway:', err.message);
        console.log('🔍 Trying to find openclaw binary...');
        try {
            const bins = execSync('find / -name "openclaw" -type f 2>/dev/null', { stdio: 'pipe' }).toString().trim();
            console.log('Found binaries:', bins || 'none');
        } catch {}
        process.exit(1);
    });

    child.on('close', (code) => {
        console.log(`⚠️ Gateway exited (${code}), restarting in 10s...`);
        setTimeout(startGateway, 10000);
    });
}

(async () => {
    console.log('🦞 OpenClaw Gateway - Railway');
    console.log('==============================');
    console.log('Node:', process.version);
    console.log('PORT:', PORT);

    if (!TELEGRAM_BOT_TOKEN) {
        console.warn('⚠️ TELEGRAM_BOT_TOKEN tidak diset! Telegram channel tidak aktif.');
    }
    if (!DEEPSEK_API_KEY && !ANTHROPIC_API_KEY && !GROQ_API_KEY) {
        console.error('❌ Set salah satu: DEEPSEK_API_KEY, ANTHROPIC_API_KEY, atau GROQ_API_KEY');
        process.exit(1);
    }

    await installOpenClaw();
    writeConfig();
    await startGateway();
})();