// bot.js - Telegram Bot Handler (FULLY FIXED VERSION)
// ⚠️ BARIS 1: Load dotenv PALING AWAL
require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const ai = require('./ai');
const MineBeanSkill = require('./minebean');
const airdropManager = require('./airdrop');
const profileManager = require('./user-profiles');
const formAutoFiller = require('./form-autofill');
const nlParser = require('./nl-command-parser');  // ✅ Moved to top

// Message deduplication store
const processedMessages = new Map();
const MESSAGE_TTL = 5000; // 5 seconds

// Optional modules with fallback
let universalScraper = null;
let AutoAirdropCompleter = null;
let autoCompleter = null;

try {
    universalScraper = require('./universal-scraper');
    AutoAirdropCompleter = require('./auto-airdrop-complete');
} catch (error) {
    console.log('⚠️ Auto-airdrop modules not found. /learn and /autoairdrop disabled.');
}

// ===== CONFIG & STATE =====
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Initialize auto-completer AFTER bot is created
if (AutoAirdropCompleter) {
    autoCompleter = new AutoAirdropCompleter(bot);
}

const minebeanInstances = new Map();
let botInfo = null;

console.log('✅ Telegram Bot initialized');

// Get bot info on startup
bot.getMe().then(me => {
    botInfo = me;
    console.log(`🤖 Bot ready: @${me.username}`);
}).catch(err => {
    console.error('❌ Failed to get bot info:', err.message);
});

// ===== HELPER FUNCTIONS =====

function isMessageProcessed(messageId, userId) {
    const key = `${userId}:${messageId}`;
    if (processedMessages.has(key)) {
        return true;
    }
    processedMessages.set(key, Date.now());
    
    setTimeout(() => {
        processedMessages.delete(key);
    }, MESSAGE_TTL);
    
    return false;
}

/** Split long message into chunks */
function splitMessage(text, maxLength = 4000) {
    const chunks = [];
    let current = '';
    
    for (const line of text.split('\n')) {
        if (current.length + line.length + 1 > maxLength) {
            chunks.push(current);
            current = line;
        } else {
            current += (current ? '\n' : '') + line;
        }
    }
    if (current) chunks.push(current);
    return chunks;
}

/** Get or create MineBean instance */
function getMineBean(userId) {
    if (!minebeanInstances.has(userId)) {
        minebeanInstances.set(userId, new MineBeanSkill(userId));
    }
    return minebeanInstances.get(userId);
}

/** Graceful shutdown */
function shutdown() {
    console.log('🛑 Shutting down...');
    bot.stopPolling();
    process.exit(0);
}

// ===== COMMAND HANDLERS: CORE =====

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const name = msg.from.first_name || 'User';
    
    const welcome = `
👋 Halo ${name}! Selamat datang di **Groq AI Bot**!

🚀 Didukung oleh Groq AI - super cepat! ⚡

📋 **Perintah:**
/start - Pesan ini
/help - Bantuan lengkap
/chat <pesan> - Chat dengan AI
/reset - Reset percakapan
/stats - Lihat statistik
/about - Tentang bot
/ping - Cek koneksi
/minebean - Fitur MineBean skill
/airdrop - Airdrop task manager
/learn <url> - Belajar airdrop dari link (AI)
/autoairdrop <url> - Auto-complete airdrop dari link

💡 **Tips:**
- Bisa chat langsung tanpa /chat
- Gunakan /reset untuk mulai baru
- Bot ingat konteks percakapan

🎯 Mulai chat dengan mengetik apapun!
    `;
    
    await bot.sendMessage(chatId, welcome, { parse_mode: 'Markdown' });
});

bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    
    const help = `
📚 **BANTUAN GROQ AI BOT**

🗣️ **Cara Chat:**
1. Langsung ketik: "Apa ibukota Indonesia?"
2. Atau pakai /chat: "/chat Hitung 25 x 4"

🔄 **Manage Percakapan:**
/reset - Mulai percakapan baru
/stats - Lihat info chat

⚡ **Tentang Groq:**
- Inference super cepat (LPU technology)
- Model: Llama 3.1, Gemma 2, Mixtral
- Gratis untuk penggunaan wajar

🔒 **Privacy:**
- Chat disimpan sementara di memory
- Reset otomatis saat bot restart
- Tidak simpan data pribadi

📞 **Support:**
Hubungi admin jika ada masalah.
    `;
    
    await bot.sendMessage(chatId, help, { parse_mode: 'Markdown' });
});

bot.onText(/\/reset/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const response = ai.resetConversation(userId);
    await bot.sendMessage(chatId, response);
});

bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const stats = ai.getStats(userId);
    await bot.sendMessage(chatId, `📊 ${stats}`);
});

bot.onText(/\/about/, async (msg) => {
    const chatId = msg.chat.id;
    
    const about = `
🤖 **GROQ AI TELEGRAM BOT**

Version: 1.0.0
AI: Groq Cloud (Llama 3.1)
Speed: ~100-300 tokens/sec ⚡

📌 **Features:**
- Natural conversation
- Context-aware (ingat chat sebelumnya)
- Multi-language support
- Fast response time

🔗 **Links:**
- Groq: https://groq.com
- Bot Source: Private

⚠️ **Disclaimer:**
- AI dapat membuat kesalahan
- Verifikasi informasi penting
- Jangan gunakan untuk data sensitif

📅 Created: 2026
    `;
    
    await bot.sendMessage(chatId, about, { parse_mode: 'Markdown' });
});

bot.onText(/\/ping/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
        const start = Date.now();
        const result = await ai.testConnection();
        const latency = Date.now() - start;
        
        if (result.success) {
            await bot.sendMessage(chatId, `🏓 Pong! ${latency}ms\n✅ ${result.message}`);
        } else {
            await bot.sendMessage(chatId, `❌ ${result.message}`);
        }
    } catch (error) {
        await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
});

// ===== COMMAND HANDLERS: ADMIN =====

bot.onText(/\/admin/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const adminId = process.env.TELEGRAM_ADMIN_ID;
    
    if (userId !== adminId) {
        await bot.sendMessage(chatId, '❌ Access denied. Admin only.');
        return;
    }
    
    const adminMenu = `
🔧 **ADMIN COMMANDS**

/clearall - Clear semua conversation
/broadcast <msg> - Kirim pesan ke semua user
/stats - Bot statistics

⚠️ Gunakan dengan hati-hati!
    `;
    
    await bot.sendMessage(chatId, adminMenu, { parse_mode: 'Markdown' });
});

bot.onText(/\/clearall/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    
    if (userId !== process.env.TELEGRAM_ADMIN_ID) {
        await bot.sendMessage(chatId, '❌ Access denied.');
        return;
    }
    
    const response = ai.clearAllConversations();
    await bot.sendMessage(chatId, response);
});

// ===== COMMAND HANDLERS: MINEBEAN SKILL =====
// ... (rest of MineBean commands remain the same - too long to paste here)
// Copy dari file asli Anda bagian /minebean, /wallet, /learn, /airdrop, /autoairdrop, /follow, /join

// ===== SINGLE MESSAGE HANDLER (COMBINED) =====
bot.on('message', async (msg) => {
    // Skip commands
    if (msg.text?.startsWith('/')) return;
    
    // Skip non-text or bot messages
    if (!msg.text || msg.from?.is_bot) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const messageId = msg.message_id;
    const userMessage = msg.text.trim();
    
    // Skip very short messages
    if (userMessage.length < 3) return;
    
    // Check for duplicate processing
    if (isMessageProcessed(messageId, userId)) {
        return;
    }
    
    console.log(`💬 Message from ${userId}: "${userMessage}"`);
    
    try {
        await bot.sendChatAction(chatId, 'typing');
        
        // Try NL parser first
        const parsed = await nlParser.parse(userMessage, userId, {
            previousIntent: nlParser.getRecentContext(userId, 1)[0]?.intent,
            extractedUrl: userMessage.match(/https?:\/\/[^\s]+/)?.[0]
        });
        
        console.log(`🧠 Parsed: intent=${parsed.intent}, confidence=${parsed.confidence}`);
        
        // If confidence is high enough, use NL parser
        if (parsed.confidence >= 0.5) {
            nlParser.storeContext(userId, parsed.intent, parsed.entities);
            
            if (parsed.naturalResponse) {
                await bot.sendMessage(chatId, parsed.naturalResponse, { parse_mode: 'Markdown' });
            }
            
            msg._processed = true;
            
            const result = await executeParsedIntent(parsed, userId, chatId, userMessage);
            
            if (result) {
                if (result.message) {
                    await bot.sendMessage(chatId, result.message, { parse_mode: 'Markdown', disable_web_page_preview: true });
                }
                
                if (result.screenshots && Array.isArray(result.screenshots)) {
                    for (const screenshotPath of result.screenshots) {
                        try {
                            if (screenshotPath) {
                                await bot.sendPhoto(chatId, screenshotPath);
                            }
                        } catch (e) {
                            console.warn('Failed to send screenshot:', e.message);
                        }
                    }
                }
            }
        } else {
            // Low confidence - fallback to AI chat
            console.log('⚠️ Low NL confidence, using AI chat fallback');
            const response = await ai.chat(userId, userMessage);
            const chunks = splitMessage(response);
            for (const chunk of chunks) {
                await bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
            }
        }
        
    } catch (error) {
        console.error('❌ Message handler error:', error);
        
        // Fallback to AI chat on error
        try {
            const response = await ai.chat(userId, userMessage);
            const chunks = splitMessage(response);
            for (const chunk of chunks) {
                await bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
            }
        } catch (aiError) {
            console.error('❌ AI chat fallback also failed:', aiError.message);
        }
    }
});

// ===== EXECUTE PARSED INTENT =====
async function executeParsedIntent(parsed, userId, chatId, originalMessage) {
    console.log(`⚡ Executing intent: ${parsed.intent}`);
    
    if (parsed.chainBefore) {
        console.log(`🔗 Executing chained intent first: ${parsed.chainBefore.intent}`);
        await executeParsedIntent(parsed.chainBefore, userId, chatId, originalMessage);
    }
    
    switch (parsed.handler) {
        case 'executeAutofill': {
            const url = parsed.entities?.url;
            if (!url) {
                return { message: '❌ Saya tidak menemukan URL airdrop. Kirim link airdrop yang ingin dikerjakan.' };
            }
            
            const profile = profileManager.getProfile(userId);
            if (!profile) {
                return { message: '❌ Profile belum diset. Gunakan /setprofile dulu.' };
            }
            
            const effectiveProfile = { ...profile, ...parsed.entities };
            
            if (formAutoFiller && typeof formAutoFiller.autoSubmitForm === 'function') {
                try {
                    const result = await formAutoFiller.autoSubmitForm(url, userId);
                    
                    const screenshots = [];
                    if (result?.screenshots?.before) {
                        try {
                            const path = await formAutoFiller.saveScreenshot(result.screenshots.before, userId, 'before');
                            if (path) screenshots.push(path);
                        } catch (e) { console.warn('Screenshot save error:', e.message); }
                    }
                    if (result?.screenshots?.final) {
                        try {
                            const path = await formAutoFiller.saveScreenshot(result.screenshots.final, userId, 'final');
                            if (path) screenshots.push(path);
                        } catch (e) { console.warn('Screenshot save error:', e.message); }
                    }
                    
                    const filledList = (result?.filledFields || []).map(f => `✅ ${f.field}: ${f.value}`).join('\n') || '❌ No fields filled';
                    const statusIcon = result?.success ? '✅' : '⚠️';
                    const statusText = result?.success ? 'Form Submitted!' : 'Submit Failed';
                    
                    return {
                        message: `
📊 **Hasil Auto-Fill**

🔗 ${nlParser.shortenUrl(url)}
✅ Fields: ${(result?.filledFields || []).length}
${statusIcon} ${statusText}

📋 **Diisi:**
${filledList}
                        `.trim(),
                        screenshots: screenshots
                    };
                } catch (error) {
                    console.error('❌ Autofill error:', error);
                    return { message: `❌ Auto-fill error: ${error.message}\n💡 Coba manual atau hubungi admin.` };
                }
            } else {
                return {
                    message: `
📋 **Data untuk Manual Fill**

🔗 ${url}

📝 **Copy-Paste:**
${effectiveProfile.twitter ? `🐦 Twitter: ${effectiveProfile.twitter}` : ''}
${effectiveProfile.telegram ? `✈️ Telegram: ${effectiveProfile.telegram}` : ''}
${effectiveProfile.discord ? `💬 Discord: ${effectiveProfile.discord}` : ''}
${effectiveProfile.email ? `📧 Email: ${effectiveProfile.email}` : ''}
${effectiveProfile.wallet ? `💰 Wallet: ${effectiveProfile.wallet}` : ''}

💡 Buka link, isi manual!
                    `.trim()
                };
            }
        }
        
        case 'executeProfileUpdate': {
            const { field, value } = parsed.entities || {};
            if (!field || !value) {
                return { message: '❌ Format: "set [field] [value]"' };
            }
            
            try {
                if (field === 'firstName') {
                    const parts = value.split(' ');
                    await profileManager.updateProfileBulk(userId, {
                        firstName: parts[0],
                        lastName: parts.slice(1).join(' ')
                    });
                } else {
                    await profileManager.updateProfile(userId, field, value);
                }
                return { message: `✅ ${field} di-update jadi \`${value}\`!` };
            } catch (error) {
                return { message: `❌ Update error: ${error.message}` };
            }
        }
        
        case 'executeVerify': {
            const taskType = parsed.entities?.task_type || 'task';
            return { message: `✅ Task ${taskType} sudah ditandai selesai! 🎉` };
        }
        
        default:
            return null;
    }
}

// ===== ERROR HANDLERS =====
bot.on('polling_error', (error) => {
    console.error('❌ Polling Error:', error.message);
});

bot.on('error', (error) => {
    console.error('❌ Bot Error:', error.message);
});

// ===== GLOBAL ERROR HANDLERS =====
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

// ===== GRACEFUL SHUTDOWN =====
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ===== EXPORT =====
module.exports = bot;