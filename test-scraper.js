// test-scraper.js - Updated with error display
console.log('🧪 Testing scraper module...\n');

try {
    const scraper = require('./universal-scraper');
    console.log('✅ Module loaded!\n');
    
    (async () => {
        console.log('🔍 Testing with https://example.com...');
        
        const result = await scraper.learnFromLink('https://example.com');
        
        console.log('\n📦 Full Result:');
        console.log('   success:', result.success);
        console.log('   error:', result.error || 'none');
        console.log('   platform:', result.platform);
        console.log('   name:', result.name);
        console.log('   tasks:', result.tasks?.length || 0);
        
        if (result.tasks?.length > 0) {
            console.log('\n📋 Tasks:');
            result.tasks.forEach((t, i) => {
                console.log(`   ${i + 1}. [${t.type}] ${t.label}`);
            });
        }
        
        // Also test with a known working site
        console.log('\n🔍 Testing with https://zealy.io (if accessible)...');
        try {
            const result2 = await scraper.learnFromLink('https://zealy.io');
            console.log('   Zealy result:', result2.success ? '✅' : '❌', result2.error || '');
        } catch (e) {
            console.log('   Zealy test error:', e.message);
        }
        
    })();
} catch (e) {
    console.error('❌ Module load failed:', e.message);
    console.error('Stack:', e.stack);
}