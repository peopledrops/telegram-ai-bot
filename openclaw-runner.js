// openclaw-runner.js - Install & run OpenClaw di Railway
require('dotenv').config();
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const DEEPSEK_API_KEY = process.env.DEEPSEK_API_KEY;
const PORT = process.env.PORT || 3000;
const HOME = os.homedir();
const CONFIG_DIR = path.join(HOME, '.openclaw');

function run(cmd, opts = {}) {
    console.log(`$ ${cmd.substring(0, 100)}`);
    return execSync(cmd, { stdio: 'inherit', ...opts });
}

async function installOpenClaw() {
    // Cek apakah sudah terinstall
    try {
        const ver = execSync('openclaw --version', { stdio: 'pipe' }).toString().trim();
        console.log('✅ OpenClaw already installed:', ver);
        return;
    } catch {}

    console.log('📦 Installing OpenClaw via npm...');
    // Nama package yang benar adalah "openclaw" (bukan @openclaw/cli)
    run('npm install -g openclaw');

    // Update PATH
    const npmGlobal = execSync('npm root -g', { stdio: 'pipe' }).toString().trim().replace('/node_modules', '/bin');
    process.env.PATH = `${npmGlobal}:/usr/local/bin:${process.env.PATH}`;

    try {
        const ver = execSync('openclaw --version', { stdio: 'pipe' }).toString().trim();
        console.log('✅ OpenClaw installed:', ver);
    } catch {
        // Cari binary
        const found = execSync('find /root /usr/local -name "openclaw" -type f 2>/dev/null | head -1', { stdio: 'pipe' }).toString().trim();
        if (found) {
            console.log('✅ Found openclaw at:', found);
            run(`ln -sf ${found} /usr/local/bin/openclaw || true`);
        } else {
            throw new Error('openclaw binary tidak ditemukan setelah install');
        }
    }
}

function writeConfig() {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });

    // Pilih AI provider
    let provider, apiKey, model;
    if (DEEPSEK_API_KEY) {
        provider = 'deepseek'; apiKey = DEEPSEK_API_KEY; model = 'deepseek-chat';
    } else if (ANTHROPIC_API_KEY) {
        provider = 'anthropic'; apiKey = ANTHROPIC_API_KEY; model = 'claude-sonnet-4-20250514';
    } else if (GROQ_API_KEY) {
        provider = 'groq'; apiKey = GROQ_API_KEY; model = 'llama-3.3-70b-versatile';
    }

    // Config utama OpenClaw
    const config = {
        gateway: {
            port: parseInt(PORT),
            bind: '0.0.0.0',
        },
        ai: {
            provider,
            apiKey,
            model,
        },
        channels: {
            telegram: {
                enabled: !!TELEGRAM_BOT_TOKEN,
                botToken: TELEGRAM_BOT_TOKEN || '',
                dmPolicy: 'open',
                pairing: 'auto',
            }
        }
    };

    fs.writeFileSync(path.join(CONFIG_DIR, 'config.json'), JSON.stringify(config, null, 2));
    console.log('✅ Config written');
    console.log('   AI Provider:', provider);
    console.log('   Model:', model);
    console.log('   Telegram:', TELEGRAM_BOT_TOKEN ? '✅ enabled' : '⚠️ disabled');
    console.log('   Port:', PORT);
}

async function startGateway() {
    console.log('\n🚀 Starting OpenClaw Gateway...');

    const child = spawn('openclaw', ['gateway', '--port', String(PORT), '--bind', '0.0.0.0', '--non-interactive'], {
        stdio: 'inherit',
        env: {
            ...process.env,
            HOME,
            OPENCLAW_CONFIG_DIR: CONFIG_DIR,
            NODE_ENV: 'production',
        }
    });

    child.on('error', (err) => {
        console.error('❌ Gateway error:', err.message);
        // List semua flags yang tersedia
        try { run('openclaw --help'); } catch {}
        process.exit(1);
    });

    child.on('close', (code) => {
        console.log(`⚠️ Gateway exited (${code}), restarting in 15s...`);
        setTimeout(startGateway, 15000);
    });
}

(async () => {
    console.log('🦞 OpenClaw Gateway - Railway');
    console.log('==============================');
    console.log('Node:', process.version, '| PORT:', PORT);

    if (!TELEGRAM_BOT_TOKEN) {
        console.warn('⚠️ TELEGRAM_BOT_TOKEN tidak diset!');
    }
    if (!DEEPSEK_API_KEY && !ANTHROPIC_API_KEY && !GROQ_API_KEY) {
        console.error('❌ Set salah satu: DEEPSEK_API_KEY, ANTHROPIC_API_KEY, atau GROQ_API_KEY');
        process.exit(1);
    }

    await installOpenClaw();
    writeConfig();

    // Jalankan onboard non-interactive untuk setup awal
    try {
        console.log('⚙️ Running openclaw doctor...');
        run('openclaw doctor --non-interactive || true');
    } catch {}

    await startGateway();
})();