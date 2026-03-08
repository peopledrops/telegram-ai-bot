// minebean.js - MineBean Skill Module
require('dotenv').config();
const { ethers } = require('ethers');
const axios = require('axios');
const WebSocket = require('ws');

// Config
const API_BASE = process.env.MINEBEAN_API || 'https://api.minebean.com';
const BASE_RPC = process.env.BASE_RPC || 'https://mainnet.base.org';
const GRID_MINING_ADDRESS = '0x9632495bDb93FD6B0740Ab69cc6c71C9c01da4f0';
const BEAN_ADDRESS = '0x5c72992b83E74c4D5200A8E8920fB946214a5A5D';

// Grid Mining ABI (minimal untuk deploy & claim)
const GRID_MINING_ABI = [
    'function deploy(uint256[] calldata blockIds) external payable',
    'function claimETH() external',
    'function claimBEAN() external',
    'function userDeploys(uint256 roundId, address user) external view returns (uint256)',
    'function roundId() external view returns (uint256)',
    'event Deployed(address indexed user, uint256 indexed roundId, uint256[] blockIds, uint256 amount)',
    'event RoundSettled(uint256 indexed roundId, uint256 winningBlock, uint256 beanWinnerMode)'
];

// BEAN Token ABI (untuk approve & stake)
const BEAN_ABI = [
    'function balanceOf(address account) external view returns (uint256)',
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) external view returns (uint256)'
];

class MineBeanSkill {
    constructor(userAddress) {
        this.userAddress = userAddress?.toLowerCase();
        this.provider = new ethers.JsonRpcProvider(BASE_RPC);
        this.gridContract = new ethers.Contract(GRID_MINING_ADDRESS, GRID_MINING_ABI, this.provider);
        this.beanContract = new ethers.Contract(BEAN_ADDRESS, BEAN_ABI, this.provider);
        this.sse = null;
        this.roundCache = null;
    }

    // ===== API CALLS =====

    /** Get current round state */
    async getCurrentRound(userAddress = null) {
        try {
            const url = userAddress 
                ? `${API_BASE}/api/round/current?user=${userAddress}`
                : `${API_BASE}/api/round/current`;
            const res = await axios.get(url, { timeout: 10000 });
            this.roundCache = res.data;
            return res.data;
        } catch (error) {
            console.error('❌ API Error (getCurrentRound):', error.message);
            return null;
        }
    }

    /** Get BEAN price in ETH */
        /** Get BEAN price in ETH */
    async getBeanPrice() {         // ← ✅ BENAR: hapus "function", ini method class
        try {
            const res = await axios.get(`${API_BASE}/api/price`, { timeout: 10000 });
            const data = res.data;
            
            // Handle berbagai kemungkinan format response
            const priceNative = data?.priceNative 
                || data?.price?.eth 
                || data?.beanPriceEth 
                || data?.native 
                || '0';
                
            const priceUsd = data?.priceUsd 
                || data?.price?.usd 
                || data?.beanPriceUsd 
                || data?.usd 
                || '0';
            
            return { 
                priceNative: priceNative.toString(), 
                priceUsd: priceUsd.toString(),
                raw: data
            };
        } catch (error) {
            console.error('❌ API Error (getBeanPrice):', error.message);
            return { priceNative: '0.000015', priceUsd: '0.045', raw: null };
        }
    }  // ← Tutup method dengan benar

    /** Get user rewards */
    async getUserRewards(address) {
        try {
            const res = await axios.get(`${API_BASE}/api/user/${address}/rewards`, { timeout: 10000 });
            return res.data;
        } catch (error) {
            console.error('❌ API Error (getUserRewards):', error.message);
            return null;
        }
    }

    /** Get global stats */
    async getStats() {
        try {
            const res = await axios.get(`${API_BASE}/api/stats`, { timeout: 10000 });
            return res.data;
        } catch (error) {
            console.error('❌ API Error (getStats):', error.message);
            return null;
        }
    }

    // ===== STRATEGY CALCULATIONS =====

    /** Calculate Expected Value for a potential deploy */
    calculateEV({ deployedEth, beanPriceEth, beanpotPool, totalDeployed, yourShareOnWinningBlock }) {
        // Fee calculations
        const adminFee = parseFloat(deployedEth) * 0.01; // 1% from total
        const effectiveHouseEdge = 0.01 + (0.10 * 0.99 * (1 - yourShareOnWinningBlock)); // ~1-11%
        
        // BEAN reward EV (1 BEAN per round, 50/50 split or single)
        const beanValueEth = parseFloat(beanPriceEth) * 1.0;
        
        // Beanpot EV (0.3 BEAN per round, 1/777 chance)
        const beanpotValueEth = parseFloat(beanpotPool) * parseFloat(beanPriceEth) * (1/777);
        
        // Net EV
        const feeCost = parseFloat(deployedEth) * effectiveHouseEdge;
        const netEV = beanValueEth + beanpotValueEth - feeCost;
        
        return {
            netEV: netEV.toFixed(8),
            netEVWei: ethers.parseEther(netEV.toFixed(8)).toString(),
            isPositive: netEV > 0,
            breakdown: {
                beanValue: beanValueEth.toFixed(8),
                beanpotEV: beanpotValueEth.toFixed(8),
                feeCost: feeCost.toFixed(8),
                houseEdge: (effectiveHouseEdge * 100).toFixed(2) + '%'
            }
        };
    }

    /** Suggest blocks based on grid crowding */
    suggestBlocks(roundData, numBlocks = 3, strategy = 'least-crowded') {
        if (!roundData?.blocks) return [];
        
        const blocks = roundData.blocks
            .filter(b => b.id >= 0 && b.id < 25)
            .map(b => ({
                id: b.id,
                deployed: parseFloat(b.deployedFormatted) || 0,
                minerCount: b.minerCount || 0
            }));
        
        switch(strategy) {
            case 'least-crowded':
                // Pick blocks with fewest miners
                return blocks
                    .sort((a, b) => a.minerCount - b.minerCount || a.deployed - b.deployed)
                    .slice(0, numBlocks)
                    .map(b => b.id);
                    
            case 'empty':
                // Pick completely empty blocks (highest risk/reward)
                const empty = blocks.filter(b => b.minerCount === 0);
                if (empty.length >= numBlocks) {
                    return empty.slice(0, numBlocks).map(b => b.id);
                }
                // Fallback to least-crowded
                return blocks
                    .sort((a, b) => a.minerCount - b.minerCount)
                    .slice(0, numBlocks)
                    .map(b => b.id);
                    
            case 'random':
                // Random selection
                const shuffled = [...blocks].sort(() => 0.5 - Math.random());
                return shuffled.slice(0, numBlocks).map(b => b.id);
                
            case 'all':
                // Deploy to all 25 blocks (conservative)
                return blocks.map(b => b.id);
                
            default:
                return [0, 1, 2]; // Default fallback
        }
    }

    // ===== BLOCKCHAIN INTERACTIONS (requires private key) =====

    /** Deploy ETH to blocks (requires signer with private key) */
    async deploy(blockIds, amountEth, privateKey) {
        if (!privateKey) {
            throw new Error('Private key required for on-chain transactions');
        }
        
        const signer = new ethers.Wallet(privateKey, this.provider);
        const gridWithSigner = this.gridContract.connect(signer);
        
        // Validate block IDs
        const validBlocks = blockIds.filter(id => id >= 0 && id < 25);
        if (validBlocks.length === 0) {
            throw new Error('No valid block IDs (0-24)');
        }
        
        // Calculate amount per block
        const totalAmount = ethers.parseEther(amountEth.toString());
        const minPerBlock = ethers.parseEther('0.0000025'); // 0.0000025 ETH minimum
        
        if (totalAmount < minPerBlock * BigInt(validBlocks.length)) {
            throw new Error(`Minimum ${ethers.formatEther(minPerBlock * BigInt(validBlocks.length))} ETH for ${validBlocks.length} blocks`);
        }
        
        // Send transaction
        const tx = await gridWithSigner.deploy(validBlocks, { 
            value: totalAmount,
            gasLimit: 200000 
        });
        
        console.log(`📤 Deploy tx: ${tx.hash}`);
        const receipt = await tx.wait();
        
        return {
            success: true,
            txHash: tx.hash,
            blockIds: validBlocks,
            amount: amountEth,
            receipt
        };
    }

    /** Claim pending ETH rewards */
    async claimETH(privateKey) {
        if (!privateKey) throw new Error('Private key required');
        
        const signer = new ethers.Wallet(privateKey, this.provider);
        const gridWithSigner = this.gridContract.connect(signer);
        
        const tx = await gridWithSigner.claimETH({ gasLimit: 150000 });
        const receipt = await tx.wait();
        
        return { success: true, txHash: tx.hash, receipt };
    }

    /** Claim pending BEAN rewards */
    async claimBEAN(privateKey) {
        if (!privateKey) throw new Error('Private key required');
        
        const signer = new ethers.Wallet(privateKey, this.provider);
        const gridWithSigner = this.gridContract.connect(signer);
        
        const tx = await gridWithSigner.claimBEAN({ gasLimit: 150000 });
        const receipt = await tx.wait();
        
        return { success: true, txHash: tx.hash, receipt };
    }

    // ===== REAL-TIME UPDATES (SSE) =====

    /** Connect to Server-Sent Events for real-time round updates */
    connectSSE(onDeployed, onRoundSettled, onError) {
        const url = `${API_BASE}/api/events/rounds`;
        this.sse = new WebSocket(url.replace('https://', 'wss://').replace('http://', 'ws://'));
        
        this.sse.on('message', (data) => {
            try {
                const event = JSON.parse(data.toString());
                
                if (event.type === 'deployed' && onDeployed) {
                    onDeployed(event.data);
                } else if (event.type === 'roundTransition' && onRoundSettled) {
                    onRoundSettled(event.data);
                }
            } catch (err) {
                console.error('❌ SSE parse error:', err);
            }
        });
        
        this.sse.on('error', (err) => {
            console.error('❌ SSE error:', err);
            if (onError) onError(err);
        });
        
        this.sse.on('close', () => {
            console.log('🔌 SSE disconnected');
            // Auto-reconnect after 5 seconds
            setTimeout(() => {
                console.log('🔄 Reconnecting SSE...');
                this.connectSSE(onDeployed, onRoundSettled, onError);
            }, 5000);
        });
        
        console.log('🔌 SSE connected');
        return this.sse;
    }

    disconnectSSE() {
        if (this.sse) {
            this.sse.close();
            this.sse = null;
        }
    }

    // ===== UTILITY =====

    /** Format wei to readable ETH */
    formatEth(wei) {
        return ethers.formatEther(wei);
    }

    /** Parse ETH string to wei */
    parseEth(eth) {
        return ethers.parseEther(eth.toString());
    }

    /** Get current timestamp */
    now() {
        return Math.floor(Date.now() / 1000);
    }
}

module.exports = MineBeanSkill;