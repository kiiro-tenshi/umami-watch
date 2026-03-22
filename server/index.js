import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import compression from 'compression';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

// Firebase Admin init — prefers explicit service account file over ADC
import { existsSync, readFileSync } from 'fs';
import { Readable } from 'stream';

const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const projectId = process.env.FIREBASE_PROJECT_ID;
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || (projectId ? `${projectId}.firebasestorage.app` : undefined);

if (saPath && existsSync(saPath)) {
  const sa = JSON.parse(readFileSync(saPath, 'utf8'));
  admin.initializeApp({
    credential: admin.credential.cert(sa),
    projectId: projectId || sa.project_id,
    storageBucket,
  });
} else {
  // Cloud Run / GKE with Workload Identity — or local if ADC is configured
  admin.initializeApp({ projectId, storageBucket });
}

import userRoutes from './routes/users.js';
import createRoomRouter from './routes/rooms.js';
import torrentRoutes from './routes/torrent.js';
import setupSockets from './socket/roomSocket.js';
import requireAuth from './middleware/requireAuth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:8080'];

const io = new Server(httpServer, { cors: { origin: allowedOrigins, methods: ['GET', 'POST'] } });

app.use(compression({
  filter: (req, res) => req.path.startsWith('/api/proxy/hls') ? false : compression.filter(req, res),
}));
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// ─── Health ────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// ─── Cloudflare Turnstile Verification ─────────────────────────────────────
app.post('/api/verify-turnstile', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, error: 'Missing token' });

  // On localhost the frontend uses Cloudflare's test site key, so use the matching test secret.
  // In production, use the real secret from env.
  const origin = req.headers.origin || req.headers.referer || '';
  const isLocal = /localhost|127\.0\.0\.1/.test(origin);
  const secretKey = isLocal
    ? '1x0000000000000000000000000000000AA'
    : (process.env.TURNSTILE_SECRET_KEY || '1x0000000000000000000000000000000AA');

  try {
    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: secretKey, response: token }),
    });
    const data = await result.json();
    res.json({ success: data.success, error: data['error-codes']?.[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── API Routes ────────────────────────────────────────────────────────────
app.use('/api/me', userRoutes);
app.use('/api/rooms', createRoomRouter(io));
app.use('/api/torrent', requireAuth, torrentRoutes);

// ─── HLS Proxy (fallback when Cloudflare Worker is blocked by CDN) ──────────
app.get('/api/proxy/hls', async (req, res) => {
  const { url, referer } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });

  const decodedUrl     = decodeURIComponent(url);
  const decodedReferer = decodeURIComponent(referer || 'https://hianime.to/');

  try {
    const upstream = await fetch(decodedUrl, {
      headers: {
        'Referer':    decodedReferer,
        'Origin':     new URL(decodedReferer).origin,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!upstream.ok) return res.status(upstream.status).send(await upstream.text());

    const contentType = upstream.headers.get('content-type') || '';
    res.setHeader('Access-Control-Allow-Origin', '*');

    const isM3u8 = contentType.includes('mpegurl') || decodedUrl.includes('.m3u8');
    if (isM3u8) {
      const text   = await upstream.text();
      const urlObj = new URL(decodedUrl);
      const base   = urlObj.origin + urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf('/') + 1);
      const proto = req.headers['x-forwarded-proto'] || req.protocol;
      const proxyBase = `${proto}://${req.get('host')}/api/proxy/hls`;

      const proxify = (raw) => {
        const abs = raw.startsWith('http') ? raw
          : raw.startsWith('/') ? urlObj.origin + raw
          : base + raw;
        return `${proxyBase}?url=${encodeURIComponent(abs)}&referer=${encodeURIComponent(decodedReferer)}`;
      };

      const rewritten = text.split('\n').map(line => {
        const t = line.trim();
        if (!t) return line;
        if (t.startsWith('#') && t.includes('URI="'))
          return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${proxify(u)}"`);
        if (t.startsWith('#')) return line;
        return proxify(t);
      }).join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'public, max-age=5');
      return res.send(rewritten);
    }

    // .ts segments never change — safe to cache aggressively
    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=3600, immutable');
    const cl = upstream.headers.get('content-length');
    if (cl) res.setHeader('Content-Length', cl);
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ─── MangaDex Proxy (browser CORS blocks direct calls from production) ──────
app.get('/api/proxy/mangadex/*', requireAuth, async (req, res) => {
  const mdPath = req.params[0];
  // Preserve raw query string intact so array params (includes[], contentRating[]) survive
  const rawQuery = req.originalUrl.split('?').slice(1).join('?');
  const targetUrl = `https://api.mangadex.org/${mdPath}${rawQuery ? '?' + rawQuery : ''}`;
  try {
    const response = await fetch(targetUrl, {
      headers: { 'User-Agent': 'UmamiStream/1.0' }
    });
    if (!response.ok) return res.status(response.status).json({ error: 'MangaDex error', status: response.status });
    res.json(await response.json());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ─── Aniwatch Proxy (forwards to self-hosted aniwatch-api) ─────────────────
app.get('/api/proxy/aniwatch/*', requireAuth, async (req, res) => {
  const base = process.env.ANIWATCH_API_URL || 'http://localhost:4000';
  const path = req.params[0];
  try {
    const targetUrl = new URL(`/api/v2/hianime/${path}`, base);
    Object.entries(req.query).forEach(([k, v]) => targetUrl.searchParams.set(k, v));
    const response = await fetch(targetUrl.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Aniwatch API error', status: response.status });
    }
    res.json(await response.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Socket.IO ─────────────────────────────────────────────────────────────
setupSockets(io);

// ─── Static + SPA catch-all ────────────────────────────────────────────────
// Vite fingerprints assets (JS/CSS/images) with content hashes → safe to cache 1 year.
// index.html must not be cached so users always get the latest shell.
app.use(express.static(resolve(__dirname, '../public'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (/\.[a-f0-9]{8,}\.(js|css|woff2?|ttf|webp|png|svg)$/i.test(filePath)) {
      // Fingerprinted assets — immutable for 1 year
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(resolve(__dirname, '../public/index.html'));
});

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
