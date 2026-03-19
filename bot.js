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

        // ===== POLYMARKET PREDICT =====
        async polymarket_predict({ query, category = 'all' }) {
            try {
                // Fetch dari Polymarket API (publik, no key needed)
                const encoded = encodeURIComponent(query);
                const res = await fetch(`https://gamma-api.polymarket.com/markets?search=${encoded}&limit=5&active=true`, {
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });

                if (!res.ok) throw new Error(`API error ${res.status}`);
                const markets = await res.json();

                if (!markets || markets.length === 0) {
                    // Fallback: coba tanpa filter active
                    const res2 = await fetch(`https://gamma-api.polymarket.com/markets?search=${encoded}&limit=5`);
                    const markets2 = await res2.json();
                    if (!markets2 || markets2.length === 0) {
                        return `❓ Tidak ada market Polymarket untuk "${query}". Coba keyword berbeda.

🔗 Cek langsung: https://polymarket.com/search?q=${encoded}`;
                    }
                    return formatMarkets(markets2, query);
                }

                return formatMarkets(markets, query);

                function formatMarkets(markets, query) {
                    let result = `🎯 **Polymarket Prediksi: "${query}"**
━━━━━━━━━━━━━━━
`;

                    markets.slice(0, 4).forEach((m, i) => {
                        const yesPrice = m.outcomePrices ? JSON.parse(m.outcomePrices)[0] : m.bestBid || 0;
                        const noPrice = m.outcomePrices ? JSON.parse(m.outcomePrices)[1] : m.bestAsk || 0;
                        const yesPct = (parseFloat(yesPrice) * 100).toFixed(1);
                        const noPct = (parseFloat(noPrice) * 100).toFixed(1);
                        const volume = m.volume ? `$${parseFloat(m.volume).toLocaleString()}` : 'N/A';
                        const liquidity = m.liquidity ? `$${parseFloat(m.liquidity).toLocaleString()}` : 'N/A';

                        const trend = parseFloat(yesPct) > 60 ? '📈 LIKELY' : parseFloat(yesPct) < 40 ? '📉 UNLIKELY' : '⚖️ TOSS UP';

                        result += `
**${i+1}. ${m.question || m.title}**
`;
                        result += `   ✅ YES: ${yesPct}% | ❌ NO: ${noPct}%
`;
                        result += `   ${trend}
`;
                        result += `   💰 Volume: ${volume} | 💧 Liquidity: ${liquidity}
`;
                        if (m.endDate) result += `   📅 Ends: ${new Date(m.endDate).toLocaleDateString('id-ID')}
`;
                        if (m.conditionId || m.slug) result += `   🔗 https://polymarket.com/event/${m.slug || m.conditionId}
`;
                    });

                    result += `
⚠️ _Odds berubah real-time. Ini bukan financial advice._
`;
                    result += `🔗 Lihat semua: https://polymarket.com/search?q=${encodeURIComponent(query)}`;
                    return result;
                }
            } catch(e) {
                return `❌ Gagal ambil data Polymarket: ${e.message}
🔗 Cek langsung: https://polymarket.com/search?q=${encodeURIComponent(query)}`;
            }
        },

        // ===== GET NEWS =====
        async get_news({ topic, limit = 5 }) {
            try {
                // DuckDuckGo news search
                const encoded = encodeURIComponent(topic);
                const res = await fetch(`https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1&t=news`);
                const data = await res.json();

                let result = `📰 **Berita Terbaru: "${topic}"**
━━━━━━━━━━━━━━━
`;

                // Abstract
                if (data.AbstractText) {
                    result += `
📖 **Ringkasan:** ${data.AbstractText}
`;
                }

                // Related topics as news
                const topics = (data.RelatedTopics || []).filter(t => t.Text && t.FirstURL).slice(0, limit);
                if (topics.length > 0) {
                    result += `
**Artikel Terkait:**
`;
                    topics.forEach((t, i) => {
                        result += `
${i+1}. ${t.Text}
   🔗 ${t.FirstURL}
`;
                    });
                }

                // Fallback jika tidak ada hasil
                if (!data.AbstractText && topics.length === 0) {
                    // Coba CoinGecko news untuk crypto topics
                    const cryptoKeywords = ['bitcoin', 'ethereum', 'crypto', 'btc', 'eth', 'defi', 'nft', 'blockchain'];
                    const isCrypto = cryptoKeywords.some(k => topic.toLowerCase().includes(k));

                    if (isCrypto) {
                        const cgRes = await fetch(`https://api.coingecko.com/api/v3/search?query=${encoded}`);
                        const cgData = await cgRes.json();
                        if (cgData.coins && cgData.coins.length > 0) {
                            const coin = cgData.coins[0];
                            result += `
🪙 Token terkait: ${coin.name} (${coin.symbol.toUpperCase()})
`;
                            result += `📊 Market Cap Rank: #${coin.market_cap_rank || 'N/A'}
`;
                            result += `🔗 https://coingecko.com/en/coins/${coin.id}
`;
                        }
                    }

                    result += `
🔍 Cari berita lebih lengkap:
`;
                    result += `• Google: https://news.google.com/search?q=${encoded}
`;
                    result += `• Twitter: https://twitter.com/search?q=${encoded}
`;
                }

                return result;
            } catch(e) {
                return `❌ Gagal ambil berita: ${e.message}`;
            }
        },

        // ===== P2P SWAP MATCHING =====
        async p2p_swap_create({ giveToken, giveAmount, wantToken, wantAmount }) {
            try {
                const swap = require('./p2p-swap');
                const userName = msg?.from?.username || userId;
                const order = await swap.createSwapOrder({
                    userId, userName, giveToken, giveAmount, wantToken, wantAmount
                });

                // Langsung cari match
                const matches = swap.findMatch(order.id);

                let result = '🔄 **Order Swap Dibuat!**\n' +
                    '━━━━━━━━━━━━━━━\n' +
                    '🆔 ID: **' + order.id + '**\n' +
                    '📤 Kamu beri: ' + order.giveAmount + ' ' + order.giveToken +
                    (order.giveValueUSD ? ' (~$' + order.giveValueUSD.toFixed(2) + ')' : '') + '\n' +
                    '📥 Kamu mau: ' + order.wantAmount + ' ' + order.wantToken + '\n' +
                    '💸 Fee: ' + swap.FEE_PCT + '% dipotong otomatis\n\n';

                if (matches && matches.length > 0) {
                    result += '🎯 **Match Ditemukan!**\n';
                    matches.forEach((m, i) => {
                        result += (i+1) + '. **[' + m.id + ']** ' + m.giveAmount + ' ' + m.giveToken +
                            ' → ' + m.wantAmount + ' ' + m.wantToken +
                            ' | @' + m.userName + '\n';
                    });
                    result += '\n✅ Setuju? Ketik: "match ' + order.id + ' [ID_MATCH]"';
                } else {
                    result += '⏳ Belum ada match. Order kamu aktif di market.\n' +
                        'Bot akan otomatis carikan match jika ada yang cocok.';
                }
                return result;
            } catch(e) { return '❌ Error: ' + e.message; }
        },

        async p2p_swap_find({ orderId, token }) {
            try {
                const swap = require('./p2p-swap');
                if (orderId) {
                    const matches = swap.findMatch(orderId);
                    if (!matches || matches.length === 0) return '❌ Tidak ada match untuk order ' + orderId + ' saat ini.';
                    let result = '🎯 **Match untuk ' + orderId + ':**\n━━━━━━━━━━━━━━━\n';
                    matches.forEach((m, i) => {
                        result += swap.formatOrder(m, true);
                    });
                    result += '\nKetik: "match ' + orderId + ' [SW-xxx]" untuk konfirmasi.';
                    return result;
                }
                // Browse market
                const orders = swap.getOpenOrders(token);
                if (orders.length === 0) return '📭 Tidak ada order swap terbuka' + (token ? ' untuk ' + token : '') + '.';
                let result = '🏪 **P2P Swap Market**\n━━━━━━━━━━━━━━━\n';
                orders.slice(0, 8).forEach(o => { result += swap.formatOrder(o, true); });
                return result;
            } catch(e) { return '❌ Error: ' + e.message; }
        },

        async p2p_swap_match({ myOrderId, matchOrderId }) {
            try {
                const swap = require('./p2p-swap');
                const result = swap.matchOrders(myOrderId, matchOrderId);
                if (!result) return '❌ Order tidak ditemukan.';
                const { order1, order2 } = result;
                const myOrder = order1.id === myOrderId ? order1 : order2;
                const theirOrder = order1.id === matchOrderId ? order1 : order2;

                return '🤝 **Match Dikonfirmasi!**\n' +
                    '━━━━━━━━━━━━━━━\n' +
                    '👤 Kamu (@' + myOrder.userName + '): kirim ' + myOrder.giveAmount + ' ' + myOrder.giveToken + '\n' +
                    '👤 Mereka (@' + theirOrder.userName + '): kirim ' + theirOrder.giveAmount + ' ' + theirOrder.giveToken + '\n\n' +
                    '**📋 Instruksi:**\n' +
                    '1️⃣ Kedua pihak kirim token ke wallet escrow:\n' +
                    '`' + swap.OWNER_WALLET + '`\n' +
                    '2️⃣ Fee ' + swap.FEE_PCT + '% dipotong otomatis\n' +
                    '3️⃣ Bot release token ke masing-masing pihak\n\n' +
                    '⚠️ Pastikan kirim ke wallet escrow, BUKAN langsung ke user lain!';
            } catch(e) { return '❌ Error: ' + e.message; }
        },

        async p2p_swap_orders({ showMarket = false, token }) {
            try {
                const swap = require('./p2p-swap');
                if (showMarket) {
                    const orders = swap.getOpenOrders(token);
                    if (orders.length === 0) return '📭 Market P2P kosong' + (token ? ' untuk ' + token : '') + '.';
                    let result = '🏪 **P2P Swap Market** (' + orders.length + ' order)\n━━━━━━━━━━━━━━━\n';
                    orders.slice(0, 10).forEach(o => { result += swap.formatOrder(o); });
                    return result;
                }
                const orders = swap.getUserOrders(userId);
                if (orders.length === 0) return '📭 Kamu belum punya order swap.\n\n💡 Mulai: "tukar 1 BNB ke POL"';
                let result = '📋 **Order Swap Kamu**\n━━━━━━━━━━━━━━━\n';
                orders.slice(0, 5).forEach(o => { result += swap.formatOrder(o); });
                return result;
            } catch(e) { return '❌ Error: ' + e.message; }
        },

        async p2p_swap_cancel({ orderId }) {
            try {
                const swap = require('./p2p-swap');
                const order = swap.cancelOrder(orderId, userId);
                if (!order) return '❌ Order ' + orderId + ' tidak ditemukan atau bukan milikmu.';
                return '✅ Order **' + orderId + '** berhasil dicancel.';
            } catch(e) { return '❌ Error: ' + e.message; }
        },

        // ===== ESCROW =====
        async escrow_create({ sellerContact, token, amount, priceUSDC, chain = 'base' }) {
            try {
                const escrow = require('./escrow');
                const buyerName = msg?.from?.username || userId;
                const e = escrow.createEscrow({
                    buyerId: userId, buyerName,
                    sellerId: sellerContact || 'unknown',
                    sellerName: sellerContact || 'Seller',
                    token, amount, priceUSDC, chain
                });
                return '🔐 **Escrow Dibuat!**\n' +
                    '━━━━━━━━━━━━━━━\n' +
                    '🆔 ID: **' + e.id + '**\n' +
                    '🪙 ' + e.amount + ' ' + e.token + ' — $' + e.priceUSDC + ' USDC\n' +
                    '💸 Fee (1%): $' + e.fee + ' | Seller terima: $' + e.sellerReceives + '\n\n' +
                    '**📋 Langkah selanjutnya:**\n' +
                    '1️⃣ BUYER kirim $' + e.priceUSDC + ' USDC ke:\n' +
                    '`' + escrow.ESCROW_WALLET + '`\n' +
                    '2️⃣ Kirim bukti tx: "deposit ' + e.id + ' [tx_hash]"\n' +
                    '3️⃣ SELLER kirim token setelah deposit dikonfirmasi\n' +
                    '4️⃣ BUYER konfirmasi terima token\n' +
                    '5️⃣ USDC otomatis release ke seller\n\n' +
                    '⚠️ Simpan ID escrow ini!';
            } catch(err) { return '❌ Gagal buat escrow: ' + err.message; }
        },

        async escrow_status({ escrowId }) {
            try {
                const escrow = require('./escrow');
                const e = escrow.getEscrow(escrowId);
                if (!e) return '❌ Escrow ' + escrowId + ' tidak ditemukan.';
                return escrow.formatEscrow(e);
            } catch(err) { return '❌ Error: ' + err.message; }
        },

        async escrow_confirm_deposit({ escrowId, txHash }) {
            try {
                const escrow = require('./escrow');
                const e = escrow.confirmDeposit(escrowId, txHash);
                if (!e) return '❌ Escrow tidak ditemukan.';
                return '✅ **Deposit Dikonfirmasi!**\n' +
                    '🆔 ' + escrowId + '\n' +
                    '💰 $' + e.priceUSDC + ' USDC diterima\n' +
                    '📋 Tx: ' + txHash + '\n\n' +
                    '➡️ Seller (' + e.sellerName + ') silakan kirim ' + e.amount + ' ' + e.token + ' ke buyer.\n' +
                    'Setelah kirim, konfirmasi: "token dikirim ' + escrowId + ' [tx_hash]"';
            } catch(err) { return '❌ Error: ' + err.message; }
        },

        async escrow_confirm_token({ escrowId, txHash }) {
            try {
                const escrow = require('./escrow');
                const e = escrow.confirmTokenSent(escrowId, txHash);
                if (!e) return '❌ Escrow tidak ditemukan.';
                return '📤 **Token Terkirim!**\n' +
                    '🆔 ' + escrowId + '\n' +
                    '🪙 ' + e.amount + ' ' + e.token + ' dikirim ke buyer\n' +
                    '📋 Tx: ' + txHash + '\n\n' +
                    '➡️ Buyer (' + e.buyerName + ') silakan konfirmasi terima token.\n' +
                    'Ketik: "selesai ' + escrowId + '" untuk release USDC ke seller.';
            } catch(err) { return '❌ Error: ' + err.message; }
        },

        async escrow_complete({ escrowId }) {
            try {
                const escrow = require('./escrow');
                const e = escrow.completeEscrow(escrowId, 'manual-release');
                if (!e) return '❌ Escrow tidak ditemukan.';
                return '🎉 **Escrow Selesai!**\n' +
                    '━━━━━━━━━━━━━━━\n' +
                    '✅ ' + e.amount + ' ' + e.token + ' → ' + e.buyerName + '\n' +
                    '✅ $' + e.sellerReceives + ' USDC → ' + e.sellerName + '\n' +
                    '💸 Fee: $' + e.fee + ' USDC (CryptoClawAI)\n\n' +
                    '⚠️ Release USDC manual ke seller: ' + e.sellerName + '\n' +
                    'Kirim $' + e.sellerReceives + ' USDC ke wallet seller.';
            } catch(err) { return '❌ Error: ' + err.message; }
        },

        async escrow_dispute({ escrowId, reason }) {
            try {
                const escrow = require('./escrow');
                const e = escrow.disputeEscrow(escrowId, reason, userId);
                if (!e) return '❌ Escrow tidak ditemukan.';
                return '⚠️ **Dispute Dibuka!**\n' +
                    '🆔 ' + escrowId + '\n' +
                    '📝 Alasan: ' + reason + '\n\n' +
                    'Dana USDC ditahan sampai dispute diselesaikan.\n' +
                    'Hubungi admin untuk resolusi.';
            } catch(err) { return '❌ Error: ' + err.message; }
        },

        async escrow_my_trades() {
            try {
                const escrow = require('./escrow');
                const trades = escrow.getUserEscrows(userId);
                if (trades.length === 0) return '📭 Kamu belum punya transaksi escrow.';
                let result = '📋 **Transaksi Escrow Kamu**\n━━━━━━━━━━━━━━━\n';
                trades.slice(0, 5).forEach(e => {
                    const role = e.buyerId === userId ? '🛒 Buyer' : '💼 Seller';
                    const statusEmoji = { pending_deposit:'⏳', funded:'💰', token_sent:'📤', completed:'✅', disputed:'⚠️', cancelled:'❌' }[e.status];
                    result += '\n' + statusEmoji + ' **[' + e.id + ']** ' + role + '\n';
                    result += '   ' + e.amount + ' ' + e.token + ' — $' + e.priceUSDC + ' USDC\n';
                    result += '   Status: ' + e.status + '\n';
                });
                return result;
            } catch(err) { return '❌ Error: ' + err.message; }
        },

        // ===== P2P TRADING =====
        async p2p_create_listing({ token, amount, priceUSDC, chain = 'base', contact }) {
            try {
                const p2p = require('./p2p-trading');
                const sellerName = msg?.from?.username || userId;
                const listing = p2p.createListing({
                    sellerId: userId,
                    sellerName,
                    token, amount, priceUSDC, chain,
                    contact: contact || (sellerName ? '@' + sellerName : 'DM bot'),
                });
                return '✅ **Listing P2P Berhasil Dibuat!**\n' +
                    '━━━━━━━━━━━━━━━\n' +
                    '🆔 ID: ' + listing.id + '\n' +
                    '🪙 Token: ' + listing.amount + ' ' + listing.token + '\n' +
                    '💰 Harga: $' + listing.priceUSDC + ' USDC ($' + listing.pricePerUnit.toFixed(4) + '/unit)\n' +
                    '⛓️ Chain: ' + listing.chain + '\n' +
                    '📩 Kontak: ' + listing.contact + '\n\n' +
                    '💡 Share ID listing ke pembeli atau tunggu mereka temukan di market.\n' +
                    'Gunakan "hapus listing ' + listing.id + '" untuk cancel.';
            } catch(e) { return '❌ Gagal buat listing: ' + e.message; }
        },

        async p2p_get_listings({ token, maxPrice, chain } = {}) {
            try {
                const p2p = require('./p2p-trading');
                const listings = p2p.getListings({ token, maxPrice, chain });
                if (listings.length === 0) {
                    return '📭 Tidak ada listing P2P aktif' + (token ? ' untuk ' + token.toUpperCase() : '') + '.\n\n💡 Jadilah yang pertama jual! Ketik: "jual 1 ETH seharga 3500 USDC"';
                }
                let result = '🏪 **P2P Market** (' + listings.length + ' listing aktif)\n━━━━━━━━━━━━━━━\n';
                listings.slice(0, 8).forEach((l, i) => {
                    p2p.incrementViews(l.id);
                    result += '\n' + (i+1) + '. **[' + l.id + '] ' + l.amount + ' ' + l.token + '**\n';
                    result += '   💰 $' + l.priceUSDC + ' USDC ($' + l.pricePerUnit.toFixed(4) + '/unit)\n';
                    result += '   ⛓️ ' + l.chain + ' | 👤 ' + l.sellerName + '\n';
                    result += '   📩 Kontak: ' + l.contact + '\n';
                });
                result += '\n💡 Mau beli? Kontak seller langsung dan transfer USDC ke wallet mereka.';
                return result;
            } catch(e) { return '❌ Gagal ambil listing: ' + e.message; }
        },

        async p2p_my_listings() {
            try {
                const p2p = require('./p2p-trading');
                const listings = p2p.getMyListings(userId);
                if (listings.length === 0) return '📭 Kamu belum punya listing P2P.\n\n💡 Mulai jual: "jual 1 ETH seharga 3500 USDC"';
                let result = '📋 **Listing Kamu**\n━━━━━━━━━━━━━━━\n';
                listings.forEach((l, i) => {
                    const statusEmoji = { active: '🟢', sold: '✅', cancelled: '❌' }[l.status];
                    result += '\n' + (i+1) + '. ' + statusEmoji + ' **[' + l.id + '] ' + l.amount + ' ' + l.token + '**\n';
                    result += '   💰 $' + l.priceUSDC + ' USDC | Status: ' + l.status + '\n';
                    result += '   👁️ Views: ' + l.views + '\n';
                });
                return result;
            } catch(e) { return '❌ Error: ' + e.message; }
        },

        async p2p_cancel_listing({ listingId }) {
            try {
                const p2p = require('./p2p-trading');
                const listing = p2p.cancelListing(listingId, userId);
                if (!listing) return '❌ Listing ' + listingId + ' tidak ditemukan atau bukan milikmu.';
                return '✅ Listing **' + listingId + '** berhasil dihapus.';
            } catch(e) { return '❌ Error: ' + e.message; }
        },

        async p2p_mark_sold({ listingId }) {
            try {
                const p2p = require('./p2p-trading');
                const listing = p2p.markSold(listingId, userId);
                if (!listing) return '❌ Listing ' + listingId + ' tidak ditemukan atau bukan milikmu.';
                return '✅ **' + listing.amount + ' ' + listing.token + '** ditandai TERJUAL!\n💰 Harga: $' + listing.priceUSDC + ' USDC\n\nSelamat! 🎉';
            } catch(e) { return '❌ Error: ' + e.message; }
        },

        // ===== TOKEN SWAP =====
        async token_swap({ tokenIn, tokenOut, amount, chain = 'base' }) {
            try {
                // Ambil harga via CoinGecko
                const coins = { 'ETH': 'ethereum', 'BTC': 'bitcoin', 'USDC': 'usd-coin', 'USDT': 'tether', 'SOL': 'solana', 'BNB': 'binancecoin' };
                const idIn = coins[tokenIn?.toUpperCase()] || tokenIn?.toLowerCase();
                const idOut = coins[tokenOut?.toUpperCase()] || tokenOut?.toLowerCase();

                const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${idIn},${idOut}&vs_currencies=usd`);
                const prices = await res.json();

                const priceIn = prices[idIn]?.usd;
                const priceOut = prices[idOut]?.usd;

                if (!priceIn || !priceOut) {
                    return `❌ Tidak bisa ambil harga untuk ${tokenIn} atau ${tokenOut}. Cek simbol token.`;
                }

                const amountNum = parseFloat(amount) || 1;
                const valueUSD = amountNum * priceIn;
                const amountOut = valueUSD / priceOut;
                const slippage = 0.5;
                const minOut = amountOut * (1 - slippage/100);

                const dexLinks = {
                    base: 'https://app.uniswap.org/#/swap?chain=base',
                    ethereum: 'https://app.uniswap.org/#/swap',
                    bsc: 'https://pancakeswap.finance/swap',
                    arbitrum: 'https://app.uniswap.org/#/swap?chain=arbitrum',
                };

                return `🔄 **Token Swap Estimasi**
` +
                    `━━━━━━━━━━━━━━━
` +
                    `📤 Jual: ${amountNum} ${tokenIn.toUpperCase()} ($${(valueUSD).toFixed(2)})
` +
                    `📥 Dapat: ~${amountOut.toFixed(6)} ${tokenOut.toUpperCase()}
` +
                    `📉 Min received (0.5% slippage): ${minOut.toFixed(6)} ${tokenOut.toUpperCase()}
` +
                    `⛓️ Chain: ${chain}
` +
                    `💱 Rate: 1 ${tokenIn.toUpperCase()} = ${(priceIn/priceOut).toFixed(6)} ${tokenOut.toUpperCase()}

` +
                    `🔗 Swap sekarang: ${dexLinks[chain] || dexLinks.base}

` +
                    `⚠️ _Harga bisa berubah. Cek slippage sebelum konfirmasi._`;
            } catch(e) {
                return `❌ Gagal estimasi swap: ${e.message}`;
            }
        },

        // ===== YIELD ANALYSIS =====
        async yield_analysis({ token, chain = 'all', riskLevel = 'medium' }) {
            try {
                // Data yield farming dari protokol populer
                const yieldData = {
                    'USDC': [
                        { protocol: 'Aave V3', chain: 'base', apy: '4.2%', tvl: '$2.1B', risk: 'low', link: 'https://app.aave.com' },
                        { protocol: 'Compound V3', chain: 'ethereum', apy: '3.8%', tvl: '$800M', risk: 'low', link: 'https://app.compound.finance' },
                        { protocol: 'Aerodrome', chain: 'base', apy: '12.5%', tvl: '$450M', risk: 'medium', link: 'https://aerodrome.finance' },
                        { protocol: 'Curve Finance', chain: 'ethereum', apy: '5.1%', tvl: '$1.2B', risk: 'low', link: 'https://curve.fi' },
                        { protocol: 'Morpho', chain: 'base', apy: '6.8%', tvl: '$320M', risk: 'low', link: 'https://app.morpho.org' },
                    ],
                    'ETH': [
                        { protocol: 'Lido', chain: 'ethereum', apy: '3.5%', tvl: '$15B', risk: 'low', link: 'https://lido.fi' },
                        { protocol: 'Rocket Pool', chain: 'ethereum', apy: '3.2%', tvl: '$3.5B', risk: 'low', link: 'https://rocketpool.net' },
                        { protocol: 'Aave V3 (wETH)', chain: 'base', apy: '2.1%', tvl: '$800M', risk: 'low', link: 'https://app.aave.com' },
                        { protocol: 'Pendle', chain: 'ethereum', apy: '8.5%', tvl: '$600M', risk: 'medium', link: 'https://pendle.finance' },
                    ],
                    'BTC': [
                        { protocol: 'Lombard Finance', chain: 'ethereum', apy: '5.2%', tvl: '$250M', risk: 'medium', link: 'https://lombard.finance' },
                        { protocol: 'Aave V3 (wBTC)', chain: 'ethereum', apy: '1.8%', tvl: '$500M', risk: 'low', link: 'https://app.aave.com' },
                        { protocol: 'Bedrock', chain: 'base', apy: '7.3%', tvl: '$120M', risk: 'medium', link: 'https://bedrock.technology' },
                    ]
                };

                const tokenKey = token.toUpperCase();
                const protocols = yieldData[tokenKey] || yieldData['USDC'];

                // Filter by risk & chain
                let filtered = protocols;
                if (riskLevel !== 'high') {
                    filtered = protocols.filter(p => p.risk === riskLevel || (riskLevel === 'medium' && p.risk !== 'high'));
                }
                if (chain !== 'all') {
                    const chainFiltered = filtered.filter(p => p.chain === chain);
                    if (chainFiltered.length > 0) filtered = chainFiltered;
                }

                const riskEmoji = { low: '🟢', medium: '🟡', high: '🔴' };
                let result = `🌾 **Yield Farming Terbaik untuk ${tokenKey}**
`;
                result += `━━━━━━━━━━━━━━━
`;

                filtered.slice(0, 4).forEach((p, i) => {
                    result += `
**${i+1}. ${p.protocol}** ${riskEmoji[p.risk]}
`;
                    result += `   💰 APY: ${p.apy} | ⛓️ ${p.chain}
`;
                    result += `   🏦 TVL: ${p.tvl} | Risiko: ${p.risk}
`;
                    result += `   🔗 ${p.link}
`;
                });

                result += `
⚠️ _APY berubah setiap hari. DYOR sebelum deposit._`;
                return result;
            } catch(e) {
                return `❌ Gagal analisa yield: ${e.message}`;
            }
        },

        // ===== AIRDROP CHECKER =====
        async airdrop_checker({ project, wallet, checkAll = false }) {
            try {
                const walletAddr = wallet || (walletManager ? walletManager.walletInfo(userId)?.address : null);

                // Database airdrop aktif
                const airdrops = {
                    'layerzero': { name: 'LayerZero', status: 'claimed', checker: 'https://layerzero.foundation', deadline: 'Ended', token: 'ZRO' },
                    'zksync': { name: 'zkSync', status: 'claimed', checker: 'https://claim.zksync.io', deadline: 'Ended', token: 'ZK' },
                    'scroll': { name: 'Scroll', status: 'active', checker: 'https://scroll.io/airdrop', deadline: 'Q2 2026', token: 'SCR' },
                    'linea': { name: 'Linea', status: 'upcoming', checker: 'https://linea.build', deadline: 'TBA', token: 'LINEA' },
                    'base': { name: 'Base', status: 'upcoming', checker: 'https://base.org', deadline: 'TBA', token: 'BASE' },
                    'hyperliquid': { name: 'Hyperliquid', status: 'active', checker: 'https://hyperliquid.xyz', deadline: 'Q1 2026', token: 'HYPE' },
                    'monad': { name: 'Monad', status: 'upcoming', checker: 'https://monad.xyz', deadline: 'TBA', token: 'MON' },
                    'berachain': { name: 'Berachain', status: 'active', checker: 'https://hub.berachain.com', deadline: 'Ongoing', token: 'BERA' },
                };

                if (checkAll) {
                    const active = Object.values(airdrops).filter(a => a.status === 'active' || a.status === 'upcoming');
                    let result = `🎁 **Airdrop Terbaru & Upcoming**
━━━━━━━━━━━━━━━
`;
                    active.forEach(a => {
                        const statusEmoji = a.status === 'active' ? '🟢' : '🔵';
                        result += `
${statusEmoji} **${a.name}** ($${a.token})
`;
                        result += `   📅 Deadline: ${a.deadline}
`;
                        result += `   🔗 ${a.checker}
`;
                    });
                    if (walletAddr) result += `
💼 Wallet: \`${walletAddr.substring(0,10)}...\`
Cek eligibility di link masing-masing.`;
                    return result;
                }

                const key = project.toLowerCase().replace(/\s/g, '');
                const airdrop = airdrops[key] || airdrops[Object.keys(airdrops).find(k => k.includes(key) || key.includes(k))];

                if (!airdrop) {
                    const activeList = Object.values(airdrops).filter(a => a.status === 'active').map(a => '• ' + a.name + ' ($' + a.token + ')').join('\n');
                    return '❌ Project "' + project + '" tidak ditemukan di database.\n\nAirdrop aktif saat ini:\n' + activeList + '\n\nKirim "cek semua airdrop" untuk list lengkap.';
                }

                const statusEmoji = { active: '🟢 AKTIF', upcoming: '🔵 UPCOMING', claimed: '✅ SELESAI' }[airdrop.status];
                let result = '🎁 **' + airdrop.name + ' Airdrop**\n━━━━━━━━━━━━━━━\n';
                result += '📊 Status: ' + statusEmoji + '\n';
                result += '🪙 Token: $' + airdrop.token + '\n';
                result += '📅 Deadline: ' + airdrop.deadline + '\n';
                result += '🔗 Cek eligibility: ' + airdrop.checker + '\n';
                if (walletAddr) result += '\n\ud83d\udcbc Wallet kamu: `' + walletAddr + '`\nBuka link di atas dan connect wallet untuk cek eligibility.';
                else result += '\n\ud83d\udca1 Set wallet dulu dengan /setwallet untuk cek eligibility otomatis.';

                return result;
            } catch(e) {
                return `❌ Gagal cek airdrop: ${e.message}`;
            }
        },

        // ===== ANALISA & RISET TOOLS =====
        async web_search({ query, type = 'general' }) {
            try {
                // Coba CoinGecko dulu untuk crypto price
                const isCryptoQuery = type === 'price' || /harga|price|kurs|coin|token|crypto/i.test(query);
                if (isCryptoQuery) {
                    const coin = query.replace(/harga|price|crypto|token|coin/gi, '').trim().toLowerCase().replace(/ /g, '-');
                    try {
                        const cgRes = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(coin)}`);
                        const cgData = await cgRes.json();
                        if (cgData.coins && cgData.coins.length > 0) {
                            const top = cgData.coins[0];
                            const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${top.id}&vs_currencies=usd,idr&include_24hr_change=true&include_market_cap=true`);
                            const priceData = await priceRes.json();
                            const p = priceData[top.id];
                            if (p) {
                                return '💰 **' + top.name + ' (' + top.symbol.toUpperCase() + ')**\n' +
                                    '💵 Harga: $' + p.usd?.toLocaleString() + ' (Rp ' + p.idr?.toLocaleString() + ')\n' +
                                    '📈 24h: ' + p.usd_24h_change?.toFixed(2) + '%\n' +
                                    '🏦 Market Cap: $' + (p.usd_market_cap/1e9)?.toFixed(2) + 'B';
                            }
                        }
                    } catch(e) {}
                }

                // DuckDuckGo Instant Answer
                const q = encodeURIComponent(query);
                const res = await fetch('https://api.duckduckgo.com/?q=' + q + '&format=json&no_html=1&skip_disambig=1');
                const data = await res.json();
                let result = '';
                if (data.AbstractText) result += '📖 **' + data.AbstractSource + '**: ' + data.AbstractText + '\n\n';
                if (data.RelatedTopics && data.RelatedTopics.length > 0) {
                    const topics = data.RelatedTopics.filter(t => t.Text).slice(0, 4).map(t => '• ' + t.Text).join('\n');
                    if (topics) result += '🔍 **Info terkait:**\n' + topics;
                }
                return result.trim() || 'Tidak ada hasil untuk: "' + query + '". Coba kata kunci berbeda.';
            } catch (e) {
                return 'Gagal search: ' + e.message;
            }
        },

        async analyze_chart({ description, timeframe }) {
            return '📊 **Cara Analisa Chart:**\n\nKirim gambar chart kamu + tulis pesan seperti:\n"Analisa chart ini ETH 4H"\n\nBot akan analisa chart yang kamu kirim! Pastikan gambar dan pesan dikirim bersamaan.';
        },

        async analyze_token({ token, aspect = 'full' }) {
            try {
                const searchRes = await fetch('https://api.coingecko.com/api/v3/search?query=' + encodeURIComponent(token));
                const searchData = await searchRes.json();
                if (!searchData.coins || searchData.coins.length === 0) return 'Token "' + token + '" tidak ditemukan.';
                const coin = searchData.coins[0];
                const detailRes = await fetch('https://api.coingecko.com/api/v3/coins/' + coin.id + '?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false');
                const detail = await detailRes.json();
                const md = detail.market_data;
                if (!md) return 'Gagal ambil data market untuk ' + token;
                const price = md.current_price?.usd;
                const change24h = md.price_change_percentage_24h;
                const change7d = md.price_change_percentage_7d;
                const marketCap = md.market_cap?.usd;
                const volume = md.total_volume?.usd;
                const ath = md.ath?.usd;
                const athChange = md.ath_change_percentage?.usd;
                const trend = change24h > 5 ? '🟢 BULLISH' : change24h < -5 ? '🔴 BEARISH' : '🟡 NEUTRAL';
                const emoji24h = change24h >= 0 ? '📈' : '📉';
                let result = '🪙 **' + detail.name + ' (' + detail.symbol?.toUpperCase() + ')**\n';
                result += '━━━━━━━━━━━━━━━\n';
                result += '💵 Harga: $' + price?.toLocaleString() + '\n';
                result += emoji24h + ' 24h: ' + change24h?.toFixed(2) + '% | 7d: ' + change7d?.toFixed(2) + '%\n';
                result += '🏦 Market Cap: $' + (marketCap/1e9)?.toFixed(2) + 'B\n';
                result += '💧 Volume 24h: $' + (volume/1e6)?.toFixed(0) + 'M\n';
                result += '📉 vs ATH: ' + athChange?.toFixed(1) + '% ($' + ath?.toLocaleString() + ')\n';
                result += '📋 Rank: #' + detail.market_cap_rank + '\n';
                if (detail.description?.en) result += '\n📝 ' + detail.description.en.split('.')[0] + '.\n';
                if (detail.categories?.length) result += '🏷️ Kategori: ' + detail.categories.slice(0,3).join(', ') + '\n';
                result += '\n🎯 **Kesimpulan: ' + trend + '**\n';
                result += '⚠️ _Bukan financial advice. DYOR sebelum investasi._';
                return result;
            } catch (e) {
                return 'Gagal analisa token: ' + e.message;
            }
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

// ===== PHOTO/CHART HANDLER =====
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const caption = msg.caption || '';

    // Simpan info gambar terakhir untuk analisa
    if (!global.lastChartImage) global.lastChartImage = {};
    global.lastChartImage[userId] = {
        fileId: msg.photo[msg.photo.length - 1].file_id,
        caption,
        timestamp: Date.now()
    };

    try {
        await bot.sendChatAction(chatId, 'typing');

        // Ambil file URL dari Telegram
        const file = await bot.getFile(msg.photo[msg.photo.length - 1].file_id);
        const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

        // Kirim ke AI dengan gambar (vision) jika provider support
        const userMessage = caption || 'Analisa chart ini dan berikan pendapat teknikal lengkap (trend, support, resistance, rekomendasi)';
        console.log(`📸 [${msg.from.username||userId}]: Photo + "${userMessage.substring(0,40)}"`);

        // Cek apakah provider support vision
        const hasVision = process.env.DEEPSEK_API_KEY || process.env.POE_API_KEY;

        if (hasVision) {
            // Kirim dengan image URL ke AI vision
            const { OpenAI } = require('openai');
            const AI_PROVIDER = process.env.DEEPSEK_API_KEY ? 'deepseek' : 'poe';
            const visionClient = new OpenAI({
                apiKey: process.env.DEEPSEK_API_KEY || process.env.POE_API_KEY,
                baseURL: AI_PROVIDER === 'deepseek' ? 'https://api.deepseek.com/v1' : 'https://api.poe.com/v1',
            });

            const visionModel = AI_PROVIDER === 'deepseek' ? 'deepseek-chat' : 'Claude-Sonnet-4.5';

            const response = await visionClient.chat.completions.create({
                model: visionModel,
                messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: { url: fileUrl }
                        },
                        {
                            type: 'text',
                            text: `Kamu adalah analis crypto profesional. ${userMessage}\n\nBerikan analisa teknikal lengkap dalam Bahasa Indonesia:\n1. Identifikasi coin/pair dan timeframe\n2. Trend utama (bullish/bearish/sideways)\n3. Support & resistance terdekat\n4. Indikator (RSI, MACD, MA jika terlihat)\n5. Rekomendasi: Entry, Target, Stop Loss\n6. Kesimpulan singkat dengan confidence level\n\nGunakan emoji yang relevan 📊📈📉`
                        }
                    ]
                }],
                max_tokens: 1500,
            });

            const analysis = response.choices[0].message.content;
            const chunks = splitMessage(analysis);
            for (const chunk of chunks) {
                await bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown', disable_web_page_preview: true });
            }
        } else {
            // Fallback tanpa vision
            await bot.sendMessage(chatId,
                '📊 *Analisa Chart*\n\n' +
                'Gambar chart diterima! ✅\n\n' +
                'Untuk analisa chart dengan AI Vision, aktifkan salah satu:\n' +
                '• `DEEPSEK_API_KEY` (DeepSeek Vision)\n' +
                '• `POE_API_KEY` (Claude Vision via Poe)\n\n' +
                'Sementara itu, kirim deskripsi chart kamu dalam teks untuk analisa manual.',
                { parse_mode: 'Markdown' }
            );
        }
    } catch (error) {
        console.error('❌ Photo handler error:', error.message);
        await bot.sendMessage(chatId, `❌ Gagal analisa chart: ${error.message}`).catch(() => {});
    }
});

// ===== OPENCLAW AGENT (exec tools) =====
// Setara dengan: from openclaw import Agent; agent = Agent(tools=["exec"])
let openclawAgent = null;
try {
    openclawAgent = require('./openclaw-agent');
    console.log('✅ OpenClaw Agent loaded (exec tools enabled)');
} catch (e) {
    console.log('⚠️ OpenClaw Agent not loaded:', e.message);
}

// Handler khusus untuk /agent command — pakai OpenClaw Agent dengan exec
bot.onText(/\/agent(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const input = match[1].trim();

    if (!openclawAgent) {
        return bot.sendMessage(chatId, '❌ OpenClaw Agent tidak tersedia.');
    }
    if (!input) {
        return bot.sendMessage(chatId, '💡 *OpenClaw Agent* — AI dengan kemampuan eksekusi kode\n\nContoh:\n`/agent hitung 1000 * 365 * 24`\n`/agent buat script cek harga BTC`\n`/agent analisa data: [1,5,3,8,2,9]`', { parse_mode: 'Markdown' });
    }

    try {
        await bot.sendChatAction(chatId, 'typing');
        console.log(`🤖 OpenClaw Agent [${userId}]: ${input.substring(0, 60)}`);
        const result = await openclawAgent.run(userId, input);
        const chunks = splitMessage(result);
        for (const chunk of chunks) {
            await bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown', disable_web_page_preview: true });
        }
    } catch (e) {
        console.error('❌ OpenClaw Agent error:', e.message);
        await bot.sendMessage(chatId, `❌ Agent error: ${e.message}`);
    }
});

// /resetagent — reset history OpenClaw Agent
bot.onText(/\/resetagent/, async (msg) => {
    const userId = msg.from.id.toString();
    if (openclawAgent) openclawAgent.reset(userId);
    await bot.sendMessage(msg.chat.id, '✅ OpenClaw Agent history direset.');
});