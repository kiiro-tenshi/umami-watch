/**
 * AllAnime API proxy routes
 * AllAnime GraphQL API: https://api.allanime.day/api
 * Provides search, episode lists, and source URLs for anime streaming.
 *
 * Source URL encoding: URLs prefixed with "--" are XOR-encoded (key=56).
 * Decoded Yt-mp4 URLs are direct MP4 files; play via /api/proxy/video range-proxy.
 * iframe-type sources embed directly in the browser.
 */
import express from 'express';

const router = express.Router();
const ALLANIME_API = 'https://api.allanime.day/api';
const ALLANIME_REFERER = 'https://allanime.to/';

function decodeUrl(encoded) {
  if (!encoded.startsWith('--')) return encoded;
  const hex = encoded.slice(2);
  return Array.from({ length: hex.length / 2 }, (_, i) =>
    String.fromCharCode(parseInt(hex.slice(i * 2, i * 2 + 2), 16) ^ 56)
  ).join('');
}

async function gqlPost(query, variables) {
  const res = await fetch(ALLANIME_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Referer': ALLANIME_REFERER,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`AllAnime API error: ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

// GET /api/anime/allanime/search?q=...
router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q required' });
  try {
    const data = await gqlPost(
      `query($s:SearchInput,$limit:Int,$page:Int){shows(search:$s,limit:$limit,page:$page){edges{_id,name,englishName,thumbnail}}}`,
      { s: { query: q }, limit: 10, page: 1 }
    );
    res.json({ shows: data.shows.edges });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/anime/allanime/show/:id — get episode list
router.get('/show/:id', async (req, res) => {
  try {
    const data = await gqlPost(
      `query($id:String!){show(_id:$id){_id,name,englishName,availableEpisodesDetail}}`,
      { id: req.params.id }
    );
    const show = data.show;
    // availableEpisodesDetail: { sub: ['1','2',...], dub: [...] }
    res.json({
      id: show._id,
      name: show.name,
      englishName: show.englishName,
      episodes: show.availableEpisodesDetail || {},
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/anime/allanime/sources?showId=...&ep=...&type=sub
router.get('/sources', async (req, res) => {
  const { showId, ep, type = 'sub' } = req.query;
  if (!showId || !ep) return res.status(400).json({ error: 'showId and ep required' });
  try {
    const data = await gqlPost(
      `query($id:String!,$ep:String!,$t:VaildTranslationTypeEnumType!){episode(showId:$id,translationType:$t,episodeString:$ep){sourceUrls}}`,
      { id: showId, ep, t: type }
    );
    const rawSources = data.episode?.sourceUrls || [];

    const sources = rawSources
      .filter(s => s.type === 'iframe' || (s.sourceUrl.startsWith('--') && !decodeUrl(s.sourceUrl).startsWith('/apivtwo')))
      .map(s => {
        const decodedUrl = decodeUrl(s.sourceUrl);
        return {
          name: s.sourceName,
          priority: s.priority,
          type: s.type === 'iframe' ? 'iframe' : 'direct',
          url: decodedUrl,
        };
      })
      .sort((a, b) => b.priority - a.priority);

    res.json({ sources });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
