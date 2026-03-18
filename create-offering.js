// create-offering.js
// Jalankan: node create-offering.js
// Script ini otomatis buat offering di Virtuals ACP

require('dotenv').config();

const ACP_API_KEY = process.env.ACP_API_KEY || 'acp-88df1664478aca1c7ce8';
const AGENT_ID = process.env.ACP_AGENT_ID || 'zgn5b6rik8utnckhnxy391sr';

const offerings = [
    {
        name: 'crypto_analysis',
        description: 'Real-time crypto token analysis including price, market cap, volume, trend and risk score for any token. Send a token symbol (BTC, ETH, SOL) and get instant insights.',
        price: '0.60',
        currency: 'USDC',
        sla: 300, // 5 menit dalam detik
        category: 'crypto-analysis',
        tags: ['crypto', 'analysis', 'price', 'market-cap', 'volume', 'trend']
    },
    {
        name: 'airdrop_analysis',
        description: 'Analyze airdrop opportunities. Send a project URL or contract address and get eligibility check, risk score, and recommendation.',
        price: '0.50',
        currency: 'USDC',
        sla: 300,
        category: 'airdrop',
        tags: ['airdrop', 'analysis', 'defi', 'eligibility']
    }
];

async function createOffering(offering) {
    console.log(`\n📝 Creating offering: ${offering.name}`);

    // Coba Virtuals ACP API
    const endpoints = [
        `https://api.virtuals.io/acp/v1/agents/${AGENT_ID}/offerings`,
        `https://api.virtuals.io/v1/acp/agents/${AGENT_ID}/offerings`,
        `https://app.virtuals.io/api/acp/agents/${AGENT_ID}/offerings`,
    ];

    for (const endpoint of endpoints) {
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ACP_API_KEY}`,
                    'X-API-Key': ACP_API_KEY,
                },
                body: JSON.stringify({
                    name: offering.name,
                    description: offering.description,
                    price: offering.price,
                    currency: offering.currency,
                    sla: offering.sla,
                    category: offering.category,
                    tags: offering.tags,
                    enabled: true,
                })
            });

            const text = await res.text();
            console.log(`   ${endpoint}`);
            console.log(`   Status: ${res.status}`);

            if (res.ok) {
                const data = JSON.parse(text);
                console.log(`   ✅ Success! Offering ID: ${data.id || data.offeringId || 'created'}`);
                return data;
            } else {
                console.log(`   ❌ ${text.substring(0, 100)}`);
            }
        } catch (e) {
            console.log(`   ❌ ${e.message}`);
        }
    }
}

async function main() {
    console.log('🦞 CryptoClawAI — Auto Create Offerings');
    console.log('=========================================');
    console.log(`Agent ID: ${AGENT_ID}`);
    console.log(`API Key: ${ACP_API_KEY.substring(0, 10)}...`);

    for (const offering of offerings) {
        await createOffering(offering);
    }

    console.log('\n✅ Done! Check https://agdp.io/agent/23736');
}

main().catch(console.error);