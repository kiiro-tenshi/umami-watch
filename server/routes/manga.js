import express from 'express';

const router = express.Router();
const MB = 'https://mangabuddy.com';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://mangabuddy.com/',
};

async function fetchHtml(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`MangaBuddy returned ${res.status} for ${url}`);
  return res.text();
}

// Search by title — returns [{ slug, title }]
router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  try {
    const html = await fetchHtml(`${MB}/search?q=${encodeURIComponent(q)}`);
    const results = [];
    // Matches thumbnail anchor: <a title="TITLE" href="/SLUG"><img
    const re = /<a title="([^"]+)" href="\/([^/">\s]+)"><img/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      results.push({ slug: m[2], title: m[1] });
    }
    res.json(results.slice(0, 10));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Chapter list for a slug — returns MangaDex-shaped chapter objects
router.get('/chapters', async (req, res) => {
  const { slug } = req.query;
  if (!slug) return res.json([]);
  try {
    const html = await fetchHtml(`${MB}/${slug}`);
    const chapters = [];
    // Matches: <a href="/slug/chapter-N" title="..."><div><strong class="chapter-title">Chapter N</strong>
    const re = /<a href="\/([\w-]+)\/(chapter-[\w-]+)"[^>]*><div><strong[^>]*>Chapter ([\d.]+)/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const [, mangaSlug, chapterSlug, chapterNum] = m;
      chapters.push({
        id: `${mangaSlug}~${chapterSlug}`,
        attributes: { chapter: chapterNum, title: null, translatedLanguage: 'en' },
        relationships: [],
      });
    }
    // HTML lists newest first — reverse to ascending
    res.json(chapters.reverse());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Chapter images — returns array of image URLs
router.get('/pages', async (req, res) => {
  const { slug, chapter } = req.query;
  if (!slug || !chapter) return res.json([]);
  try {
    const html = await fetchHtml(`${MB}/${slug}/${chapter}`);

    // Strategy 1: comma-separated URL list in page (hash-named files, newer chapters)
    const csvMatch = html.match(/(https:\/\/s\d+\.mbcdns\w+\.org\/res\/manga\/[^\s"]+\.(?:jpg|webp|png)(?:,https:\/\/[^\s"]+\.(?:jpg|webp|png))+)/);
    if (csvMatch) {
      return res.json(csvMatch[1].split(',').filter(u => u.startsWith('https://')));
    }

    // Strategy 2: sequential filenames (older chapters) — extract base + total from "Loading X/N"
    const imgMatch = html.match(/<img\s+src="(https:\/\/[^"]+\/res\/manga\/[^/]+\/[^/]+\/)1\.(jpg|webp|png)"/);
    if (!imgMatch) return res.json([]);
    const base = imgMatch[1];
    const ext = imgMatch[2];

    const totalMatch = html.match(/Loading \d+\/(\d+)/);
    let total = totalMatch ? parseInt(totalMatch[1]) : 0;
    if (!total) {
      const allNums = [...html.matchAll(new RegExp(`${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)\\.${ext}`, 'g'))];
      total = allNums.reduce((max, m) => Math.max(max, parseInt(m[1])), 0);
    }
    if (!total) return res.json([]);
    res.json(Array.from({ length: total }, (_, i) => `${base}${i + 1}.${ext}`));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
