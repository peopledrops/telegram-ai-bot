// test-minebean.js - REVISED (Bulletproof Version)
require('dotenv').config();

console.log('🚀 Starting MineBean Test...\n');

// Keep process alive
let testsRunning = 0;
function keepAlive() { testsRunning++; }
function done() { 
    testsRunning--; 
    if (testsRunning === 0) {
        console.log('\n🏁 All tests completed!');
        // Give 1 second for final logs to flush
        setTimeout(() => process.exit(0), 1000);
    }
}

// Test 1: Can we require the module?
console.log('📦 Test 1: Loading minebean.js module...');
try {
    const MineBeanSkill = require('./minebean');
    console.log('✅ Module loaded successfully\n');
    keepAlive();
    runTests(MineBeanSkill);
} catch (error) {
    console.log('❌ FAILED to load module:', error.message);
    console.log('Stack:', error.stack);
    process.exit(1);
}

async function runTests(MineBeanSkill) {
    try {
        // Test 2: Create instance
        console.log('🧪 Test 2: Creating MineBeanSkill instance...');
        const mb = new MineBeanSkill('0x742d35Cc6634C0532925a3b844Bc9E7595f8fE');
        console.log('✅ Instance created\n');
        
        // Test 3: API call - getCurrentRound
        console.log('🌐 Test 3: Calling getCurrentRound()...');
        try {
            const round = await mb.getCurrentRound();
            if (round) {
                console.log('✅ API call successful!');
                console.log('   Round ID:', round.roundId);
                console.log('   Beanpot:', round.beanpotPoolFormatted, 'BEAN');
                console.log('   Total deployed:', round.totalDeployedFormatted, 'ETH\n');
            } else {
                console.log('⚠️ API returned null (might be rate limited or down)\n');
            }
        } catch (err) {
            console.log('❌ getCurrentRound failed:', err.message, '\n');
        }
        
        // Test 4: API call - getBeanPrice
        console.log('💰 Test 4: Calling getBeanPrice()...');
        try {
            const price = await mb.getBeanPrice();
            console.log('✅ Price fetched!');
            console.log('   ETH:', price.priceNative);
            console.log('   USD: $' + price.priceUsd + '\n');
        } catch (err) {
            console.log('❌ getBeanPrice failed:', err.message, '\n');
        }
        
        // Test 5: EV Calculation (no API needed)
        console.log('📊 Test 5: Calculating EV...');
        try {
            const ev = mb.calculateEV({
                deployedEth: '0.001',
                beanPriceEth: '0.000015',
                beanpotPool: '45',
                totalDeployed: '1',
                yourShareOnWinningBlock: 0.04
            });
            console.log('✅ EV calculated!');
            console.log('   Net EV:', ev.netEV, 'ETH', ev.isPositive ? '✅' : '❌');
            console.log('   House edge:', ev.breakdown.houseEdge + '\n');
        } catch (err) {
            console.log('❌ calculateEV failed:', err.message, '\n');
        }
        
        // Test 6: Block suggestions
        console.log('🎯 Test 6: Suggesting blocks...');
        try {
            // Mock round data for testing
            const mockRound = {
                blocks: Array.from({length: 25}, (_, i) => ({
                    id: i,
                    deployedFormatted: (Math.random() * 0.1).toFixed(4),
                    minerCount: Math.floor(Math.random() * 5)
                }))
            };
            const suggested = mb.suggestBlocks(mockRound, 3, 'least-crowded');
            console.log('✅ Blocks suggested!');
            console.log('   Suggested:', suggested, '\n');
        } catch (err) {
            console.log('❌ suggestBlocks failed:', err.message, '\n');
        }
        
    } catch (error) {
        console.log('❌ Unexpected error in runTests:', error.message);
        console.log('Stack:', error.stack);
    } finally {
        done();
    }
}

// Fallback: exit after 30 seconds if something hangs
setTimeout(() => {
    if (testsRunning > 0) {
        console.log('⏰ Timeout: Force exiting after 30s');
        process.exit(0);
    }
}, 30000);