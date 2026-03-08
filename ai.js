// ai.js
require('dotenv').config();
const OpenAI = require('openai');

// Groq API kompatibel dengan OpenAI SDK - cukup ganti baseURL!
const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',  // ← Groq endpoint
});

const SYSTEM_PROMPT = `
Anda adalah asisten AI crypto & airdrop yang helpful di Telegram.

🎯 **Tugas Anda:**
- Bantu user dengan pertanyaan tentang airdrop crypto
- Berikan informasi umum tentang project blockchain
- Jawab pertanyaan teknis tentang cara ikut airdrop
- Bantu troubleshoot masalah form/claim airdrop
- Bersikap friendly, helpful, dan informatif

✅ **Yang BOLEH dibahas:**
- Cara ikut airdrop yang legitimate
- Informasi project crypto & blockchain
- Tutorial wallet, MetaMask, dll
- Tips keamanan dalam crypto
- Informasi teknis airdrop

❌ **Yang TIDAK BOLEH:**
- Financial advice (jangan saranin beli/jual)
- Janji profit/gain
- Promosi scam/rugpull projects
- Private key/seed phrase (JANGAN PERNAH minta!)

💡 **Guidelines:**
- Selalu disclaimer: "DYOR - Do Your Own Research"
- Arahkan ke official website untuk info akurat
- Jika tidak yakin, katakan "saya kurang tahu"
- Gunakan bahasa Indonesia yang santai & friendly

Anda di sini untuk MEMBANTU user, bukan menolak! 😊
`;

// Memory per user (conversation history)
const conversations = new Map();

/**
 * Kirim pesan ke Groq AI
 * @param {string} userId - ID user Telegram  
 * @param {string} message - Pesan user
 * @returns {Promise<string>} - Response AI
 */
async function chat(userId, message) {
    try {
        // Init conversation jika belum ada
        if (!conversations.has(userId)) {
            conversations.set(userId, [
                { role: 'system', content: SYSTEM_PROMPT }
            ]);
        }
        
        const history = conversations.get(userId);
        
        // Add user message
        history.push({ role: 'user', content: message });
        
        // Limit history (keep system + last 9 messages)
        if (history.length > 10) {
            const system = history[0];
            const recent = history.slice(-9);
            conversations.set(userId, [system, ...recent]);
        }
        
        // Call Groq API
        const response = await groq.chat.completions.create({
            model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
            messages: conversations.get(userId),
            max_tokens: 1000,
            temperature: 0.7,
            // Groq-specific: fast inference
            stream: false,
        });
        
        const aiResponse = response.choices[0].message.content;
        
        // Add AI response to history
        conversations.get(userId).push({ role: 'assistant', content: aiResponse });
        
        return aiResponse;
        
    } catch (error) {
        console.error('❌ Groq AI Error:', error.message);
        
        // Handle specific errors
        if (error.status === 401) {
            return '❌ Error: API Key tidak valid. Hubungi admin.';
        } else if (error.status === 429) {
            return '⏳ Rate limit. Tunggu sebentar dan coba lagi.';
        } else if (error.status === 500) {
            return '🔧 Server Groq sedang gangguan. Coba lagi nanti.';
        } else if (error.code === 'insufficient_quota') {
            return '💸 Kuota Groq habis. Hubungi admin untuk top-up.';
        }
        
        return `❌ Error: ${error.message}`;
    }
}

/**
 * Reset conversation untuk user
 */
function resetConversation(userId) {
    conversations.delete(userId);
    return '🔄 Percakapan direset!';
}

/**
 * Get conversation stats
 */
function getStats(userId) {
    const history = conversations.get(userId);
    if (!history) return 'Belum ada percakapan.';
    
    const userMsgs = history.filter(m => m.role === 'user').length;
    const aiMsgs = history.filter(m => m.role === 'assistant').length;
    
    return `📊 Stats:
- Total messages: ${history.length}
- Your messages: ${userMsgs}
- AI responses: ${aiMsgs}
- Model: ${process.env.GROQ_MODEL || 'llama-3.1-8b-instant'}`;
}

/**
 * Clear all conversations (admin)
 */
function clearAllConversations() {
    const count = conversations.size;
    conversations.clear();
    return `✅ Cleared ${count} conversations.`;
}

/**
 * Test Groq connection
 */
async function testConnection() {
    try {
        const response = await groq.chat.completions.create({
            model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 10
        });
        return { success: true, message: 'Groq API connected!' };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

module.exports = {
    chat,
    resetConversation,
    getStats,
    clearAllConversations,
    testConnection,
};