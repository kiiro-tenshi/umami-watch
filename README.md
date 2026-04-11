# UmamiWatch

A premium, private anime & movies portal with real-time synchronized watch party rooms. Designed for high-performance streaming with minimal infrastructure overhead.

*Created exclusively for Umami Dream precious members by The Boss Lady ©2026*

---

## System Architecture

UmamiWatch is built as a cloud-native streaming platform. It uses a multi-layered proxying system to ensure availability and bypass CDN restrictions, with video bandwidth routed through Cloudflare Workers to eliminate Cloud Run egress costs.

### System Overview
```mermaid
graph TD
    User([User Browser]) --> CF[Cloudflare DNS/SSL]
    CF --> CR_Main[Cloud Run: umami-watch]

    subgraph CR_Main_Sub [Main Express Service]
        Express[Express Middlewares]
        HLS_Fallback[HLS Fallback Proxy]
        SocketIO[Socket.IO Server]
        AdminSDK[Firebase Admin SDK]
        Frontend[React SPA Bundle]
    end

    subgraph CFWorker [Cloudflare Worker: umami-hls-proxy]
        HLS_Worker[HLS Manifest Rewriter + Edge Cache]
        Video_Worker[Direct MP4 Range Proxy]
    end

    CR_Main_Sub --> Firestore[(Firestore DB)]
    CR_Main_Sub --> Auth{Firebase Auth}

    User -->|HLS streams| CFWorker
    User -->|Direct MP4 video| CFWorker
    CFWorker -->|Referer-injected fetch| StreamCDNs[Stream CDNs: fast4speed, MegaCloud]

    HLS_Fallback -.->|Fallback if Worker blocked| StreamCDNs

    User --> AllAnime[AllAnime GraphQL API]
    User --> TMDB[TMDB API: Movies/TV Meta]
    User --> Kitsu[Kitsu API: Anime Meta]
    User --> MangaDex[MangaDex API]
    User --> ComicK[ComicK]
```

### Real-time Synchronization Flow
UmamiWatch uses a **Distributed Sync Strategy** to ensure all viewers stay within **< 1s** of the host's playback position.

```mermaid
sequenceDiagram
    participant H as Host Browser
    participant S as Socket.IO Server
    participant V as Viewer Browser
    participant F as Firestore

    H->>S: playback:play (position)
    S->>V: playback:play (position)
    S->>F: Update playback state (async)

    loop Heartbeat (Every 3s)
        H->>S: playback:heartbeat
        S->>V: sync:state (drift correction)
    end

    V->>S: request-sync (after buffer/lag)
    S->>H: viewer-needs-sync
    H->>S: sync-response (current pos)
    S->>V: sync:state
```

---

## Key Features

- **Anime Portal** — Search and stream anime via AllAnime (allanime.to) with sub/dub support.
- **Movies & TV** — Metadata via TMDB with multiple embed sources (VidSrc CC/Net).
- **Watch Party Rooms** — Create private rooms; host picks the episode and all viewers sync in real-time.
- **Sync Playback** — Host-controlled play/pause/seek with automated drift correction for viewers.
- **Live Chat** — Real-time room chat with history persisted in Firestore.
- **Personal Hub** — Continue-watching history, personal watchlist, and custom avatar upload.
- **Bot Protection** — Cloudflare Turnstile integrated at the auth layer.
- **Manga & Comics (Beta)** — Proxied metadata via MangaDex and ComicK with image proxy.

---

## Technical Deep Dive

### 1. Anime Streaming via AllAnime

Anime streams are sourced from **AllAnime** (`api.allanime.day` GraphQL API). The previous provider (aniwatch-api / HiAnime scraper) was DMCA'd by Crunchyroll in March 2026 and is no longer usable.

AllAnime source types:
- **`iframe`** — embedded player URL, rendered directly in the browser.
- **`direct` (XOR-encoded)** — URLs decoded with key 56 that resolve to `tools.fast4speed.rsvp`. These are direct MP4 files with no CORS headers, proxied through the Cloudflare Worker with `Range` header pass-through for seeking.

### 2. <img src="cloudflare-worker/CF%20Logo.webp" height="20" alt="Cloudflare" /> Worker Proxy (Zero Cloud Run Egress for Video)

All video bandwidth is routed through the **Cloudflare Worker** (`umami-hls-proxy`) instead of Cloud Run, eliminating video egress charges entirely:

- **HLS path** — The Worker rewrites `.m3u8` manifests so all segment URLs point back through itself. Segments are cached at the Cloudflare edge (1h TTL), meaning watch party members sharing an episode hit cache after the first viewer loads each segment.
- **Direct MP4 path** — The Worker forwards `Range` requests to fast4speed with `Referer: https://allanime.to/` injected and streams the response body directly without buffering. Returns `206 Partial Content` with correct `Content-Range` headers for seeking.
- **Fallback** — Cloud Run retains an `/api/proxy/hls` fallback for cases where the Worker's IP range gets blocked by a CDN.

A ~400MB episode stream generates **zero Cloud Run egress charges**.

### 3. Distributed Playback Sync

Synchronization is handled via **Socket.IO** with a drift-correction algorithm:
- **Heartbeat** — The host emits a heartbeat every 3 seconds. Viewers calculate their drift. If drift exceeds **1 second**, the viewer's player automatically seeks to match the host.
- **State Persistence** — Room playback state is written to Firestore asynchronously, allowing users to resume rooms even if the host disconnects.

### 4. Manga & Comics

Manga metadata and chapters are sourced from **MangaDex** (primary) with **ComicK** as a fallback when a title has fewer than 10 English chapters on MangaDex.

ComicK uses the `comick.art` domain directly — `api.comick.dev` is protected by Cloudflare Bot Management and blocks requests from cloud server IPs. Chapter images are proxied through Cloud Run with `Referer: https://comick.art/` injection.

### 5. Security Model

- **Firebase Admin SDK** — All database operations go through the Express backend. The frontend has no direct Firestore access.
- **JWT Auth** — Every API request and socket connection requires a valid Firebase ID token verified server-side.
- **Turnstile Verification** — Cloudflare Turnstile tokens are verified on the server before granting access.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, Tailwind CSS, Plyr, HLS.js |
| **Backend** | Node.js, Express, Socket.IO |
| **Database** | Google Firestore |
| **Auth** | Firebase Authentication |
| **Compute** | Google Cloud Run (Serverless) |
| **Video Proxy** | <img src="cloudflare-worker/CF%20Logo.webp" height="16" alt="Cloudflare" /> Worker (free egress) |
| **Anime Source** | AllAnime GraphQL API |
| **Anime Metadata** | Kitsu API |
| **Movie/TV Metadata** | TMDB API |
| **Manga** | MangaDex API, ComicK |
| **CI/CD** | Cloud Build (auto-deploy on `git tag`) |

---

## Environment Variables

> [!IMPORTANT]
> All sensitive keys must be stored in **Google Cloud Secret Manager** and never committed to the repository.

### Frontend (`.env`)
```bash
VITE_FIREBASE_API_KEY=your_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_TMDB_API_KEY=your_tmdb_key
VITE_TURNSTILE_SITE_KEY=your_cloudflare_site_key
VITE_API_BASE_URL=http://localhost:8080
VITE_HLS_PROXY_URL=https://umami-hls-proxy.<subdomain>.workers.dev
```

### Backend (`server/.env`)
```bash
GOOGLE_APPLICATION_CREDENTIALS=../firebase-service-account.json
FIREBASE_PROJECT_ID=your_id
FIREBASE_STORAGE_BUCKET=your_bucket
ALLOWED_ORIGINS=http://localhost:5173
TURNSTILE_SECRET_KEY=your_cloudflare_secret
```

---

## Deployment

Deployments are fully automated via **Cloud Build tag triggers**.

1. **Tag your release:**
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. **What happens:**
   - The main app Docker image is built with Vite build-time vars baked in.
   - The image is deployed to Cloud Run with secrets mounted from Secret Manager.

3. **Cloudflare Worker** — Deploy `cloudflare-worker/hls-proxy.js` separately via the Cloudflare dashboard or `wrangler deploy`. The Worker handles both HLS and direct MP4 proxying and must be redeployed independently of Cloud Run.

> [!TIP]
> Cloud Run **Session Affinity** must be enabled for the main service to ensure WebSocket stability.

---

*UmamiWatch — Sharing moments, frame by frame.*
