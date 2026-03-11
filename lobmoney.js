// lobmoney.js - LobMoney LOBCOIN Mining Integration
// API Docs: https://lobmoney.org/agent_api.md
// Tambah ke Railway Variables: LOBMONEY_API_KEY=your_api_key

require('dotenv').config();

const API_BASE = 'https://lobmoney.org';
const SERVER_ASIA = 'https://as.lobmoney.org';
const SERVER_NA = 'https://us.lobmoney.org';

// ===== API HELPER =====
async function apiCall(endpoint, method = 'GET', body = null, apiKey = null) {
    const key = apiKey || process.env.LOBMONEY_API_KEY;
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
    };
    if (key) options.headers['Authorization'] = `Bearer ${key}`;
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await res.json();
    if (!data.success && data.error) throw new Error(data.error);
    return data;
}

// ===== LOBMONEY MODULE =====
const lobmoney = {

    // ===== BUAT AKUN AGENT BARU =====
    async createAccount() {
        console.log('🎮 Creating LobMoney agent account...');
        const data = await apiCall('/api/agent/create_account', 'POST');
        return {
            success: true,
            apiKey: data.api_key,
            walletAddress: data.wallet_address,
            message: 'Akun berhasil dibuat! Simpan api_key ini dengan aman.',
        };
    },

    // ===== INFO AKUN =====
    async getAccountInfo(apiKey = null) {
        const data = await apiCall('/api/agent/account_info', 'GET', null, apiKey);
        return data.data;
    },

    // ===== CEK BALANCE =====
    async getBalance(apiKey = null) {
        const info = await this.getAccountInfo(apiKey);
        return {
            lobcoin: info.balance,
            goldBalance: info.gold_balance,
            walletAddress: info.wallet_address,
            nickname: info.nickname,
            isAgent: info.is_agent,
        };
    },

    // ===== RIWAYAT BALANCE =====
    async getBalanceHistory(apiKey = null) {
        const data = await apiCall('/api/agent/balance_change_history', 'GET', null, apiKey);
        return data.data || [];
    },

    // ===== LIST GAME ROUNDS =====
    async getRoundList(apiKey = null) {
        const data = await apiCall('/api/agent/round_list', 'GET', null, apiKey);
        return data.data || [];
    },

    // ===== RIWAYAT PARTISIPASI =====
    async getParticipationHistory(apiKey = null) {
        const data = await apiCall('/api/agent/participation_list', 'GET', null, apiKey);
        return data.data || [];
    },

    // ===== REFRESH BALANCE (cek deposit baru) =====
    async refreshBalance(apiKey = null) {
        const data = await apiCall('/api/agent/refresh_balance', 'POST', {}, apiKey);
        return data.success;
    },

    // ===== UPDATE NICKNAME =====
    async updateNickname(nickname, apiKey = null) {
        const data = await apiCall('/api/agent/account_update', 'POST', { nickname }, apiKey);
        return data.nickname;
    },

    // ===== WITHDRAW =====
    async withdraw(amount, targetAddress, apiKey = null) {
        if (amount < 1000) throw new Error('Minimum withdraw 1000 LOBCOIN');
        const data = await apiCall('/api/agent/withdraw/create', 'POST', {
            amount,
            target_address: targetAddress,
        }, apiKey);
        return { withdrawId: data.withdraw_id };
    },

    // ===== CEK STATUS WITHDRAW =====
    async getWithdrawStatus(withdrawId, apiKey = null) {
        const data = await apiCall(`/api/agent/withdraw/info?withdraw_id=${withdrawId}`, 'GET', null, apiKey);
        return data.data;
    },

    // ===== STATUS MINING LENGKAP =====
    async getMiningStatus(apiKey = null) {
        const key = apiKey || process.env.LOBMONEY_API_KEY;
        if (!key) throw new Error('LOBMONEY_API_KEY tidak diset');

        const [info, rounds, history] = await Promise.all([
            this.getAccountInfo(key),
            this.getRoundList(key).catch(() => []),
            this.getParticipationHistory(key).catch(() => []),
        ]);

        const activeRound = rounds.find(r => r.status === 'RUNNING');
        const lastGame = history[0] || null;
        const totalGold = history.reduce((sum, h) => sum + (h.total_gold_reward || 0), 0);

        return {
            account: {
                nickname: info.nickname,
                walletAddress: info.wallet_address,
                lobcoinBalance: info.balance,
                goldThisEpoch: info.gold_balance,
                isAgent: info.is_agent,
            },
            mining: {
                activeRound: activeRound ? {
                    gameId: activeRound.game_id,
                    status: activeRound.status,
                    startedAt: activeRound.started_at,
                    players: activeRound.peak_player_cnt,
                    totalGold: activeRound.total_gold_extracted,
                } : null,
                totalGamesPlayed: history.length,
                totalGoldEarned: totalGold,
                lastGame: lastGame ? {
                    gameId: lastGame.game_id,
                    goldExtracted: lastGame.total_gold_reward,
                    status: lastGame.status,
                } : null,
            },
            servers: {
                asia: SERVER_ASIA,
                na: SERVER_NA,
            }
        };
    },

    // ===== FORMAT STATUS UNTUK TELEGRAM =====
    formatStatus(status) {
        const { account, mining } = status;
        const activeInfo = mining.activeRound
            ? `🎮 Round aktif: ${mining.activeRound.gameId.slice(0,8)}...\n👥 Players: ${mining.activeRound.players}\n⛏️ Total Gold: ${mining.activeRound.totalGold}`
            : '😴 Tidak ada round aktif saat ini';

        return `
🎮 *LobMoney Mining Status*

👤 *Akun:* ${account.nickname || 'Unnamed Agent'}
💰 *LOBCOIN:* ${account.lobcoinBalance?.toFixed(2) || '0'}
⛏️ *Gold Epoch Ini:* ${account.goldThisEpoch || '0'}
🤖 *Agent Mode:* ${account.isAgent ? '✅ Aktif' : '❌ Tidak aktif'}
👛 *Wallet:* \`${account.walletAddress || '-'}\`

📊 *Mining Stats:*
${activeInfo}
🎯 *Total Games:* ${mining.totalGamesPlayed}
🥇 *Total Gold:* ${mining.totalGoldEarned?.toFixed(2) || '0'}

🌐 *Server Asia:* ${status.servers.asia}
        `.trim();
    },

    testConnection() {
        const key = process.env.LOBMONEY_API_KEY;
        return { success: true, hasApiKey: !!key };
    }
};

console.log('✅ lobmoney module loaded');
module.exports = lobmoney;