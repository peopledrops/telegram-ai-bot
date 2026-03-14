// test-kimi-raw.js
require('dotenv').config();
const https = require('https');

const KIMI_API_KEY = process.env.KIMI_API_KEY;
const BASE_URL = 'https://api.moonshot.cn/v1';

console.log('🧪 Testing Kimi API with raw HTTP...\n');

function makeRequest(endpoint, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        
        const options = {
            hostname: 'api.moonshot.cn',
            path: endpoint,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${KIMI_API_KEY}`,
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };
        
        const req = https.request(options, (res) => {
            let responseData = '';
            
            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
                console.log(`Status: ${res.statusCode}`);
                console.log('Headers:', JSON.stringify(res.headers, null, 2));
                console.log('Response:', responseData);
                
                if (res.statusCode === 200) {
                    resolve(JSON.parse(responseData));
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
                }
            });
        });
        
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function test() {
    try {
        console.log('📡 Testing with moonshot-v1-8k model...\n');
        
        const result = await makeRequest('/chat/completions', {
            model: 'moonshot-v1-8k',
            messages: [
                { role: 'system', content: 'You are helpful.' },
                { role: 'user', content: 'Hello' }
            ],
            max_tokens: 50
        });
        
        console.log('\n✅ SUCCESS!');
        console.log('Response:', result.choices?.[0]?.message?.content);
        
    } catch (error) {
        console.log('\n❌ FAILED!');
        console.log('Error:', error.message);
        
        // Try alternative endpoints
        console.log('\n🔄 Trying alternative base URLs...');
        
        const alternatives = [
            'https://api.moonshot.ai/v1',
            'https://openai.api2d.net/v1',  // Some providers use this
            'https://api.openai.com/v1'      // Just in case
        ];
        
        for (const url of alternatives) {
            console.log(`\n📡 Trying: ${url}`);
            // You can add similar test code here
        }
    }
}

test();