// debug-kimi.js
require('dotenv').config();
const https = require('https');

const API_KEY = process.env.KIMI_API_KEY;

console.log('╔════════════════════════════════════════╗');
console.log('║   🔧 KIMI API DEBUGGER - COMPREHENSIVE ║');
console.log('╚════════════════════════════════════════╝\n');

console.log('📋 Info:');
console.log('   API Key length:', API_KEY?.length || 0);
console.log('   API Key prefix:', API_KEY?.substring(0, 10) + '...');
console.log('');

// Test configurations to try
const configs = [
    {
        name: 'Config 1: Standard Moonshot',
        hostname: 'api.moonshot.cn',
        path: '/v1/chat/completions',
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
        }
    },
    {
        name: 'Config 2: Moonshot with User-Agent',
        hostname: 'api.moonshot.cn',
        path: '/v1/chat/completions',
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
            'User-Agent': 'TelegramBot/1.0'
        }
    },
    {
        name: 'Config 3: Alternative Domain',
        hostname: 'api.moonshot.ai',
        path: '/v1/chat/completions',
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
        }
    },
    {
        name: 'Config 4: No /v1 prefix',
        hostname: 'api.moonshot.cn',
        path: '/chat/completions',
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
        }
    },
    {
        name: 'Config 5: Auth as query param',
        hostname: 'api.moonshot.cn',
        path: `/v1/chat/completions?key=${API_KEY}`,
        headers: {
            'Content-Type': 'application/json'
        }
    }
];

const models = [
    'moonshot-v1-8k',
    'moonshot-v1-32k', 
    'moonshot-v1-128k',
    'kimi-latest'
];

const testBody = {
    model: 'moonshot-v1-8k',  // Will be overridden per test
    messages: [
        { role: 'user', content: 'Hi' }
    ],
    max_tokens: 20,
    temperature: 0.3
};

function makeRequest(config, model) {
    return new Promise((resolve, reject) => {
        const body = { ...testBody, model };
        const data = JSON.stringify(body);
        
        const options = {
            hostname: config.hostname,
            path: config.path,
            method: 'POST',
            headers: {
                ...config.headers,
                'Content-Length': data.length
            }
        };
        
        console.log(`\n📡 Testing: ${config.name}`);
        console.log(`   URL: https://${config.hostname}${config.path}`);
        console.log(`   Model: ${model}`);
        
        const req = https.request(options, (res) => {
            let responseData = '';
            
            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
                const result = {
                    config: config.name,
                    model,
                    status: res.statusCode,
                    headers: res.headers,
                    body: responseData
                };
                
                if (res.statusCode === 200) {
                    console.log(`   ✅ SUCCESS (200)`);
                    try {
                        const parsed = JSON.parse(responseData);
                        console.log(`   Response: ${parsed.choices?.[0]?.message?.content?.substring(0, 100)}`);
                    } catch {
                        console.log(`   Raw: ${responseData.substring(0, 100)}`);
                    }
                    resolve(result);
                } else {
                    console.log(`   ❌ HTTP ${res.statusCode}`);
                    try {
                        const parsed = JSON.parse(responseData);
                        console.log(`   Error: ${parsed.error?.message || JSON.stringify(parsed)}`);
                    } catch {
                        console.log(`   Raw: ${responseData.substring(0, 200)}`);
                    }
                    resolve(result); // Resolve anyway to continue testing
                }
            });
        });
        
        req.on('error', (err) => {
            console.log(`   ❌ Network Error: ${err.message}`);
            resolve({ config: config.name, model, error: err.message });
        });
        
        req.write(data);
        req.end();
    });
}

async function runAllTests() {
    const results = [];
    
    for (const config of configs) {
        for (const model of models) {
            const result = await makeRequest(config, model);
            results.push(result);
            
            // If we found a working config, we can stop early
            if (result.status === 200) {
                console.log(`\n🎉 FOUND WORKING CONFIG!`);
                console.log(`   Config: ${config.name}`);
                console.log(`   Model: ${model}`);
                console.log(`\n💡 Use this configuration in your ai.js file!`);
                return results;
            }
            
            // Small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 500));
        }
    }
    
    console.log(`\n⚠️  No configuration worked. See results above.`);
    console.log(`\n📋 Next steps:`);
    console.log(`   1. Check if API key is valid at https://platform.moonshot.cn`);
    console.log(`   2. Check if you have quota/credits remaining`);
    console.log(`   3. Check if your region is supported`);
    console.log(`   4. Contact Kimi/Moonshot support`);
    
    return results;
}

// Run tests
runAllTests().then(results => {
    console.log(`\n🏁 Debug complete. Tested ${results.length} configurations.`);
    
    // Save results to file for reference
    const fs = require('fs');
    fs.writeFileSync('kimi-debug-results.json', JSON.stringify(results, null, 2));
    console.log(`📄 Results saved to kimi-debug-results.json`);
});