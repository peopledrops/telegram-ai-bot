// nl-command-parser.js - Natural Language Command Parser
require('dotenv').config();
const { OpenAI } = require('openai');

// Initialize Groq client
const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1'
});

// Intent definitions - mapping natural language to bot functions
const INTENTS = {
    // Airdrop automation
    'autofill_airdrop': {
        keywords: ['kerjakan', 'isi', 'submit', 'claim', 'daftar', 'register', 'auto', 'otomatis'],
        entities: ['url', 'airdrop_name', 'platform'],
        handler: 'executeAutofill',
        description: 'Auto-fill and submit airdrop form',
        examples: [
            'kerjakan airdrop probechain',
            'isi form airdrop ini https://example.com/airdrop',
            'claim airdrop zealy dong',
            'auto submit untuk link ini'
        ]
    },
    
    // Learn airdrop from link
    'learn_airdrop': {
        keywords: ['pelajari', 'analyze', 'cek', 'lihat', 'scan', 'baca'],
        entities: ['url'],
        handler: 'executeLearn',
        description: 'Learn/analyze airdrop from URL',
        examples: [
            'pelajari airdrop dari link ini',
            'cek airdrop https://galxe.com/quest/xxx',
            'analyze ini dong'
        ]
    },
    
    // Track/verify task
    'verify_task': {
        keywords: ['selesai', 'done', 'verify', 'tandai', 'sudah', 'finish'],
        entities: ['task_type', 'airdrop_name'],
        handler: 'executeVerify',
        description: 'Mark a task as completed',
        examples: [
            'sudah follow twitter-nya',
            'tandai discord sudah join',
            'verify task telegram done'
        ]
    },
    
    // Check status/progress
    'check_status': {
        keywords: ['status', 'progress', 'berapa', 'sudah', 'belum', 'cek'],
        entities: ['airdrop_name'],
        handler: 'executeStatus',
        description: 'Check airdrop progress/status',
        examples: [
            'berapa progress airdrop saya',
            'cek status probechain',
            'sudah selesai belum airdrop-nya'
        ]
    },
    
    // Set/update profile
    'update_profile': {
        keywords: ['set', 'ganti', 'update', 'ubah', 'simpan', 'profile'],
        entities: ['field', 'value'],
        handler: 'executeProfileUpdate',
        description: 'Update user social media profile',
        examples: [
            'ganti twitter username jadi @newuser',
            'set wallet address 0x123...',
            'update discord tag saya'
        ]
    },
    
    // General question/help
    'general_question': {
        keywords: ['apa', 'bagaimana', 'cara', 'bantu', 'help', 'info'],
        entities: ['topic'],
        handler: 'executeGeneralResponse',
        description: 'Answer general questions about airdrops',
        examples: [
            'cara ikut airdrop gimana',
            'apa itu probechain',
            'bantu saya ikut airdrop'
        ]
    }
};

// Entity extractors
const ENTITY_PATTERNS = {
    url: /https?:\/\/[^\s]+/gi,
    airdrop_name: /(?:airdrop\s+)?([a-z0-9\-_]+(?:\s+[a-z0-9\-_]+)*)/gi,
    twitter: /@?([a-z0-9_]{3,15})/i,
    telegram: /@?([a-z0-9_]{5,32})/i,
    discord: /([a-z0-9_]{2,32}#\d{4}|[a-z0-9_]{2,32})/i,
    wallet: /0x[a-fA-F0-9]{40}/i,
    email: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i
};

class NLCommandParser {
    constructor() {
        this.conversationHistory = new Map();
    }

    /**
     * Parse natural language message and return structured command
     */
    /**
 * Parse natural language message - MULTI-INTENT VERSION
 */
async parse(message, userId, context = {}) {
    console.log(`🧠 Parsing: "${message}" for user ${userId}`);
    
    const intents = [];
    
    // 1. Extract ALL entities first
    const entities = this.extractAllEntities(message);
    console.log('📦 Extracted entities:', entities);
    
    // 2. Check for profile update intent (before URL-based intents)
    const profileUpdate = this.detectProfileUpdateIntent(message, entities);
    if (profileUpdate) {
        intents.push(profileUpdate);
    }
    
    // 3. Check for URL-based intents
    if (entities.url) {
        // Check keywords for autofill vs learn
        const lower = message.toLowerCase();
        if (lower.includes('kerjakan') || lower.includes('isi') || lower.includes('submit') || lower.includes('claim') || lower.includes('daftar')) {
            intents.push({
                intent: 'autofill_airdrop',
                confidence: 0.9,
                entities: { url: entities.url, ...entities },
                handler: 'executeAutofill',
                naturalResponse: `🚀 Oke, saya akan kerjakan airdrop di ${this.shortenUrl(entities.url)} untuk Anda. Tunggu sebentar ya...`
            });
        } else if (lower.includes('pelajari') || lower.includes('analyze') || lower.includes('cek') || lower.includes('lihat')) {
            intents.push({
                intent: 'learn_airdrop',
                confidence: 0.9,
                entities: { url: entities.url },
                handler: 'executeLearn',
                naturalResponse: `🔍 Sedang menganalisis airdrop di ${this.shortenUrl(entities.url)}...`
            });
        }
    }
    
    // 4. Check for task verification
    const verifyIntent = this.detectVerifyIntent(message, entities);
    if (verifyIntent) {
        intents.push(verifyIntent);
    }
    
    // 5. If no specific intent found, use AI for complex parsing
    if (intents.length === 0) {
        const aiParsed = await this.parseWithAI(message, userId, context);
        intents.push(aiParsed);
    }
    
    // 6. Return ALL intents (or combine them)
    console.log(`✅ Detected ${intents.length} intent(s):`, intents.map(i => i.intent));
    
    // If multiple intents, prioritize profile update first, then action
    if (intents.length > 1) {
        // Execute profile update first, then the main action
        const profileIntent = intents.find(i => i.intent === 'update_profile');
        const actionIntent = intents.find(i => i.intent !== 'update_profile');
        
        if (profileIntent && actionIntent) {
            // Chain them: update profile first, then execute action
            return {
                ...actionIntent,
                chainBefore: profileIntent, // Execute this first
                naturalResponse: `${profileIntent.naturalResponse} ${actionIntent.naturalResponse}`
            };
        }
    }
    
    return intents[0] || this.fallbackResponse(message);
}

/**
 * Extract ALL entities from message
 */
extractAllEntities(message) {
    const entities = {};
    
    // URL
    const urls = message.match(/https?:\/\/[^\s]+/gi);
    if (urls && urls.length > 0) {
        entities.url = urls[0];
    }
    
    // Twitter/X username (with @ or without)
    const twitterPatterns = [
        /(?:twitter|x)\s+(?:username\s+)?[@:]?\s*([a-z0-9_]+)/gi,
        /@([a-z0-9_]{3,15})(?=\s|$)/gi
    ];
    for (const pattern of twitterPatterns) {
        const match = message.match(pattern);
        if (match) {
            entities.twitter = match[0].replace(/[@:\s]/g, '');
            break;
        }
    }
    
    // Telegram username
    const telegramPatterns = [
        /(?:telegram|tg|galxe)\s+(?:username\s+)?[@:]?\s*([a-z0-9_]+)/gi,
        /@([a-z0-9_]{5,32})(?=\s|$)/gi
    ];
    for (const pattern of telegramPatterns) {
        const match = message.match(pattern);
        if (match) {
            entities.telegram = match[0].replace(/[@:\s]/g, '');
            break;
        }
    }
    
    // Discord
    const discordMatch = message.match(/(?:discord)\s+(?:username|tag)?\s*[@:]?\s*([a-z0-9_#]+)/i);
    if (discordMatch) {
        entities.discord = discordMatch[1];
    }
    
    // Wallet
    const walletMatch = message.match(/0x[a-fA-F0-9]{40}/i);
    if (walletMatch) {
        entities.wallet = walletMatch[0];
    }
    
    // Email
    const emailMatch = message.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    if (emailMatch) {
        entities.email = emailMatch[0];
    }
    
    return entities;
}

/**
 * Detect profile update intent
 */
detectProfileUpdateIntent(message, entities) {
    const lower = message.toLowerCase();
    
    // Patterns for "isi [field] dengan [value]" or "set [field] [value]"
    const updatePatterns = [
        /(?:isi|set|ganti|update|ubah|simpan)\s+(twitter|x|telegram|tg|galxe|discord|email|wallet|nama|name)\s+(?:dengan|to|be|:|=)?\s*([@\w.]+)/i,
        /(?:twitter|x|telegram|tg|galxe|discord|email|wallet)\s+(?:username|address)?\s*(?:adalah|yaitu|:|=)?\s*([@\w.0x]+)/i
    ];
    
    for (const pattern of updatePatterns) {
        const match = message.match(pattern);
        if (match) {
            const fieldKeyword = match[1]?.toLowerCase() || '';
            const value = match[2]?.trim();
            
            // Map field keyword to actual field name
            let field = null;
            if (['twitter', 'x'].includes(fieldKeyword)) field = 'twitter';
            else if (['telegram', 'tg', 'galxe'].includes(fieldKeyword)) field = 'telegram';
            else if (fieldKeyword === 'discord') field = 'discord';
            else if (fieldKeyword === 'email') field = 'email';
            else if (fieldKeyword === 'wallet') field = 'wallet';
            else if (['nama', 'name'].includes(fieldKeyword)) field = 'firstName';
            
            if (field && value) {
                // Clean value (remove @ prefix for usernames)
                const cleanValue = value.replace(/^@/, '');
                
                return {
                    intent: 'update_profile',
                    confidence: 0.95,
                    entities: { field, value: cleanValue },
                    handler: 'executeProfileUpdate',
                    naturalResponse: `✅ ${field} sudah di-update jadi \`${cleanValue}\`!`
                };
            }
        }
    }
    
    return null;
}

/**
 * Detect task verification intent
 */
detectVerifyIntent(message, entities) {
    const lower = message.toLowerCase();
    
    if (INTENTS.verify_task.keywords.some(k => lower.includes(k))) {
        const taskType = this.extractTaskType(lower);
        return {
            intent: 'verify_task',
            confidence: 0.8,
            entities: { task_type: taskType, ...entities },
            handler: 'executeVerify',
            naturalResponse: `✅ Oke, saya tandai task ${taskType} sudah selesai! 🎉`
        };
    }
    
    return null;
}
    /**
     * Parse with AI for complex/natural language
     */
    async parseWithAI(message, userId, context) {
        try {
            const prompt = this.buildPrompt(message, context);
            
            const response = await groq.chat.completions.create({
                model: 'llama-3.1-8b-instant',
                messages: [
                    { role: 'system', content: 'You are a JSON-only assistant. Return ONLY valid JSON.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.1,
                max_tokens: 500
            });
            
            const aiResponse = response.choices[0].message.content;
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
            
            if (!jsonMatch) {
                console.warn('⚠️ AI response not valid JSON');
                return this.fallbackResponse(message);
            }
            
            const parsed = JSON.parse(jsonMatch[0]);
            
            // Validate and enhance result
            return {
                intent: parsed.intent || 'general_question',
                confidence: parsed.confidence || 0.7,
                entities: parsed.entities || {},
                handler: INTENTS[parsed.intent]?.handler || 'executeGeneralResponse',
                naturalResponse: parsed.naturalResponse || this.generateNaturalResponse(parsed, message),
                _raw: parsed
            };
            
        } catch (error) {
            console.error('❌ AI parsing error:', error.message);
            return this.fallbackResponse(message);
        }
    }

    /**
     * Build prompt for AI parsing
     */
    buildPrompt(message, context) {
        const intentsList = Object.entries(INTENTS).map(([key, val]) => 
            `- ${key}: ${val.description}\n  Keywords: ${val.keywords.join(', ')}\n  Entities: ${val.entities.join(', ')}`
        ).join('\n');
        
        return `
You are an intent parser for an airdrop Telegram bot.

User message: "${message}"
${context.previousIntent ? `Previous intent: ${context.previousIntent}` : ''}
${context.extractedUrl ? `Context URL: ${context.extractedUrl}` : ''}

Available intents:
${intentsList}

Extract entities using these patterns:
- url: https?://...
- airdrop_name: project name like "probechain", "zealy"
- task_type: twitter, telegram, discord, form, wallet
- profile_field: twitter, telegram, discord, email, wallet, name
- value: the actual value to set

Return ONLY valid JSON in this exact format:
{
  "intent": "intent_name_here",
  "confidence": 0.95,
  "entities": {
    "url": "https://...",
    "airdrop_name": "probechain",
    "task_type": "twitter",
    "field": "twitter",
    "value": "myusername"
  },
  "naturalResponse": "Friendly response in Indonesian to show user"
}

Rules:
- If user wants to auto-fill a form with a URL → intent: autofill_airdrop
- If user wants to analyze/learn about an airdrop → intent: learn_airdrop
- If user says they completed a task → intent: verify_task
- If user wants to update their profile → intent: update_profile
- Use Indonesian for naturalResponse
- Be concise and friendly
`;
    }

    /**
     * Fallback when AI fails
     */
    fallbackResponse(message) {
        const lower = message.toLowerCase();
        const url = message.match(ENTITY_PATTERNS.url)?.[0];
        
        if (url && (lower.includes('kerjakan') || lower.includes('isi') || lower.includes('claim'))) {
            return {
                intent: 'autofill_airdrop',
                confidence: 0.7,
                entities: { url },
                handler: 'executeAutofill',
                naturalResponse: `🚀 Saya akan coba kerjakan airdrop di ${this.shortenUrl(url)} untuk Anda...`
            };
        }
        
        return {
            intent: 'general_question',
            confidence: 0.5,
            entities: {},
            handler: 'executeGeneralResponse',
            naturalResponse: `🤔 Saya kurang paham maksudnya. Coba ketik lebih spesifik, atau gunakan command seperti /autofill <url> atau /setprofile twitter <username>`
        };
    }

    /**
     * Generate natural response from parsed result
     */
    generateNaturalResponse(parsed, originalMessage) {
        const responses = {
            'autofill_airdrop': `🚀 Oke, saya kerjakan airdrop${parsed.entities.airdrop_name ? ` ${parsed.entities.airdrop_name}` : ''} untuk Anda. Tunggu sebentar ya...`,
            'learn_airdrop': `🔍 Sedang menganalisis airdrop${parsed.entities.airdrop_name ? ` ${parsed.entities.airdrop_name}` : ''}...`,
            'verify_task': `✅ Task ${parsed.entities.task_type || 'tersebut'} sudah saya tandai selesai! 🎉`,
            'check_status': `📊 Sedang cek progress airdrop Anda...`,
            'update_profile': `✅ Profile updated! ${parsed.entities.field}: \`${parsed.entities.value}\``,
            'general_question': `🤖 ${this.getGeneralAnswer(originalMessage)}`
        };
        
        return responses[parsed.intent] || responses['general_question'];
    }

    /**
     * Get general answer for questions
     */
    getGeneralAnswer(question) {
        const answers = {
            'cara': 'Untuk ikut airdrop: 1) Set profile dengan /setprofile, 2) Kirim link airdrop, 3) Saya akan bantu auto-fill form-nya! 🚀',
            'apa itu': 'Airdrop adalah program distribusi token gratis dari project crypto untuk early supporters. Saya bantu Anda ikut airdrop dengan auto-fill form! 🪂',
            'bantu': 'Tentu! Saya bisa: 🔹 Auto-fill form airdrop 🔹 Pelajari airdrop dari link 🔹 Track progress Anda 🔹 Update profile sosial media. Mau mulai dari mana? 😊',
            'default': 'Saya adalah asisten airdrop AI! Kirim link airdrop atau ketik "kerjakan airdrop [link]" dan saya akan bantu otomatis. 🤖✨'
        };
        
        const lower = question.toLowerCase();
        for (const [key, answer] of Object.entries(answers)) {
            if (key !== 'default' && lower.includes(key)) {
                return answer;
            }
        }
        return answers['default'];
    }

    /**
     * Extract task type from message
     */
    extractTaskType(message) {
        if (message.includes('twitter') || message.includes('follow')) return 'twitter';
        if (message.includes('telegram') || message.includes('tg')) return 'telegram';
        if (message.includes('discord')) return 'discord';
        if (message.includes('form') || message.includes('submit')) return 'form';
        if (message.includes('wallet')) return 'wallet';
        return 'unknown';
    }

    /**
     * Extract profile field from message
     */
    extractProfileField(message) {
        if (message.includes('twitter') || message.includes('x.com')) return 'twitter';
        if (message.includes('telegram') || message.includes('tg')) return 'telegram';
        if (message.includes('discord')) return 'discord';
        if (message.includes('email') || message.includes('mail')) return 'email';
        if (message.includes('wallet') || message.includes('0x')) return 'wallet';
        if (message.includes('name') || message.includes('nama')) return 'firstName';
        return null;
    }

    /**
     * Extract value for profile update
     */
    extractValue(message, field) {
        // Extract based on field type
        if (field === 'wallet') {
            const match = message.match(ENTITY_PATTERNS.wallet);
            return match ? match[0] : null;
        }
        if (field === 'email') {
            const match = message.match(ENTITY_PATTERNS.email);
            return match ? match[0] : null;
        }
        
        // For usernames, extract word after field keyword
        const patterns = {
            twitter: /(?:twitter|x)\s+[@:]?\s*([a-z0-9_]+)/i,
            telegram: /(?:telegram|tg)\s+[@:]?\s*([a-z0-9_]+)/i,
            discord: /(?:discord)\s+([a-z0-9_#]+)/i,
            firstName: /(?:name|nama)\s+([a-z\s]+)/i
        };
        
        const pattern = patterns[field];
        if (pattern) {
            const match = message.match(pattern);
            return match ? match[1].trim() : null;
        }
        
        return null;
    }

    /**
     * Shorten URL for display
     */
    shortenUrl(url) {
        try {
            const hostname = new URL(url).hostname;
            return hostname.replace('www.', '');
        } catch {
            return url.substring(0, 30) + (url.length > 30 ? '...' : '');
        }
    }

    /**
     * Store conversation context
     */
    storeContext(userId, intent, entities) {
        if (!this.conversationHistory.has(userId)) {
            this.conversationHistory.set(userId, []);
        }
        
        const history = this.conversationHistory.get(userId);
        history.push({ intent, entities, timestamp: Date.now() });
        
        // Keep only last 10 messages
        if (history.length > 10) {
            history.shift();
        }
    }

    /**
     * Get recent context for user
     */
    getRecentContext(userId, limit = 3) {
        const history = this.conversationHistory.get(userId) || [];
        return history.slice(-limit);
    }
}

// Export singleton
module.exports = new NLCommandParser();