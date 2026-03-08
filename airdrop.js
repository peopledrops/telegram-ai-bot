// airdrop.js - Airdrop Task Manager Module
require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// Data file path
const DATA_FILE = path.join(__dirname, 'airdrop-data.json');

// Default airdrops database
const DEFAULT_AIRDROPS = [
    {
        id: '1',
        name: 'Zealy Campaign',
        description: 'Follow Twitter + Join Telegram + Submit Form',
        reward: '500-2000 XP + Potential Airdrop',
        tasks: [
            { type: 'twitter', label: 'Follow @Zealy_io', url: 'https://twitter.com/Zealy_io', required: true },
            { type: 'telegram', label: 'Join Zealy Telegram', url: 'https://t.me/zealy_io', required: true },
            { type: 'google_form', label: 'Submit Wallet Address', url: 'https://forms.gle/xxxxx', required: true, fields: ['wallet', 'email', 'twitter_username'] }
        ],
        status: 'active',
        deadline: '2026-03-31'
    },
    {
        id: '2',
        name: 'Galxe Campaign',
        description: 'Complete social tasks for NFT badge',
        reward: 'NFT Badge + OAT',
        tasks: [
            { type: 'twitter', label: 'Follow @Galxe', url: 'https://twitter.com/Galxe', required: true },
            { type: 'twitter', label: 'Retweet Pinned Post', url: 'https://twitter.com/Galxe/status/xxx', required: false },
            { type: 'telegram', label: 'Join Galxe Telegram', url: 'https://t.me/GalxeOfficial', required: true }
        ],
        status: 'active',
        deadline: '2026-04-15'
    },
    {
        id: '3',
        name: 'LayerZero Airdrop',
        description: 'Bridge + Social Tasks',
        reward: '$ZRO Token Airdrop',
        tasks: [
            { type: 'twitter', label: 'Follow @LayerZero_Labs', url: 'https://twitter.com/LayerZero_Labs', required: true },
            { type: 'discord', label: 'Join Discord', url: 'https://discord.gg/layerzero', required: true },
            { type: 'google_form', label: 'Submit Wallet', url: 'https://forms.gle/yyyyy', required: true, fields: ['wallet', 'email'] }
        ],
        status: 'active',
        deadline: '2026-05-01'
    }
];

// ===== DATA MANAGEMENT =====

class AirdropManager {
    constructor() {
        this.airdrops = [];
        this.userProgress = new Map(); // userId -> { airdropId: { tasks: { taskId: completed } } }
    }

    // Load airdrops from file or use default
    async loadAirdrops() {
        try {
            const data = await fs.readFile(DATA_FILE, 'utf8');
            this.airdrops = JSON.parse(data);
            console.log(`✅ Loaded ${this.airdrops.length} airdrops from file`);
        } catch (error) {
            this.airdrops = JSON.parse(JSON.stringify(DEFAULT_AIRDROPS));
            await this.saveAirdrops();
            console.log(`✅ Initialized ${this.airdrops.length} default airdrops`);
        }
    }

    // Save airdrops to file
    async saveAirdrops() {
        try {
            await fs.writeFile(DATA_FILE, JSON.stringify(this.airdrops, null, 2), 'utf8');
        } catch (error) {
            console.error('❌ Failed to save airdrops:', error.message);
        }
    }

    // Get all active airdrops
    getActiveAirdrops() {
        return this.airdrops.filter(a => a.status === 'active');
    }

    // Get airdrop by ID
    getAirdropById(id) {
        return this.airdrops.find(a => a.id === id);
    }

    // Get user progress for specific airdrop
    getUserProgress(userId, airdropId) {
        const userProgress = this.userProgress.get(userId) || {};
        return userProgress[airdropId] || { tasks: {}, completed: false, submittedAt: null };
    }

    // Mark task as completed
    markTaskComplete(userId, airdropId, taskId) {
        if (!this.userProgress.has(userId)) {
            this.userProgress.set(userId, {});
        }
        
        const userProgress = this.userProgress.get(userId);
        if (!userProgress[airdropId]) {
            userProgress[airdropId] = { tasks: {}, completed: false, submittedAt: null };
        }
        
        userProgress[airdropId].tasks[taskId] = true;
        
        // Check if all required tasks are complete
        const airdrop = this.getAirdropById(airdropId);
        if (airdrop) {
            const requiredTasks = airdrop.tasks.filter(t => t.required);
            const completedRequired = requiredTasks.every(t => userProgress[airdropId].tasks[requiredTasks.indexOf(t)]);
            
            if (completedRequired) {
                userProgress[airdropId].completed = true;
                userProgress[airdropId].submittedAt = new Date().toISOString();
            }
        }
        
        return userProgress[airdropId];
    }

    // Submit Google Form
    async submitGoogleForm(formUrl, formData) {
        try {
            // Note: Google Forms doesn't have official API for submission
            // This is a workaround using HTTP POST
            // You need to extract form IDs from the actual form URL
            
            const response = await axios.post(formUrl, formData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 10000
            });
            
            return {
                success: response.status === 200,
                message: 'Form submitted successfully'
            };
        } catch (error) {
            return {
                success: false,
                message: `Form submission failed: ${error.message}`
            };
        }
    }

    // Verify Twitter follow (requires Twitter API)
    async verifyTwitterFollow(username, targetAccount) {
        // Note: This requires Twitter API v2 access (paid)
        // For free version, we'll use self-reporting with link verification
        return {
            verified: false,
            message: 'Please complete the task and click "Verify" to submit'
        };
    }

    // Verify Telegram join (requires Telegram Bot API)
    async verifyTelegramJoin(userId, chatId) {
        try {
            const member = await axios.get(
                `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getChatMember`,
                { params: { chat_id: chatId, user_id: userId } }
            );
            
            return {
                verified: ['member', 'administrator', 'creator'].includes(member.data.result.status),
                message: member.data.result.status
            };
        } catch (error) {
            return {
                verified: false,
                message: 'Unable to verify. Please make sure you joined.'
            };
        }
    }

    // Get progress summary for user
    getUserSummary(userId) {
        const userProgress = this.userProgress.get(userId) || {};
        const activeAirdrops = this.getActiveAirdrops();
        
        let total = activeAirdrops.length;
        let completed = 0;
        let inProgress = 0;
        
        activeAirdrops.forEach(airdrop => {
            const progress = userProgress[airdrop.id];
            if (progress?.completed) {
                completed++;
            } else if (progress && Object.keys(progress.tasks || {}).length > 0) {
                inProgress++;
            }
        });
        
        return {
            total,
            completed,
            inProgress,
            notStarted: total - completed - inProgress
        };
    }
}

// Export singleton instance
const airdropManager = new AirdropManager();

// Initialize on module load
airdropManager.loadAirdrops();

module.exports = airdropManager;