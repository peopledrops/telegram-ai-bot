// test-fix.js
require('dotenv').config({ debug: true });

console.log('\n=== ENV CHECK ===');
console.log('GROQ_API_KEY:', process.env.GROQ_API_KEY?.substring(0, 10) + '...');
console.log('Length:', process.env.GROQ_API_KEY?.length);
console.log('Has trailing space:', process.env.GROQ_API_KEY?.endsWith(' '));

console.log('\nMINEBEAN_API:', process.env.MINEBEAN_API);
console.log('Has trailing space:', process.env.MINEBEAN_API?.endsWith(' '));

console.log('\nTELEGRAM_BOT_TOKEN:', process.env.TELEGRAM_BOT_TOKEN ? '✅ SET' : '❌ NOT SET');
console.log('=================\n');

// Quick API test
if (process.env.GROQ_API_KEY && !process.env.GROQ_API_KEY.endsWith(' ')) {
    const OpenAI = require('openai');
    const groq = new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1',
    });
    
    groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10
    }).then(res => {
        console.log('✅ Groq API: SUCCESS!');
        console.log('Response:', res.choices[0].message.content);
    }).catch(err => {
        console.log('❌ Groq API:', err.message);
    });
}