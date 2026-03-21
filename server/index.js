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

app.use(compression());
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
