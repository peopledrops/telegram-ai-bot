// bot.js - Telegram Bot Handler (Fixed Complete Version)
// ⚠️ BARIS 1: Load dotenv PALING AWAL
require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const ai = require('./ai');
const MineBeanSkill = require('./minebean');
const airdropManager = require('./airdrop');
const profileManager = require('./user-profiles');
const formAutoFiller = require('./form-autofill');
const nlParser = require('./nl-command-parser');  // ✅ MOVED TO TOP (ONLY ONCE)

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

/** Split long message into chunks (Telegram max 4096 chars) */
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

/** Get or create MineBean instance for user */
function getMineBean(userId) {
    if (!minebeanInstances.has(userId)) {
        minebeanInstances.set(userId, new MineBeanSkill(userId));
    }
    return minebeanInstances.get(userId);
}

/** Graceful shutdown handler */
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

bot.onText(/\/minebean(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const args = match[1]?.trim().split(' ') || [];
    const subcommand = args[0]?.toLowerCase();
    
    if (!subcommand) {
        const help = `
⛏️ **MINEBEAN SKILL**

Game: Deploy ETH ke grid 5x5, menangkan ETH + BEAN!
Chain: Base (8453) | Round: 60 detik

📋 **Commands:**
/minebean status - Lihat round saat ini
/minebean price - Harga BEAN saat ini
/minebean rewards - Cek reward pending (perlu wallet)
/minebean ev <eth> - Hitung EV untuk deploy X ETH
/minebean suggest [strategy] - Saran block
/minebean stats - Global stats game
/minebean help - Bantuan lengkap

⚠️ **Peringatan:**
- Game punya house edge ~1-11%
- BEAN price volatile - DYOR!
- Jangan share private key!

🔗 https://minebean.com
        `;
        await bot.sendMessage(chatId, help, { parse_mode: 'Markdown' });
        return;
    }
    
    const mb = getMineBean(userId);
    
    try {
        switch(subcommand) {
            case 'status':
            case 'round': {
                const round = await mb.getCurrentRound();
                if (!round) { await bot.sendMessage(chatId, '❌ Gagal ambil data round'); return; }
                const timeLeft = Math.max(0, round.endTime - mb.now());
                const minutes = Math.floor(timeLeft / 60);
                const seconds = timeLeft % 60;
                const status = `
🎮 **Round #${round.roundId}**
⏱️ Waktu tersisa: ${minutes}m ${seconds}s
💰 Total deployed: ${round.totalDeployedFormatted} ETH
🏆 Beanpot: ${round.beanpotPoolFormatted} BEAN
📊 Settled: ${round.settled ? '✅ Ya' : '❌ Belum'}

💡 Ketik /minebean suggest untuk saran block!
                `;
                await bot.sendMessage(chatId, status, { parse_mode: 'Markdown' });
                break;
            }
            case 'price': {
                const price = await mb.getBeanPrice();
                const priceEth = parseFloat(price.priceNative || '0').toFixed(8);
                const priceUsd = parseFloat(price.priceUsd || '0').toFixed(4);
                await bot.sendMessage(chatId, `💰 **BEAN Price**\n🔗 ${priceEth} ETH\n💵 $${priceUsd} USD\n📈 Update: ${new Date().toLocaleTimeString('id-ID')}`, { parse_mode: 'Markdown' });
                break;
            }
            case 'rewards': {
                const walletAddress = global.userWallets?.get(userId);
                if (!walletAddress) {
                    await bot.sendMessage(chatId, '❌ Wallet belum diset.\n\nGunakan `/wallet 0xYourAddress` untuk set wallet Anda.', { parse_mode: 'Markdown' });
                    return;
                }
                try {
                    const rewards = await mb.getUserRewards(walletAddress);
                    if (!rewards) {
                        await bot.sendMessage(chatId, '❌ Gagal mengambil data rewards.\n\nCek langsung di: https://minebean.com', { parse_mode: 'Markdown' });
                        return;
                    }
                    const rewardMsg = `
🎁 **Your Rewards**

💰 Pending ETH: ${mb.formatEth(rewards.pendingEth || '0')} ETH
🫘 Pending BEAN: ${mb.formatEth(rewards.pendingBean || '0')} BEAN
   ├─ Unroasted: ${mb.formatEth(rewards.unroastedBean || '0')}
   ├─ Roasted: ${mb.formatEth(rewards.roastedBean || '0')}
   └─ Fee earned: ${mb.formatEth(rewards.roastingBonus || '0')}

💡 Ketik /minebean claim untuk info cara claim!
                    `;
                    await bot.sendMessage(chatId, rewardMsg, { parse_mode: 'Markdown' });
                } catch (error) {
                    console.error('❌ Rewards error:', error);
                    await bot.sendMessage(chatId, `❌ Error mengambil rewards: ${error.message}\n\nCek langsung di: https://minebean.com`, { parse_mode: 'Markdown' });
                }
                break;
            }
            case 'ev': {
                const deployEth = args[1] || '0.001';
                const roundData = await mb.getCurrentRound();
                const priceData = await mb.getBeanPrice();
                if (!roundData || !priceData) { await bot.sendMessage(chatId, '❌ Gagal ambil data untuk kalkulasi EV'); return; }
                const ev = mb.calculateEV({ deployedEth, beanPriceEth: priceData.priceNative || '0.000015', beanpotPool: roundData.beanpotPoolFormatted || '0', totalDeployed: roundData.totalDeployedFormatted || '1', yourShareOnWinningBlock: 0.04 });
                const evMsg = `
📊 **Expected Value Analysis**

Deploy: ${deployEth} ETH
Net EV: ${ev.netEV} ETH ${ev.isPositive ? '✅ Positif' : '❌ Negatif'}

Breakdown:
• BEAN reward: ${ev.breakdown.beanValue} ETH
• Beanpot EV: ${ev.breakdown.beanpotEV} ETH
• Fee cost: ${ev.breakdown.feeCost} ETH (${ev.breakdown.houseEdge})

💡 EV positif = secara statistik menguntungkan jangka panjang
⚠️ Variance tinggi - bisa rugi di short term!
                `;
                await bot.sendMessage(chatId, evMsg, { parse_mode: 'Markdown' });
                break;
            }
            case 'suggest': {
                const strategy = args[1] || 'least-crowded';
                const roundForSuggest = await mb.getCurrentRound();
                if (!roundForSuggest) { await bot.sendMessage(chatId, '❌ Gagal ambil data grid'); return; }
                const suggested = mb.suggestBlocks(roundForSuggest, 3, strategy);
                const blockInfo = suggested.map(id => {
                    const block = roundForSuggest.blocks?.find(b => b.id === id);
                    return `• Block ${id}: ${block?.deployedFormatted || '0'} ETH, ${block?.minerCount || 0} miners`;
                }).join('\n');
                await bot.sendMessage(chatId, `🎯 **Block Suggestions** (strategy: ${strategy})\n\n${blockInfo}\n\n💡 Deploy ke block dengan sedikit miners = share lebih besar jika menang!\n⚠️ Win probability tetap 1/25 per block (VRF uniform random)`, { parse_mode: 'Markdown' });
                break;
            }
            case 'stats': {
                const stats = await mb.getStats();
                if (!stats) { await bot.sendMessage(chatId, '❌ Gagal ambil stats'); return; }
                const statsMsg = `
🌍 **MineBean Global Stats**

📊 Total rounds: ${stats.totalRounds || '?'}
💰 Total deployed: ${stats.totalDeployedFormatted || '?'} ETH
🫘 BEAN minted: ${stats.totalBeanMintedFormatted || '?'}
🏆 Beanpot: ${stats.beanpotPoolFormatted || '?'} BEAN
👥 Unique miners: ${stats.uniqueMiners || '?'}

🔗 https://minebean.com
                `;
                await bot.sendMessage(chatId, statsMsg, { parse_mode: 'Markdown' });
                break;
            }
            case 'deploy': {
                const deployWarning = `
⚠️ **DEPLOY MEMERLUKAN PRIVATE KEY**

🔐 Untuk keamanan, auto-deploy via bot TIDAK direkomendasikan.

🛡️ Cara aman deploy:
1. Buka https://minebean.com
2. Connect wallet Anda (MetaMask, Coinbase, dll)
3. Deploy manual via UI

💡 Tips:
- Gunakan wallet khusus untuk gaming
- Jangan deploy lebih dari yang siap hilang
- Cek EV sebelum deploy: /minebean ev <amount>
                `;
                await bot.sendMessage(chatId, deployWarning, { parse_mode: 'Markdown' });
                break;
            }
            case 'claim': {
                const claimInfo = `
🎁 **Claim Rewards**

Pending rewards dapat di-claim via:
• Website: https://minebean.com (recommended)
• Wallet: Connect & claim via UI

💡 Tips:
- Tahan BEAN unclaimed untuk dapat roasting bonus (10% fee dari claim user lain)!
- Claim ETH lebih sering, hold BEAN untuk bonus
                `;
                await bot.sendMessage(chatId, claimInfo, { parse_mode: 'Markdown' });
                break;
            }
            case 'help':
            default:
                await bot.sendMessage(chatId, 'Ketik /minebean untuk lihat semua commands', { parse_mode: 'Markdown' });
        }
    } catch (error) {
        console.error('❌ MineBean command error:', error);
        await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
});

// /wallet - Set user wallet address
bot.onText(/\/wallet\s+(0x[a-fA-F0-9]{40})/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const address = match[1].toLowerCase();
    
    if (!global.userWallets) global.userWallets = new Map();
    global.userWallets.set(userId, address);
    minebeanInstances.set(userId, new MineBeanSkill(address));
    
    await bot.sendMessage(chatId, `✅ Wallet diset: \`${address}\`\n\nSekarang Anda bisa cek rewards dengan /minebean rewards\n⚠️ Pastikan ini adalah wallet yang Anda kontrol!`, { parse_mode: 'Markdown' });
});

// ===== COMMAND HANDLERS: AIRDROP LEARNING & AUTO-COMPLETION =====

// /learn - Learn airdrop from ANY link using AI
bot.onText(/\/learn\s+(.+)/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const url = match[1].trim();
    
    console.log(`\n🔍 /learn command received from ${msg.from.username || userId}`);
    console.log(`   URL: ${url}`);
    console.log(`   universalScraper loaded: ${!!universalScraper}`);
    
    // Check if module is loaded
    if (!universalScraper) {
        console.log('❌ universalScraper is NULL!');
        await bot.sendMessage(chatId, '❌ **Module tidak ter-load!**\n\nCek console bot untuk detail error.', { parse_mode: 'Markdown' });
        return;
    }
    
    // Send initial message
    await bot.sendMessage(chatId, `🔍 Mempelajari airdrop dari:\n\`${url}\`\n\n⏳ Memproses...`, { parse_mode: 'Markdown', disable_web_page_preview: true });
    
    try {
        console.log(`🕷️ Calling scraper.learnFromLink(${url})...`);
        const result = await universalScraper.learnFromLink(url, { useAI: false });
        console.log('📦 Scraper result:', result.success ? '✅ Success' : '❌ Failed');
        
        if (!result.success) {
            await bot.sendMessage(chatId, `❌ Error: ${result.error}\n\n💡 Tips:\n- Pastikan link publik\n- Coba akses di browser dulu`, { parse_mode: 'Markdown' });
            return;
        }
        
        console.log('💾 Saving airdrop...');
        let saved = null;
        try {
            saved = await universalScraper.saveAirdrop(result);
            console.log('✅ Airdrop saved:', saved?.id || 'no id');
        } catch (saveError) {
            console.warn('⚠️ saveAirdrop failed (non-critical):', saveError.message);
            saved = { id: `temp_${Date.now()}`, ...result };
        }
        
        // Format task list
        const taskList = (result.tasks || []).map((t, i) => `${i + 1}. **${t.type.toUpperCase()}**: ${t.label}${t.url ? `\n   🔗 \`${t.url}\`` : ''}`).join('\n') || 'No specific tasks detected - visit page for details';
        
        const message = `
✅ **Airdrop Berhasil Dipelajari!**

🎯 **Nama:** ${result.name}
🌐 **Platform:** ${result.platform}
📝 **Deskripsi:** ${result.description?.substring(0, 150)}${result.description?.length > 150 ? '...' : ''}
🎁 **Reward:** ${result.reward || 'Potential airdrop'}

📋 **Tasks Ditemukan (${(result.tasks || []).length}):**

${taskList}

💡 **Commands:**
\`/airdrop ${saved.id}\` - Lihat detail & track progress
\`/airdrop verify ${saved.id} discord\` - Mark Discord task done
\`/airdrop verify ${saved.id} twitter\` - Mark Twitter task done

⚠️ Catatan: Beberapa tasks perlu diselesaikan manual.
        `.trim();
        
        console.log('📤 Sending success message to Telegram...');
        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown', disable_web_page_preview: true });
        console.log('✅ Success message sent!');
        
    } catch (error) {
        console.error('❌ Learn handler error:', error);
        console.error('Stack:', error.stack);
        await bot.sendMessage(chatId, `❌ **Terjadi error**\n\nMessage: ${error.message}\n\n💡 Coba lagi atau cek console bot untuk detail.`, { parse_mode: 'Markdown' });
    }
});

// ===== COMMAND HANDLERS: AIRDROP TASKS =====

bot.onText(/\/airdrop(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const args = match[1]?.trim().split(' ') || [];
    const subcommand = args[0]?.toLowerCase();
    
    if (msg._processed) {
        return;
    }
    
    // If message contains URL but no valid subcommand, skip
    if (msg.text?.includes('http') && (!subcommand || subcommand.length < 2)) {
        console.log('⏭️ /airdrop called with URL but no valid subcommand, skipping');
        return;
    }
    
    if (!subcommand) {
        const summary = airdropManager.getUserSummary?.(userId) || { total: 3, completed: 0, inProgress: 0, notStarted: 3 };
        const menu = `
🪂 **AIRDROP TASK MANAGER**

📊 **Your Progress:**
✅ Completed: ${summary.completed}
🔄 In Progress: ${summary.inProgress}
⏳ Not Started: ${summary.notStarted}
📋 Total: ${summary.total}

🎯 **Available Airdrops:**
1. ⏳ **Zealy Campaign** - 🎁 500-2000 XP
2. ⏳ **Galxe Campaign** - 🎁 NFT Badge + OAT
3. ⏳ **LayerZero** - 🎁 $ZRO Token

📋 **Commands:**
/airdrop list - List all airdrops
/airdrop <id> - View specific airdrop tasks
/airdrop verify <id> <task> - Verify task completion
/airdrop submit <id> - Submit completed airdrop
/airdrop progress - Your progress summary
/learn <url> - Learn new airdrop from link (AI)

💡 Complete social tasks for potential airdrops!
        `;
        await bot.sendMessage(chatId, menu, { parse_mode: 'Markdown' });
        return;
    }
    
    try {
        switch(subcommand) {
            case 'list': {
                const airdrops = airdropManager.getActiveAirdrops();
                const list = airdrops.map((a, i) => `**${i + 1}. ${a.name}**\n${a.description}\n🎁 ${a.reward}\n⏰ ${a.deadline}\n`).join('\n');
                await bot.sendMessage(chatId, `🪂 **Active Airdrops**\n\n${list}`, { parse_mode: 'Markdown' });
                break;
            }
            case 'progress': {
                const summary = airdropManager.getUserSummary(userId);
                const rate = summary.total > 0 ? Math.round((summary.completed / summary.total) * 100) : 0;
                await bot.sendMessage(chatId, `📊 **Your Airdrop Progress**\n\n✅ Completed: ${summary.completed}\n🔄 In Progress: ${summary.inProgress || 0}\n⏳ Not Started: ${summary.notStarted || 0}\n📋 Total: ${summary.total}\n\nCompletion Rate: ${rate}%`, { parse_mode: 'Markdown' });
                break;
            }
            case 'verify': {
                const airdropId = args[1];
                const taskType = args[2];
                if (!airdropId || !taskType) { await bot.sendMessage(chatId, '❌ Usage: `/airdrop verify <id> <task>`', { parse_mode: 'Markdown' }); return; }
                const airdrop = airdropManager.getAirdropById(airdropId);
                if (!airdrop) { await bot.sendMessage(chatId, '❌ Airdrop not found'); return; }
                const taskIndex = airdrop.tasks.findIndex(t => t.type === taskType);
                if (taskIndex === -1) { await bot.sendMessage(chatId, '❌ Task type not found'); return; }
                const progress = airdropManager.markTaskComplete(userId, airdropId, taskIndex.toString());
                await bot.sendMessage(chatId, `✅ Task verified!\n\n📊 Progress: ${Object.keys(progress.tasks).length}/${airdrop.tasks.length} tasks\n${progress.completed ? '🎉 All required tasks completed!' : 'Continue with remaining tasks'}`, { parse_mode: 'Markdown' });
                break;
            }
            case 'submit': {
                const airdropId = args[1];
                if (!airdropId) { await bot.sendMessage(chatId, '❌ Usage: `/airdrop submit <id>`', { parse_mode: 'Markdown' }); return; }
                const airdrop = airdropManager.getAirdropById(airdropId);
                if (!airdrop) { await bot.sendMessage(chatId, '❌ Airdrop not found'); return; }
                const progress = airdropManager.getUserProgress(userId, airdropId);
                if (!progress.completed) { await bot.sendMessage(chatId, '❌ Not all required tasks completed!', { parse_mode: 'Markdown' }); return; }
                const walletAddress = global.userWallets?.get(userId);
                await bot.sendMessage(chatId, `✅ **Airdrop Submission**\n\n🎯 Airdrop: ${airdrop.name}\n💼 Wallet: ${walletAddress || 'Not set'}\n📅 Submitted: ${new Date().toLocaleString('id-ID')}\n\n⏳ Your submission is being reviewed!`, { parse_mode: 'Markdown' });
                break;
            }
            default: {
                const airdrop = airdropManager.getAirdropById(subcommand);
                if (!airdrop) { await bot.sendMessage(chatId, '❌ Airdrop not found. Use /airdrop to see list.'); return; }
                const progress = airdropManager.getUserProgress(userId, airdrop.id);
                const walletAddress = global.userWallets?.get(userId);
                const taskList = airdrop.tasks.map((t, i) => {
                    const completed = progress.tasks[i.toString()] ? '✅' : '⏳';
                    const required = t.required ? '🔴' : '🟢';
                    return `${completed} ${required} **${t.label}**\n   🔗 ${t.url}`;
                }).join('\n');
                await bot.sendMessage(chatId, `🎯 **${airdrop.name}**\n\n📝 ${airdrop.description}\n🎁 **Reward:** ${airdrop.reward}\n⏰ **Deadline:** ${airdrop.deadline}\n\n📋 **Tasks:**\n\n${taskList}\n\n💼 **Your Wallet:** ${walletAddress || 'Not set'}\n📊 **Progress:** ${Object.keys(progress.tasks).length}/${airdrop.tasks.length} tasks`, { parse_mode: 'Markdown', disable_web_page_preview: true });
            }
        }
    } catch (error) {
        console.error('❌ Airdrop command error:', error);
        if (error.message?.includes('not found')) {
            await bot.sendMessage(chatId, `❌ Airdrop tidak ditemukan. Gunakan /airdrop list untuk melihat daftar.`, { parse_mode: 'Markdown' });
        } else {
            await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
    }
});

// /autoairdrop - Full auto-completion from link
bot.onText(/\/autoairdrop\s+(https?:\/\/\S+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const url = match[1];
    
    if (!autoCompleter) {
        await bot.sendMessage(chatId, '❌ Auto-completion module not installed.\n\nInstall dependencies: npm install puppeteer-core playwright axios openai twitter-api-v2', { parse_mode: 'Markdown' });
        return;
    }
    
    const userWallet = global.userWallets?.get(userId);
    
    await bot.sendMessage(chatId, `🚀 **Starting Full Auto Airdrop Completion!**\n\n🔗 URL: ${url}\n💼 Wallet: ${userWallet || 'Not set (use /wallet)'}\n\n⏳ This will take 2-5 minutes. I'll update you on progress...`, { parse_mode: 'Markdown' });
    
    try {
        const result = await autoCompleter.completeAirdropFromLink(userId, url, userWallet);
        
        if (result.success) {
            const taskResults = result.status.steps.filter(s => s.task).map(s => {
                if (s.manual) {
                    return `🔶 **${s.task}** (Manual)\n   ${s.hint}\n   🔗 ${s.manualUrl}`;
                }
                const icon = s.status === 'completed' ? '✅' : '❌';
                return `${icon} **${s.task}**\n   ${s.message || s.status}${s.manualUrl ? `\n   🔗 ${s.manualUrl}` : ''}`;
            }).join('\n');
            
            const report = `
🤖 **Airdrop Automation Report**

📊 **Results:**
✅ Auto-completed: ${result.status.completed}
🔶 Manual required: ${result.status.steps.filter(s => s.manual).length}
❌ Failed: ${result.status.failed}

📋 **Task Details:**

${taskResults}

💡 **Next Steps:**
- Complete 🔶 manual tasks using the links provided
- After completing, use: \`/airdrop verify <id> <task_type>\`
- Check screenshots for auto-completed tasks
            `.trim();
            
            await bot.sendMessage(chatId, report, { parse_mode: 'Markdown', disable_web_page_preview: true });
            
            if (result.status.screenshots?.length > 0) {
                await bot.sendMessage(chatId, `📸 Sending ${result.status.screenshots.length} screenshots...`);
                for (const screenshotPath of result.status.screenshots) {
                    try {
                        await bot.sendPhoto(chatId, screenshotPath);
                    } catch (e) {
                        console.error('Failed to send screenshot:', e);
                    }
                }
            }
        } else {
            await bot.sendMessage(chatId, `❌ **Automation Failed**\n\nError: ${result.error}\n\nPartial progress:\n${JSON.stringify(result.status.steps || [], null, 2)}`, { parse_mode: 'Markdown' });
        }
    } catch (error) {
        console.error('❌ Auto-airdrop error:', error);
        await bot.sendMessage(chatId, `❌ Auto-completion failed: ${error.message}`);
    }
});

// /follow - Quick Twitter follow tracker
bot.onText(/\/follow\s+@?(\w+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const twitterHandle = match[1];
    await bot.sendMessage(chatId, `✅ Twitter follow tracked: @${twitterHandle}\n\n🔗 Open: https://twitter.com/${twitterHandle}\n\n💡 After following, use /airdrop verify <id> twitter`, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

// /join - Quick Telegram join tracker
bot.onText(/\/join\s+(https?:\/\/t\.me\/\w+)/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const tgLink = match[1];
    await bot.sendMessage(chatId, `✅ Telegram join tracked\n\n🔗 Join: ${tgLink}\n\n💡 After joining, use /airdrop verify <id> telegram`, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

// ===== SINGLE MESSAGE HANDLER (COMBINED NL + AI FALLBACK) =====
// ✅ HANYA ADA SATU bot.on('message') HANDLER!



// ===== PROFILE MANAGEMENT COMMANDS =====

bot.onText(/\/setprofile(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const args = match[1]?.trim();
    
    if (!args) {
        const menu = `
👤 **PROFILE SETUP**

Pilih field yang ingin diset:

/setprofile twitter username_here
/setprofile telegram username_here
/setprofile discord username_here
/setprofile email your@email.com
/setprofile wallet 0xYourWalletAddress
/setprofile name FirstName LastName

📋 Lihat profil: /myprofile
🗑️ Hapus profil: /clearprofile
        `;
        await bot.sendMessage(chatId, menu, { parse_mode: 'Markdown' });
        return;
    }
    
    // Parse: field value
    const parts = args.split(/\s+/);
    const field = parts[0].toLowerCase();
    const value = parts.slice(1).join(' ');
    
    if (!value) {
        await bot.sendMessage(chatId, '❌ Format salah. Contoh: `/setprofile twitter myusername`', { parse_mode: 'Markdown' });
        return;
    }
    
    // Validate field
    const validFields = ['twitter', 'telegram', 'discord', 'email', 'wallet', 'name'];
    if (!validFields.includes(field)) {
        await bot.sendMessage(chatId, `❌ Field tidak valid. Pilihan: ${validFields.join(', ')}`, { parse_mode: 'Markdown' });
        return;
    }
    
    try {
        // Handle 'name' field (split into firstName/lastName)
        if (field === 'name') {
            const nameParts = value.split(' ');
            await profileManager.updateProfileBulk(userId, {
                firstName: nameParts[0],
                lastName: nameParts.slice(1).join(' ')
            });
        } else {
            await profileManager.updateProfile(userId, field, value);
        }
        
        await bot.sendMessage(chatId, `✅ **Profile Updated**\n\n${field.toUpperCase()}: \`${value}\`\n\nGunakan /myprofile untuk lihat semua data.`, { parse_mode: 'Markdown' });
    } catch (error) {
        await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
});

// /myprofile - View current profile
bot.onText(/\/myprofile/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const summary = profileManager.getProfileSummary(userId);
    await bot.sendMessage(chatId, `👤 **Your Profile**\n\n${summary}\n\n✏️ Update: /setprofile`, { parse_mode: 'Markdown' });
});

// /clearprofile - Clear user profile
bot.onText(/\/clearprofile/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    
    if (profileManager.getProfile(userId)) {
        profileManager.profiles.delete(userId);
        await profileManager.saveProfiles();
        await bot.sendMessage(chatId, '✅ Profile cleared.');
    } else {
        await bot.sendMessage(chatId, '❌ No profile to clear.');
    }
});

// /autofill - Auto-fill and submit form
bot.onText(/\/autofill\s+(https?:\/\/\S+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const url = match[1];
    
    console.log(`🔍 /autofill command: user=${userId}, url=${url}`);
    
    // Check if module is loaded correctly
    if (!formAutoFiller || typeof formAutoFiller.autoSubmitForm !== 'function') {
        console.error('❌ formAutoFiller module not loaded correctly');
        console.error('   formAutoFiller:', formAutoFiller);
        console.error('   typeof autoSubmitForm:', typeof formAutoFiller?.autoSubmitForm);
        await bot.sendMessage(chatId, '❌ **Auto-fill module error**\n\nModule tidak ter-load dengan benar. Hubungi admin.', { parse_mode: 'Markdown' });
        return;
    }
    
    // Check profile
    const profile = profileManager.getProfile(userId);
    if (!profile) {
        await bot.sendMessage(chatId, '❌ **Profile belum diset!**\n\nGunakan /setprofile untuk menambahkan data sosial media Anda.', { parse_mode: 'Markdown' });
        return;
    }
    
    await bot.sendMessage(chatId, `🤖 **Starting Auto-Fill**\n\n🔗 URL: ${url}\n💼 Profile: ${profile.twitter || 'N/A'} (Twitter)\n\n⏳ Memproses... Ini butuh 30-60 detik.`, { parse_mode: 'Markdown', disable_web_page_preview: true });
    
    let browserClosed = false;
    
    try {
        console.log('🚀 Calling formAutoFiller.autoSubmitForm()...');
        const result = await formAutoFiller.autoSubmitForm(url, userId);
        console.log('✅ autoSubmitForm completed:', result.success ? 'success' : 'failed');
        
        // Save screenshots
        const screenshotPaths = [];
        if (result.screenshots) {
            if (result.screenshots.before) {
                try {
                    const p = await formAutoFiller.saveScreenshot(result.screenshots.before, userId, 'before');
                    if (p) screenshotPaths.push(p);
                } catch (e) { console.warn('Failed to save before screenshot:', e.message); }
            }
            if (result.screenshots.final) {
                try {
                    const p = await formAutoFiller.saveScreenshot(result.screenshots.final, userId, 'final');
                    if (p) screenshotPaths.push(p);
                } catch (e) { console.warn('Failed to save final screenshot:', e.message); }
            }
        }
        
        // Format result message
        const filledFieldsList = (result.filledFields || []).map(f => `✅ ${f.field}: \`${f.value}\``).join('\n') || '❌ No fields filled';
        const statusIcon = result.success ? '✅' : '⚠️';
        const statusText = result.success ? 'Form Submitted!' : 'Submit Failed - may need manual completion';
        
        const message = `
${statusIcon} **Auto-Fill Result**

🔗 URL: ${url}
✅ Fields Filled: ${(result.filledFields || []).length}
${statusText}

📋 **Filled Fields:**
${filledFieldsList}

${result.submitError ? `⚠️ Note: ${result.submitError}` : ''}
${result.error ? `❌ Error: ${result.error}` : ''}

💡 **Next Steps:**
- Check screenshots below
- Verify submission on the website
- If failed, try manual submission
        `.trim();
        
        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown', disable_web_page_preview: true });
        
        // Send screenshots
        for (const screenshotPath of screenshotPaths) {
            try {
                await bot.sendPhoto(chatId, screenshotPath);
                console.log('📸 Screenshot sent to Telegram');
            } catch (e) {
                console.error('Failed to send screenshot:', e.message);
            }
        }
        
    } catch (error) {
        console.error('❌ Auto-fill handler error:', error);
        console.error('Stack:', error.stack);
        await bot.sendMessage(chatId, `❌ **Auto-Fill Failed**\n\nError: ${error.message}\n\n💡 Coba manual atau hubungi admin.`, { parse_mode: 'Markdown' });
    } finally {
        // Close browser if still open
        if (!browserClosed && formAutoFiller && typeof formAutoFiller.closeBrowser === 'function') {
            try {
                await formAutoFiller.closeBrowser();
                browserClosed = true;
            } catch (e) {
                console.warn('Failed to close browser:', e.message);
            }
        }
    }
});

// /quickfill - Quick fill for common airdrops
bot.onText(/\/quickfill\s+(\w+)/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const airdropName = match[1].toLowerCase();
    
    // Predefined airdrop URLs
    const airdrops = {
        'probechain': 'https://probechain.org/airdrop/',
        'zealy': 'https://zealy.io',
        'galxe': 'https://galxe.com'
    };
    
    const url = airdrops[airdropName];
    if (!url) {
        await bot.sendMessage(chatId, `❌ Airdrop tidak ditemukan.\n\nTersedia: ${Object.keys(airdrops).join(', ')}`, { parse_mode: 'Markdown' });
        return;
    }
    
    // Redirect to /autofill
    msg.text = `/autofill ${url}`;
    bot.emit('message', msg);
});

// ===== EXECUTE PARSED INTENT FUNCTION =====

async function executeParsedIntent(parsed, userId, chatId, originalMessage) {
    console.log(`⚡ Executing intent: ${parsed.intent}`);
    
    // Execute chained intent first
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
            
            // Check profile
            const profile = profileManager.getProfile(userId);
            if (!profile) {
                return { message: '❌ Profile belum diset. Gunakan /setprofile dulu.' };
            }
            
            // Merge profile with entities
            const effectiveProfile = { ...profile, ...parsed.entities };
            
            // Execute autofill
            if (formAutoFiller && typeof formAutoFiller.autoSubmitForm === 'function') {
                try {
                    const result = await formAutoFiller.autoSubmitForm(url, userId);
                    
                    // Safely handle screenshots
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
                    return { message: `❌ Auto-fill error: ${error.message}\n\n💡 Coba manual atau hubungi admin.` };
                }
            } else {
                // Fallback manual
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

// ===== GLOBAL ERROR HANDLER =====

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