// openclaw-bridge.js
// Tambahkan di bot.js kamu untuk forward pesan ke OpenClaw Gateway
// OpenClaw akan handle dengan AI + tools yang lebih canggih

const OPENCLAW_URL = process.env.OPENCLAW_URL; // URL Railway service OpenClaw, e.g. https://openclaw-xxx.up.railway.app
const OPENCLAW_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || 'my-secret-token';

/**
 * Kirim pesan ke OpenClaw Gateway dan dapat balasan AI
 * @param {string} message - Pesan dari user
 * @param {string} userId - Telegram user ID (untuk session continuity)
 * @returns {Promise<string>} - Balasan dari OpenClaw AI
 */
async function askOpenClaw(message, userId) {
    if (!OPENCLAW_URL) {
        throw new Error('OPENCLAW_URL tidak diset');
    }

    const response = await fetch(`${OPENCLAW_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENCLAW_TOKEN}`,
            'x-openclaw-agent-id': 'main',
        },
        body: JSON.stringify({
            model: 'openclaw',
            messages: [{ role: 'user', content: message }],
            user: `telegram-${userId}`, // Untuk session continuity per user
        }),
        signal: AbortSignal.timeout(60000), // 60s timeout
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenClaw error ${response.status}: ${err}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'Tidak ada balasan';
}

/**
 * Cek apakah OpenClaw Gateway online
 */
async function isOpenClawOnline() {
    if (!OPENCLAW_URL) return false;
    try {
        const res = await fetch(`${OPENCLAW_URL}/health`, {
            headers: { 'Authorization': `Bearer ${OPENCLAW_TOKEN}` },
            signal: AbortSignal.timeout(5000),
        });
        return res.ok;
    } catch {
        return false;
    }
}

module.exports = { askOpenClaw, isOpenClawOnline };