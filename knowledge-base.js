// knowledge-base.js - Custom knowledge untuk bot
const knowledgeBase = {
  airdrops: {
    probechain: {
      name: 'ProbeChain',
      description: 'Layer-1 blockchain for IoT data verification',
      token: 'PRO',
      chain: 'Ethereum',
      officialLinks: {
        website: 'https://probechain.org',
        twitter: 'https://x.com/ProbeChain',
        telegram: 'https://t.me/ProbeChainOfficial',
        docs: 'https://docs.probechain.org'
      },
      airdropSteps: [
        'Follow Twitter @ProbeChain',
        'Join Telegram official group',
        'Submit wallet via form',
        'Complete testnet tasks (if any)'
      ],
      warnings: [
        'Jangan share private key ke siapapun',
        'Hanya gunakan wallet khusus airdrop',
        'Verifikasi URL sebelum submit data'
      ]
    },
    // Tambah project lain di sini...
  },
  
  faq: {
    'apa itu airdrop': 'Airdrop adalah distribusi token gratis dari project crypto untuk early supporters. Biasanya butuh follow social media, join community, atau complete tasks.',
    'cara aman ikut airdrop': '1) Gunakan wallet khusus (bukan main wallet), 2) Jangan pernah share private key, 3) Verifikasi URL official, 4) DYOR sebelum invest waktu/uang.',
    'kenapa claim gagal': 'Biasanya karena: 1) Snapshot sudah lewat, 2) Wallet tidak eligible, 3) Gas fee kurang, 4) Network congestion. Cek official announcement untuk detail.'
  },
  
  commands: {
    '/learn <url>': 'Pelajari airdrop dari link yang diberikan',
    '/autofill <url>': 'Auto-fill form airdrop dengan data profile Anda',
    '/setprofile <field> <value>': 'Update data sosial media/wallet Anda',
    '/myprofile': 'Lihat data profile yang tersimpan'
  }
};

// Function untuk search knowledge
function searchKnowledge(query) {
  const lower = query.toLowerCase();
  
  // Search airdrops
  for (const [key, data] of Object.entries(knowledgeBase.airdrops)) {
    if (lower.includes(key) || lower.includes(data.name.toLowerCase())) {
      return { type: 'airdrop', data };
    }
  }
  
  // Search FAQ
  for (const [q, a] of Object.entries(knowledgeBase.faq)) {
    if (lower.includes(q)) {
      return { type: 'faq', question: q, answer: a };
    }
  }
  
  return null;
}

module.exports = { knowledgeBase, searchKnowledge };