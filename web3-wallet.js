// web3-wallet.js - Web3 Wallet Integration
// Support: Ethereum, Base, Arbitrum, BNB Chain
// Method: Private Key (stored in .env)
// ⚠️ PERINGATAN: Jangan pernah share private key ke siapapun!

require('dotenv').config();
const { ethers } = require('ethers');

// ===== CHAIN CONFIGURATIONS =====
const CHAINS = {
    ethereum: {
        name: 'Ethereum Mainnet',
        chainId: 1,
        rpc: process.env.ETH_RPC_URL || 'https://eth.llamarpc.com',
        symbol: 'ETH',
        explorer: 'https://etherscan.io',
    },
    base: {
        name: 'Base',
        chainId: 8453,
        rpc: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
        symbol: 'ETH',
        explorer: 'https://basescan.org',
    },
    arbitrum: {
        name: 'Arbitrum One',
        chainId: 42161,
        rpc: process.env.ARB_RPC_URL || 'https://arb1.arbitrum.io/rpc',
        symbol: 'ETH',
        explorer: 'https://arbiscan.io',
    },
    bnb: {
        name: 'BNB Chain',
        chainId: 56,
        rpc: process.env.BNB_RPC_URL || 'https://bsc-dataseed.binance.org',
        symbol: 'BNB',
        explorer: 'https://bscscan.com',
    },
};

// ===== WALLET MANAGER =====
class Web3WalletManager {
    constructor() {
        this.wallets = new Map();    // userId → { privateKey, address }
        this.providers = new Map();  // chainName → provider
    }

    // ===== GET PROVIDER =====
    getProvider(chain = 'base') {
        const chainKey = chain.toLowerCase();
        if (!CHAINS[chainKey]) throw new Error(`Chain tidak dikenal: ${chain}. Pilihan: ${Object.keys(CHAINS).join(', ')}`);

        if (!this.providers.has(chainKey)) {
            const provider = new ethers.JsonRpcProvider(CHAINS[chainKey].rpc);
            this.providers.set(chainKey, provider);
        }
        return this.providers.get(chainKey);
    }

    // ===== LOAD WALLET FROM PRIVATE KEY =====
    // Private key bisa dari .env (WALLET_PRIVATE_KEY) atau diset per user
    loadWallet(userId, privateKey, chain = 'base') {
        if (!privateKey) throw new Error('Private key tidak boleh kosong');

        // Validasi format private key
        let cleanKey = privateKey.trim();
        if (!cleanKey.startsWith('0x')) cleanKey = '0x' + cleanKey;
        if (!/^0x[0-9a-fA-F]{64}$/.test(cleanKey)) {
            throw new Error('Format private key tidak valid. Harus 64 karakter hex.');
        }

        const provider = this.getProvider(chain);
        const wallet = new ethers.Wallet(cleanKey, provider);

        this.wallets.set(userId, {
            privateKey: cleanKey,
            address: wallet.address,
            chain,
        });

        console.log(`✅ Wallet loaded for user ${userId}: ${wallet.address} on ${chain}`);
        return wallet.address;
    }

    // ===== GET WALLET =====
    getWallet(userId, chain = null) {
        const stored = this.wallets.get(userId);
        if (!stored) {
            // Coba pakai global private key dari .env
            const globalKey = process.env.WALLET_PRIVATE_KEY;
            if (globalKey) {
                const targetChain = chain || 'base';
                const provider = this.getProvider(targetChain);
                return new ethers.Wallet(
                    globalKey.startsWith('0x') ? globalKey : '0x' + globalKey,
                    provider
                );
            }
            throw new Error('Wallet belum diset. Kirim private key dulu.');
        }

        const targetChain = chain || stored.chain;
        const provider = this.getProvider(targetChain);
        return new ethers.Wallet(stored.privateKey, provider);
    }

    // ===== GET WALLET ADDRESS =====
    getAddress(userId) {
        const stored = this.wallets.get(userId);
        if (stored) return stored.address;

        const globalKey = process.env.WALLET_PRIVATE_KEY;
        if (globalKey) {
            const key = globalKey.startsWith('0x') ? globalKey : '0x' + globalKey;
            return new ethers.Wallet(key).address;
        }
        return null;
    }

    // ===== CEK BALANCE =====
    async getBalance(userId, chain = 'base') {
        const wallet = this.getWallet(userId, chain);
        const chainConfig = CHAINS[chain.toLowerCase()];
        const provider = this.getProvider(chain);

        const balanceWei = await provider.getBalance(wallet.address);
        const balanceEth = ethers.formatEther(balanceWei);

        return {
            address: wallet.address,
            chain: chainConfig.name,
            symbol: chainConfig.symbol,
            balance: parseFloat(balanceEth).toFixed(6),
            balanceWei: balanceWei.toString(),
            explorer: `${chainConfig.explorer}/address/${wallet.address}`,
        };
    }

    // ===== CEK BALANCE SEMUA CHAIN =====
    async getAllBalances(userId) {
        const results = [];
        for (const [chainKey, chainConfig] of Object.entries(CHAINS)) {
            try {
                const bal = await this.getBalance(userId, chainKey);
                results.push(bal);
            } catch (e) {
                results.push({
                    chain: chainConfig.name,
                    symbol: chainConfig.symbol,
                    balance: 'Error',
                    error: e.message,
                });
            }
        }
        return results;
    }

    // ===== SIGN MESSAGE =====
    // Dipakai untuk verifikasi identitas di airdrop (bukan transaksi)
    async signMessage(userId, message, chain = 'base') {
        const wallet = this.getWallet(userId, chain);
        const signature = await wallet.signMessage(message);
        return {
            address: wallet.address,
            message,
            signature,
        };
    }

    // ===== SEND TRANSACTION =====
    // Dipakai untuk claim airdrop on-chain, dll
    async sendTransaction(userId, chain, to, value = '0', data = '0x') {
        const wallet = this.getWallet(userId, chain);
        const provider = this.getProvider(chain);

        // Estimasi gas
        const feeData = await provider.getFeeData();
        const gasEstimate = await provider.estimateGas({
            from: wallet.address,
            to,
            value: ethers.parseEther(value.toString()),
            data,
        }).catch(() => 200000n);

        const tx = {
            to,
            value: ethers.parseEther(value.toString()),
            data,
            gasLimit: gasEstimate * 120n / 100n, // +20% buffer
            maxFeePerGas: feeData.maxFeePerGas,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        };

        console.log(`📤 Sending tx on ${chain}: to=${to}, value=${value}`);
        const txResponse = await wallet.sendTransaction(tx);
        console.log(`⏳ Tx hash: ${txResponse.hash}`);

        const receipt = await txResponse.wait();
        console.log(`✅ Tx confirmed: ${receipt.hash}`);

        const chainConfig = CHAINS[chain.toLowerCase()];
        return {
            success: receipt.status === 1,
            hash: receipt.hash,
            explorer: `${chainConfig.explorer}/tx/${receipt.hash}`,
            gasUsed: receipt.gasUsed.toString(),
        };
    }

    // ===== INTERACT WITH CONTRACT =====
    // Untuk claim token, mint NFT, approve, dll
    async callContract(userId, chain, contractAddress, abi, method, args = [], value = '0') {
        const wallet = this.getWallet(userId, chain);
        const contract = new ethers.Contract(contractAddress, abi, wallet);

        console.log(`📜 Calling ${method} on ${contractAddress} (${chain})`);

        const options = {};
        if (value && value !== '0') {
            options.value = ethers.parseEther(value.toString());
        }

        // Estimasi gas dulu
        try {
            const gasEstimate = await contract[method].estimateGas(...args, options);
            options.gasLimit = gasEstimate * 120n / 100n;
        } catch (e) {
            console.warn('⚠️ Gas estimation failed, using default:', e.message);
            options.gasLimit = 300000n;
        }

        const tx = await contract[method](...args, options);
        console.log(`⏳ Tx hash: ${tx.hash}`);

        const receipt = await tx.wait();
        const chainConfig = CHAINS[chain.toLowerCase()];

        return {
            success: receipt.status === 1,
            hash: receipt.hash,
            explorer: `${chainConfig.explorer}/tx/${receipt.hash}`,
            gasUsed: receipt.gasUsed.toString(),
        };
    }

    // ===== READ CONTRACT (tidak butuh gas) =====
    async readContract(chain, contractAddress, abi, method, args = []) {
        const provider = this.getProvider(chain);
        const contract = new ethers.Contract(contractAddress, abi, provider);
        const result = await contract[method](...args);
        return result;
    }

    // ===== APPROVE TOKEN ERC20 =====
    async approveToken(userId, chain, tokenAddress, spenderAddress, amount = 'max') {
        const ERC20_ABI = [
            'function approve(address spender, uint256 amount) returns (bool)',
            'function allowance(address owner, address spender) view returns (uint256)',
            'function decimals() view returns (uint8)',
            'function symbol() view returns (string)',
        ];

        const amountBN = amount === 'max'
            ? ethers.MaxUint256
            : ethers.parseUnits(amount.toString(), 18);

        return await this.callContract(userId, chain, tokenAddress, ERC20_ABI, 'approve', [spenderAddress, amountBN]);
    }

    // ===== CLAIM AIRDROP (generic) =====
    // Coba berbagai method umum yang dipakai airdrop contracts
    async claimAirdrop(userId, chain, contractAddress, claimData = {}) {
        const CLAIM_ABIS = [
            // Standard claim()
            { method: 'claim', abi: ['function claim() external'], args: [] },
            // Claim dengan amount
            { method: 'claim', abi: ['function claim(uint256 amount) external'], args: [claimData.amount || 0] },
            // Merkle claim
            {
                method: 'claim',
                abi: ['function claim(uint256 index, address account, uint256 amount, bytes32[] calldata merkleProof) external'],
                args: [claimData.index || 0, claimData.address, claimData.amount || 0, claimData.proof || []]
            },
            // ClaimTokens
            { method: 'claimTokens', abi: ['function claimTokens() external'], args: [] },
            // Mint
            { method: 'mint', abi: ['function mint() external payable'], args: [] },
        ];

        for (const { method, abi, args } of CLAIM_ABIS) {
            try {
                console.log(`🎯 Trying ${method}() on ${contractAddress}...`);
                const result = await this.callContract(userId, chain, contractAddress, abi, method, args, claimData.value || '0');
                if (result.success) {
                    console.log(`✅ Claim berhasil via ${method}()`);
                    return { ...result, method };
                }
            } catch (e) {
                console.log(`  ❌ ${method}() failed: ${e.message.substring(0, 50)}`);
            }
        }

        throw new Error('Semua metode claim gagal. Contract mungkin butuh parameter khusus.');
    }

    // ===== CEK STATUS WALLET =====
    walletInfo(userId) {
        const stored = this.wallets.get(userId);
        const globalKey = process.env.WALLET_PRIVATE_KEY;

        if (stored) {
            return {
                hasWallet: true,
                address: stored.address,
                chain: stored.chain,
                source: 'user-set',
            };
        } else if (globalKey) {
            const key = globalKey.startsWith('0x') ? globalKey : '0x' + globalKey;
            const address = new ethers.Wallet(key).address;
            return {
                hasWallet: true,
                address,
                chain: 'all',
                source: 'env',
            };
        }

        return { hasWallet: false };
    }

    // ===== HAPUS WALLET (keamanan) =====
    removeWallet(userId) {
        this.wallets.delete(userId);
    }

    // ===== SUPPORTED CHAINS =====
    getSupportedChains() {
        return Object.entries(CHAINS).map(([key, c]) => ({
            key,
            name: c.name,
            chainId: c.chainId,
            symbol: c.symbol,
        }));
    }
}

// Export singleton
const walletManager = new Web3WalletManager();
module.exports = walletManager;