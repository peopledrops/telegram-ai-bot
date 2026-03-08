// ai.js
require('dotenv').config();
const OpenAI = require('openai');

// Groq API kompatibel dengan OpenAI SDK - cukup ganti baseURL!
const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',  // ← Groq endpoint
});

// ai.js - System Prompt yang Powerful tapi Responsible
const SYSTEM_PROMPT = `
Anda adalah asisten AI crypto & airdrop expert di Telegram.

🎯 **TUGAS UTAMA:**
- Bantu user memahami & ikut airdrop crypto yang legitimate
- Jelaskan konsep blockchain, DeFi, NFT dengan bahasa sederhana
- Bantu troubleshoot masalah teknis (wallet, form, claim)
- Berikan informasi project berdasarkan data publik & official source
- Jawab pertanyaan teknis coding untuk bot development

✅ **ANDA BOLEH & DIDORONG UNTUK:**
- Jelaskan cara kerja smart contract (educational)
- Berikan tutorial MetaMask, wallet setup, security best practices
- Analisis tokenomics berdasarkan whitepaper resmi
- Bantu debug code JavaScript/Node.js untuk bot
- Sarankan strategi airdrop hunting yang sustainable
- Terjemahkan dokumentasi teknis ke bahasa Indonesia

❌ **ANDA HARUS MENOLAK DENGAN SOPAN:**
- Minta private key, seed phrase, atau credential sensitif
- Buat scam message, phishing template, atau fake announcement
- Sarankan investasi dengan janji profit pasti ("financial advice")
- Generate code untuk exploit, hack, atau manipulasi
- Bantu aktivitas illegal, fraud, atau money laundering

💡 **GUIDELINES RESPONSE:**
- Selalu disclaimer: "DYOR - Do Your Own Research"
- Arahkan ke official website/docs untuk info akurat
- Jika tidak yakin: "Saya kurang tahu, cek official source ya"
- Gunakan bahasa Indonesia santai + emoji untuk friendly vibe
- Prioritaskan keamanan user di atas segalanya

Anda di sini untuk MEMBERDAYAKAN user, bukan membatasi — 
dengan tanggung jawab. 🤝✨
`;


// Di fungsi chat():
const { searchKnowledge } = require('./knowledge-base');

// Sebelum kirim ke Groq, cek knowledge base dulu
const kbResult = searchKnowledge(userMessage);
if (kbResult) {
  // Inject knowledge ke prompt
  const enhancedPrompt = `
Context from knowledge base:
${JSON.stringify(kbResult, null, 2)}

User question: ${userMessage}

Jawab berdasarkan context di atas + pengetahuan umum Anda.
`;
  // Gunakan enhancedPrompt untuk API call
}


// Di ai.js, tambahkan:
const userContexts = new Map();

function getUserContext(userId, maxMessages = 10) {
  if (!userContexts.has(userId)) {
    userContexts.set(userId, []);
  }
  
  const context = userContexts.get(userId);
  
  return context
    .slice(-maxMessages)
    .map(msg => `${msg.role}: ${msg.content}`)
    .join('\n');
}

function saveUserMessage(userId, role, content) {
  if (!userContexts.has(userId)) {
    userContexts.set(userId, []);
  }
  
  const context = userContexts.get(userId);
  context.push({ role, content, timestamp: Date.now() });
  
  // Keep only last 20 messages
  if (context.length > 20) {
    context.shift();
  }
}

// Di fungsi chat():
saveUserMessage(userId, 'user', userMessage);
const context = getUserContext(userId);

// Inject context ke prompt
const promptWithContext = `
Recent conversation:
${context}

Current question: ${userMessage}

Jawab dengan mempertimbangkan konteks percakapan di atas.
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