// wallet-commands.js - Telegram Bot Commands untuk Web3 Wallet
// Import ini di bot.js dan panggil registerWalletCommands(bot)

const walletManager = require('./web3-wallet');

function registerWalletCommands(bot) {

    // ===== /setwallet - Set private key =====
    bot.onText(/\/setwallet\s+(.+)/i, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id.toString();
        const privateKey = match[1].trim();

        // ⚠️ Hapus pesan user SEGERA untuk keamanan (private key jangan tersimpan di chat)
        try { await bot.deleteMessage(chatId, msg.message_id); } catch (e) {}

        try {
            const address = walletManager.loadWallet(userId, privateKey);
            await bot.sendMessage(chatId, `
✅ *Wallet berhasil diset!*

📍 Address: \`${address}\`

⚠️ *PENTING UNTUK KEAMANAN:*
• Pesan berisi private key sudah dihapus otomatis
• Jangan pernah kirim private key di chat group
• Gunakan wallet khusus untuk bot (bukan wallet utama)
• Private key disimpan sementara di memory, hilang saat bot restart

💡 Gunakan /walletinfo untuk cek status wallet
            `.trim(), { parse_mode: 'Markdown' });
        } catch (error) {
            await bot.sendMessage(chatId, `❌ Error: ${error.message}`, { parse_mode: 'Markdown' });
        }
    });

    // ===== /walletinfo - Cek info wallet =====
    bot.onText(/\/walletinfo/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id.toString();

        const info = walletManager.walletInfo(userId);

        if (!info.hasWallet) {
            await bot.sendMessage(chatId, `
❌ *Wallet belum diset*

Cara set wallet:
1. Kirim: \`/setwallet 0xPrivateKeymu\`
2. Atau set \`WALLET_PRIVATE_KEY\` di environment variables Railway

⚠️ Gunakan wallet khusus untuk bot, bukan wallet utama!
            `.trim(), { parse_mode: 'Markdown' });
            return;
        }

        await bot.sendMessage(chatId, `
👛 *Wallet Info*

📍 Address: \`${info.address}\`
🔗 Source: ${info.source === 'env' ? 'Environment (.env)' : 'User-set'}
⛓️ Default Chain: ${info.chain}

Gunakan /balance untuk cek saldo semua chain.
        `.trim(), { parse_mode: 'Markdown' });
    });

    // ===== /balance - Cek saldo =====
    bot.onText(/\/balance(?:\s+(\w+))?/, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id.toString();
        const chain = match[1]?.toLowerCase();

        const info = walletManager.walletInfo(userId);
        if (!info.hasWallet) {
            await bot.sendMessage(chatId, '❌ Wallet belum diset. Gunakan /setwallet');
            return;
        }

        await bot.sendMessage(chatId, '⏳ Mengecek saldo...');

        try {
            if (chain && ['ethereum', 'base', 'arbitrum', 'bnb'].includes(chain)) {
                const bal = await walletManager.getBalance(userId, chain);
                await bot.sendMessage(chatId, `
💰 *Balance ${bal.chain}*

📍 \`${bal.address}\`
💎 ${bal.balance} ${bal.symbol}
🔗 [Lihat di Explorer](${bal.explorer})
                `.trim(), { parse_mode: 'Markdown', disable_web_page_preview: true });
            } else {
                // Cek semua chain
                const balances = await walletManager.getAllBalances(userId);
                const lines = balances.map(b =>
                    b.error
                        ? `❌ ${b.chain}: Error`
                        : `💎 ${b.chain}: ${b.balance} ${b.symbol}`
                ).join('\n');

                await bot.sendMessage(chatId, `
💰 *Semua Balance*

📍 \`${info.address}\`

${lines}

💡 Cek spesifik: /balance ethereum | /balance base | /balance arbitrum | /balance bnb
                `.trim(), { parse_mode: 'Markdown' });
            }
        } catch (error) {
            await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
    });

    // ===== /signmessage - Sign pesan =====
    bot.onText(/\/signmessage\s+(.+)/i, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id.toString();
        const message = match[1].trim();

        const info = walletManager.walletInfo(userId);
        if (!info.hasWallet) { await bot.sendMessage(chatId, '❌ Wallet belum diset.'); return; }

        try {
            const result = await walletManager.signMessage(userId, message);
            await bot.sendMessage(chatId, `
✍️ *Message Signed*

📝 Message: \`${result.message}\`
📍 Address: \`${result.address}\`
🔏 Signature:
\`${result.signature}\`

💡 Signature ini bisa dipakai untuk verifikasi identitas wallet di airdrop.
            `.trim(), { parse_mode: 'Markdown' });
        } catch (error) {
            await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
    });

    // ===== /claimairdrop - Claim airdrop dari contract =====
    bot.onText(/\/claimairdrop\s+(\w+)\s+(0x[a-fA-F0-9]{40})(?:\s+(.+))?/i, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id.toString();
        const chain = match[1].toLowerCase();
        const contractAddress = match[2];
        const extraData = match[3] || '';

        const info = walletManager.walletInfo(userId);
        if (!info.hasWallet) { await bot.sendMessage(chatId, '❌ Wallet belum diset. Gunakan /setwallet'); return; }

        const supportedChains = ['ethereum', 'base', 'arbitrum', 'bnb'];
        if (!supportedChains.includes(chain)) {
            await bot.sendMessage(chatId, `❌ Chain tidak valid. Pilihan: ${supportedChains.join(', ')}`);
            return;
        }

        await bot.sendMessage(chatId, `
⏳ *Mencoba claim airdrop...*

⛓️ Chain: ${chain}
📜 Contract: \`${contractAddress}\`
👛 Wallet: \`${info.address}\`

Mohon tunggu...
        `.trim(), { parse_mode: 'Markdown' });

        try {
            const claimData = { address: info.address };

            // Parse extra data jika ada (misal: value=0.001)
            if (extraData) {
                const valueMatch = extraData.match(/value[=:]([\d.]+)/i);
                if (valueMatch) claimData.value = valueMatch[1];
            }

            const result = await walletManager.claimAirdrop(userId, chain, contractAddress, claimData);

            await bot.sendMessage(chatId, `
${result.success ? '🎉' : '❌'} *Claim ${result.success ? 'Berhasil!' : 'Gagal'}*

🔧 Method: \`${result.method}()\`
📋 Tx Hash: \`${result.hash}\`
⛽ Gas Used: ${result.gasUsed}
🔗 [Lihat Transaksi](${result.explorer})
            `.trim(), { parse_mode: 'Markdown', disable_web_page_preview: false });

        } catch (error) {
            await bot.sendMessage(chatId, `
❌ *Claim Gagal*

Error: ${error.message}

💡 Tips:
• Pastikan wallet punya cukup ETH/BNB untuk gas
• Cek apakah wallet eligible untuk airdrop ini
• Contract mungkin butuh parameter khusus
            `.trim(), { parse_mode: 'Markdown' });
        }
    });

    // ===== /removewallet - Hapus wallet dari memory =====
    bot.onText(/\/removewallet/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id.toString();
        walletManager.removeWallet(userId);
        await bot.sendMessage(chatId, '✅ Wallet dihapus dari memory bot.\n\n💡 Set ulang dengan /setwallet jika diperlukan.');
    });

    // ===== /chains - Lihat chain yang didukung =====
    bot.onText(/\/chains/, async (msg) => {
        const chatId = msg.chat.id;
        const chains = walletManager.getSupportedChains();
        const list = chains.map(c => `• *${c.name}* (\`${c.key}\`) - Chain ID: ${c.chainId} - ${c.symbol}`).join('\n');
        await bot.sendMessage(chatId, `
⛓️ *Chain yang Didukung:*

${list}

💡 Cara pakai:
/balance base
/claimairdrop base 0xContractAddress
        `.trim(), { parse_mode: 'Markdown' });
    });

    console.log('✅ Wallet commands registered');
}

module.exports = { registerWalletCommands };