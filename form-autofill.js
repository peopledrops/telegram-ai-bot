// form-autofill.js - MINIMAL WORKING VERSION
const puppeteer = require('puppeteer-core');
const profileManager = require('./user-profiles');
const fs = require('fs').promises;
const path = require('path');

console.log('🔧 Loading form-autofill module...');

// Simple object export (no class complexity)
const formAutoFiller = {
    
    browser: null,
    
    // Di fungsi launchBrowser():
async launchBrowser() {
    if (this.browser) return this.browser;
    
    console.log('🌐 Launching browser...');
    
    // Detect if running in Docker/production
    const isProduction = process.env.NODE_ENV === 'production' || 
                         process.env.RAILWAY || 
                         process.env.DYNO; // Heroku
    
    const launchOptions = {
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1920x1080',
            '--single-process',
            '--no-zygote',
            '--disable-software-rasterizer'
        ]
    };
    

    if (isProduction) {
        // Use system Chromium in Docker
        launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
        launchOptions.ignoreHTTPSErrors = true;
    }
    
    this.browser = await puppeteer.launch(launchOptions);
    console.log('✅ Browser launched');
    return this.browser;
},
    
    async autoSubmitForm(url, userId, options = {}) {
        console.log(`🚀 autoSubmitForm: ${url} for user ${userId}`);
        
        const profile = profileManager.getProfile(userId);
        if (!profile) {
            throw new Error('User profile not found. Use /setprofile first.');
        }

        await this.launchBrowser();
        const page = await this.browser.newPage();

        try {
            console.log(`🌐 Navigating to: ${url}`);
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            await new Promise(r => setTimeout(r, 3000));

            const beforeScreenshot = await page.screenshot({ fullPage: true, encoding: 'binary' });
            const filledFields = await this.fillFormFields(page, profile);
            console.log(`✅ Filled ${filledFields.length} fields`);

            // Try to submit
            let submitted = false;
            try {
                const selectors = ['button[type="submit"]', 'input[type="submit"]', '.submit-btn', '#submit'];
                for (const sel of selectors) {
                    const btn = await page.$(sel);
                    if (btn) {
                        await Promise.all([
                            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {}),
                            btn.click()
                        ]);
                        submitted = true;
                        console.log('✅ Submit clicked');
                        break;
                    }
                }
            } catch (e) {
                console.warn('⚠️ Submit error:', e.message);
            }

            await new Promise(r => setTimeout(r, 2000));
            const finalScreenshot = await page.screenshot({ fullPage: true, encoding: 'binary' });

            return {
                success: submitted,
                filledFields,
                screenshots: { before: beforeScreenshot, final: finalScreenshot }
            };

        } catch (error) {
            console.error('❌ Form error:', error);
            return { success: false, error: error.message, filledFields: [] };
        } finally {
            await page.close();
        }
    },
    
    async fillFormFields(page, profile) {
        const filled = [];
        const mappings = {
            'twitter': 'twitter', 'x username': 'twitter', 'x handle': 'twitter',
            'telegram': 'telegram', 'tg username': 'telegram',
            'discord': 'discord', 'discord tag': 'discord',
            'email': 'email', 'mail': 'email',
            'wallet': 'wallet', 'wallet address': 'wallet', 'eth address': 'wallet',
            'name': 'firstName', 'first name': 'firstName', 'full name': 'firstName'
        };

        const inputs = await page.$$('input[type="text"], input[type="email"], input:not([type])');
        
        for (const input of inputs) {
            try {
                const [name, id, placeholder] = await input.evaluate(el => 
                    [el.name?.toLowerCase()||'', el.id?.toLowerCase()||'', el.placeholder?.toLowerCase()||'']
                );
                
                const visible = await input.evaluate(el => {
                    const s = window.getComputedStyle(el);
                    return s.display!=='none' && s.visibility!=='hidden' && !el.disabled;
                });
                if (!visible) continue;
                
                const value = await input.evaluate(el => el.value);
                if (value && value.length > 0) continue;
                
                const search = `${name} ${id} ${placeholder}`.toLowerCase();
                for (const [kw, field] of Object.entries(mappings)) {
                    if (search.includes(kw) && profile[field]) {
                        let val = profile[field].replace(/^@/, '');
                        await input.type(val, { delay: 30 });
                        filled.push({ field, name: name||id||'unknown', value: val });
                        console.log(`  ✅ Filled [${field}]: ${val}`);
                        break;
                    }
                }
            } catch (e) {
                console.warn('  ⚠️ Field error:', e.message);
            }
        }
        return filled;
    },
    
    async saveScreenshot(buf, userId, type) {
        if (!buf) return null;
        const dir = path.join(__dirname, 'screenshots', userId);
        await fs.mkdir(dir, { recursive: true });
        const file = path.join(dir, `form_${type}_${Date.now()}.png`);
        await fs.writeFile(file, buf);
        return file;
    },


    /**
 * Auto-fill with custom profile (instead of stored profile)
 */
async autoSubmitFormWithProfile(url, customProfile, options = {}) {
    console.log(`🚀 autoSubmitFormWithProfile: ${url}`);
    
    if (!customProfile) {
        throw new Error('Profile required');
    }

    await this.launchBrowser();
    const page = await this.browser.newPage();

    try {
        console.log(`🌐 Navigating to: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 3000));

        const beforeScreenshot = await page.screenshot({ fullPage: true, encoding: 'binary' });
        
        // Use custom profile instead of stored profile
        const filledFields = await this.fillFormFields(page, customProfile);
        console.log(`✅ Filled ${filledFields.length} fields with custom profile`);

        // ... rest same as autoSubmitForm ...
        
    } catch (error) {
        console.error('❌ Form error:', error);
        return { success: false, error: error.message, filledFields: [] };
    } finally {
        await page.close();
    }
},

    // Test method
    testConnection() {
        console.log('🧪 formAutoFiller.testConnection() called');
        return { success: true, message: 'Module loaded OK' };
    }
};

console.log('✅ form-autofill module ready');
module.exports = formAutoFiller;