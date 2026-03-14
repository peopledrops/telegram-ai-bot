// openclaw-runner.js
// Deploy OpenClaw Gateway di Railway sebagai service terpisah
// Bot Telegram kamu terhubung ke Gateway ini via HTTP API

require('dotenv').config();
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.OPENCLAW_TELEGRAM_TOKEN; // Bot token TERPISAH untuk OpenClaw
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || 'my-secret-token';
const PORT = process.env.PORT || 18789;

if (!ANTHROPIC_API_KEY && !GROQ_API_KEY) {
    console.error('❌ Set ANTHROPIC_API_KEY atau GROQ_API_KEY');
    process.exit(1);
}

async function installOpenClaw() {
    try {
        execSync('openclaw --version', { stdio: 'pipe' });
        console.log('✅ OpenClaw sudah terinstall');
    } catch {
        console.log('📦 Installing OpenClaw...');
        execSync('npm install -g @openclaw/cli@latest', { stdio: 'inherit' });
        console.log('✅ OpenClaw terinstall');
    }
}

function setupConfig() {
    const configDir = path.join(os.homedir(), '.openclaw');
    fs.mkdirSync(configDir, { recursive: true });

    // Main config
    const config = {
        gateway: {
            port: parseInt(PORT),
            bind: '0.0.0.0', // Railway butuh 0.0.0.0 bukan loopback
            auth: {
                mode: 'token',
                token: GATEWAY_TOKEN
            },
            http: {
                endpoints: {
                    chatCompletions: { enabled: true }
                }
            }
        },
        models: {
            default: ANTHROPIC_API_KEY ? 'anthropic/claude-sonnet-4-20250514' : 'groq/llama-3.3-70b-versatile'
        }
    };

    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(config, null, 2));

    // Credentials
    const creds = {};
    if (ANTHROPIC_API_KEY) creds.anthropic = { apiKey: ANTHROPIC_API_KEY };
    if (GROQ_API_KEY) creds.groq = { apiKey: GROQ_API_KEY };
    fs.writeFileSync(path.join(configDir, 'credentials.json'), JSON.stringify(creds, null, 2));

    // Telegram channel config
    if (TELEGRAM_BOT_TOKEN) {
        const channels = {
            telegram: {
                enabled: true,
                botToken: TELEGRAM_BOT_TOKEN,
                dmPolicy: 'open'
            }
        };
        fs.writeFileSync(path.join(configDir, 'channels.json'), JSON.stringify(channels, null, 2));
        console.log('✅ Telegram channel configured');
    }

    console.log('✅ Config written');
}

const path = require('path');

(async () => {
    console.log('🦞 OpenClaw Gateway - Railway Runner');
    console.log('=====================================');
    console.log(`Port: ${PORT}`);
    console.log(`Model: ${ANTHROPIC_API_KEY ? 'Claude (Anthropic)' : 'Groq'}`);

    await installOpenClaw();
    setupConfig();

    console.log('\n🚀 Starting OpenClaw Gateway...');
    const gateway = spawn('openclaw', ['gateway', '--port', String(PORT), '--bind', '0.0.0.0', '--verbose'], {
        stdio: 'inherit',
        env: { ...process.env }
    });

    gateway.on('close', (code) => {
        console.log(`⚠️ Gateway exited (${code}), restarting in 10s...`);
        setTimeout(() => require('child_process').execSync('node openclaw-runner.js'), 10000);
    });

    gateway.on('error', (err) => {
        console.error('❌ Gateway error:', err.message);
        process.exit(1);
    });
})();
