// p2p-swap.js - P2P Token Swap Matching System
// User A mau swap BNB → POL, bot carikan User B yang mau swap POL → BNB
// Fee 5% masuk ke wallet owner

const fs = require('fs');
const path = require('path');

const SWAP_FILE = path.join(__dirname, 'p2p-swaps.json');
const OWNER_WALLET = process.env.OWNER_WALLET || '0xfEe6E7f9389Ce9CeBFEeb77F077b6754B94eCbF6';
const FEE_PCT = 5; // 5% fee ke owner

function load() {
    if (!fs.existsSync(SWAP_FILE)) return [];
    try { return JSON.parse(fs.readFileSync(SWAP_FILE, 'utf8')); } catch { return []; }
}

function save(data) {
    fs.writeFileSync(SWAP_FILE, JSON.stringify(data, null, 2));
}

function genId() {
    return 'SW-' + Date.now().toString(36).toUpperCase();
}

// Harga token dalam USD via CoinGecko
async function getTokenPriceUSD(symbol) {
    const map = {
        'BNB': 'binancecoin', 'ETH': 'ethereum', 'BTC': 'bitcoin',
        'POL': 'matic-network', 'MATIC': 'matic-network', 'SOL': 'solana',
        'USDC': 'usd-coin', 'USDT': 'tether', 'ARB': 'arbitrum',
        'OP': 'optimism', 'AVAX': 'avalanche-2', 'LINK': 'chainlink',
        'UNI': 'uniswap', 'AAVE': 'aave', 'DOT': 'polkadot',
    };
    const id = map[symbol.toUpperCase()] || symbol.toLowerCase();
    try {
        const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
        const data = await res.json();
        return data[id]?.usd || null;
    } catch { return null; }
}

// Buat swap order
async function createSwapOrder({ userId, userName, giveToken, giveAmount, wantToken, wantAmount }) {
    const swaps = load();

    // Hitung nilai USD
    const givePriceUSD = await getTokenPriceUSD(giveToken);
    const wantPriceUSD = await getTokenPriceUSD(wantToken);

    const giveValueUSD = givePriceUSD ? parseFloat(giveAmount) * givePriceUSD : null;
    const wantValueUSD = wantPriceUSD ? parseFloat(wantAmount) * wantPriceUSD : null;

    // Kalau wantAmount tidak diisi, hitung otomatis berdasarkan harga pasar
    let finalWantAmount = wantAmount;
    if (!wantAmount && giveValueUSD && wantPriceUSD) {
        const netValueUSD = giveValueUSD * (1 - FEE_PCT / 100);
        finalWantAmount = (netValueUSD / wantPriceUSD).toFixed(6);
    }

    const fee = giveValueUSD ? (giveValueUSD * FEE_PCT / 100).toFixed(4) : null;

    const order = {
        id: genId(),
        userId,
        userName: userName || 'Anonymous',
        giveToken: giveToken.toUpperCase(),
        giveAmount: parseFloat(giveAmount),
        wantToken: wantToken.toUpperCase(),
        wantAmount: parseFloat(finalWantAmount),
        giveValueUSD,
        wantValueUSD,
        feeUSD: fee,
        feePct: FEE_PCT,
        status: 'open', // open → matched → funded → completed / cancelled / disputed
        createdAt: new Date().toISOString(),
        matchedWith: null,
        escrowTx: null,
    };

    swaps.push(order);
    save(swaps);
    return order;
}

// Cari match untuk order
function findMatch(orderId) {
    const swaps = load();
    const order = swaps.find(s => s.id === orderId);
    if (!order) return null;

    // Cari order yang mau tukar dengan arah berlawanan
    const matches = swaps.filter(s =>
        s.id !== orderId &&
        s.status === 'open' &&
        s.giveToken === order.wantToken &&
        s.wantToken === order.giveToken &&
        s.userId !== order.userId
    );

    // Sort by closest amount match
    matches.sort((a, b) => {
        const diffA = Math.abs(a.giveAmount - order.wantAmount) / order.wantAmount;
        const diffB = Math.abs(b.giveAmount - order.wantAmount) / order.wantAmount;
        return diffA - diffB;
    });

    return matches.slice(0, 3); // Return top 3 matches
}

// Match dua order
function matchOrders(orderId1, orderId2) {
    const swaps = load();
    const idx1 = swaps.findIndex(s => s.id === orderId1);
    const idx2 = swaps.findIndex(s => s.id === orderId2);
    if (idx1 === -1 || idx2 === -1) return null;

    swaps[idx1].status = 'matched';
    swaps[idx1].matchedWith = orderId2;
    swaps[idx1].matchedAt = new Date().toISOString();

    swaps[idx2].status = 'matched';
    swaps[idx2].matchedWith = orderId1;
    swaps[idx2].matchedAt = new Date().toISOString();

    save(swaps);
    return { order1: swaps[idx1], order2: swaps[idx2] };
}

function getOrder(id) {
    return load().find(s => s.id === id);
}

function getUserOrders(userId) {
    return load().filter(s => s.userId === userId);
}

function getOpenOrders(token = null) {
    let orders = load().filter(s => s.status === 'open');
    if (token) orders = orders.filter(s =>
        s.giveToken === token.toUpperCase() ||
        s.wantToken === token.toUpperCase()
    );
    return orders;
}

function updateOrderStatus(id, status, extra = {}) {
    const swaps = load();
    const idx = swaps.findIndex(s => s.id === id);
    if (idx === -1) return null;
    swaps[idx].status = status;
    Object.assign(swaps[idx], extra);
    save(swaps);
    return swaps[idx];
}

function cancelOrder(id, userId) {
    const swaps = load();
    const idx = swaps.findIndex(s => s.id === id && s.userId === userId);
    if (idx === -1) return null;
    swaps[idx].status = 'cancelled';
    save(swaps);
    return swaps[idx];
}

function formatOrder(o, showContact = false) {
    const statusEmoji = {
        open: '🟢', matched: '🤝', funded: '💰',
        completed: '✅', cancelled: '❌', disputed: '⚠️'
    }[o.status] || '⚪';

    let text = `${statusEmoji} **[${o.id}]** ${o.giveAmount} ${o.giveToken} → ${o.wantAmount} ${o.wantToken}\n`;
    if (o.giveValueUSD) text += `   💵 Nilai: ~$${o.giveValueUSD.toFixed(2)} USD\n`;
    text += `   💸 Fee: ${o.feePct}% ($${o.feeUSD || '?'})\n`;
    text += `   👤 ${o.userName}\n`;
    if (showContact) text += `   📩 @${o.userName}\n`;
    return text;
}

module.exports = {
    createSwapOrder, findMatch, matchOrders,
    getOrder, getUserOrders, getOpenOrders,
    updateOrderStatus, cancelOrder,
    formatOrder, OWNER_WALLET, FEE_PCT
};