// user-profiles.js - User Social Media Profiles Storage
const fs = require('fs').promises;
const path = require('path');

const PROFILES_FILE = path.join(__dirname, 'user-profiles.json');

class UserProfileManager {
    constructor() {
        this.profiles = new Map();
    }

    /**
     * Load all profiles from file
     */
    async loadProfiles() {
        try {
            const data = await fs.readFile(PROFILES_FILE, 'utf8');
            const profiles = JSON.parse(data);
            
            // Convert to Map for faster lookup
            for (const [userId, profile] of Object.entries(profiles)) {
                this.profiles.set(userId, profile);
            }
            
            console.log(`✅ Loaded ${this.profiles.size} user profiles`);
        } catch (error) {
            console.log('📄 No profiles file yet (will create on first save)');
        }
    }

    /**
     * Save all profiles to file
     */
    async saveProfiles() {
        try {
            const profilesObj = {};
            for (const [userId, profile] of this.profiles) {
                profilesObj[userId] = profile;
            }
            
            await fs.writeFile(
                PROFILES_FILE,
                JSON.stringify(profilesObj, null, 2),
                'utf8'
            );
            console.log('✅ Profiles saved');
        } catch (error) {
            console.error('❌ Failed to save profiles:', error.message);
        }
    }

    /**
     * Get user profile
     */
    getProfile(userId) {
        return this.profiles.get(userId) || null;
    }

    /**
     * Update user profile field
     */
    async updateProfile(userId, field, value) {
        let profile = this.profiles.get(userId) || {
            userId,
            createdAt: new Date().toISOString(),
            updatedAt: null,
            twitter: null,
            telegram: null,
            discord: null,
            email: null,
            wallet: null,
            firstName: null,
            lastName: null
        };

        // Update field
        profile[field] = value;
        profile.updatedAt = new Date().toISOString();

        this.profiles.set(userId, profile);
        await this.saveProfiles();

        return profile;
    }

    /**
     * Update multiple fields at once
     */
    async updateProfileBulk(userId, updates) {
        let profile = this.profiles.get(userId) || {
            userId,
            createdAt: new Date().toISOString(),
            updatedAt: null,
            twitter: null,
            telegram: null,
            discord: null,
            email: null,
            wallet: null,
            firstName: null,
            lastName: null
        };

        // Update all provided fields
        for (const [field, value] of Object.entries(updates)) {
            profile[field] = value;
        }
        
        profile.updatedAt = new Date().toISOString();
        this.profiles.set(userId, profile);
        await this.saveProfiles();

        return profile;
    }

    /**
     * Get profile summary for display
     */
    getProfileSummary(userId) {
        const profile = this.getProfile(userId);
        
        if (!profile) {
            return '❌ Profil belum diset. Gunakan /setprofile untuk menambahkan data.';
        }

        const fields = [
            ['🐦 Twitter', profile.twitter],
            ['✈️ Telegram', profile.telegram],
            ['💬 Discord', profile.discord],
            ['📧 Email', profile.email],
            ['💰 Wallet', profile.wallet],
            ['👤 Name', profile.firstName && profile.lastName ? `${profile.firstName} ${profile.lastName}` : (profile.firstName || profile.lastName)]
        ];

        const summary = fields
            .filter(([_, value]) => value)
            .map(([label, value]) => `${label}: \`${value}\``)
            .join('\n');

        return summary || '❌ Belum ada data yang diset.';
    }

    /**
     * Check if profile is complete for form submission
     */
    isProfileComplete(userId, requiredFields = []) {
        const profile = this.getProfile(userId);
        if (!profile) return false;

        for (const field of requiredFields) {
            if (!profile[field]) return false;
        }

        return true;
    }
}

// Export singleton
const profileManager = new UserProfileManager();

// Auto-load on module init
profileManager.loadProfiles();

module.exports = profileManager;