// index.js
require('dotenv').config();

console.log('╔════════════════════════════════════════╗');
console.log('║   ⚡ GROQ AI TELEGRAM BOT v1.0         ║');
console.log('║   Super Fast AI Powered by Groq       ║');
console.log('╚════════════════════════════════════════╝\n');

// Validate env vars
const required = ['GROQ_API_KEY', 'TELEGRAM_BOT_TOKEN'];
const missing = required.filter(key => !process.env[key]);

if (missing.length > 0) {
    console.error('❌ Missing environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\n📝 Check your .env file or Railway Variables!');
    process.exit(1);
}

console.log('✅ Environment loaded');

// 🔍 Debug: Show which env vars are actually loaded
console.log('🔍 Debug env vars:');
console.log('   GROQ_API_KEY:', process.env.GROQ_API_KEY ? '✅ Set' : '❌ Missing');
console.log('   TELEGRAM_BOT_TOKEN:', process.env.TELEGRAM_BOT_TOKEN ? '✅ Set' : '❌ Missing');
console.log('   MINEBEAN_API:', process.env.MINEBEAN_API ? '✅ Set' : '❌ Missing');
console.log('   BASE_RPC:', process.env.BASE_RPC ? '✅ Set' : '❌ Missing');
console.log('   TELEGRAM_ADMIN_ID:', process.env.TELEGRAM_ADMIN_ID ? '✅ Set' : '❌ Missing');

// Test Groq connection
async function testGroq() {
    try {
        const { OpenAI } = require('openai');
        const groq = new OpenAI({
            apiKey: process.env.GROQ_API_KEY,
            baseURL: 'https://api.groq.com/openai/v1',  // ✅ FIXED: No trailing spaces!
        });
        
        console.log('🧪 Testing Groq API...');
        const start = Date.now();
        
        const response = await groq.chat.completions.create({
            model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 10,
        });
        
        const latency = Date.now() - start;
        console.log(`✅ Groq API OK! (${latency}ms)`);
        console.log(`   Response: ${response.choices[0].message.content}`);
        return true;
        
    } catch (error) {
        console.error('❌ Groq API failed:', error.message);
        if (error.status === 401) {
            console.error('   💡 Check your GROQ_API_KEY at https://console.groq.com/keys');
        }
        return false;
    }
}

// Start bot
async function start() {
    const groqOk = await testGroq();
    if (!groqOk) {
        console.error('\n⚠️  Groq connection failed. Bot may not work.');
        console.error('   Check GROQ_API_KEY in Railway Variables\n');
    }
    
    console.log('\n🚀 Starting Telegram Bot...\n');
    
    try {
        require('./bot');
        console.log('✅ Bot running! Press Ctrl+C to stop.\n');
    } catch (error) {
        console.error('❌ Failed to start bot:', error.message);
        process.exit(1);
    }
}

start();