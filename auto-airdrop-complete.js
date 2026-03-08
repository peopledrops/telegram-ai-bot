// auto-airdrop-complete.js - Complete Automation from Link to Task Completion
require('dotenv').config();
const puppeteer = require('puppeteer-core');
const { chromium } = require('playwright');
const axios = require('axios');
const { OpenAI } = require('openai');
const { TwitterApi } = require('twitter-api-v2');
const fs = require('fs-extra');
const path = require('path');

class AutoAirdropCompleter {
    constructor(bot) {
        this.bot = bot;
        this.browser = null;
        this.page = null;
        
        // Initialize Groq/OpenAI
        this.ai = new OpenAI({
            apiKey: process.env.GROQ_API_KEY,
            baseURL: 'https://api.groq.com/openai/v1'
        });

        // Initialize Twitter API (optional)
        if (process.env.TWITTER_API_KEY) {
            this.twitterClient = new TwitterApi({
                appKey: process.env.TWITTER_API_KEY,
                appSecret: process.env.TWITTER_API_SECRET,
                accessToken: process.env.TWITTER_ACCESS_TOKEN,
                accessSecret: process.env.TWITTER_ACCESS_SECRET,
            });
        }

        // User sessions storage
        this.userSessions = new Map();
    }

    /**
     * MAIN: Complete airdrop from link automatically
     */
    async completeAirdropFromLink(userId, url, userWallet = null) {
        console.log(`🚀 Starting auto-complete for user ${userId}: ${url}`);
        
        const status = {
            userId,
            url,
            wallet: userWallet,
            steps: [],
            completed: 0,
            failed: 0,
            total: 0,
            screenshots: []
        };

        try {
            // Step 1: Launch browser
            await this.logStatus(userId, '🌐 Launching browser...');
            await this.launchBrowser();
            status.steps.push({ step: 'browser', status: 'success' });

            // Step 2: Navigate to URL and scrape
            await this.logStatus(userId, '🕷️ Scraping page content...');
            const pageData = await this.scrapePage(url);
            status.steps.push({ step: 'scrape', status: 'success', data: pageData });

            // Step 3: AI analyze and extract tasks
            await this.logStatus(userId, '🧠 AI analyzing tasks...');
            const tasks = await this.extractTasksWithAI(pageData.html, url);
            status.total = tasks.length;
            status.steps.push({ step: 'ai_analysis', status: 'success', tasks });

            // Step 4: Execute each task automatically
            await this.logStatus(userId, `🤖 Executing ${tasks.length} tasks automatically...`);
            
            for (let i = 0; i < tasks.length; i++) {
                const task = tasks[i];
                const taskNum = i + 1;
                
                await this.logStatus(userId, `⚡ Task ${taskNum}/${tasks.length}: ${task.type}`);
                
                try {
                    const result = await this.executeTask(task, userId, userWallet);
                    
                    if (result.success) {
                        status.completed++;
                        status.steps.push({ 
                            task: task.label, 
                            type: task.type, 
                            status: 'completed',
                            proof: result.proof 
                        });
                        
                        // Take screenshot if available
                        if (result.screenshot) {
                            const screenshotPath = await this.saveScreenshot(
                                userId, 
                                task.type, 
                                result.screenshot
                            );
                            status.screenshots.push(screenshotPath);
                        }
                        
                        await this.logStatus(userId, `✅ Completed: ${task.label}`);
                    } else {
                        status.failed++;
                        status.steps.push({ 
                            task: task.label, 
                            type: task.type, 
                            status: 'failed',
                            error: result.error 
                        });
                        await this.logStatus(userId, `❌ Failed: ${task.label} - ${result.error}`);
                    }
                } catch (error) {
                    status.failed++;
                    await this.logStatus(userId, `❌ Error executing ${task.label}: ${error.message}`);
                }

                // Delay between tasks
                await this.sleep(2000);
            }

            // Step 5: Generate completion report
            await this.logStatus(userId, '📊 Generating completion report...');
            const report = this.generateCompletionReport(status);

            // Step 6: Cleanup
            await this.closeBrowser();

            return {
                success: true,
                status,
                report
            };

        } catch (error) {
            console.error('❌ Auto-complete error:', error);
            await this.closeBrowser();
            return {
                success: false,
                error: error.message,
                status
            };
        }
    }

    /**
     * Launch browser (Puppeteer/Playwright)
     */
    async launchBrowser() {
        if (this.browser) return;

        const launchOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920x1080'
            ]
        };

        // Try Playwright first (better performance)
        try {
            this.browser = await chromium.launch(launchOptions);
            this.page = await this.browser.newPage();
            await this.page.setViewport({ width: 1920, height: 1080 });
            console.log('✅ Browser launched (Playwright)');
        } catch (e) {
            // Fallback to Puppeteer
            console.log('⚠️ Playwright failed, trying Puppeteer...');
            this.browser = await puppeteer.launch({
                ...launchOptions,
                executablePath: process.env.CHROME_PATH || undefined
            });
            this.page = await this.browser.newPage();
            console.log('✅ Browser launched (Puppeteer)');
        }
    }

    /**
     * Scrape page content
     */
    async scrapePage(url) {
        await this.page.goto(url, { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });

        // Wait for page to load
        await this.sleep(3000);

        // Get HTML and metadata
        const html = await this.page.content();
        const title = await this.page.title();
        const url_final = this.page.url();

        // Take screenshot
        const screenshot = await this.page.screenshot({ 
            fullPage: true,
            encoding: 'binary'
        });

        // Extract all interactive elements
        const elements = await this.page.evaluate(() => {
            const tasks = [];
            document.querySelectorAll('a, button, [role="button"]').forEach(el => {
                const text = el.textContent.trim();
                const href = el.href;
                if (text && text.length > 3) {
                    tasks.push({
                        text,
                        href,
                        tag: el.tagName.toLowerCase(),
                        className: el.className
                    });
                }
            });
            return tasks;
        });

        return { html, title, url: url_final, screenshot, elements };
    }

    /**
     * Extract tasks using AI
     */
    async extractTasksWithAI(html, url) {
        const prompt = `
You are an airdrop task extraction expert. Analyze this HTML content and extract ALL tasks that users need to complete for an airdrop.

URL: ${url}

HTML Content (first 15000 chars):
${html.substring(0, 15000)}

Extract tasks and return ONLY valid JSON in this exact format:
{
  "tasks": [
    {
      "type": "twitter_follow|twitter_retweet|telegram_join|discord_join|google_form|website_visit|email_subscribe|wallet_connect",
      "label": "Clear task description",
      "url": "Direct URL to complete task (or null)",
      "required": true,
      "selector": "CSS selector to click (if applicable)",
      "hint": "Optional hint for automation"
    }
  ],
  "campaignName": "Campaign name",
  "reward": "Expected reward",
  "deadline": "Deadline if mentioned"
}

Rules:
- Extract EVERY task mentioned (follow, join, submit, visit, etc.)
- For Twitter: Use full URL (https://x.com/username)
- For Telegram: Use t.me/username format
- For forms: Include if wallet address needed
- Return ONLY JSON, no other text
`;

        try {
            const response = await this.ai.chat.completions.create({
                model: 'llama-3.1-8b-instant',
                messages: [
                    { role: 'system', content: 'You are a JSON-only assistant. Return ONLY valid JSON.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.1,
                max_tokens: 3000
            });

            const aiResponse = response.choices[0].message.content;
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
            
            if (!jsonMatch) {
                throw new Error('Invalid AI response');
            }

            const result = JSON.parse(jsonMatch[0]);
            
            // Validate and normalize tasks
            return (result.tasks || []).map(task => ({
                type: task.type || 'website_visit',
                label: task.label?.substring(0, 100) || 'Complete task',
                url: task.url || null,
                required: task.required !== false,
                selector: task.selector || null,
                hint: task.hint || null
            })).filter(t => t.type && t.label);

        } catch (error) {
            console.error('❌ AI extraction failed:', error);
            // Fallback: extract from elements
            return this.extractTasksFromElements(html, url);
        }
    }

    /**
     * Fallback: Extract tasks from DOM elements
     */
    extractTasksFromElements(html, url) {
        const $ = require('cheerio').load(html);
        const tasks = [];
        const seenUrls = new Set();

        $('a, button').each((i, el) => {
            const text = $(el).text().trim().toLowerCase();
            const href = $(el).attr('href');
            
            if (!text || text.length < 5) return;

            let type = null;
            if (text.includes('follow') || text.includes('twitter')) type = 'twitter_follow';
            else if (text.includes('join') && text.includes('telegram')) type = 'telegram_join';
            else if (text.includes('discord')) type = 'discord_join';
            else if (text.includes('form') || text.includes('submit')) type = 'google_form';
            else if (text.includes('visit') || text.includes('website')) type = 'website_visit';
            else if (text.includes('wallet')) type = 'wallet_connect';

            if (type && href && !seenUrls.has(href)) {
                seenUrls.add(href);
                tasks.push({
                    type,
                    label: $(el).text().trim().substring(0, 80),
                    url: href.startsWith('http') ? href : new URL(href, url).href,
                    required: true,
                    selector: null,
                    hint: null
                });
            }
        });

        return tasks;
    }

    // Di file: auto-airdrop-complete.js, dalam fungsi executeTask()

async executeTask(task, userId, userWallet) {
    console.log(`🤖 Executing task: ${task.type} - ${task.label}`);

    switch (task.type) {
        case 'twitter_follow':
        case 'twitter_retweet':
            // Always return manual instructions for Twitter
            return await this.manualTwitterTask(task, userId);
        
        case 'telegram_join':
            return await this.autoJoinTelegram(task.url, userId);
        
        // ... other cases ...
    }
}

/**
 * Return manual instructions for Twitter tasks
 */
async manualTwitterTask(task, userId) {
    const username = task.url?.match(/(?:twitter|x)\.com\/(\w+)/)?.[1] || 'unknown';
    
    return {
        success: false,
        manual: true,
        taskType: task.type,
        label: task.label,
        manualUrl: task.url,
        hint: `Follow @${username} manually, then verify with bot`,
        instructions: [
            `1. Open: ${task.url}`,
            `2. Login to Twitter/X`,
            `3. Click "Follow" @${username}`,
            `4. Return to bot and type: /airdrop verify <id> twitter`
        ]
    };
}


    // Di file: auto-airdrop-complete.js

/**
 * Auto-follow Twitter - MANUAL MODE (karena API berbayar)
 */
async autoFollowTwitter(url, userId) {
    // Extract username for display
    const username = url.match(/(?:twitter|x)\.com\/(\w+)/)?.[1] || 'unknown';
    
    return {
        success: false,  // Mark as "not auto-completed"
        manual: true,    // Flag for manual task
        error: 'Twitter API requires paid tier. Please follow manually.',
        manualUrl: url,
        hint: `Click link → Follow @${username} → Use /airdrop verify <id> twitter`,
        instructions: [
            `1. Open: ${url}`,
            `2. Login to your Twitter/X account`,
            `3. Click "Follow" @${username}`,
            `4. Return to Telegram bot`,
            `5. Type: /airdrop verify <airdrop_id> twitter`
        ]
    };
}

    async autoRetweet(url, userId) {
        if (!this.twitterClient) {
            return { success: false, error: 'Twitter API not configured', manualUrl: url };
        }

        try {
            const tweetId = url.match(/status\/(\d+)/)?.[1];
            if (!tweetId) return { success: false, error: 'Invalid tweet URL' };

            await this.twitterClient.v2.retweet(process.env.TWITTER_USER_ID, tweetId);

            return { success: true, proof: 'Retweeted successfully' };
        } catch (error) {
            return { success: false, error: error.message, manualUrl: url };
        }
    }

    /**
     * Auto-join Telegram
     */
    async autoJoinTelegram(url, userId) {
        try {
            const chatUsername = url.match(/t\.me\/(\w+)/)?.[1];
            if (!chatUsername) return { success: false, error: 'Invalid Telegram URL' };

            // Use Telegram Bot API to get invite link
            const botToken = process.env.TELEGRAM_BOT_TOKEN;
            const response = await axios.get(
                `https://api.telegram.org/bot${botToken}/exportChatInviteLink`,
                { params: { chat_id: `@${chatUsername}` } }
            );

            if (response.data.ok) {
                return {
                    success: true,
                    proof: `Join link generated for @${chatUsername}`,
                    manualUrl: response.data.result.invite_link
                };
            }

            return { success: false, error: 'Bot not admin in this group', manualUrl: url };

        } catch (error) {
            return { success: false, error: error.message, manualUrl: url };
        }
    }

    /**
     * Auto-join Discord (requires OAuth setup)
     */
    async autoJoinDiscord(url, userId) {
        return {
            success: false,
            error: 'Discord join requires OAuth setup. Manual join required.',
            manualUrl: url
        };
    }

    /**
     * Auto-submit Google Form
     */
    async autoSubmitForm(url, userWallet, userId) {
        if (!url || !userWallet) {
            return { success: false, error: 'Form URL or wallet missing' };
        }

        try {
            // Navigate to form
            await this.page.goto(url, { waitUntil: 'networkidle2' });
            await this.sleep(2000);

            // Try to find and fill wallet field
            const walletInput = await this.page.$('input[type="text"], input[type="email"]');
            if (walletInput) {
                await walletInput.type(userWallet, { delay: 50 });
            }

            // Try to find and click submit
            const submitButton = await this.page.$('input[type="submit"], button[type="submit"]');
            if (submitButton) {
                await submitButton.click();
                await this.sleep(3000);
                
                // Take screenshot of confirmation
                const screenshot = await this.page.screenshot({ encoding: 'binary' });
                
                return {
                    success: true,
                    proof: 'Form submitted successfully',
                    screenshot
                };
            }

            return { success: false, error: 'Submit button not found', manualUrl: url };

        } catch (error) {
            return { success: false, error: error.message, manualUrl: url };
        }
    }

    /**
     * Auto-visit website
     */
    async autoVisitWebsite(url, userId) {
        try {
            await this.page.goto(url, { waitUntil: 'networkidle2' });
            await this.sleep(3000);
            
            const screenshot = await this.page.screenshot({ encoding: 'binary' });
            
            return {
                success: true,
                proof: `Visited ${url}`,
                screenshot
            };
        } catch (error) {
            return { success: false, error: error.message, manualUrl: url };
        }
    }

    /**
     * Auto-connect wallet (MetaMask simulation)
     */
    async autoConnectWallet(url, userWallet, userId) {
        return {
            success: false,
            error: 'Wallet connection requires browser extension. Manual connection required.',
            manualUrl: url,
            hint: `Use wallet: ${userWallet}`
        };
    }

    /**
     * Utility: Save screenshot
     */
    async saveScreenshot(userId, taskType, screenshotBuffer) {
        const dir = path.join(__dirname, 'screenshots', userId);
        await fs.ensureDir(dir);
        
        const filename = `${taskType}_${Date.now()}.png`;
        const filepath = path.join(dir, filename);
        
        await fs.writeFile(filepath, screenshotBuffer);
        return filepath;
    }

    /**
     * Utility: Log status to user
     */
    async logStatus(userId, message) {
        console.log(`[${userId}] ${message}`);
        if (this.bot) {
            try {
                await this.bot.sendMessage(userId, message);
            } catch (e) {
                // User may have blocked bot
            }
        }
    }

    /**
     * Utility: Generate completion report
     */
    generateCompletionReport(status) {
        const successRate = status.total > 0 
            ? Math.round((status.completed / status.total) * 100) 
            : 0;

        return `
🎉 **Airdrop Automation Complete!**

📊 **Results:**
✅ Completed: ${status.completed}/${status.total}
❌ Failed: ${status.failed}
📈 Success Rate: ${successRate}%

🔗 **URL:** ${status.url}
💼 **Wallet:** ${status.wallet || 'Not set'}

${status.steps.map((s, i) => {
    if (s.status === 'completed') return `✅ ${i + 1}. ${s.task}`;
    if (s.status === 'failed') return `❌ ${i + 1}. ${s.task} - ${s.error}`;
    return `⚡ ${i + 1}. ${s.step || s.task}`;
}).join('\n')}

💡 **Next Steps:**
- Check screenshots in /screenshots/${status.userId}/
- Manually complete failed tasks if any
- Wait for airdrop distribution!
        `;
    }

    /**
     * Utility: Sleep
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Cleanup
     */
    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
            console.log('🔒 Browser closed');
        }
    }
}

module.exports = AutoAirdropCompleter;