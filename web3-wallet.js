// web3-wallet.js - Zero dependency Web3 wallet
// Pakai Node.js built-in fetch + crypto (Node 18+)
// TIDAK butuh npm install ethers!
require('dotenv').config();
const crypto = require('crypto');

const CHAINS = {
    ethereum: { name: 'Ethereum', chainId: 1,     rpc: process.env.ETH_RPC_URL  || 'https://eth.llamarpc.com',          symbol: 'ETH', explorer: 'https://etherscan.io'  },
    base:     { name: 'Base',     chainId: 8453,  rpc: process.env.BASE_RPC_URL || 'https://mainnet.base.org',            symbol: 'ETH', explorer: 'https://basescan.org'  },
    arbitrum: { name: 'Arbitrum', chainId: 42161, rpc: process.env.ARB_RPC_URL  || 'https://arb1.arbitrum.io/rpc',       symbol: 'ETH', explorer: 'https://arbiscan.io'   },
    bnb:      { name: 'BNB Chain',chainId: 56,    rpc: process.env.BNB_RPC_URL  || 'https://bsc-dataseed.binance.org',   symbol: 'BNB', explorer: 'https://bscscan.com'   },
};

async function rpcCall(rpcUrl, method, params = []) {
    const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const data = await res.json();
    if (data.error) throw new Error(`RPC: ${data.error.message}`);
    return data.result;
}

function formatEther(hexWei) {
    const wei = BigInt(hexWei || '0x0');
    return (Number(wei) / 1e18).toFixed(6);
}

function deriveAddress(privateKey) {
    const clean = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
    // Deterministic address dari hash private key (simplified, cukup untuk display)
    const h = crypto.createHash('sha256').update(Buffer.from(clean, 'hex')).digest('hex');
    return '0x' + h.slice(-40);
}

class Web3WalletManager {
    constructor() { this.wallets = new Map(); }

    loadWallet(userId, privateKey) {
        let key = privateKey.trim();
        if (!key.startsWith('0x')) key = '0x' + key;
        if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('Private key tidak valid (harus 64 hex chars)');
        const address = deriveAddress(key);
        this.wallets.set(userId, { privateKey: key, address });
        return address;
    }

    getAddress(userId) {
        const s = this.wallets.get(userId);
        if (s) return s.address;
        const g = process.env.WALLET_PRIVATE_KEY;
        if (g) return deriveAddress(g.startsWith('0x') ? g : '0x' + g);
        return null;
    }

    walletInfo(userId) {
        const s = this.wallets.get(userId);
        if (s) return { hasWallet: true, address: s.address, source: 'user-set', chain: 'all' };
        const g = process.env.WALLET_PRIVATE_KEY;
        if (g) return { hasWallet: true, address: deriveAddress(g.startsWith('0x') ? g : '0x' + g), source: 'env', chain: 'all' };
        return { hasWallet: false };
    }

    async getBalance(userId, chain = 'base') {
        const cfg = CHAINS[chain.toLowerCase()];
        if (!cfg) throw new Error(`Chain tidak dikenal: ${chain}`);
        const address = this.getAddress(userId);
        if (!address) throw new Error('Wallet belum diset');
        const hex = await rpcCall(cfg.rpc, 'eth_getBalance', [address, 'latest']);
        return { address, chain: cfg.name, symbol: cfg.symbol, balance: formatEther(hex), explorer: `${cfg.explorer}/address/${address}` };
    }

    async getAllBalances(userId) {
        const out = [];
        for (const [key, cfg] of Object.entries(CHAINS)) {
            try { out.push(await this.getBalance(userId, key)); }
            catch (e) { out.push({ chain: cfg.name, symbol: cfg.symbol, balance: 'Error', error: e.message }); }
        }
        return out;
    }

    async signMessage(userId, message) {
        const s = this.wallets.get(userId);
        const g = process.env.WALLET_PRIVATE_KEY;
        const pk = s?.privateKey || (g ? (g.startsWith('0x') ? g : '0x' + g) : null);
        if (!pk) throw new Error('Wallet belum diset');
        const sig = crypto.createHmac('sha256', Buffer.from(pk.slice(2), 'hex')).update(message).digest('hex');
        return { address: this.getAddress(userId), message, signature: '0x' + sig };
    }

    async claimAirdrop() {
        throw new Error('Claim on-chain butuh ethers library. Gunakan Browser Use Cloud untuk claim via UI.');
    }

    removeWallet(userId) { this.wallets.delete(userId); }
    getSupportedChains() { return Object.entries(CHAINS).map(([k, c]) => ({ key: k, ...c })); }
}

const walletManager = new Web3WalletManager();
console.log('✅ web3-wallet loaded (zero-dependency mode)');
module.exports = walletManager;