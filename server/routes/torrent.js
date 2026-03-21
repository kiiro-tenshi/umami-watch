import express from 'express';
import torrentStream from 'torrent-stream';

const router = express.Router();

// Cache engines per magnet — avoids re-announcing to DHT on range/seek requests
const engines = new Map();

const TWO_HOURS = 1000 * 60 * 120;

function getOrCreateEngine(magnet) {
  if (engines.has(magnet)) return engines.get(magnet);

  const engine = torrentStream(magnet, { connections: 100, uploads: 10 });
  engine._ready = false;

  engine.on('ready', () => {
    engine._ready = true;
    console.log('[Torrent] Engine ready, files:', engine.files.map(f => f.name).join(', '));
  });

  engine.on('error', (err) => {
    console.error('[Torrent] Engine error:', err.message);
    engines.delete(magnet);
    try { engine.destroy(); } catch {}
  });

  // Auto-cleanup after 2 hours
  setTimeout(() => {
    engines.delete(magnet);
    try { engine.destroy(); } catch {}
    console.log('[Torrent] Cleaned up stale engine');
  }, TWO_HOURS);

  engines.set(magnet, engine);
  return engine;
}

function streamFile(engine, req, res) {
  // Pick the largest file (almost always the video)
  const file = engine.files.reduce((a, b) => a.length > b.length ? a : b);
  const fileSize = file.length;
  const mimeType = file.name.endsWith('.mkv') ? 'video/x-matroska' : 'video/mp4';

  console.log(`[Torrent] Streaming "${file.name}" (${(fileSize / 1024 / 1024).toFixed(1)} MB)`);

  const range = req.headers.range;
  if (!range) {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
    });
    file.createReadStream().pipe(res);
    return;
  }

  const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
  const start = parseInt(startStr, 10);
  const end = endStr ? parseInt(endStr, 10) : fileSize - 1;

  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': (end - start) + 1,
    'Content-Type': mimeType,
  });
  file.createReadStream({ start, end }).pipe(res);
}

router.get('/stream', (req, res) => {
  const { magnet } = req.query;
  if (!magnet) return res.status(400).send('magnet query param required');

  const engine = getOrCreateEngine(magnet);

  engine.on('error', (err) => {
    if (!res.headersSent) res.status(500).send(err.message);
  });

  // KEY FIX: if engine already finished metadata, call directly instead of waiting for event
  if (engine._ready) {
    streamFile(engine, req, res);
  } else {
    engine.once('ready', () => streamFile(engine, req, res));
  }
});

// Progress endpoint so the frontend can poll while buffering
router.get('/status', (req, res) => {
  const { magnet } = req.query;
  if (!magnet) return res.status(400).json({ error: 'magnet required' });
  const engine = engines.get(magnet);
  if (!engine) return res.json({ ready: false, known: false });
  res.json({ ready: engine._ready, known: true, files: engine._ready ? engine.files.map(f => ({ name: f.name, size: f.length })) : [] });
});

export default router;
