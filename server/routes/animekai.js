import express from 'express';

const router = express.Router();
const ANIKAI = 'https://anikai.to';
const ENCDEC = 'https://enc-dec.app/api';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const BASE_HEADERS = { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', 'Referer': 'https://anikai.to/' };
const AJAX_HEADERS = { ...BASE_HEADERS, 'X-Requested-With': 'XMLHttpRequest' };

async function encodeToken(text) {
  const res = await fetch(`${ENCDEC}/enc-kai?text=${encodeURIComponent(text)}`, { headers: { 'User-Agent': UA } });
  const data = await res.json();
  if (data.status !== 200) throw new Error('AnimeKai token encoding failed');
  return data.result;
}

async function decodeKai(text) {
  const res = await fetch(`${ENCDEC}/dec-kai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  if (data.status !== 200) throw new Error('AnimeKai embed decryption failed');
  return data.result;
}

async function decodeMega(text) {
  const res = await fetch(`${ENCDEC}/dec-mega`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ text, agent: UA }),
  });
  const data = await res.json();
  if (data.status !== 200) throw new Error('AnimeKai media decryption failed');
  return data.result;
}

function getAttr(str, name) {
  const m = str.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : null;
}

// GET /search?q=...
// Returns { shows: [{ id, slug, name, japaneseName }] }
router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q required' });
  try {
    const r = await fetch(`${ANIKAI}/ajax/anime/search?keyword=${encodeURIComponent(q)}`, { headers: AJAX_HEADERS });
    const data = await r.json();
    const html = data?.result?.html || '';

    const shows = [];
    const aRe = /<a\b[^>]*class="aitem"[^>]*href="\/watch\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = aRe.exec(html)) !== null) {
      const slug = m[1];
      const inner = m[2];
      const id = slug.split('-').pop();
      const titleMatch = inner.match(/class="title"[^>]*data-jp="([^"]*)"[^>]*>([^<]+)/);
      shows.push({
        id,
        slug,
        name: titleMatch?.[2]?.trim() || slug,
        japaneseName: titleMatch?.[1] || '',
      });
    }
    res.json({ shows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /episodes?slug=...  (full watch slug e.g. "one-piece-dk6r")
// Returns { episodes: [{ number, slug, token, hasSub, hasDub }] }
router.get('/episodes', async (req, res) => {
  const { slug } = req.query;
  if (!slug) return res.status(400).json({ error: 'slug required' });
  try {
    // Fetch the watch page to extract the internal ani_id (differs from URL slug ID)
    const pageRes = await fetch(`${ANIKAI}/watch/${slug}`, { headers: BASE_HEADERS });
    const pageHtml = await pageRes.text();

    const idCounts = {};
    const dataIdRe = /\bdata-id="([^"]+)"/g;
    let dm;
    while ((dm = dataIdRe.exec(pageHtml)) !== null) idCounts[dm[1]] = (idCounts[dm[1]] || 0) + 1;

    const UI_IDS = new Set(['episode', 'anime', 'report', 'request', 'signin', 'sub', 'softsub', 'dub']);
    let aniId = null, maxCount = 1;
    for (const [id, count] of Object.entries(idCounts)) {
      if (!UI_IDS.has(id) && !id.startsWith('t_') && !/^\d+$/.test(id) && count > maxCount) {
        maxCount = count; aniId = id;
      }
    }
    if (!aniId) throw new Error('Could not extract anime ID from page — series may not be on AnimeKai');

    const encoded = await encodeToken(aniId);
    const r = await fetch(`${ANIKAI}/ajax/episodes/list?ani_id=${aniId}&_=${encoded}`, { headers: AJAX_HEADERS });
    const data = await r.json();
    const html = data?.result || '';

    const episodes = [];
    const aRe = /<a\b([^>]*)>/g;
    let m;
    while ((m = aRe.exec(html)) !== null) {
      const attrs = m[1];
      const token = getAttr(attrs, 'token');
      if (!token) continue;
      const num = parseFloat(getAttr(attrs, 'num') || '0');
      const epSlug = getAttr(attrs, 'slug') || '';
      const langs = parseInt(getAttr(attrs, 'langs') || '0', 10);
      episodes.push({ number: num, slug: epSlug, token, hasSub: !!(langs & 1), hasDub: !!(langs & 2) });
    }
    res.json({ episodes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /sources?token=...&lang=sub|dub
// Returns { sources: [{ file }], tracks, skip, referer }
router.get('/sources', async (req, res) => {
  const { token, lang = 'sub' } = req.query;
  if (!token) return res.status(400).json({ error: 'token required' });
  try {
    const encodedToken = await encodeToken(token);
    const r = await fetch(`${ANIKAI}/ajax/links/list?token=${token}&_=${encodedToken}`, {
      headers: { ...AJAX_HEADERS, Referer: 'https://anikai.to/watch/' },
    });
    const data = await r.json();
    const html = data?.result || '';

    // Collect all linkIds for the matched language — try all servers so the frontend
    // can pick one whose CDN works through the Cloudflare Worker proxy.
    const blocks = html.split(/<div[^>]*class="[^"]*server-items[^"]*"/);
    const linkIds = [];

    const langPriority = lang === 'dub' ? ['dub'] : ['sub', 'softsub'];
    for (const targetLang of langPriority) {
      for (const block of blocks) {
        if (getAttr(block, 'data-id') !== targetLang) continue;
        const lids = [...block.matchAll(/data-lid="([^"]+)"/g)].map(m => m[1]);
        linkIds.push(...lids);
        break;
      }
      if (linkIds.length) break;
    }
    if (!linkIds.length) {
      const firstLid = html.match(/data-lid="([^"]+)"/);
      if (firstLid) linkIds.push(firstLid[1]);
    }
    if (!linkIds.length) throw new Error('No stream server found for this episode');

    // Resolve every linkId in parallel; keep whichever succeed
    async function resolveLink(linkId) {
      const encodedLink = await encodeToken(linkId);
      const viewRes = await fetch(`${ANIKAI}/ajax/links/view?id=${linkId}&_=${encodedLink}`, { headers: AJAX_HEADERS });
      const viewData = await viewRes.json();
      if (!viewData?.result) throw new Error('No embed data');
      const embedData = await decodeKai(viewData.result);
      const embedUrl = embedData?.url;
      if (!embedUrl) throw new Error('Embed URL decryption failed');
      const videoId = embedUrl.split('/').pop();
      const embedBase = embedUrl.includes('/e/') ? embedUrl.split('/e/')[0] : embedUrl.split('/').slice(0, -2).join('/');
      const mediaRes = await fetch(`${embedBase}/media/${videoId}`, { headers: { ...BASE_HEADERS, Referer: embedUrl } });
      const mediaData = await mediaRes.json();
      if (!mediaData?.result) throw new Error('No media data');
      const finalData = await decodeMega(mediaData.result);
      return {
        sources: (finalData?.sources || []).map(s => ({ file: s.file })),
        tracks: (finalData?.tracks || []).filter(t => t.kind !== 'thumbnails'),
        skip: embedData?.skip || {},
        referer: new URL(embedUrl).origin + '/',
      };
    }

    const settled = await Promise.allSettled(linkIds.map(resolveLink));
    const servers = settled.filter(r => r.status === 'fulfilled').map(r => r.value);
    if (!servers.length) throw new Error('No stream servers could be resolved');

    res.json({ servers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
