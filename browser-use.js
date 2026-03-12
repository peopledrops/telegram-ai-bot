// browser-use.js - Browser Use Cloud API Integration
// Docs: https://docs.cloud.browser-use.com
// Daftar & dapat $10 free credit: https://cloud.browser-use.com
// Tambah ke Railway Variables: BROWSER_USE_API_KEY=bu_xxxxxx

require('dotenv').config();

const API_BASE = 'https://api.browser-use.com/api/v1';

class BrowserUseClient {

    constructor(apiKey) {
        this.apiKey = apiKey || process.env.BROWSER_USE_API_KEY;
        if (!this.apiKey) throw new Error('BROWSER_USE_API_KEY tidak ditemukan di environment variables');
    }

    // ===== HELPER: Fetch wrapper =====
    async request(method, path, body = null) {
        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
        };
        if (body) options.body = JSON.stringify(body);

        const res = await fetch(`${API_BASE}${path}`, options);
        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Browser Use API error ${res.status}: ${err}`);
        }
        return res.json();
    }

    // ===== RUN TASK =====
    // Kirim instruksi natural language ke cloud browser
    async runTask(taskDescription, options = {}) {
        const body = { task: taskDescription };
        if (options.sessionId) body.session_id = options.sessionId;
        if (options.model) body.llm_model = options.model; // e.g. 'gpt-4o', 'claude-3-5-sonnet'

        const result = await this.request('POST', '/run-task', body);
        return result; // { task_id, status, live_url }
    }

    // ===== GET TASK STATUS =====
    async getTask(taskId) {
        return this.request('GET', `/task/${taskId}`);
    }

    // ===== WAIT FOR TASK COMPLETE =====
    async waitForTask(taskId, timeoutMs = 120000, pollIntervalMs = 3000) {
        const start = Date.now();

        while (Date.now() - start < timeoutMs) {
            const task = await this.getTask(taskId);

            if (task.status === 'finished' || task.status === 'done') {
                return { success: true, task };
            }
            if (task.status === 'failed' || task.status === 'error') {
                return { success: false, task, error: task.error || 'Task failed' };
            }
            if (task.status === 'stopped') {
                return { success: false, task, error: 'Task was stopped' };
            }

            // Masih running, tunggu sebentar
            await new Promise(r => setTimeout(r, pollIntervalMs));
        }

        return { success: false, error: 'Timeout: task tidak selesai dalam 2 menit' };
    }

    // ===== STOP TASK =====
    async stopTask(taskId) {
        return this.request('PUT', `/stop-task/${taskId}`);
    }

    // ===== AUTO FILL AIRDROP FORM =====
    // Fungsi utama: buka URL, isi form dengan profil user, submit
    async autoFillAirdropForm(url, profile, options = {}) {
        if (!url) throw new Error('URL diperlukan');
        if (!profile) throw new Error('Profile diperlukan');

        // Buat instruksi detail untuk AI browser
        const profileDetails = [];
        if (profile.twitter)  profileDetails.push(`Twitter/X username: ${profile.twitter}`);
        if (profile.telegram) profileDetails.push(`Telegram username: ${profile.telegram}`);
        if (profile.discord)  profileDetails.push(`Discord username: ${profile.discord}`);
        if (profile.email)    profileDetails.push(`Email: ${profile.email}`);
        if (profile.wallet)   profileDetails.push(`Wallet/ETH address: ${profile.wallet}`);
        if (profile.firstName) profileDetails.push(`Name: ${profile.firstName}`);

        const task = `
Go to this URL: ${url}

Fill out the airdrop/registration form with this information:
${profileDetails.join('\n')}

Instructions:
1. Navigate to the URL
2. Find all visible form fields
3. Fill in the matching fields using the profile information above
4. For Twitter/X fields: enter "${profile.twitter || ''}" (remove @ if needed)
5. For wallet/address fields: enter "${profile.wallet || ''}"
6. For email fields: enter "${profile.email || ''}"
7. Click the Submit/Register/Join button
8. Wait for confirmation and report the result

If a field is not in the profile info, skip it. Do not fill in fake data.
Report: how many fields were filled, whether form was submitted successfully, and any confirmation message shown.
        `.trim();

        console.log(`🌐 Browser Use: Starting airdrop form fill for ${url}`);

        // Jalankan task
        const taskResult = await this.runTask(task, options);
        console.log(`📋 Task created: ${taskResult.task_id}`);
        console.log(`👁️ Live preview: ${taskResult.live_url}`);

        return {
            taskId: taskResult.task_id,
            status: taskResult.status,
            liveUrl: taskResult.live_url,
        };
    }

    // ===== AUTO FILL + TUNGGU HASIL =====
    async autoFillAndWait(url, profile, options = {}) {
        const started = await this.autoFillAirdropForm(url, profile, options);
        console.log(`⏳ Waiting for task ${started.taskId}...`);

        const result = await this.waitForTask(started.taskId, options.timeoutMs || 120000);

        return {
            ...started,
            ...result,
            output: result.task?.output || result.task?.result || null,
        };
    }

    // ===== CEK SALDO BROWSER USE =====
    async getCredits() {
        try {
            const info = await this.request('GET', '/me');
            return info;
        } catch (e) {
            return { error: e.message };
        }
    }
}

// ===== SINGLETON =====
let client = null;

function getClient() {
    if (!client) {
        const apiKey = process.env.BROWSER_USE_API_KEY;
        if (!apiKey) return null;
        try {
            client = new BrowserUseClient(apiKey);
        } catch (e) {
            console.warn('⚠️ Browser Use client error:', e.message);
            return null;
        }
    }
    return client;
}

module.exports = { BrowserUseClient, getClient };