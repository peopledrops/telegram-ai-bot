console.log('🧪 Testing scraper module...\n');
try {
    const scraper = require('./universal-scraper');
    console.log('✅ Module loaded!\n');
    (async () => {
        const result = await scraper.learnFromLink('https://example.com');
        console.log('📦 Result:', result.success ? '✅ Success' : '❌ Failed');
        console.log('   Name:', result.name);
        console.log('   Tasks:', result.tasks?.length || 0);
    })();
} catch (e) {
    console.error('❌ Error:', e.message);
}