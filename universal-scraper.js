require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');

class UniversalAirdropScraper {
    constructor() {
        this.taskPatterns = {
            twitter_follow: { keywords: ['follow', 'twitter', '@', 'x.com'] },
            telegram_join: { keywords: ['join', 'telegram', 't.me'] },
            discord_join: { keywords: ['discord', 'invite'] },
            google_form: { keywords: ['form', 'google', 'submit'] },
            website_visit: { keywords: ['visit', 'website', 'click'] }
        };
    }

   // Di universal-scraper.js, ganti fungsi learnFromLink dengan ini:

async learnFromLink(url, options = {}) {
    console.log(`🔍 [SCRAPER] Learning from: ${url}`);
    
    try {

        const https = require('https');
        const httpsAgent = new https.Agent({
            rejectUnauthorized: false  // ⚠️ Hanya untuk development!
        });

        // Fetch with debug
        console.log(`🌐 [SCRAPER] Fetching URL...`);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            httpsAgent,
            timeout: 20000,
            validateStatus: (status) => status >= 200 && status < 400
        });
        console.log(`✅ [SCRAPER] Fetched: ${response.status} ${response.statusText}`);
        
        const $ = cheerio.load(response.data);
        const title = $('title').text().trim();
        console.log(`📄 [SCRAPER] Page title: "${title}"`);
        
        // Extract tasks
        const tasks = [];
        $('a, button').each((i, el) => {
            const $el = $(el);
            const text = $el.text().trim().toLowerCase();
            const href = $el.attr('href');
            
            if (!text || text.length < 5) return;
            
            // Simple pattern matching
            let type = null;
            if (text.includes('follow') || text.includes('twitter')) type = 'twitter_follow';
            else if (text.includes('join') && text.includes('telegram')) type = 'telegram_join';
            else if (text.includes('discord')) type = 'discord_join';
            else if (text.includes('form') || text.includes('submit')) type = 'google_form';
            else if (text.includes('visit') || text.includes('website')) type = 'website_visit';
            
            if (type) {
                tasks.push({
                    type,
                    label: text.substring(0, 60),
                    url: href || null
                });
                console.log(`🔍 [SCRAPER] Found task: ${type} - ${text.substring(0, 40)}`);
            }
        });
        
        console.log(`📊 [SCRAPER] Found ${tasks.length} tasks`);
        
        return {
            success: true,
            url,
            platform: 'unknown',
            name: title || 'Unknown',
            description: 'Complete tasks to participate',
            tasks: tasks.slice(0, 10)
        };
        
    } catch (error) {
        console.error(`❌ [SCRAPER] Error details:`);
        console.error(`   Message: ${error.message}`);
        console.error(`   Code: ${error.code || 'N/A'}`);
        console.error(`   Status: ${error.response?.status || 'N/A'}`);
        console.error(`   Response: ${error.response?.data ? 'Yes' : 'No'}`);
        
        return {
            success: false,
            error: `${error.message}${error.code ? ` (${error.code})` : ''}`,
            url
        };
    }
}

   async saveAirdrop(airdropData) {
        const fs = require('fs').promises;
        const path = require('path');
        const dataFile = path.join(__dirname, 'learned-airdrops.json');

        try {
            let existing = [];
            try {
                const data = await fs.readFile(dataFile, 'utf8');
                existing = JSON.parse(data);
            } catch (e) {
                console.log('📄 Creating new learned-airdrops.json');
            }

            const newAirdrop = {
                id: Date.now().toString(),
                learnedAt: new Date().toISOString(),
                sourceUrl: airdropData.url,
                ...airdropData
            };

            existing.push(newAirdrop);
            await fs.mkdir(path.dirname(dataFile), { recursive: true });
            await fs.writeFile(dataFile, JSON.stringify(existing, null, 2), 'utf8');
            
            console.log(`✅ Saved airdrop: ${newAirdrop.name} (ID: ${newAirdrop.id})`);
            return newAirdrop;

        } catch (error) {
            console.error('❌ saveAirdrop error:', error.message);
            return { id: `temp_${Date.now()}`, ...airdropData, _saveError: error.message };
        }
    }


}



module.exports = new UniversalAirdropScraper();