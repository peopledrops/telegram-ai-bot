// openclaw-agent.js
// Konversi dari Python: from openclaw import Agent
// Agent dengan tool "exec" - bisa jalankan kode & command
// Terhubung ke OpenClaw Gateway kalau tersedia, fallback ke DeepSeek/Groq

require('dotenv').config();
const { execSync } = require('child_process');
const { OpenAI } = require('openai');
const os = require('os');
const fs = require('fs');
const path = require('path');

const OPENCLAW_URL = process.env.OPENCLAW_URL;
const OPENCLAW_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN;

// AI client (sama seperti ai-agent.js)
const AI_PROVIDER = process.env.DEEPSEK_API_KEY ? 'deepseek' : process.env.POE_API_KEY ? 'poe' : 'groq';
const AI_API_KEY = process.env.DEEPSEK_API_KEY || process.env.POE_API_KEY || process.env.GROQ_API_KEY;
const AI_BASE_URL = {
    deepseek: 'https://api.deepseek.com/v1',
    poe: 'https://api.poe.com/v1',
    groq: 'https://api.groq.com/openai/v1',
}[AI_PROVIDER];
const DEFAULT_MODEL = {
    deepseek: 'deepseek-chat',
    poe: 'Claude-Sonnet-4.5',
    groq: 'llama-3.3-70b-versatile',
}[AI_PROVIDER];

const client = new OpenAI({ apiKey: AI_API_KEY, baseURL: AI_BASE_URL });

// ===== EXEC TOOL =====
// Mirip tools=["exec"] di Python OpenClaw SDK
const EXEC_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'exec_command',
            description: 'Jalankan shell command atau kode. Gunakan untuk: hitung matematika, analisa data, konversi format, cek system info, jalankan script.',
            parameters: {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'Shell command yang akan dijalankan' },
                    language: { type: 'string', enum: ['bash', 'node', 'python3'], description: 'Bahasa/environment' }
                },
                required: ['command']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'exec_code',
            description: 'Jalankan kode JavaScript/Node.js dan kembalikan hasilnya. Cocok untuk kalkulasi, manipulasi data, format output.',
            parameters: {
                type: 'object',
                properties: {
                    code: { type: 'string', description: 'Kode JavaScript yang akan dijalankan' }
                },
                required: ['code']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'write_file',
            description: 'Buat file teks, simpan data, atau buat laporan',
            parameters: {
                type: 'object',
                properties: {
                    filename: { type: 'string', description: 'Nama file' },
                    content: { type: 'string', description: 'Isi file' }
                },
                required: ['filename', 'content']
            }
        }
    }
];

const SYSTEM_PROMPT = `Kamu adalah AI Agent dengan kemampuan EKSEKUSI KODE dan COMMAND langsung.

Kamu bisa:
- Menjalankan shell commands (bash)
- Menjalankan kode JavaScript/Node.js
- Membuat dan menyimpan file
- Melakukan kalkulasi kompleks
- Analisa dan manipulasi data
- Fetch data dari internet via Node.js

CARA KERJA:
- Saat user minta sesuatu yang butuh komputasi → LANGSUNG panggil exec_code atau exec_command
- Jangan hanya jelaskan — LAKUKAN dan tunjukkan hasilnya
- Kalau gagal, coba pendekatan lain

KEAMANAN:
- Jangan jalankan command yang bisa merusak sistem
- Jangan akses file sensitif (/etc/passwd, private keys, dll)
- Jangan jalankan infinite loop

Jawab dalam Bahasa Indonesia yang santai. Gunakan emoji relevan.`;

// Whitelist command yang aman
const DANGEROUS_PATTERNS = [
    /rm\s+-rf/i, /dd\s+if=/i, /mkfs/i, /format/i,
    /\/etc\/shadow/i, /\/etc\/passwd/i, /private.key/i,
    />\s*\/dev\/sd/i, /shutdown/i, /reboot/i, /halt/i,
];

function isSafeCommand(cmd) {
    return !DANGEROUS_PATTERNS.some(p => p.test(cmd));
}

function executeCommand(command, language = 'bash') {
    if (!isSafeCommand(command)) {
        return { success: false, output: 'Command ditolak: berpotensi berbahaya' };
    }
    try {
        const tmpDir = os.tmpdir();
        let result;
        if (language === 'node' || language === 'javascript') {
            const tmpFile = path.join(tmpDir, `exec_${Date.now()}.js`);
            fs.writeFileSync(tmpFile, command);
            result = execSync(`node ${tmpFile}`, { timeout: 10000, stdio: 'pipe' }).toString();
            try { fs.unlinkSync(tmpFile); } catch {}
        } else if (language === 'python3') {
            const tmpFile = path.join(tmpDir, `exec_${Date.now()}.py`);
            fs.writeFileSync(tmpFile, command);
            result = execSync(`python3 ${tmpFile}`, { timeout: 10000, stdio: 'pipe' }).toString();
            try { fs.unlinkSync(tmpFile); } catch {}
        } else {
            result = execSync(command, { timeout: 10000, stdio: 'pipe' }).toString();
        }
        return { success: true, output: result.trim().substring(0, 2000) };
    } catch (e) {
        return { success: false, output: e.message.substring(0, 500) };
    }
}

function executeCode(code) {
    if (!isSafeCommand(code)) {
        return { success: false, output: 'Kode ditolak: berpotensi berbahaya' };
    }
    try {
        // Jalankan JS code di context terbatas
        const tmpFile = path.join(os.tmpdir(), `code_${Date.now()}.js`);
        // Wrap dengan console.log capture
        const wrapped = `
const _results = [];
const _log = console.log;
console.log = (...args) => _results.push(args.map(String).join(' '));
try {
    const result = (function() {
        ${code}
    })();
    if (result !== undefined) _results.push(String(result));
} catch(e) { _results.push('Error: ' + e.message); }
console.log = _log;
process.stdout.write(_results.join('\\n'));
`;
        fs.writeFileSync(tmpFile, wrapped);
        const output = execSync(`node ${tmpFile}`, { timeout: 10000, stdio: 'pipe' }).toString();
        try { fs.unlinkSync(tmpFile); } catch {}
        return { success: true, output: output.trim().substring(0, 2000) || '(no output)' };
    } catch (e) {
        return { success: false, output: e.message.substring(0, 500) };
    }
}

// History per user
const conversations = new Map();

/**
 * Main: jalankan Agent dengan exec tools
 * Setara dengan: agent.run(user_text) di Python
 */
async function run(userId, userMessage) {
    // Init history
    if (!conversations.has(userId)) {
        conversations.set(userId, [{ role: 'system', content: SYSTEM_PROMPT }]);
    }
    const history = conversations.get(userId);
    history.push({ role: 'user', content: userMessage });

    // Trim history
    if (history.length > 20) {
        conversations.set(userId, [history[0], ...history.slice(-19)]);
    }

    // Kirim ke AI
    const response = await client.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: history,
        tools: EXEC_TOOLS,
        tool_choice: 'auto',
        max_tokens: 2000,
        temperature: 0.3,
    });

    const msg = response.choices[0].message;
    history.push(msg);

    // Proses tool calls
    if (msg.tool_calls && msg.tool_calls.length > 0) {
        const toolResults = [];

        for (const toolCall of msg.tool_calls) {
            const args = JSON.parse(toolCall.function.arguments || '{}');
            let result;

            console.log(`🔧 Exec tool: ${toolCall.function.name}`);

            if (toolCall.function.name === 'exec_command') {
                const execResult = executeCommand(args.command, args.language);
                result = execResult.success
                    ? `✅ Output:\n\`\`\`\n${execResult.output}\n\`\`\``
                    : `❌ Error: ${execResult.output}`;

            } else if (toolCall.function.name === 'exec_code') {
                const execResult = executeCode(args.code);
                result = execResult.success
                    ? `✅ Result:\n\`\`\`\n${execResult.output}\n\`\`\``
                    : `❌ Error: ${execResult.output}`;

            } else if (toolCall.function.name === 'write_file') {
                try {
                    const filePath = path.join('/tmp', args.filename);
                    fs.writeFileSync(filePath, args.content);
                    result = `✅ File tersimpan: ${args.filename} (${args.content.length} chars)`;
                } catch (e) {
                    result = `❌ Gagal simpan file: ${e.message}`;
                }
            }

            toolResults.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                content: result
            });
        }

        // Tambah hasil ke history
        for (const r of toolResults) history.push(r);

        // Minta AI buat respons final
        const finalResponse = await client.chat.completions.create({
            model: DEFAULT_MODEL,
            messages: history,
            max_tokens: 2000,
            temperature: 0.3,
        });

        const finalMsg = finalResponse.choices[0].message;
        history.push(finalMsg);
        return finalMsg.content;
    }

    return msg.content;
}

function reset(userId) {
    conversations.delete(userId);
}

module.exports = { run, reset };