// bot.js - Telegram Bot Handler (AI AGENT + ALL ORIGINAL COMMANDS)
// ⚠️ BARIS 1: Load dotenv PALING AWAL
require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const aiAgent = require('./ai-agent');          // ✅ AI Agent - satu-satunya AI module

// LobMoney Mining - optional (butuh: LOBMONEY_API_KEY di env)
let lobmoney = null;
try {
    lobmoney = require('./lobmoney');
    console.log('✅ LobMoney module loaded');
} catch (e) {
    console.log('⚠️ LobMoney module not loaded:', e.message);
}

// Browser Use Cloud - optional (butuh: BROWSER_USE_API_KEY di env)
let browserUseClient = null;
try {
    const bu = require('./browser-use');
    browserUseClient = bu.getClient();
    if (browserUseClient) console.log('✅ Browser Use Cloud module loaded');
    else console.log('⚠️ Browser Use Cloud: BROWSER_USE_API_KEY tidak diset');
} catch (e) {
    console.log('⚠️ Browser Use module not loaded:', e.message);
}

// Web3 wallet - optional (butuh: npm install ethers)
let walletManager = null;
let registerWalletCommands = null;
try {
    walletManager = require('./web3-wallet');
    const wc = require('./wallet-commands');
    registerWalletCommands = wc.registerWalletCommands;
    console.log('✅ Web3 wallet module loaded');
} catch (e) {
    console.log('⚠️ Web3 wallet (opsional) tidak loaded:', e.message);
    console.log('   Jalankan: npm install ethers');
}
// MineBean - optional (butuh ethers)
let MineBeanSkill = null;
try {
    MineBeanSkill = require('./minebean');
    console.log('✅ MineBean module loaded');
} catch (e) {
    console.log('⚠️ MineBean module not loaded:', e.message);
}
const airdropManager = require('./airdrop');
const profileManager = require('./user-profiles');

// Optional modules with fallback
let formAutoFiller = null;
let universalScraper = null;
let AutoAirdropCompleter = null;
let autoCompleter = null;
let nlParser = null;

try { formAutoFiller = require('./form-autofill'); } catch (e) { console.log('⚠️ form-autofill not found'); }
try { nlParser = require('./nl-command-parser'); } catch (e) { console.log('⚠️ nl-command-parser not found'); }
try {
    universalScraper = require('./universal-scraper');
    AutoAirdropCompleter = require('./auto-airdrop-complete');
} catch (error) {
    console.log('⚠️ Auto-airdrop modules not found. /learn and /autoairdrop disabled.');
}

// ===== CONFIG & STATE =====
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
    polling: {
        interval: 300,
        autoStart: false,   // ✅ Jangan auto-start, kita start manual setelah clear webhook
        params: { timeout: 10 }
    }
});

// ✅ Clear webhook & pastikan tidak ada instance lain sebelum start polling
async function startBot(attempt = 1) {
    try {
        console.log(`🔄 Starting bot (attempt ${attempt})...`);

        // Step 1: Stop polling dulu kalau sedang jalan
        try { await bot.stopPolling(); } catch (e) {}

        // Step 2: Force delete webhook + drop semua pending updates
        await bot.deleteWebHook({ drop_pending_updates: true });
        console.log('✅ Webhook cleared');

        // Step 3: Tunggu lebih lama agar Telegram server release lock
        const waitTime = Math.min(attempt * 3000, 15000); // max 15 detik
        console.log(`⏳ Waiting ${waitTime/1000}s for Telegram to release lock...`);
        await new Promise(r => setTimeout(r, waitTime));

        // Step 4: Start polling
        await bot.startPolling({ restart: false });
        console.log('✅ Bot polling started successfully');

    } catch (err) {
        console.error(`❌ Start attempt ${attempt} failed:`, err.message);
        if (attempt < 10) {
            setTimeout(() => startBot(attempt + 1), 5000);
        } else {
            console.error('❌ Max retries reached. Bot failed to start.');
        }
    }
}

// Delay awal 3 detik supaya instance lama sempat mati dulu
setTimeout(() => startBot(), 3000);

if (AutoAirdropCompleter) {
    autoCompleter = new AutoAirdropCompleter(bot);
}

const minebeanInstances = new Map();
const processedMessages = new Map();
const MESSAGE_TTL = 5000;

if (!global.userWallets) global.userWallets = new Map();

let botInfo = null;

console.log('✅ Telegram Bot initialized');

bot.getMe().then(me => {
    botInfo = me;
    console.log(`🤖 Bot ready: @${me.username}`);
}).catch(err => {
    console.error('❌ Failed to get bot info:', err.message);
});

// ✅ Register wallet commands (jika module tersedia)
if (registerWalletCommands) {
    registerWalletCommands(bot);
} else {
    // Fallback handler jika ethers belum install
    bot.onText(/\/setwallet(.*)/, async (msg) => {
        await bot.sendMessage(msg.chat.id, '❌ Fitur wallet Web3 belum aktif.\n\nJalankan di server:\n`npm install ethers`\n\nLalu redeploy.', { parse_mode: 'Markdown' });
    });
    bot.onText(/\/balance(.*)/, async (msg) => {
        await bot.sendMessage(msg.chat.id, '❌ Fitur wallet Web3 belum aktif.\n\nJalankan: `npm install ethers`', { parse_mode: 'Markdown' });
    });
}

// ===== HELPER FUNCTIONS =====

function isMessageProcessed(messageId, userId) {
    const key = `${userId}:${messageId}`;
    if (processedMessages.has(key)) return true;
    processedMessages.set(key, Date.now());
    setTimeout(() => processedMessages.delete(key), MESSAGE_TTL);
    return false;
}

function splitMessage(text, maxLength = 4000) {
    if (!text) return [''];
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

function getMineBean(userId) {
    if (!MineBeanSkill) return null;
    if (!minebeanInstances.has(userId)) {
        minebeanInstances.set(userId, new MineBeanSkill(userId));
    }
    return minebeanInstances.get(userId);
}

function shutdown() {
    console.log('🛑 Shutting down...');
    bot.stopPolling();
    process.exit(0);
}

// ===== TOOL EXECUTORS UNTUK AI AGENT =====
// AI Agent akan otomatis memanggil fungsi-fungsi ini berdasarkan pesan user

function createToolExecutors(userId, chatId) {
    const mb = getMineBean(userId);

    return {
        // --- MineBean Tools ---
        async check_airdrop_status() {
            const round = await mb.getCurrentRound();
            if (!round) return 'Gagal ambil data round MineBean';
            const timeLeft = Math.max(0, round.endTime - mb.now());
            return `Round #${round.roundId} | Waktu: ${Math.floor(timeLeft/60)}m ${timeLeft%60}s | Deployed: ${round.totalDeployedFormatted} ETH | Beanpot: ${round.beanpotPoolFormatted} BEAN | Status: ${round.settled ? 'Settled' : 'Aktif'}`;
        },

        async check_bean_price() {
            const price = await mb.getBeanPrice();
            const eth = parseFloat(price.priceNative || '0').toFixed(8);
            const usd = parseFloat(price.priceUsd || '0').toFixed(4);
            return `Harga BEAN: ${eth} ETH / $${usd} USD (update: ${new Date().toLocaleTimeString('id-ID')})`;
        },

        async check_rewards() {
            const wallet = global.userWallets?.get(userId);
            if (!wallet) return 'Wallet belum diset. Kirim pesan: set wallet 0xAlamatWalletmu';
            const rewards = await mb.getUserRewards(wallet);
            if (!rewards) return 'Gagal ambil data rewards';
            return `Rewards - ETH: ${mb.formatEth(rewards.pendingEth||'0')} | BEAN: ${mb.formatEth(rewards.pendingBean||'0')} (Unroasted: ${mb.formatEth(rewards.unroastedBean||'0')}, Roasted: ${mb.formatEth(rewards.roastedBean||'0')}, Bonus: ${mb.formatEth(rewards.roastingBonus||'0')})`;
        },

        async suggest_blocks({ strategy = 'least-crowded' } = {}) {
            const round = await mb.getCurrentRound();
            if (!round) return 'Gagal ambil data grid';
            const suggested = mb.suggestBlocks(round, 3, strategy);
            const info = suggested.map(id => {
                const block = round.blocks?.find(b => b.id === id);
                return `Block ${id}: ${block?.deployedFormatted||'0'} ETH, ${block?.minerCount||0} miners`;
            }).join(' | ');
            return `Rekomendasi block (${strategy}): ${info}`;
        },

        async calculate_ev({ amount_eth = '0.001' } = {}) {
            const [roundData, priceData] = await Promise.all([mb.getCurrentRound(), mb.getBeanPrice()]);
            if (!roundData || !priceData) return 'Gagal ambil data untuk kalkulasi EV';
            const ev = mb.calculateEV({
                deployedEth: amount_eth,
                beanPriceEth: priceData.priceNative || '0.000015',
                beanpotPool: roundData.beanpotPoolFormatted || '0',
                totalDeployed: roundData.totalDeployedFormatted || '1',
                yourShareOnWinningBlock: 0.04
            });
            return `EV untuk ${amount_eth} ETH: ${ev.netEV} ETH (${ev.isPositive ? 'Positif' : 'Negatif'}) | BEAN: ${ev.breakdown.beanValue} | Beanpot: ${ev.breakdown.beanpotEV} | Fee: ${ev.breakdown.feeCost} (${ev.breakdown.houseEdge})`;
        },

        // --- Airdrop Tools ---
        async list_airdrops() {
            const airdrops = airdropManager.getActiveAirdrops();
            if (!airdrops?.length) return 'Belum ada airdrop aktif. Kirim link airdrop untuk dipelajari!';
            return airdrops.map((a, i) => `${i+1}. ${a.name} | Reward: ${a.reward} | Deadline: ${a.deadline}`).join('\n');
        },

        async learn_airdrop_from_url({ url } = {}) {
            if (!url) return 'URL tidak ditemukan';

            await bot.sendMessage(chatId, `🔍 Mengakses & menganalisis link... ⏳
${url}`, { disable_web_page_preview: true }).catch(() => {});

            // Prioritas 1: Browser Use Cloud (bisa render JS, login, dll)
            if (browserUseClient) {
                const task = `Go to this URL: ${url}
Analyze this page and provide a detailed summary in Indonesian including:
1. What is this website/project about?
2. Is this an airdrop? If yes, what are the requirements and rewards?
3. What tasks need to be completed?
4. Are there any forms to fill out?
5. Key information the user should know

Be specific and detailed. Respond in Indonesian.`;

                const started = await browserUseClient.runTask(task);
                if (started.liveUrl) {
                    await bot.sendMessage(chatId, `👁️ Live preview: ${started.liveUrl}`, { disable_web_page_preview: false }).catch(() => {});
                }
                const result = await browserUseClient.waitForTask(started.task_id, 60000);
                const output = result.task?.output || result.task?.result || 'Tidak dapat menganalisis halaman';
                return `✅ Analisis selesai:

${output}`;
            }

            // Fallback: fetch biasa
            try {
                const res = await fetch(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                    signal: AbortSignal.timeout(15000)
                });
                const html = await res.text();
                // Ambil teks dari HTML (strip tags)
                const text = html
                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .substring(0, 2000);

                if (!text || text.length < 50) return `❌ Halaman tidak bisa diakses atau kosong. Coba set BROWSER_USE_API_KEY untuk akses penuh.`;
                return `📄 Konten dari ${url}:

${text}

💡 Untuk analisis lebih detail, set BROWSER_USE_API_KEY di Railway.`;
            } catch (e) {
                if (universalScraper) {
                    const result = await universalScraper.learnFromLink(url, { useAI: false });
                    if (result.success) {
                        const tasks = (result.tasks||[]).map((t, i) => `${i+1}. ${t.type}: ${t.label}`).join(', ') || '-';
                        return `Nama: ${result.name} | Platform: ${result.platform} | Reward: ${result.reward||'TBA'} | Tasks: ${tasks}`;
                    }
                }
                return `❌ Tidak bisa mengakses link: ${e.message}

Set BROWSER_USE_API_KEY untuk akses penuh.`;
            }
        },

        async autofill_airdrop_form({ url } = {}) {
            if (!url) return 'URL tidak ditemukan';

            const profile = profileManager.getProfile(userId);
            if (!profile) return 'Profile belum diset. Kirim: set twitter @usernamesaya dulu!';

            // ✅ Prioritas 1: Browser Use Cloud (lebih handal, tidak butuh Chromium)
            if (browserUseClient) {
                await bot.sendMessage(chatId,
                    `🌐 *Mengisi form via Browser Use Cloud...*
🔗 ${url}

⏳ Mohon tunggu 1-2 menit...`,
                    { parse_mode: 'Markdown', disable_web_page_preview: true }
                ).catch(() => {});

                const result = await browserUseClient.autoFillAndWait(url, profile, { timeoutMs: 150000 });

                // Kirim live preview URL dulu
                if (result.liveUrl) {
                    await bot.sendMessage(chatId,
                        `👁️ *Live Preview:*
${result.liveUrl}

_Klik untuk lihat browser bekerja secara real-time_`,
                        { parse_mode: 'Markdown', disable_web_page_preview: false }
                    ).catch(() => {});
                }

                if (result.success) {
                    const output = result.output ? `

📋 Hasil: ${result.output}` : '';
                    return `✅ Form berhasil diisi & disubmit via Browser Use Cloud!${output}`;
                } else {
                    return `⚠️ Browser Use selesai tapi mungkin perlu cek manual: ${result.error || 'unknown'}`;
                }
            }

            // Fallback: Puppeteer lokal
            if (!formAutoFiller) {
                return '❌ Tidak ada browser module tersedia.\n\nSet BROWSER_USE_API_KEY di Railway Variables untuk menggunakan Browser Use Cloud.';
            }

            await bot.sendMessage(chatId, `🤖 Mengisi form airdrop... ⏳ (30-60 detik)`, { disable_web_page_preview: true }).catch(() => {});
            const result = await formAutoFiller.autoSubmitForm(url, userId);

            if (result.screenshots?.final) {
                try {
                    const p = await formAutoFiller.saveScreenshot(result.screenshots.final, userId, 'final');
                    if (p) await bot.sendPhoto(chatId, p).catch(() => {});
                } catch (e) {}
            }

            const filled = (result.filledFields||[]).map(f => `${f.field}: ${f.value}`).join(', ') || 'tidak ada field terisi';
            return `${result.success ? 'Berhasil submit!' : 'Submit perlu dicek'} | Fields: ${filled}`;
        },

        // --- Profile Tools ---
        async update_profile({ field, value } = {}) {
            if (!field || !value) return 'Field atau value tidak lengkap';
            const cleanValue = value.replace(/^@/, '');
            if (field === 'wallet') {
                global.userWallets.set(userId, cleanValue.toLowerCase());
                if (MineBeanSkill) minebeanInstances.set(userId, new MineBeanSkill(cleanValue.toLowerCase()));
            }
            await profileManager.updateProfile(userId, field, cleanValue);
            return `${field} berhasil diupdate: ${cleanValue}`;
        },

        async show_profile() {
            const summary = profileManager.getProfileSummary(userId);
            return `Profil kamu:\n${summary}`;
        },

        // --- Task Tools ---
        async verify_task({ airdrop_id, task_type } = {}) {
            const airdrops = airdropManager.getActiveAirdrops();
            const airdrop = airdrop_id ? airdropManager.getAirdropById(airdrop_id) : airdrops[0];
            if (!airdrop) return 'Airdrop tidak ditemukan';
            const taskIndex = airdrop.tasks.findIndex(t => t.type === task_type);
            if (taskIndex === -1) return `Task "${task_type}" tidak ditemukan`;
            const progress = airdropManager.markTaskComplete(userId, airdrop.id, taskIndex.toString());
            const done = Object.keys(progress.tasks).length;
            return `Task ${task_type} ditandai selesai! Progress: ${done}/${airdrop.tasks.length}${progress.completed ? ' - SEMUA SELESAI!' : ''}`;
        },

        async check_progress() {
            const summary = airdropManager.getUserSummary?.(userId) || { total: 0, completed: 0, inProgress: 0, notStarted: 0 };
            const rate = summary.total > 0 ? Math.round((summary.completed/summary.total)*100) : 0;
            return `Progress: ${summary.completed}/${summary.total} selesai (${rate}%) | Proses: ${summary.inProgress||0} | Belum: ${summary.notStarted||0}`;
        },

        async reset_conversation() {
            aiAgent.resetConversation(userId);
            return 'Percakapan direset!';
        },

        // ===== LOBMONEY MINING TOOLS =====
        async check_lobmoney_status() {
            if (!lobmoney) return 'LobMoney module tidak tersedia.';
            const key = process.env.LOBMONEY_API_KEY;
            if (!key) return 'LOBMONEY_API_KEY belum diset di Railway Variables.';
            const status = await lobmoney.getMiningStatus();
            return lobmoney.formatStatus(status);
        },

        async create_lobmoney_account() {
            if (!lobmoney) return 'LobMoney module tidak tersedia.';
            const result = await lobmoney.createAccount();
            await bot.sendMessage(chatId,
                `🎮 *Akun LobMoney Berhasil Dibuat!*

🔑 API Key: \`${result.apiKey}\`
👛 Wallet: \`${result.walletAddress}\`

⚠️ Simpan API Key ini! Tambahkan ke Railway Variables sebagai \`LOBMONEY_API_KEY\``,
                { parse_mode: 'Markdown' }
            ).catch(() => {});
            return `Akun dibuat! API Key: ${result.apiKey} | Wallet: ${result.walletAddress}`;
        },

        async get_lobmoney_balance() {
            if (!lobmoney) return 'LobMoney module tidak tersedia.';
            const key = process.env.LOBMONEY_API_KEY;
            if (!key) return 'LOBMONEY_API_KEY belum diset.';
            const bal = await lobmoney.getBalance();
            return `LOBCOIN: ${bal.lobcoin} | Gold Epoch Ini: ${bal.goldBalance} | Wallet: ${bal.walletAddress}`;
        },

        async get_lobmoney_rounds() {
            if (!lobmoney) return 'LobMoney module tidak tersedia.';
            const key = process.env.LOBMONEY_API_KEY;
            if (!key) return 'LOBMONEY_API_KEY belum diset.';
            const rounds = await lobmoney.getRoundList();
            const active = rounds.filter(r => r.status === 'RUNNING');
            const recent = rounds.slice(0, 5);
            return `Round aktif: ${active.length} | Recent rounds: ${recent.map(r => r.status).join(', ')}`;
        },

        // ===== WALLET / WEB3 TOOLS =====
        async check_wallet_balance(args = {}) {
            const { chain } = (args && typeof args === 'object') ? args : {};
            if (!walletManager) return 'Fitur wallet Web3 belum aktif. Hubungi admin untuk install ethers di server.';
            const info = walletManager.walletInfo(userId);
            if (!info.hasWallet) return 'Wallet belum diset. Kirim /setwallet lalu private key kamu (di chat private ya!).';
            if (chain) {
                const bal = await walletManager.getBalance(userId, chain);
                return `Balance ${bal.chain}: ${bal.balance} ${bal.symbol} | Address: ${bal.address} | Explorer: ${bal.explorer}`;
            } else {
                const balances = await walletManager.getAllBalances(userId);
                return balances.map(b =>
                    b.error ? `${b.chain}: Error` : `${b.chain}: ${b.balance} ${b.symbol}`
                ).join('\n');
            }
        },

        async claim_airdrop_onchain(args = {}) {
            const { chain, contract_address, value = '0' } = (args && typeof args === 'object') ? args : {};
            if (!walletManager) return 'Fitur wallet Web3 belum aktif. Hubungi admin untuk install ethers di server.';
            const info = walletManager.walletInfo(userId);
            if (!info.hasWallet) return 'Wallet belum diset. Gunakan /setwallet terlebih dahulu.';
            if (!contract_address) return 'Contract address diperlukan.';

            await bot.sendMessage(chatId, `⏳ Mencoba claim on-chain...\n⛓️ ${chain}\n📜 \`${contract_address}\`\n👛 \`${info.address}\``, { parse_mode: 'Markdown' }).catch(() => {});

            const result = await walletManager.claimAirdrop(userId, chain, contract_address, {
                address: info.address, value
            });

            return result.success
                ? `Claim berhasil! Method: ${result.method} | Tx: ${result.hash} | Explorer: ${result.explorer}`
                : `Claim gagal. Gas: ${result.gasUsed}`;
        },

        async sign_message(args = {}) {
            const { message, chain = 'base' } = (args && typeof args === 'object') ? args : {};
            if (!walletManager) return 'Fitur wallet Web3 belum aktif.';
            const info = walletManager.walletInfo(userId);
            if (!info.hasWallet) return 'Wallet belum diset.';
            if (!message) return 'Pesan untuk di-sign diperlukan.';
            const result = await walletManager.signMessage(userId, message, chain);
            return `Signed!\nAddress: ${result.address}\nSignature: ${result.signature}`;
        },

        async get_wallet_info() {
            if (!walletManager) return 'Fitur wallet Web3 belum aktif.';
            const info = walletManager.walletInfo(userId);
            if (!info.hasWallet) return 'Wallet belum diset. Gunakan /setwallet di chat private.';
            return `Wallet aktif:\nAddress: ${info.address}\nChain: ${info.chain}\nSource: ${info.source}`;
        },
    };
}

// ===== COMMAND HANDLERS: CORE =====

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const name = msg.from.first_name || 'User';
    const welcome = `
👋 Halo ${name}! Selamat datang di **Groq AI Bot**!

🤖 **AI Pintar - Langsung Action!**
Tidak perlu hafal command, cukup ngobrol natural:
• _"cek harga bean"_ → langsung cek harga
• _"lihat reward saya"_ → langsung cek rewards
• _"set twitter @username"_ → langsung simpan
• _"pelajari airdrop dari [link]"_ → langsung analisis
• _"kerjakan form [link]"_ → langsung auto-isi form

📋 **Command tersedia:**
/start /help /reset /stats /about /ping
/minebean /airdrop /learn /autoairdrop
/setprofile /myprofile /wallet /autofill

✨ AI akan langsung eksekusi - tidak perlu manual!
    `;
    await bot.sendMessage(chatId, welcome, { parse_mode: 'Markdown' });
});

bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    const help = `
📚 **BANTUAN GROQ AI BOT**

🗣️ **Chat Natural (Direkomendasikan):**
Cukup ketik apa yang kamu mau, AI langsung action:
• "cek harga bean"
• "lihat reward saya"
• "suggest block terbaik"
• "set wallet 0x123..."
• "pelajari airdrop dari https://..."
• "kerjakan form https://..."

📋 **Command Manual:**
/reset - Mulai percakapan baru
/stats - Statistik chat
/minebean - MineBean game commands
/airdrop - Airdrop task manager
/learn <url> - Pelajari airdrop dari link
/autoairdrop <url> - Auto-complete airdrop
/setprofile - Setup profil sosmed
/myprofile - Lihat profil
/wallet <0x...> - Set wallet address
/autofill <url> - Auto-isi form airdrop
    `;
    await bot.sendMessage(chatId, help, { parse_mode: 'Markdown' });
});

bot.onText(/\/reset/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    aiAgent.resetConversation(userId);
    await bot.sendMessage(chatId, '🔄 Percakapan direset! Halo lagi! 👋');
});

bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    await bot.sendMessage(chatId, `📊 ${aiAgent.getStats(userId)}`);
});

bot.onText(/\/about/, async (msg) => {
    const chatId = msg.chat.id;
    const about = `
🤖 **GROQ AI TELEGRAM BOT**

Version: 2.0.0 (AI Agent)
AI: Groq Cloud (Llama 3.1 70B)
Mode: Function Calling Agent ⚡

📌 **Features:**
- Natural language → auto action
- MineBean game integration
- Airdrop auto-fill & tracking
- Profile management
- Context-aware conversation

📅 Created: 2026
    `;
    await bot.sendMessage(chatId, about, { parse_mode: 'Markdown' });
});

bot.onText(/\/ping/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        const start = Date.now();
        const result = await aiAgent.testConnection();
        const latency = Date.now() - start;
        await bot.sendMessage(chatId, result.success ? `🏓 Pong! ${latency}ms\n✅ ${result.message}` : `❌ ${result.message}`);
    } catch (error) {
        await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
});

// ===== COMMAND HANDLERS: ADMIN =====

bot.onText(/\/admin/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    if (userId !== process.env.TELEGRAM_ADMIN_ID) {
        await bot.sendMessage(chatId, '❌ Access denied. Admin only.');
        return;
    }
    await bot.sendMessage(chatId, `🔧 **ADMIN COMMANDS**\n\n/clearall - Clear semua conversation\n/stats - Bot statistics\n\n⚠️ Gunakan dengan hati-hati!`, { parse_mode: 'Markdown' });
});

bot.onText(/\/clearall/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    if (userId !== process.env.TELEGRAM_ADMIN_ID) {
        await bot.sendMessage(chatId, '❌ Access denied.');
        return;
    }
    aiAgent.clearAllConversations();
    await bot.sendMessage(chatId, '✅ Semua conversation dihapus.');
});

// ===== COMMAND HANDLERS: MINEBEAN =====

bot.onText(/\/minebean(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const args = match[1]?.trim().split(' ') || [];
    const subcommand = args[0]?.toLowerCase();

    if (!subcommand) {
        await bot.sendMessage(chatId, `
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

💬 **Atau chat natural:**
_"cek harga bean", "lihat reward", "suggest block"_

🔗 https://minebean.com
        `, { parse_mode: 'Markdown' });
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
                await bot.sendMessage(chatId, `
🎮 **Round #${round.roundId}**
⏱️ Waktu tersisa: ${Math.floor(timeLeft/60)}m ${timeLeft%60}s
💰 Total deployed: ${round.totalDeployedFormatted} ETH
🏆 Beanpot: ${round.beanpotPoolFormatted} BEAN
📊 Settled: ${round.settled ? '✅ Ya' : '❌ Belum'}
                `.trim(), { parse_mode: 'Markdown' });
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
                    await bot.sendMessage(chatId, '❌ Wallet belum diset.\n\nGunakan `/wallet 0xYourAddress` atau ketik _"set wallet 0xAlamatmu"_', { parse_mode: 'Markdown' });
                    return;
                }
                const rewards = await mb.getUserRewards(walletAddress);
                if (!rewards) { await bot.sendMessage(chatId, '❌ Gagal mengambil data rewards.'); return; }
                await bot.sendMessage(chatId, `
🎁 **Your Rewards**
💰 Pending ETH: ${mb.formatEth(rewards.pendingEth || '0')} ETH
🫘 Pending BEAN: ${mb.formatEth(rewards.pendingBean || '0')} BEAN
   ├─ Unroasted: ${mb.formatEth(rewards.unroastedBean || '0')}
   ├─ Roasted: ${mb.formatEth(rewards.roastedBean || '0')}
   └─ Fee earned: ${mb.formatEth(rewards.roastingBonus || '0')}
                `.trim(), { parse_mode: 'Markdown' });
                break;
            }
            case 'ev': {
                const deployEth = args[1] || '0.001';
                const [roundData, priceData] = await Promise.all([mb.getCurrentRound(), mb.getBeanPrice()]);
                if (!roundData || !priceData) { await bot.sendMessage(chatId, '❌ Gagal ambil data untuk kalkulasi EV'); return; }
                const ev = mb.calculateEV({
                    deployedEth: deployEth,
                    beanPriceEth: priceData.priceNative || '0.000015',
                    beanpotPool: roundData.beanpotPoolFormatted || '0',
                    totalDeployed: roundData.totalDeployedFormatted || '1',
                    yourShareOnWinningBlock: 0.04
                });
                await bot.sendMessage(chatId, `
📊 **Expected Value Analysis**
Deploy: ${deployEth} ETH
Net EV: ${ev.netEV} ETH ${ev.isPositive ? '✅ Positif' : '❌ Negatif'}
• BEAN reward: ${ev.breakdown.beanValue} ETH
• Beanpot EV: ${ev.breakdown.beanpotEV} ETH
• Fee cost: ${ev.breakdown.feeCost} ETH (${ev.breakdown.houseEdge})
                `.trim(), { parse_mode: 'Markdown' });
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
                await bot.sendMessage(chatId, `🎯 **Block Suggestions** (${strategy})\n\n${blockInfo}\n\n💡 Sedikit miners = share lebih besar!\n⚠️ Win probability 1/25 per block`, { parse_mode: 'Markdown' });
                break;
            }
            case 'stats': {
                const stats = await mb.getStats();
                if (!stats) { await bot.sendMessage(chatId, '❌ Gagal ambil stats'); return; }
                await bot.sendMessage(chatId, `
🌍 **MineBean Global Stats**
📊 Total rounds: ${stats.totalRounds || '?'}
💰 Total deployed: ${stats.totalDeployedFormatted || '?'} ETH
🫘 BEAN minted: ${stats.totalBeanMintedFormatted || '?'}
🏆 Beanpot: ${stats.beanpotPoolFormatted || '?'} BEAN
👥 Unique miners: ${stats.uniqueMiners || '?'}
🔗 https://minebean.com
                `.trim(), { parse_mode: 'Markdown' });
                break;
            }
            case 'deploy':
                await bot.sendMessage(chatId, '⚠️ Deploy memerlukan private key. Untuk keamanan, deploy manual via https://minebean.com', { parse_mode: 'Markdown' });
                break;
            case 'claim':
                await bot.sendMessage(chatId, '🎁 Claim rewards via https://minebean.com\n\n💡 Tip: Tahan BEAN untuk dapat roasting bonus (10% fee)!', { parse_mode: 'Markdown' });
                break;
            default:
                await bot.sendMessage(chatId, 'Ketik /minebean untuk lihat semua commands.');
        }
    } catch (error) {
        console.error('❌ MineBean command error:', error);
        await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
});

// /wallet
bot.onText(/\/wallet\s+(0x[a-fA-F0-9]{40})/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const address = match[1].toLowerCase();
    global.userWallets.set(userId, address);
    if (MineBeanSkill) minebeanInstances.set(userId, new MineBeanSkill(address));
    await bot.sendMessage(chatId, `✅ Wallet diset: \`${address}\`\n\n/minebean rewards untuk cek rewards.`, { parse_mode: 'Markdown' });
});

// ===== COMMAND HANDLERS: AIRDROP =====

bot.onText(/\/learn\s+(.+)/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const url = match[1].trim();

    if (!universalScraper) {
        await bot.sendMessage(chatId, '❌ Module scraper tidak ter-load.', { parse_mode: 'Markdown' });
        return;
    }

    await bot.sendMessage(chatId, `🔍 Mempelajari airdrop dari:\n\`${url}\`\n\n⏳ Memproses...`, { parse_mode: 'Markdown', disable_web_page_preview: true });

    try {
        const result = await universalScraper.learnFromLink(url, { useAI: false });
        if (!result.success) {
            await bot.sendMessage(chatId, `❌ Error: ${result.error}`, { parse_mode: 'Markdown' });
            return;
        }

        let saved;
        try { saved = await universalScraper.saveAirdrop(result); }
        catch (e) { saved = { id: `temp_${Date.now()}`, ...result }; }

        const taskList = (result.tasks || []).map((t, i) => `${i+1}. **${t.type.toUpperCase()}**: ${t.label}${t.url ? `\n   🔗 \`${t.url}\`` : ''}`).join('\n') || 'Tidak ada task spesifik';

        await bot.sendMessage(chatId, `
✅ **Airdrop Berhasil Dipelajari!**

🎯 **Nama:** ${result.name}
🌐 **Platform:** ${result.platform}
📝 **Deskripsi:** ${(result.description||'').substring(0, 150)}${(result.description||'').length > 150 ? '...' : ''}
🎁 **Reward:** ${result.reward || 'Potential airdrop'}

📋 **Tasks (${(result.tasks||[]).length}):**
${taskList}

ID: \`${saved.id}\`
        `.trim(), { parse_mode: 'Markdown', disable_web_page_preview: true });

    } catch (error) {
        console.error('❌ Learn handler error:', error);
        await bot.sendMessage(chatId, `❌ Error: ${error.message}`, { parse_mode: 'Markdown' });
    }
});

bot.onText(/\/airdrop(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const args = match[1]?.trim().split(' ') || [];
    const subcommand = args[0]?.toLowerCase();

    if (msg.text?.includes('http') && (!subcommand || subcommand.length < 2)) return;

    if (!subcommand) {
        const summary = airdropManager.getUserSummary?.(userId) || { total: 0, completed: 0, inProgress: 0, notStarted: 0 };
        await bot.sendMessage(chatId, `
🪂 **AIRDROP TASK MANAGER**

📊 Progress: ✅${summary.completed} 🔄${summary.inProgress||0} ⏳${summary.notStarted||0} 📋${summary.total}

📋 **Commands:**
/airdrop list - List semua airdrop
/airdrop <id> - Detail airdrop
/airdrop verify <id> <task> - Tandai task selesai
/airdrop submit <id> - Submit airdrop
/airdrop progress - Lihat progress
/learn <url> - Pelajari airdrop baru

💬 Atau chat: _"lihat daftar airdrop"_, _"progress airdrop saya"_
        `, { parse_mode: 'Markdown' });
        return;
    }

    try {
        switch(subcommand) {
            case 'list': {
                const airdrops = airdropManager.getActiveAirdrops();
                const list = airdrops.map((a, i) => `**${i+1}. ${a.name}**\n${a.description}\n🎁 ${a.reward}\n⏰ ${a.deadline}`).join('\n\n');
                await bot.sendMessage(chatId, `🪂 **Active Airdrops**\n\n${list}`, { parse_mode: 'Markdown' });
                break;
            }
            case 'progress': {
                const summary = airdropManager.getUserSummary(userId);
                const rate = summary.total > 0 ? Math.round((summary.completed/summary.total)*100) : 0;
                await bot.sendMessage(chatId, `📊 **Progress**\n✅ Selesai: ${summary.completed}\n🔄 Proses: ${summary.inProgress||0}\n⏳ Belum: ${summary.notStarted||0}\n📋 Total: ${summary.total}\n🎯 Rate: ${rate}%`, { parse_mode: 'Markdown' });
                break;
            }
            case 'verify': {
                const [airdropId, taskType] = [args[1], args[2]];
                if (!airdropId || !taskType) { await bot.sendMessage(chatId, '❌ Usage: `/airdrop verify <id> <task>`', { parse_mode: 'Markdown' }); return; }
                const airdrop = airdropManager.getAirdropById(airdropId);
                if (!airdrop) { await bot.sendMessage(chatId, '❌ Airdrop not found'); return; }
                const taskIndex = airdrop.tasks.findIndex(t => t.type === taskType);
                if (taskIndex === -1) { await bot.sendMessage(chatId, '❌ Task not found'); return; }
                const progress = airdropManager.markTaskComplete(userId, airdropId, taskIndex.toString());
                await bot.sendMessage(chatId, `✅ Task verified!\n📊 ${Object.keys(progress.tasks).length}/${airdrop.tasks.length} tasks${progress.completed ? '\n🎉 All done!' : ''}`, { parse_mode: 'Markdown' });
                break;
            }
            case 'submit': {
                const airdropId = args[1];
                if (!airdropId) { await bot.sendMessage(chatId, '❌ Usage: `/airdrop submit <id>`', { parse_mode: 'Markdown' }); return; }
                const airdrop = airdropManager.getAirdropById(airdropId);
                if (!airdrop) { await bot.sendMessage(chatId, '❌ Airdrop not found'); return; }
                const progress = airdropManager.getUserProgress(userId, airdropId);
                if (!progress.completed) { await bot.sendMessage(chatId, '❌ Belum semua task selesai!'); return; }
                const wallet = global.userWallets?.get(userId);
                await bot.sendMessage(chatId, `✅ **Submitted!**\n🎯 ${airdrop.name}\n💼 Wallet: ${wallet||'Not set'}\n📅 ${new Date().toLocaleString('id-ID')}`, { parse_mode: 'Markdown' });
                break;
            }
            default: {
                const airdrop = airdropManager.getAirdropById(subcommand);
                if (!airdrop) { await bot.sendMessage(chatId, '❌ Airdrop not found. Use /airdrop list.'); return; }
                const progress = airdropManager.getUserProgress(userId, airdrop.id);
                const wallet = global.userWallets?.get(userId);
                const taskList = airdrop.tasks.map((t, i) => {
                    const done = progress.tasks[i.toString()] ? '✅' : '⏳';
                    return `${done} ${t.required ? '🔴' : '🟢'} **${t.label}**\n   🔗 ${t.url}`;
                }).join('\n');
                await bot.sendMessage(chatId, `🎯 **${airdrop.name}**\n📝 ${airdrop.description}\n🎁 ${airdrop.reward}\n⏰ ${airdrop.deadline}\n\n${taskList}\n\n💼 Wallet: ${wallet||'Not set'}\n📊 ${Object.keys(progress.tasks).length}/${airdrop.tasks.length} tasks`, { parse_mode: 'Markdown', disable_web_page_preview: true });
            }
        }
    } catch (error) {
        console.error('❌ Airdrop error:', error);
        await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
});

// /autoairdrop
bot.onText(/\/autoairdrop\s+(https?:\/\/\S+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const url = match[1];

    if (!autoCompleter) {
        await bot.sendMessage(chatId, '❌ Auto-completion module not installed.');
        return;
    }

    const userWallet = global.userWallets?.get(userId);
    await bot.sendMessage(chatId, `🚀 **Starting Auto Airdrop!**\n🔗 ${url}\n💼 Wallet: ${userWallet||'Not set'}\n\n⏳ 2-5 menit...`, { parse_mode: 'Markdown' });

    try {
        const result = await autoCompleter.completeAirdropFromLink(userId, url, userWallet);
        if (result.success) {
            const taskResults = result.status.steps.filter(s => s.task).map(s => {
                if (s.manual) return `🔶 **${s.task}** (Manual)\n   ${s.hint}`;
                return `${s.status === 'completed' ? '✅' : '❌'} **${s.task}**: ${s.message||s.status}`;
            }).join('\n');
            await bot.sendMessage(chatId, `🤖 **Laporan Auto Airdrop**\n✅ Auto: ${result.status.completed}\n🔶 Manual: ${result.status.steps.filter(s=>s.manual).length}\n❌ Gagal: ${result.status.failed}\n\n${taskResults}`, { parse_mode: 'Markdown', disable_web_page_preview: true });
            for (const sc of result.status.screenshots||[]) {
                try { await bot.sendPhoto(chatId, sc); } catch (e) {}
            }
        } else {
            await bot.sendMessage(chatId, `❌ Automation Failed: ${result.error}`);
        }
    } catch (error) {
        await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
});

// /follow, /join
bot.onText(/\/follow\s+@?(\w+)/, async (msg, match) => {
    await bot.sendMessage(msg.chat.id, `✅ Follow tracked: @${match[1]}\n🔗 https://twitter.com/${match[1]}\n\nSetelah follow, tandai: /airdrop verify <id> twitter`, { disable_web_page_preview: true });
});

bot.onText(/\/join\s+(https?:\/\/t\.me\/\w+)/i, async (msg, match) => {
    await bot.sendMessage(msg.chat.id, `✅ Join tracked\n🔗 ${match[1]}\n\nSetelah join, tandai: /airdrop verify <id> telegram`, { disable_web_page_preview: true });
});

// ===== PROFILE COMMANDS =====

bot.onText(/\/setprofile(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const args = match[1]?.trim();

    if (!args) {
        await bot.sendMessage(chatId, `
👤 **PROFILE SETUP**

/setprofile twitter username
/setprofile telegram username
/setprofile discord username
/setprofile email your@email.com
/setprofile wallet 0xAddress
/setprofile name Nama Lengkap

💬 Atau chat: _"set twitter @usernamesaya"_
        `, { parse_mode: 'Markdown' });
        return;
    }

    const parts = args.split(/\s+/);
    const field = parts[0].toLowerCase();
    const value = parts.slice(1).join(' ');

    if (!value) { await bot.sendMessage(chatId, '❌ Format: `/setprofile twitter myusername`', { parse_mode: 'Markdown' }); return; }

    const validFields = ['twitter', 'telegram', 'discord', 'email', 'wallet', 'name'];
    if (!validFields.includes(field)) { await bot.sendMessage(chatId, `❌ Field tidak valid: ${validFields.join(', ')}`); return; }

    try {
        if (field === 'name') {
            const parts2 = value.split(' ');
            await profileManager.updateProfileBulk(userId, { firstName: parts2[0], lastName: parts2.slice(1).join(' ') });
        } else {
            await profileManager.updateProfile(userId, field, value);
            if (field === 'wallet') {
                global.userWallets.set(userId, value.toLowerCase());
                if (MineBeanSkill) minebeanInstances.set(userId, new MineBeanSkill(value.toLowerCase()));
            }
        }
        await bot.sendMessage(chatId, `✅ **${field.toUpperCase()}** diset: \`${value}\``, { parse_mode: 'Markdown' });
    } catch (error) {
        await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
});

bot.onText(/\/myprofile/, async (msg) => {
    const userId = msg.from.id.toString();
    await bot.sendMessage(msg.chat.id, `👤 **Your Profile**\n\n${profileManager.getProfileSummary(userId)}\n\n✏️ Update: /setprofile`, { parse_mode: 'Markdown' });
});

bot.onText(/\/clearprofile/, async (msg) => {
    const userId = msg.from.id.toString();
    if (profileManager.getProfile(userId)) {
        profileManager.profiles.delete(userId);
        await profileManager.saveProfiles();
        await bot.sendMessage(msg.chat.id, '✅ Profile cleared.');
    } else {
        await bot.sendMessage(msg.chat.id, '❌ No profile to clear.');
    }
});

bot.onText(/\/autofill\s+(https?:\/\/\S+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const url = match[1];

    if (!formAutoFiller?.autoSubmitForm) { await bot.sendMessage(chatId, '❌ Auto-fill module error.'); return; }
    if (!profileManager.getProfile(userId)) { await bot.sendMessage(chatId, '❌ Profile belum diset! Gunakan /setprofile atau ketik _"set twitter @username"_', { parse_mode: 'Markdown' }); return; }

    await bot.sendMessage(chatId, `🤖 Starting Auto-Fill...\n🔗 ${url}\n⏳ 30-60 detik...`, { disable_web_page_preview: true });

    try {
        const result = await formAutoFiller.autoSubmitForm(url, userId);
        const screenshotPaths = [];
        for (const key of ['before', 'final']) {
            if (result.screenshots?.[key]) {
                try { const p = await formAutoFiller.saveScreenshot(result.screenshots[key], userId, key); if (p) screenshotPaths.push(p); } catch (e) {}
            }
        }

        const filledList = (result.filledFields||[]).map(f => `✅ ${f.field}: \`${f.value}\``).join('\n') || '❌ No fields filled';
        await bot.sendMessage(chatId, `${result.success ? '✅' : '⚠️'} **Auto-Fill Result**\n\nFields Filled: ${(result.filledFields||[]).length}\n${result.success ? 'Form Submitted!' : 'Perlu dicek manual'}\n\n${filledList}`, { parse_mode: 'Markdown', disable_web_page_preview: true });

        for (const p of screenshotPaths) { try { await bot.sendPhoto(chatId, p); } catch (e) {} }
    } catch (error) {
        await bot.sendMessage(chatId, `❌ Auto-Fill Failed: ${error.message}`);
    } finally {
        if (formAutoFiller?.closeBrowser) { try { await formAutoFiller.closeBrowser(); } catch (e) {} }
    }
});

bot.onText(/\/quickfill\s+(\w+)/i, async (msg, match) => {
    const airdrops = { probechain: 'https://probechain.org/airdrop/', zealy: 'https://zealy.io', galxe: 'https://galxe.com' };
    const url = airdrops[match[1].toLowerCase()];
    if (!url) { await bot.sendMessage(msg.chat.id, `❌ Tersedia: ${Object.keys(airdrops).join(', ')}`); return; }
    msg.text = `/autofill ${url}`;
    bot.emit('message', msg);
});

// ===== MAIN MESSAGE HANDLER =====
// ✅ SATU-SATUNYA bot.on('message') — AI Agent otomatis eksekusi tools

bot.on('message', async (msg) => {
    if (!msg.text) return;

    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const userMessage = msg.text.trim();

    if (isMessageProcessed(msg.message_id, userId)) return;
    if (userMessage.startsWith('/')) return;

    console.log(`💬 [${msg.from.username||userId}]: ${userMessage.substring(0, 60)}`);

    try {
        await bot.sendChatAction(chatId, 'typing').catch(() => {});

        // ✅ AI Agent dengan Function Calling - otomatis eksekusi tools
        const toolExecutors = createToolExecutors(userId, chatId);
        const result = await aiAgent.processMessage(userId, userMessage, toolExecutors);

        if (result.toolsUsed?.length > 0) {
            console.log(`✅ AI used tools: ${result.toolsUsed.join(', ')}`);
        }

        if (result.text) {
            const chunks = splitMessage(result.text);
            for (const chunk of chunks) {
                await bot.sendMessage(chatId, chunk, {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                });
            }
        }

    } catch (error) {
        console.error('❌ Message handler error:', error);
        await bot.sendMessage(chatId, `❌ Error: ${error.message}\n\nCoba lagi atau ketik /reset`).catch(() => {});
    }
});

// ===== ERROR HANDLERS =====

bot.on('polling_error', async (error) => {
    console.error('❌ Polling Error:', error.message);

    if (error.message?.includes('409')) {
        // Conflict: ada instance lain - stop & restart
        console.log('⚠️ Conflict detected, restarting in 5s...');
        try {
            await bot.stopPolling();
            await new Promise(r => setTimeout(r, 5000));
            await bot.deleteWebHook({ drop_pending_updates: true });
            await new Promise(r => setTimeout(r, 2000));
            await bot.startPolling();
            console.log('✅ Polling restarted after conflict');
        } catch (e) {
            console.error('❌ Restart failed:', e.message);
            setTimeout(startBot, 5000);
        }
    }
});
bot.on('error', (error) => console.error('❌ Bot Error:', error.message));

process.on('unhandledRejection', (reason) => console.error('❌ Unhandled Rejection:', reason));
process.on('uncaughtException', (error) => console.error('❌ Uncaught Exception:', error));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = bot;