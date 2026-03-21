# UmamiStream

A private anime & movies streaming portal with synchronized watch party rooms.

*Created exclusively for Umami Dream precious member by The Boss Lady ©2026*

---

## Features

- **Anime** — Browse and stream anime episodes via HiAnime (self-hosted aniwatch-api)
- **Movies & TV** — Browse with TMDB metadata, stream via VidSrc embeds
- **Watch Rooms** — Create a room, invite friends via code, watch in sync
- **Playback Sync** — Host controls play/pause/seek; viewers stay in lockstep via Socket.IO
- **Live Chat** — Per-room chat stored in Firestore
- **Watch History** — Per-episode continue-watching, saved to Firestore
- **Watchlist** — Personal saved content list
- **Avatar Upload** — Canvas-resized base64 avatar, no Storage bucket needed
- **Bot Protection** — Cloudflare Turnstile on login

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS, HLS.js, Plyr |
| Backend | Node.js, Express, Socket.IO |
| Auth | Firebase Authentication |
| Database | Firestore |
| Anime API | [aniwatch-api](https://github.com/ghoshritesh12/aniwatch) (self-hosted) |
| Movie metadata | TMDB API |
| Infra | Google Cloud Run, Cloud Build, Secret Manager |
| CI/CD | Cloud Build tag triggers → auto deploy on `git tag` |

---

## Project Structure

```
umami-watch/
├── frontend/          # React + Vite SPA
│   └── src/
│       ├── pages/     # AuthPage, HomePage, WatchPage, RoomsPage, ...
│       ├── components/
│       └── api/       # aniwatch.js, tmdb.js, ...
├── server/            # Express + Socket.IO backend
│   ├── routes/        # users.js, rooms.js, torrent.js
│   ├── socket/        # roomSocket.js
│   └── middleware/    # requireAuth.js
├── Dockerfile         # Multi-stage: build frontend → serve with Node
├── cloudbuild.yaml    # CI/CD pipeline
└── docker-compose.yml # Local dev
```

---

## Local Development

### Prerequisites
- Node.js 20+
- Firebase project (Auth + Firestore enabled)
- A Firebase service account JSON file

### 1. Frontend

```bash
cd frontend
cp .env.example .env.local   # fill in your Firebase + API keys
npm install
npm run dev                  # http://localhost:5173
```

Required `.env.local` vars:
```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_API_BASE_URL=http://localhost:8080
VITE_TMDB_API_KEY=
VITE_TURNSTILE_SITE_KEY=       # use Cloudflare test key for localhost
```

### 2. Backend

```bash
cd server
cp .env.example .env           # fill in your config
npm install
npm run dev                    # http://localhost:8080
```

Required `.env` vars:
```
GOOGLE_APPLICATION_CREDENTIALS=../firebase-service-account.json
FIREBASE_PROJECT_ID=
FIREBASE_STORAGE_BUCKET=
ALLOWED_ORIGINS=http://localhost:5173
ANIWATCH_API_URL=http://localhost:4000
TURNSTILE_SECRET_KEY=          # use Cloudflare test secret for localhost
```

### 3. aniwatch-api (optional, for anime streaming)

```bash
docker run -p 4000:4000 ghcr.io/ghoshritesh12/aniwatch:latest
```

Or use `docker-compose up`.

---

## Deployment (Google Cloud Run)

Deployments are fully automated via **Cloud Build tag triggers**. Push a git tag to deploy.

```bash
git tag v0.1.0
git push origin v0.1.0
```

This triggers `cloudbuild.yaml` which:
1. Mirrors `aniwatch-api` from ghcr.io → GCR and deploys it to Cloud Run
2. Builds the main app Docker image (baking VITE_* vars from Secret Manager)
3. Pushes the image tagged with both `$TAG_NAME` and `latest`
4. Deploys the main app to Cloud Run with runtime secrets mounted from Secret Manager

### Required GCP Setup

1. **Enable APIs**: Cloud Run, Cloud Build, Container Registry, Secret Manager
2. **Create secrets** in Secret Manager (one per env var — see `cloudbuild.yaml`)
3. **Grant IAM**: the Compute Engine service account needs `Secret Manager Secret Accessor` on all secrets
4. **Create Cloud Build trigger**: tag trigger pointing to `cloudbuild.yaml`, with substitutions:
   - `_REGION` — e.g. `us-west1`
   - `_VITE_FIREBASE_AUTH_DOMAIN` — e.g. `your-project.firebaseapp.com`
   - `_VITE_FIREBASE_PROJECT_ID`
   - `_VITE_FIREBASE_STORAGE_BUCKET`
   - `_VITE_CONSUMET_API_URL`

All sensitive values (API keys, Firebase SA, etc.) live in **Secret Manager only** — never in the repo.

---

## Architecture Notes

- **Single service**: frontend and backend are served from the same Cloud Run container. Express serves the Vite build as static files and handles the SPA catch-all.
- **Socket.IO**: Cloud Run `--session-affinity` is required so WebSocket connections stick to one instance.
- **aniwatch-api**: deployed as a separate Cloud Run service (0 min instances to save cost); the main app proxies requests to it via `/api/proxy/aniwatch/*`.
- **HLS proxy**: `/api/proxy/hls` rewrites M3U8 URLs so the browser never directly contacts the upstream CDN (bypasses CORS + Referer restrictions).
- **Auth everywhere**: all API routes and socket connections require a valid Firebase ID token.

---

## Firestore Collections

| Collection | Purpose |
|------------|---------|
| `users/{uid}` | Profile (displayName, photoURL, watchlist) |
| `users/{uid}/history/{contentId}` | Per-episode watch progress |
| `rooms/{roomId}` | Room metadata, members, playback state |
| `rooms/{roomId}/messages` | Chat messages |

---

## Security

- Firebase Auth tokens verified server-side on every request and socket connection
- All proxy endpoints require authentication (`requireAuth` middleware)
- Chat messages validated: non-empty string, max 500 chars
- Playback control events restricted to the room host only
- All secrets stored in GCP Secret Manager — zero plaintext credentials in the repo
- Cloudflare Turnstile protects login against bots
