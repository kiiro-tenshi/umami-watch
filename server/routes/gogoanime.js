import express from 'express';

const router = express.Router();
const GOGO = 'https://anitaku.to';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`GogoAnime fetch error: ${res.status} ${url}`);
  return res.text();
}

function parseSearchResults(html) {
  const shows = [];
  const re = /href="\/category\/([^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]*)"[^>]*>[\s\S]*?class="name"[^>]*>([^<]+)</g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1];
    if (!shows.find(s => s.slug === slug)) {
      shows.push({ slug, thumbnail: m[2], title: m[3].trim() });
    }
  }
  return shows;
}

function parseEpisodeNumbers(html, slug) {
  const nums = new Set();
  const re = new RegExp(`href="/${slug}-episode-(\\d+(?:\\.\\d+)?)"`, 'g');
  let m;
  while ((m = re.exec(html)) !== null) nums.add(parseFloat(m[1]));
  return [...nums].sort((a, b) => a - b).map(n => ({ number: n }));
}

function parseEmbedUrls(html) {
  const urls = [];
  const re = /data-video="(https:\/\/[^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) urls.push(m[1]);
  return urls;
}

// Short vibeplayer ID: exactly 16 lowercase hex chars, no 'ag' prefix, no trailing 'h'
function pickVibeId(embedUrls) {
  for (const u of embedUrls) {
    try {
      const parsed = new URL(u);
      if (parsed.hostname !== 'vibeplayer.site') continue;
      const id = parsed.pathname.slice(1).split('?')[0];
      if (/^[0-9a-f]{16}$/.test(id)) return { id, url: parsed };
    } catch { /* skip malformed */ }
  }
  return null;
}

// GET /api/anime/gogoanime/search?q=
router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q required' });
  try {
    const html = await fetchHtml(`${GOGO}/search.html?keyword=${encodeURIComponent(q)}`);
    const shows = parseSearchResults(html);
    res.json({ shows });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/anime/gogoanime/episodes?slug=
router.get('/episodes', async (req, res) => {
  const { slug } = req.query;
  if (!slug) return res.status(400).json({ error: 'slug required' });
  try {
    const html = await fetchHtml(`${GOGO}/category/${encodeURIComponent(slug)}`);
    const episodes = parseEpisodeNumbers(html, slug);
    res.json({ episodes });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/anime/gogoanime/sources?slug=&ep=
router.get('/sources', async (req, res) => {
  const { slug, ep } = req.query;
  if (!slug || !ep) return res.status(400).json({ error: 'slug and ep required' });
  try {
    const html = await fetchHtml(`${GOGO}/${encodeURIComponent(slug)}-episode-${ep}`);
    const embeds = parseEmbedUrls(html);
    const vibe = pickVibeId(embeds);
    if (!vibe) return res.status(404).json({ error: 'No vibeplayer source found for this episode' });

    const hlsUrl = `https://vibeplayer.site/public/stream/${vibe.id}/master.m3u8`;
    const subUrl = vibe.url.searchParams.get('sub') || null;
    const tracks = subUrl ? [{ kind: 'captions', label: 'English', src: subUrl }] : [];

    res.json({ hlsUrl, tracks });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
