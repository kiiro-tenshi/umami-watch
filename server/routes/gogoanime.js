import express from 'express';

const router = express.Router();
const GOGO = 'https://anineko.to';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`GogoAnime fetch error: ${res.status} ${url}`);
  return res.text();
}

function parseSearchResults(html) {
  const shows = [];
  const re = /<a class="nv-anime-thumb[^"]*" href="\/watch\/([^"\/]+)">\s*<img[^>]+src="([^"]*)"[^>]*alt="([^"]*)"/g;
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
  const re = new RegExp(`href="/watch/${slug}/ep-(\\d+(?:\\.\\d+)?)"`, 'g');
  let m;
  while ((m = re.exec(html)) !== null) nums.add(parseFloat(m[1]));
  return [...nums].sort((a, b) => a - b).map(n => ({ number: n }));
}

const HLS_EMBED_HOSTS = new Set(['vivibebe.site', 'otakuhg.site', 'otakuvid.online']);

function decodeHtml(value) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function sourceKind(buttonHtml) {
  const span = buttonHtml.match(/<span\b[^>]*>([\s\S]*?)<\/span>/i)?.[1] || buttonHtml;
  const text = decodeHtml(span.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  if (/hard\s*sub/i.test(text)) return 'Hard Sub';
  // AniNeko currently spells this tab "Sort Sub"; accept both spellings.
  if (/(?:soft|sort)\s*sub/i.test(text)) return 'Soft Sub';
  if (/\bdub\b/i.test(text)) return 'Dub';
  return 'HLS';
}

function subtitleTracks(url) {
  const tracks = [];
  const softSub = url.searchParams.get('sub');
  if (softSub) tracks.push({ kind: 'captions', label: 'English', src: softSub });

  for (let i = 1; i <= 10; i += 1) {
    const src = url.searchParams.get('caption_' + i);
    if (!src) continue;
    tracks.push({
      kind: 'captions',
      label: url.searchParams.get('sub_' + i) || 'Subtitle ' + i,
      src,
    });
  }
  return tracks;
}

// Parse and prioritize a small HLS candidate pool. The Cloudflare Worker verifies
// availability and resolves each embed so IP/ASN-bound manifest tokens are minted
// and consumed at Cloudflare, never at Cloud Run.
export function parseHlsEmbedSources(html) {
  const raw = [];
  const buttonRe = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  let button;

  while ((button = buttonRe.exec(html)) !== null) {
    const attr = button[1].match(/\bdata-video=(['"])(https:\/\/.*?)\1/i);
    if (!attr) continue;

    try {
      const url = new URL(decodeHtml(attr[2]));
      if (!HLS_EMBED_HOSTS.has(url.hostname)) continue;
      raw.push({ kind: sourceKind(button[2]), embedUrl: url.href, tracks: subtitleTracks(url) });
    } catch { /* skip malformed embed URLs */ }
  }

  const seen = new Set();
  const providerCounts = new Map();
  const labeled = raw.filter(source => {
    if (seen.has(source.embedUrl)) return false;
    seen.add(source.embedUrl);
    return true;
  }).map(source => {
    const count = (providerCounts.get(source.kind) || 0) + 1;
    providerCounts.set(source.kind, count);
    return { ...source, label: source.kind + ' ' + count };
  });

  // Return a small prioritized candidate pool. The browser asks the Cloudflare
  // Worker to verify these and displays only the first two that really work.
  // Provider priority applies to both hard and soft subs, which matters for shows
  // such as Grand Blue that do not expose any hard-sub mirrors.
  const kindRank = { 'Hard Sub': 0, 'Soft Sub': 1, Dub: 2, HLS: 3 };
  const hostRank = { 'otakuvid.online': 0, 'otakuhg.site': 1, 'vivibebe.site': 2 };
  return labeled.sort((left, right) => {
    const leftUrl = new URL(left.embedUrl);
    const rightUrl = new URL(right.embedUrl);
    return ((kindRank[left.kind] ?? 9) * 10 + (hostRank[leftUrl.hostname] ?? 9))
      - ((kindRank[right.kind] ?? 9) * 10 + (hostRank[rightUrl.hostname] ?? 9));
  }).slice(0, 4);
}

// GET /api/anime/gogoanime/search?q=
router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q required' });
  try {
    const html = await fetchHtml(`${GOGO}/browse?keyword=${encodeURIComponent(q)}`);
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
    const html = await fetchHtml(`${GOGO}/watch/${encodeURIComponent(slug)}`);
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
    const html = await fetchHtml(`${GOGO}/watch/${encodeURIComponent(slug)}/ep-${ep}`);
    const sources = parseHlsEmbedSources(html);
    if (!sources.length) return res.status(404).json({ error: 'No supported HLS source found for this episode' });

    res.json({ sources });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
