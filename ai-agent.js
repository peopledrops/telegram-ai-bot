// ai-agent.js - Smart AI Agent that auto-executes bot functions
// AI memahami bahasa natural → otomatis eksekusi tanpa perlu manual

require('dotenv').config();
const OpenAI = require('openai');

const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
});

// ===== TOOL DEFINITIONS (Function Calling) =====
// AI akan otomatis memilih dan memanggil tool yang tepat

const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'check_airdrop_status',
            description: 'Cek status, round, dan info terkini MineBean game',
            parameters: { type: 'object', properties: {}, required: [] }
        }
    },
    {
        type: 'function',
        function: {
            name: 'check_bean_price',
            description: 'Cek harga BEAN token saat ini',
            parameters: { type: 'object', properties: {}, required: [] }
        }
    },
    {
        type: 'function',
        function: {
            name: 'check_rewards',
            description: 'Cek reward/hadiah yang pending untuk wallet user',
            parameters: { type: 'object', properties: {}, required: [] }
        }
    },
    {
        type: 'function',
        function: {
            name: 'suggest_blocks',
            description: 'Rekomendasikan block terbaik untuk di-deploy di MineBean',
            parameters: {
                type: 'object',
                properties: {
                    strategy: {
                        type: 'string',
                        enum: ['least-crowded', 'random', 'balanced'],
                        description: 'Strategi pemilihan block'
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'calculate_ev',
            description: 'Hitung Expected Value (EV) untuk deploy ETH di MineBean',
            parameters: {
                type: 'object',
                properties: {
                    amount_eth: {
                        type: 'string',
                        description: 'Jumlah ETH yang akan di-deploy, contoh: 0.001'
                    }
                },
                required: ['amount_eth']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_airdrops',
            description: 'Tampilkan daftar semua airdrop yang tersedia',
            parameters: { type: 'object', properties: {}, required: [] }
        }
    },
    {
        type: 'function',
        function: {
            name: 'learn_airdrop_from_url',
            description: 'Pelajari dan analisis airdrop dari sebuah URL/link',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'URL airdrop yang akan dipelajari' }
                },
                required: ['url']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'autofill_airdrop_form',
            description: 'Otomatis isi dan submit form airdrop dari URL',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'URL form airdrop' }
                },
                required: ['url']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'update_profile',
            description: 'Update profil user: twitter, telegram, discord, email, wallet',
            parameters: {
                type: 'object',
                properties: {
                    field: {
                        type: 'string',
                        enum: ['twitter', 'telegram', 'discord', 'email', 'wallet', 'firstName'],
                        description: 'Field profil yang akan diupdate'
                    },
                    value: { type: 'string', description: 'Nilai baru untuk field tersebut' }
                },
                required: ['field', 'value']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'show_profile',
            description: 'Tampilkan profil lengkap user',
            parameters: { type: 'object', properties: {}, required: [] }
        }
    },
    {
        type: 'function',
        function: {
            name: 'verify_task',
            description: 'Tandai task airdrop sudah selesai dikerjakan',
            parameters: {
                type: 'object',
                properties: {
                    airdrop_id: { type: 'string', description: 'ID airdrop' },
                    task_type: {
                        type: 'string',
                        enum: ['twitter', 'telegram', 'discord', 'form', 'wallet'],
                        description: 'Jenis task yang sudah selesai'
                    }
                },
                required: ['task_type']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'check_progress',
            description: 'Cek progress airdrop user secara keseluruhan',
            parameters: { type: 'object', properties: {}, required: [] }
        }
    },
    {
        type: 'function',
        function: {
            name: 'reset_conversation',
            description: 'Reset/hapus riwayat percakapan dan mulai baru',
            parameters: { type: 'object', properties: {}, required: [] }
        }
    },
    {
        type: 'function',
        function: {
            name: 'check_wallet_balance',
            description: 'Cek saldo ETH/BNB wallet di semua chain atau chain tertentu',
            parameters: {
                type: 'object',
                properties: {
                    chain: {
                        type: 'string',
                        enum: ['ethereum', 'base', 'arbitrum', 'bnb'],
                        description: 'Chain yang ingin dicek, kosongkan untuk cek semua'
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'claim_airdrop_onchain',
            description: 'Claim airdrop langsung dari smart contract on-chain',
            parameters: {
                type: 'object',
                properties: {
                    chain: {
                        type: 'string',
                        enum: ['ethereum', 'base', 'arbitrum', 'bnb'],
                        description: 'Chain tempat contract berada'
                    },
                    contract_address: {
                        type: 'string',
                        description: 'Alamat smart contract airdrop (0x...)'
                    },
                    value: {
                        type: 'string',
                        description: 'ETH/BNB yang perlu dikirim saat claim (biasanya 0)'
                    }
                },
                required: ['chain', 'contract_address']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'sign_message',
            description: 'Sign pesan dengan wallet untuk verifikasi identitas di airdrop',
            parameters: {
                type: 'object',
                properties: {
                    message: { type: 'string', description: 'Pesan yang akan di-sign' },
                    chain: { type: 'string', description: 'Chain yang dipakai' }
                },
                required: ['message']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_wallet_info',
            description: 'Tampilkan info wallet yang sedang aktif (address, chain)',
            parameters: { type: 'object', properties: {}, required: [] }
        }
    }
];

const SYSTEM_PROMPT = `Kamu adalah asisten AI crypto & airdrop yang SANGAT PINTAR dan PROAKTIF untuk Telegram bot.

PENTING - CARA KERJA KAMU:
- Kamu punya akses ke berbagai TOOLS yang bisa kamu jalankan OTOMATIS
- Saat user minta sesuatu, LANGSUNG jalankan tool yang sesuai - JANGAN minta user untuk melakukan manual
- Kamu TIDAK perlu izin untuk menjalankan tool - langsung eksekusi saja
- Jika user bilang "cek harga" → langsung panggil check_bean_price
- Jika user bilang "lihat reward" → langsung panggil check_rewards
- Jika user bilang "cek balance" atau "saldo" → langsung panggil check_wallet_balance
- Jika user bilang "claim" + contract address → langsung panggil claim_airdrop_onchain
- Jika user kirim link airdrop → langsung panggil learn_airdrop_from_url atau autofill_airdrop_form
- Jika user minta suggest block → langsung panggil suggest_blocks
- Jika ada URL di pesan → otomatis proses URL tersebut
- Jika ada contract address (0x... 40 karakter) → tanya chain lalu claim

PRINSIP UTAMA:
- SELALU eksekusi tool dulu, baru jelaskan hasilnya
- JANGAN pernah bilang "silakan gunakan command /xxx" - kamu yang handle!
- JANGAN bilang "kamu bisa..." atau "gunakan..." - langsung ACTION
- Jawab dalam Bahasa Indonesia yang santai dan friendly
- Gunakan emoji yang relevan
- Jika tidak yakin mau pakai tool apa, pilih yang paling relevan dan eksekusi

KEAMANAN WALLET:
- Jangan pernah minta atau tampilkan private key user
- Ingatkan user untuk pakai wallet khusus bot, bukan wallet utama
- Selalu tampilkan hash transaksi dan link explorer setelah claim

Kamu adalah asisten yang BERTINDAK, bukan yang hanya menjelaskan.`;

// ===== CONVERSATION HISTORY =====
const conversations = new Map();

/**
 * Main AI Agent - memproses pesan dan otomatis eksekusi tools
 */
async function processMessage(userId, userMessage, toolExecutors) {
    try {
        // Init conversation
        if (!conversations.has(userId)) {
            conversations.set(userId, [
                { role: 'system', content: SYSTEM_PROMPT }
            ]);
        }

        const history = conversations.get(userId);
        history.push({ role: 'user', content: userMessage });

        // Trim history
        if (history.length > 20) {
            const system = history[0];
            conversations.set(userId, [system, ...history.slice(-19)]);
        }

        // Step 1: Kirim ke AI dengan tools
        console.log(`🤖 AI Agent processing: "${userMessage.substring(0, 50)}..."`);

        const response = await groq.chat.completions.create({
            model: process.env.GROQ_MODEL || 'llama-3.1-70b-versatile',
            messages: conversations.get(userId),
            tools: TOOLS,
            tool_choice: 'auto',
            max_tokens: 1500,
            temperature: 0.3,
        });

        const assistantMessage = response.choices[0].message;
        conversations.get(userId).push(assistantMessage);

        // Step 2: Cek apakah AI ingin panggil tool
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
            console.log(`🔧 AI wants to call ${assistantMessage.tool_calls.length} tool(s)`);

            const toolResults = [];

            // Eksekusi semua tool calls
            for (const toolCall of assistantMessage.tool_calls) {
                const toolName = toolCall.function.name;
                let toolArgs = {};

                try {
                    toolArgs = JSON.parse(toolCall.function.arguments || '{}');
                } catch (e) {
                    toolArgs = {};
                }

                console.log(`⚙️ Executing tool: ${toolName}`, toolArgs);

                // Jalankan tool executor
                let result = '❌ Tool tidak tersedia';
                if (toolExecutors && toolExecutors[toolName]) {
                    try {
                        result = await toolExecutors[toolName](toolArgs);
                    } catch (err) {
                        result = `❌ Error: ${err.message}`;
                        console.error(`Tool ${toolName} error:`, err);
                    }
                }

                toolResults.push({
                    tool_call_id: toolCall.id,
                    role: 'tool',
                    content: typeof result === 'string' ? result : JSON.stringify(result)
                });
            }

            // Tambah hasil tool ke history
            for (const r of toolResults) {
                conversations.get(userId).push(r);
            }

            // Step 3: Minta AI buat respons final berdasarkan hasil tool
            const finalResponse = await groq.chat.completions.create({
                model: process.env.GROQ_MODEL || 'llama-3.1-70b-versatile',
                messages: conversations.get(userId),
                max_tokens: 1500,
                temperature: 0.5,
            });

            const finalMessage = finalResponse.choices[0].message;
            conversations.get(userId).push(finalMessage);

            return {
                text: finalMessage.content,
                toolsUsed: assistantMessage.tool_calls.map(t => t.function.name)
            };
        }

        // Tidak ada tool call → respons teks biasa
        return {
            text: assistantMessage.content,
            toolsUsed: []
        };

    } catch (error) {
        console.error('❌ AI Agent error:', error.message);

        if (error.status === 401) return { text: '❌ API Key tidak valid. Hubungi admin.' };
        if (error.status === 429) return { text: '⏳ Rate limit. Tunggu sebentar ya.' };

        return { text: `❌ Error: ${error.message}` };
    }
}

function resetConversation(userId) {
    conversations.delete(userId);
    return '🔄 Percakapan direset!';
}

function getStats(userId) {
    const history = conversations.get(userId);
    if (!history) return 'Belum ada percakapan.';
    return `📊 ${history.filter(m => m.role === 'user').length} pesan user, ${history.filter(m => m.role === 'assistant').length} respons AI`;
}

function clearAllConversations() {
    const count = conversations.size;
    conversations.clear();
    return `✅ Cleared ${count} conversations.`;
}

async function testConnection() {
    try {
        await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 10
        });
        return { success: true, message: 'Groq AI Agent connected!' };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

module.exports = { processMessage, resetConversation, getStats, clearAllConversations, testConnection };