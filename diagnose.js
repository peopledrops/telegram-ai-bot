// diagnose.js
console.log('🔍 DIAGNOSTIC REPORT\n');

console.log('1. Node.js version:', process.version);
console.log('2. Working directory:', process.cwd());
console.log('3. Platform:', process.platform);

// Check files
const fs = require('fs');
const files = ['index.js', 'bot.js', 'ai.js', 'minebean.js', '.env', 'package.json'];
console.log('\n4. Files check:');
files.forEach(f => {
    const exists = fs.existsSync(f);
    console.log(`   ${exists ? '✅' : '❌'} ${f}`);
});

// Check .env content
console.log('\n5. .env content:');
if (fs.existsSync('.env')) {
    const content = fs.readFileSync('.env', 'utf8');
    content.split('\n').forEach(line => {
        if (line.trim() && !line.startsWith('#')) {
            const [key] = line.split('=');
            console.log(`   ${key}: ${process.env[key] ? '✅ loaded' : '❌ not loaded'}`);
        }
    });
}

// Try require modules
console.log('\n6. Module imports:');
const modules = ['openai', 'node-telegram-bot-api', 'ethers', 'axios', 'ws', './minebean'];
modules.forEach(mod => {
    try {
        require(mod);
        console.log(`   ✅ ${mod}`);
    } catch (e) {
        console.log(`   ❌ ${mod}: ${e.message}`);
    }
});

console.log('\n🏁 Diagnostic complete!');