// web-search.js
const axios = require('axios');
const cheerio = require('cheerio');

async function searchWeb(query, limit = 3) {
  // Gunakan DuckDuckGo API (gratis, no key)
  const url = `https://duckduckgo.com/html?q=${encodeURIComponent(query)}`;
  
  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    });
    
    const $ = cheerio.load(response.data);
    const results = [];
    
    $('.result').each((i, el) => {
      if (i >= limit) return false;
      const title = $(el).find('.result__title').text().trim();
      const snippet = $(el).find('.result__snippet').text().trim();
      const link = $(el).find('.result__url').attr('href');
      
      if (title && snippet) {
        results.push({ title, snippet, link });
      }
    });
    
    return results;
  } catch (error) {
    console.error('Web search error:', error.message);
    return [];
  }
}

// Jika user tanya info terbaru:
if (userMessage.match(/terbaru|latest|update|news|berita/i)) {
  const webResults = await searchWeb(userMessage);
  // Inject ke prompt untuk AI
}

module.exports = { searchWeb };