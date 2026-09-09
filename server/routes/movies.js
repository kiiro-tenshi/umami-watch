import express from 'express';

const router = express.Router();

// Return only a stable content URL. Signed playlists are resolved at Cloudflare
// so their tokens and all media requests originate from the Worker.
router.get('/sources', (req, res) => {
  const { type, tmdbId, season = '1', episode = '1' } = req.query;
  if (!['movie', 'tv'].includes(type) || !/^[1-9]\d*$/.test(String(tmdbId || ''))
    || (type === 'tv' && (!/^\d+$/.test(String(season)) || !/^[1-9]\d*$/.test(String(episode))))) {
    return res.status(400).json({ error: 'Valid type, tmdbId, season and episode are required.' });
  }
  const path = type === 'movie' ? `/movie/${tmdbId}` : `/tv/${tmdbId}/${season}/${episode}`;
  res.json({ sources: [{ label: 'VixSrc HLS', embedUrl: `https://vixsrc.to${path}`, referer: 'https://vixsrc.to/', tracks: [] }] });
});

export default router;
