// form-autofill.js - FIXED COMPLETE VERSION
require('dotenv').config();
const puppeteer = require('puppeteer-core');
const profileManager = require('./user-profiles');
const fs = require('fs').promises;
const path = require('path');

console.log('🔧 Loading form-autofill module...');

const formAutoFiller = {

    browser: null,

    // ===== LAUNCH BROWSER =====
    async launchBrowser() {
        if (this.browser) {
            try {
                // Cek apakah browser masih hidup
                await this.browser.version();
                return this.browser;
            } catch (e) {
                console.log('⚠️ Browser died, relaunching...');
                this.browser = null;
            }
        }

        console.log('🌐 Launching browser...');

        const isProduction = process.env.NODE_ENV === 'production' ||
            process.env.RAILWAY ||
            process.env.DYNO;

        // Cari executable Chromium
        const possiblePaths = [
            process.env.PUPPETEER_EXECUTABLE_PATH,
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/snap/bin/chromium',
        ].filter(Boolean);

        let executablePath = null;
        for (const p of possiblePaths) {
            try {
                await fs.access(p);
                executablePath = p;
                console.log(`✅ Found Chromium at: ${p}`);
                break;
            } catch (e) {}
        }

        if (!executablePath && isProduction) {
            throw new Error('Chromium not found. Pastikan chromium terinstall di server.');
        }

        const launchOptions = {
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1366,768',
                '--single-process',
                '--no-zygote',
                '--disable-software-rasterizer',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-default-apps',
                '--mute-audio',
            ],
            timeout: 30000,
        };

        if (executablePath) {
            launchOptions.executablePath = executablePath;
            launchOptions.ignoreHTTPSErrors = true;
        }

        this.browser = await puppeteer.launch(launchOptions);
        console.log('✅ Browser launched successfully');
        return this.browser;
    },

    // ===== CLOSE BROWSER =====
    async closeBrowser() {
        if (this.browser) {
            try {
                await this.browser.close();
                console.log('🛑 Browser closed');
            } catch (e) {
                console.warn('⚠️ Browser close error:', e.message);
            } finally {
                this.browser = null;
            }
        }
    },

    // ===== AUTO SUBMIT FORM (pakai stored profile) =====
    async autoSubmitForm(url, userId, options = {}) {
        console.log(`🚀 autoSubmitForm: ${url} for user ${userId}`);

        const profile = profileManager.getProfile(userId);
        if (!profile) {
            throw new Error('Profile belum diset. Kirim: set twitter @usernamesaya');
        }

        return await this._doSubmit(url, profile, options);
    },

    // ===== AUTO SUBMIT FORM (pakai custom profile) =====
    async autoSubmitFormWithProfile(url, customProfile, options = {}) {
        console.log(`🚀 autoSubmitFormWithProfile: ${url}`);

        if (!customProfile) {
            throw new Error('Profile diperlukan');
        }

        return await this._doSubmit(url, customProfile, options);
    },

    // ===== CORE SUBMIT LOGIC =====
    async _doSubmit(url, profile, options = {}) {
        let page = null;

        try {
            await this.launchBrowser();
            page = await this.browser.newPage();

            // Set viewport dan user agent supaya tidak terdeteksi bot
            await page.setViewport({ width: 1366, height: 768 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            // Block resource yang tidak perlu (lebih cepat)
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const type = req.resourceType();
                if (['image', 'font', 'media'].includes(type)) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            console.log(`🌐 Navigating to: ${url}`);
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Tunggu halaman load
            await new Promise(r => setTimeout(r, 3000));

            // Screenshot sebelum isi
            const beforeScreenshot = await page.screenshot({ fullPage: true, encoding: 'binary' }).catch(() => null);

            // Isi semua field yang ditemukan
            const filledFields = await this.fillFormFields(page, profile);
            console.log(`✅ Filled ${filledFields.length} fields`);

            // Tunggu sebentar setelah isi form
            await new Promise(r => setTimeout(r, 1000));

            // Coba submit form
            let submitted = false;
            let submitError = null;

            try {
                const submitSelectors = [
                    'button[type="submit"]',
                    'input[type="submit"]',
                    'button:contains("Submit")',
                    'button:contains("submit")',
                    'button:contains("Send")',
                    'button:contains("Daftar")',
                    'button:contains("Register")',
                    'button:contains("Join")',
                    '.submit-btn',
                    '.btn-submit',
                    '#submit',
                    '#submit-btn',
                    'form button[type="button"]',
                ];

                for (const sel of submitSelectors) {
                    try {
                        const btn = await page.$(sel);
                        if (btn) {
                            const isVisible = await btn.evaluate(el => {
                                const s = window.getComputedStyle(el);
                                return s.display !== 'none' && s.visibility !== 'hidden' && !el.disabled;
                            });
                            if (!isVisible) continue;

                            await Promise.all([
                                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {}),
                                btn.click()
                            ]);
                            submitted = true;
                            console.log(`✅ Submitted via: ${sel}`);
                            break;
                        }
                    } catch (e) {
                        // Coba selector berikutnya
                    }
                }

                // Jika tidak ketemu button, coba submit via keyboard
                if (!submitted && filledFields.length > 0) {
                    await page.keyboard.press('Enter');
                    await new Promise(r => setTimeout(r, 2000));
                    submitted = true;
                    console.log('✅ Submitted via Enter key');
                }

            } catch (e) {
                submitError = e.message;
                console.warn('⚠️ Submit error:', e.message);
            }

            await new Promise(r => setTimeout(r, 2000));

            // Screenshot setelah submit
            const finalScreenshot = await page.screenshot({ fullPage: true, encoding: 'binary' }).catch(() => null);

            return {
                success: submitted || filledFields.length > 0,
                filledFields,
                submitted,
                submitError,
                screenshots: { before: beforeScreenshot, final: finalScreenshot }
            };

        } catch (error) {
            console.error('❌ Form submission error:', error.message);
            return {
                success: false,
                error: error.message,
                filledFields: [],
                screenshots: {}
            };
        } finally {
            if (page) {
                await page.close().catch(() => {});
            }
        }
    },

    // ===== FILL FORM FIELDS =====
    async fillFormFields(page, profile) {
        const filled = [];

        // Mapping keyword → profile field
        const mappings = [
            { keywords: ['twitter', 'x username', 'x handle', 'x.com', 'twitter handle'], field: 'twitter' },
            { keywords: ['telegram', 'tg username', 'tg handle', 't.me'], field: 'telegram' },
            { keywords: ['discord', 'discord tag', 'discord handle', 'discord username'], field: 'discord' },
            { keywords: ['email', 'mail', 'e-mail'], field: 'email' },
            { keywords: ['wallet', 'wallet address', 'eth address', 'evm address', '0x', 'address'], field: 'wallet' },
            { keywords: ['name', 'first name', 'full name', 'nama', 'username'], field: 'firstName' },
        ];

        // Ambil semua input yang mungkin
        const inputSelectors = [
            'input[type="text"]',
            'input[type="email"]',
            'input[type="url"]',
            'input:not([type])',
            'input[type="search"]',
        ];

        for (const selector of inputSelectors) {
            const inputs = await page.$$(selector);

            for (const input of inputs) {
                try {
                    // Ambil semua atribut input
                    const attrs = await input.evaluate(el => ({
                        name: el.name?.toLowerCase() || '',
                        id: el.id?.toLowerCase() || '',
                        placeholder: el.placeholder?.toLowerCase() || '',
                        value: el.value || '',
                        type: el.type || '',
                        ariaLabel: el.getAttribute('aria-label')?.toLowerCase() || '',
                        className: el.className?.toLowerCase() || '',
                        // Ambil label terkait
                        labelText: (() => {
                            const label = document.querySelector(`label[for="${el.id}"]`);
                            return label?.textContent?.toLowerCase() || '';
                        })(),
                    }));

                    // Skip jika sudah terisi atau tidak visible
                    if (attrs.value && attrs.value.length > 0) continue;

                    const isVisible = await input.evaluate(el => {
                        const s = window.getComputedStyle(el);
                        const rect = el.getBoundingClientRect();
                        return s.display !== 'none' &&
                            s.visibility !== 'hidden' &&
                            !el.disabled &&
                            !el.readOnly &&
                            rect.width > 0;
                    });
                    if (!isVisible) continue;

                    // Gabungkan semua teks atribut untuk pencarian
                    const searchText = `${attrs.name} ${attrs.id} ${attrs.placeholder} ${attrs.ariaLabel} ${attrs.labelText} ${attrs.className}`.toLowerCase();

                    // Cari mapping yang cocok
                    let matched = false;
                    for (const mapping of mappings) {
                        if (mapping.keywords.some(kw => searchText.includes(kw))) {
                            const profileValue = profile[mapping.field];
                            if (!profileValue) continue;

                            // Bersihkan nilai (hapus @ untuk username)
                            let val = profileValue.toString();
                            if (['twitter', 'telegram', 'discord'].includes(mapping.field)) {
                                val = val.replace(/^@/, '');
                            }

                            // Isi field dengan delay manusiawi
                            await input.click({ clickCount: 3 }); // Select all dulu
                            await input.type(val, { delay: 50 + Math.random() * 50 });
                            filled.push({ field: mapping.field, name: attrs.name || attrs.id || attrs.placeholder || 'unknown', value: val });
                            console.log(`  ✅ Filled [${mapping.field}] "${attrs.name || attrs.placeholder}": ${val}`);
                            matched = true;
                            break;
                        }
                    }

                } catch (e) {
                    console.warn(`  ⚠️ Field error: ${e.message}`);
                }
            }
        }

        // Juga cek textarea
        const textareas = await page.$$('textarea');
        for (const ta of textareas) {
            try {
                const attrs = await ta.evaluate(el => ({
                    name: el.name?.toLowerCase() || '',
                    placeholder: el.placeholder?.toLowerCase() || '',
                    value: el.value || '',
                }));

                if (attrs.value) continue;

                const searchText = `${attrs.name} ${attrs.placeholder}`;
                for (const mapping of mappings) {
                    if (mapping.keywords.some(kw => searchText.includes(kw)) && profile[mapping.field]) {
                        await ta.type(profile[mapping.field].replace(/^@/, ''), { delay: 30 });
                        filled.push({ field: mapping.field, name: attrs.name || attrs.placeholder, value: profile[mapping.field] });
                        break;
                    }
                }
            } catch (e) {}
        }

        return filled;
    },

    // ===== SAVE SCREENSHOT =====
    async saveScreenshot(buf, userId, type) {
        if (!buf) return null;
        try {
            const dir = path.join(__dirname, 'screenshots', userId);
            await fs.mkdir(dir, { recursive: true });
            const file = path.join(dir, `form_${type}_${Date.now()}.png`);
            await fs.writeFile(file, buf);
            console.log(`📸 Screenshot saved: ${file}`);
            return file;
        } catch (e) {
            console.warn('⚠️ Screenshot save error:', e.message);
            return null;
        }
    },

    // ===== TEST =====
    testConnection() {
        return { success: true, message: 'form-autofill module loaded OK' };
    }
};

console.log('✅ form-autofill module ready');
module.exports = formAutoFiller;