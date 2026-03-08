// airdrop-scraper.js - Auto-Learn Airdrop from Links
require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');

class AirdropScraper {
    constructor() {
        this.supportedPlatforms = {
            'zealy.io': this.parseZealy.bind(this),
            'galxe.com': this.parseGalxe.bind(this),
            'layerzero.network': this.parseLayerZero.bind(this),
            'testnet.braintrustweb3.com': this.parseBraintrust.bind(this),
        };
    }

    /**
     * Main function: Extract airdrop info from URL
     */
    async learnFromLink(url) {
        try {
            console.log(`🔍 Learning from: ${url}`);
            
            // Detect platform
            const platform = this.detectPlatform(url);
            if (!platform) {
                return {
                    success: false,
                    error: 'Platform not supported. Supported: Zealy, Galxe, LayerZero, Braintrust'
                };
            }

            // Fetch page content
            const html = await this.fetchPage(url);
            const $ = cheerio.load(html);

            // Parse based on platform
            const parser = this.supportedPlatforms[platform];
            const airdropData = await parser($, url);

            return {
                success: true,
                platform,
                url,
                ...airdropData
            };

        } catch (error) {
            console.error('❌ Error learning from link:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Detect platform from URL
     */
    detectPlatform(url) {
        for (const [platform, parser] of Object.entries(this.supportedPlatforms)) {
            if (url.includes(platform)) {
                return platform;
            }
        }
        return null;
    }

    /**
     * Fetch HTML from URL
     */
    async fetchPage(url) {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            },
            timeout: 15000
        });
        return response.data;
    }

    /**
     * Parse Zealy Campaign
     */
    async parseZealy($, url) {
        const tasks = [];
        
        // Extract campaign name
        const campaignName = $('h1').first().text().trim() || 'Zealy Campaign';
        
        // Extract description
        const description = $('p').first().text().trim() || 'Complete social tasks';
        
        // Extract tasks (quests)
        $('.quest-item, .task-item, [class*="quest"], [class*="task"]').each((i, el) => {
            const taskText = $(el).text().trim();
            const taskUrl = $(el).find('a').attr('href') || $(el).attr('href');
            
            // Detect task type
            let taskType = 'unknown';
            if (taskText.toLowerCase().includes('follow') || taskText.toLowerCase().includes('twitter')) {
                taskType = 'twitter_follow';
            } else if (taskText.toLowerCase().includes('join') || taskText.toLowerCase().includes('telegram')) {
                taskType = 'telegram_join';
            } else if (taskText.toLowerCase().includes('discord')) {
                taskType = 'discord_join';
            } else if (taskText.toLowerCase().includes('form') || taskText.toLowerCase().includes('submit')) {
                taskType = 'google_form';
            } else if (taskText.toLowerCase().includes('retweet') || taskText.toLowerCase().includes('share')) {
                taskType = 'twitter_retweet';
            }

            if (taskType !== 'unknown') {
                tasks.push({
                    type: taskType,
                    label: taskText.substring(0, 100),
                    url: taskUrl ? (taskUrl.startsWith('http') ? taskUrl : `https://zealy.io${taskUrl}`) : null,
                    required: true,
                    completed: false
                });
            }
        });

        // If no tasks found, add default structure
        if (tasks.length === 0) {
            tasks.push(
                { type: 'twitter_follow', label: 'Follow Twitter', url: null, required: true },
                { type: 'telegram_join', label: 'Join Telegram', url: null, required: true },
                { type: 'google_form', label: 'Submit Wallet', url: null, required: true, fields: ['wallet', 'email', 'twitter_username'] }
            );
        }

        return {
            name: campaignName,
            description,
            platform: 'Zealy',
            tasks,
            reward: 'XP + Potential Airdrop',
            deadline: null // Zealy usually doesn't show deadline
        };
    }

    /**
     * Parse Galxe Campaign
     */
    async parseGalxe($, url) {
        const tasks = [];
        
        // Extract campaign name
        const campaignName = $('h1, [class*="title"]').first().text().trim() || 'Galxe Campaign';
        
        // Extract tasks
        $('[class*="task"], [class*="quest"], .task-item').each((i, el) => {
            const taskText = $(el).text().trim();
            const taskUrl = $(el).find('a').attr('href');
            
            let taskType = 'unknown';
            if (taskText.toLowerCase().includes('follow')) taskType = 'twitter_follow';
            else if (taskText.toLowerCase().includes('join telegram')) taskType = 'telegram_join';
            else if (taskText.toLowerCase().includes('discord')) taskType = 'discord_join';
            else if (taskText.toLowerCase().includes('retweet')) taskType = 'twitter_retweet';
            else if (taskText.toLowerCase().includes('form')) taskType = 'google_form';

            if (taskType !== 'unknown') {
                tasks.push({
                    type: taskType,
                    label: taskText.substring(0, 100),
                    url: taskUrl,
                    required: true,
                    completed: false
                });
            }
        });

        if (tasks.length === 0) {
            tasks.push(
                { type: 'twitter_follow', label: 'Follow Twitter', url: null, required: true },
                { type: 'telegram_join', label: 'Join Telegram', url: null, required: true }
            );
        }

        return {
            name: campaignName,
            description: 'Galxe OAT/NFT Campaign',
            platform: 'Galxe',
            tasks,
            reward: 'NFT Badge + OAT',
            deadline: null
        };
    }

    /**
     * Parse LayerZero
     */
    async parseLayerZero($, url) {
        return {
            name: 'LayerZero Airdrop',
            description: 'Bridge + Social Tasks for $ZRO',
            platform: 'LayerZero',
            tasks: [
                { type: 'twitter_follow', label: 'Follow @LayerZero_Labs', url: 'https://twitter.com/LayerZero_Labs', required: true },
                { type: 'discord_join', label: 'Join Discord', url: 'https://discord.gg/layerzero', required: true },
                { type: 'bridge', label: 'Bridge on LayerZero', url: 'https://stargate.finance/transfer', required: true },
                { type: 'google_form', label: 'Submit Wallet', url: null, required: true, fields: ['wallet', 'email'] }
            ],
            reward: '$ZRO Token Airdrop',
            deadline: null
        };
    }

    /**
     * Parse Braintrust
     */
    async parseBraintrust($, url) {
        return {
            name: 'Braintrust Testnet',
            description: 'Complete testnet tasks',
            platform: 'Braintrust',
            tasks: [
                { type: 'twitter_follow', label: 'Follow Twitter', url: null, required: true },
                { type: 'telegram_join', label: 'Join Telegram', url: null, required: true },
                { type: 'testnet', label: 'Complete Testnet Tasks', url: url, required: true }
            ],
            reward: 'Potential Airdrop',
            deadline: null
        };
    }

    /**
     * Save learned airdrop to database/file
     */
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
                // File doesn't exist yet
            }

            // Add timestamp and ID
            const newAirdrop = {
                id: Date.now().toString(),
                learnedAt: new Date().toISOString(),
                ...airdropData
            };

            existing.push(newAirdrop);
            await fs.writeFile(dataFile, JSON.stringify(existing, null, 2), 'utf8');

            console.log(`✅ Saved airdrop: ${newAirdrop.name}`);
            return newAirdrop;

        } catch (error) {
            console.error('❌ Error saving airdrop:', error.message);
            return null;
        }
    }
}

// Export singleton instance
const scraper = new AirdropScraper();
module.exports = scraper;