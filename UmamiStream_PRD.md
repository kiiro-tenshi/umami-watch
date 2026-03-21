# UmamiStream — Product Requirements Document

**Anime & Movies Streaming Portal with Watch Party**
Version 1.1 · March 2026 · Confidential
*Created exclusively for Umami Dream precious member by The Boss Lady ©2026*

---

## Table of Contents

1. [Product Overview & Goals](#1-product-overview--goals)
2. [Tech Stack & Architecture](#2-tech-stack--architecture)
3. [Infrastructure & Deployment](#3-infrastructure--deployment)
4. [Environment Variables & Secrets](#4-environment-variables--secrets)
5. [Database Schema (Firestore)](#5-database-schema-firestore)
6. [Content APIs](#6-content-apis)
7. [Feature Specifications](#7-feature-specifications)
8. [API Endpoints (Backend)](#8-api-endpoints-backend)
9. [WebSocket Events](#9-websocket-events)
10. [Security Model](#10-security-model)
11. [Page & Component Map](#11-page--component-map)
12. [Error Handling & Edge Cases](#12-error-handling--edge-cases)

---

## 1. Product Overview & Goals

UmamiStream is a private, self-hosted web streaming portal for a small group of authenticated users. It combines a 9anime-style anime portal with a movie/TV browser, and adds synchronized watch party rooms with live chat.

**One-line pitch:**
A private Netflix + Crunchyroll alternative — browse anime and movies, hit play, invite friends, and watch in sync — all in the browser.

### 1.1 Goals

- Browse, search, and stream anime episodes via HiAnime (aniwatch-api, self-hosted)
- Browse movies and TV shows with metadata from TMDB
- Stream movies/TV via embed sources (VidSrc CC, VidSrc Net)
- Create watch party rooms, invite members via code, and watch in sync
- Playback sync (play/pause/seek/heartbeat) over Socket.IO with automatic reconnect
- Live chat inside each watch room, stored in Firestore
- Personal watchlist and continue-watching history per episode
- Avatar upload (Canvas resize → base64 stored in Firestore, no Storage bucket needed)
- Cloudflare Turnstile bot protection on login

### 1.2 Non-Goals (v1)

- No downloading or offline playback
- No user-uploaded content
- No comments/reviews on content
- No admin panel
- No mobile app (web-only, mobile-responsive)

---

## 2. Tech Stack & Architecture

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18 + Vite | SPA, served as static files from Express |
| Styling | Tailwind CSS v3 | Custom dark theme, `bg-page`, `bg-surface`, accent tokens |
| Video Player | Video.js 8 + HLS.js | HLS streams + subtitle tracks |
| Real-time | Socket.IO v4 | WebSocket + polling fallback, auto-reconnect |
| Auth | Firebase Auth | Email/password only, Turnstile-gated |
| Database | Firestore (Admin SDK) | All reads via server — no client-side Firestore rules needed |
| Anime streams | aniwatch-api (self-hosted) | `ghcr.io/ghoshritesh12/aniwatch`, proxied through main backend |
| Anime metadata | AniList GraphQL | Free, no key |
| Movie/TV metadata | TMDB REST API | Free with API key |
| Movie/TV streams | VidSrc CC + VidSrc Net | Embedded iframes |
| Container | Docker `node:20-alpine` | Multi-stage: Vite build → Express server |
| Hosting | Google Cloud Run | `umami-watch` (min-instances=1) + `aniwatch-api` (min-instances=0) |
| DNS/Proxy | Cloudflare | SSL, DDoS protection, domain: `umami-dream.com` |
| Secrets | GCP Secret Manager | All sensitive values, never in code or repo |
| CI/CD | Cloud Build | Trigger on git tag `v*`, pulls from GitHub |

### 2.1 Architecture Diagram

```
Browser (React SPA @ umami-dream.com)
 │
 ├── REST /api/*  ──────────────► Express Backend (Cloud Run: umami-watch)
 │                                 ├── /api/me          → Firestore (users)
 │                                 ├── /api/rooms/*     → Firestore (rooms)
 │                                 ├── /api/proxy/hls   → HLS segments (with Referer)
 │                                 └── /api/proxy/aniwatch/* → aniwatch-api (Cloud Run)
 │
 ├── WebSocket ─────────────────► Socket.IO (same Express process)
 │                                 └── Playback sync + live chat
 │
 ├── GraphQL ────────────────────► AniList API (anime metadata, free)
 └── REST ───────────────────────► TMDB API (movie/TV metadata)
```

All Firestore access goes through the Express backend using the Admin SDK. The frontend never reads Firestore directly (no security rules required).

### 2.2 Playback Sync Architecture

1. Host joins room → `join-room` socket event → `socket.isHost = true` cached on server
2. Host plays/pauses/seeks → immediate broadcast to viewers → async Firestore write
3. Host emits `playback:heartbeat` every 3s → server rebroadcasts as `sync:state` to all viewers
4. Viewers auto-correct drift > 1s on each `sync:state`
5. Viewers emit `request-sync` every 10s → host responds with current position

---

## 3. Infrastructure & Deployment

### 3.1 Cloud Run Services

| Service | Image | Min | Max | Notes |
|---|---|---|---|---|
| `umami-watch` | `gcr.io/umami-stream/umami-watch:TAG` | 1 | 5 | Session affinity for WebSocket |
| `aniwatch-api` | `gcr.io/umami-stream/aniwatch-api:latest` | 0 | 2 | Mirrored from ghcr.io |

### 3.2 CI/CD Pipeline (cloudbuild.yaml)

Trigger: push git tag matching `v.*` to GitHub (`kiiro-tenshi/umami-watch`)

**Steps:**
1. Pull `ghcr.io/ghoshritesh12/aniwatch:latest` → tag → push to GCR
2. Deploy `aniwatch-api` to Cloud Run (`us-west1`)
3. Build main app Docker image (Vite frontend baked in with build args from Secret Manager)
4. Push image tagged with `$TAG_NAME` + `latest`
5. Deploy `umami-watch` to Cloud Run with secrets mounted

### 3.3 Release Workflow

```bash
git add .
git commit -m "feat: ..."
git push origin main
git tag v0.x.y
git push origin v0.x.y
# Cloud Build auto-triggers
```

### 3.4 Estimated Cost (3 users)

| Item | Cost/month |
|---|---|
| Cloud Run idle (min-instances=1) | ~$7–9 |
| HLS video egress (anime) | ~$3–15 |
| Secret Manager | ~$0.60 |
| GCR storage | ~$0.05 |
| **Total** | **~$10–25** |

---

## 4. Environment Variables & Secrets

### Frontend (baked at build time via Docker ARG)

| Variable | Source | Notes |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | Secret Manager | Firebase client SDK |
| `VITE_FIREBASE_AUTH_DOMAIN` | Cloud Build substitution | |
| `VITE_FIREBASE_PROJECT_ID` | Cloud Build substitution | |
| `VITE_FIREBASE_STORAGE_BUCKET` | Cloud Build substitution | |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Secret Manager | |
| `VITE_FIREBASE_APP_ID` | Secret Manager | |
| `VITE_TMDB_API_KEY` | Secret Manager | |
| `VITE_API_BASE_URL` | Secret Manager | `https://umami-dream.com` |
| `VITE_CONSUMET_API_URL` | Cloud Build substitution | |
| `VITE_TURNSTILE_SITE_KEY` | Secret Manager | Cloudflare Turnstile public key |

### Backend (Cloud Run runtime secrets)

| Secret Name | Mounted as | Notes |
|---|---|---|
| `FIREBASE_PROJECT_ID` | env var | Firebase Admin SDK |
| `FIREBASE_STORAGE_BUCKET` | env var | |
| `ALLOWED_ORIGINS` | env var | CORS whitelist |
| `ANIWATCH_API_URL` | env var | Internal aniwatch-api Cloud Run URL |
| `TURNSTILE_SECRET_KEY` | env var | Cloudflare Turnstile server secret |
| `FIREBASE_SERVICE_ACCOUNT` | file `/run/secrets/firebase-sa.json` | Admin SDK credentials |
| `GOOGLE_APPLICATION_CREDENTIALS` | env var | Points to above file path |

---

## 5. Database Schema (Firestore)

### `users/{uid}`
```json
{
  "displayName": "string",
  "email": "string",
  "photoURL": "string (base64 JPEG, ~15KB, 128×128)",
  "createdAt": "timestamp"
}
```

### `users/{uid}/history/{contentKey}`
Content key format: `anime_{animeId}_ep{epNum}` or `{tmdbId}`
```json
{
  "contentId": "string",
  "contentType": "anime|movie|tv",
  "title": "string",
  "posterUrl": "string",
  "position": "number (seconds)",
  "duration": "number (seconds)",
  "epNum": "number (anime only)",
  "seasonNum": "string (tv only)",
  "episodeNum": "string (tv only)",
  "updatedAt": "timestamp"
}
```

### `users/{uid}/watchlist/{contentId}`
```json
{
  "contentId": "string",
  "contentType": "anime|movie|tv",
  "title": "string",
  "posterUrl": "string",
  "addedAt": "timestamp"
}
```

### `rooms/{roomId}`
```json
{
  "name": "string",
  "ownerId": "string (uid)",
  "hostId": "string (uid)",
  "members": ["uid", "..."],
  "inviteCode": "string (6-char hex, uppercase)",
  "contentId": "string|null",
  "contentType": "anime|movie|tv|null",
  "contentTitle": "string|null",
  "streamUrl": "string|null",
  "playback": {
    "playing": "boolean",
    "position": "number",
    "updatedAt": "timestamp",
    "updatedBy": "uid"
  },
  "createdAt": "timestamp"
}
```

### `rooms/{roomId}/messages/{messageId}`
```json
{
  "uid": "string",
  "displayName": "string",
  "photoURL": "string|null",
  "text": "string (max 500 chars)",
  "createdAt": "timestamp"
}
```

---

## 6. Content APIs

### 6.1 AniList (Anime Metadata)
- GraphQL endpoint: `https://graphql.anilist.co`
- No API key required
- Used for: search, trending, anime detail, episode count

### 6.2 aniwatch-api (Anime Streams)
- Self-hosted on Cloud Run: `https://aniwatch-api-338990119559.us-west1.run.app`
- Proxied through main backend at `/api/proxy/aniwatch/*`
- Used for: episode list, HLS stream sources, subtitle tracks
- Auth required: yes (Firebase token)

### 6.3 TMDB (Movies & TV Metadata)
- REST endpoint: `https://api.themoviedb.org/3`
- API key required (`VITE_TMDB_API_KEY`)
- Used for: search, trending, movie/TV detail, seasons, episodes

### 6.4 VidSrc (Movie/TV Streams)
- Embedded via `<iframe>` — no server involvement
- Sources: `vidsrc.cc` (primary), `vidsrc.net` (fallback)
- No playback sync support (iframes)

---

## 7. Feature Specifications

### 7.1 Authentication
- Email + password via Firebase Auth
- Cloudflare Turnstile bot protection (verified server-side)
- Invite-only: users must be created manually in Firebase Console
- On first login, user doc created in Firestore

### 7.2 Watch Page
- URL: `/watch?type=anime&animeId=X&aniwatchEpisodeId=Y&epNum=N`
- URL (room): append `&roomId=Z`
- Layout: 16:9 video | right sidebar (episode list + chat)
- Episode sidebar: all episodes fetched from aniwatch-api, current highlighted, auto-scrolls
- Next episode button shown below video
- Progress saved per episode every 15s to Firestore history
- Room mode: viewers cannot control playback (controls disabled)
- Host heartbeat every 3s for drift correction

### 7.3 Watch Party Rooms
- Create room → choose content → share 6-char invite code
- Host controls playback; viewers follow
- `room:content-updated` socket event propagates new content to all viewers
- Chat: messages stored in Firestore subcollection, loaded via API (50 messages), live via socket
- Host can change content mid-session via "Change" button

### 7.4 Profile
- Change display name (saved to Firebase Auth + Firestore)
- Upload avatar: resized to 128×128 JPEG via Canvas API → stored as base64 in Firestore
- Watch history with progress bars, filterable by type
- Clear all history button
- Watchlist grid

---

## 8. API Endpoints (Backend)

All endpoints require `Authorization: Bearer <Firebase ID token>` except `/health` and `/api/verify-turnstile`.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | No | Health check |
| POST | `/api/verify-turnstile` | No | Verify Cloudflare Turnstile token |
| GET | `/api/me` | Yes | Get user profile |
| PATCH | `/api/me` | Yes | Update displayName, photoURL |
| DELETE | `/api/me/history` | Yes | Clear all watch history |
| GET | `/api/rooms` | Yes | List rooms user is member of |
| POST | `/api/rooms` | Yes | Create room |
| POST | `/api/rooms/join` | Yes | Join room by invite code |
| GET | `/api/rooms/:id` | Yes | Get room data |
| PATCH | `/api/rooms/:id` | Yes (owner) | Update room content |
| DELETE | `/api/rooms/:id` | Yes (owner) | Delete room |
| GET | `/api/rooms/:id/messages` | Yes (member) | Get last 50 chat messages |
| GET | `/api/proxy/aniwatch/*` | Yes | Proxy to aniwatch-api |
| GET | `/api/proxy/hls` | Yes | HLS proxy with Referer injection |
| GET | `/api/torrent/stream` | Yes | Torrent stream proxy |
| GET | `/api/torrent/status` | Yes | Torrent engine status |

---

## 9. WebSocket Events

### Client → Server
| Event | Payload | Description |
|---|---|---|
| `join-room` | `{ roomId, displayName }` | Join a room |
| `leave-room` | — | Leave current room |
| `playback:play` | `position` | Host: play at position |
| `playback:pause` | `position` | Host: pause at position |
| `playback:seek` | `position` | Host: seek to position |
| `playback:heartbeat` | `{ position, playing }` | Host: periodic drift correction |
| `request-sync` | — | Viewer: request current position from host |
| `sync-response` | `{ viewerSocketId, position, playing }` | Host: respond to viewer sync request |
| `chat:message` | `text (max 500 chars)` | Send chat message |

### Server → Client
| Event | Payload | Description |
|---|---|---|
| `sync:state` | `{ position, playing }` | Viewer: apply playback state |
| `playback:play` | `position` | Viewer: play at position |
| `playback:pause` | `position` | Viewer: pause at position |
| `playback:seek` | `position` | Viewer: seek to position |
| `viewer-needs-sync` | `viewerSocketId` | Host: send sync response |
| `room:content-updated` | `{ streamUrl, contentId, ... }` | Room content changed |
| `user-joined` | `{ uid, displayName }` | Member joined |
| `user-left` | `{ uid, displayName }` | Member left |
| `chat:message` | `{ id, uid, displayName, text, createdAt }` | New chat message |
| `warning` | `message` | Host not connected warning |
| `error` | `message` | Room access denied |

---

## 10. Security Model

- All API routes (except health + turnstile verify) require valid Firebase ID token
- Firestore never accessed client-side — Admin SDK only, no security rules needed
- Room access enforced by `members` array check on every request
- Room modification enforced by `ownerId` check
- Socket: Firebase token verified in `io.use()` middleware before any event
- `socket.isHost` cached on `join-room` — prevents per-event Firestore reads
- Chat messages: type-checked, max 500 chars, trimmed
- HLS proxy, aniwatch proxy, torrent proxy: all require auth
- Avatar: base64 JPEG max 10MB input → resized to 128×128 (~15KB) — no Firebase Storage needed
- Secrets: all in GCP Secret Manager, never in code or git history
- CORS: locked to `ALLOWED_ORIGINS` (currently `https://umami-dream.com`)

---

## 11. Page & Component Map

| Route | Page | Key Components |
|---|---|---|
| `/auth` | AuthPage | Turnstile widget, Firebase Auth |
| `/home` | HomePage | ContentCard grid, trending |
| `/anime` | AnimeBrowsePage | Search, AniList browse |
| `/anime/:id` | AnimeDetailPage | EpisodeList, watchlist toggle, room banner |
| `/movies` | MovieBrowsePage | TMDB movie browse |
| `/tv` | MovieBrowsePage | TMDB TV browse |
| `/movie/:id` | MovieDetailPage | Detail, SeasonSelector |
| `/tv/:id` | MovieDetailPage | Detail, SeasonSelector |
| `/watch` | WatchPage | VideoPlayer, ChatPanel, episode sidebar |
| `/rooms` | RoomsPage | Room cards, CreateRoomModal, delete |
| `/join/:code` | RoomsPage | Auto-join on load |
| `/profile` | ProfilePage | Avatar upload, display name, history, watchlist |

---

## 12. Error Handling & Edge Cases

| Scenario | Handling |
|---|---|
| HiAnime source not found | Try servers in order: hd-1 → hd-2 → megacloud → vidcloud |
| Socket disconnect | Reconnect overlay shown, exponential backoff, re-joins room on reconnect |
| Host leaves room | Viewer warned: "Host is not connected" |
| aniwatch-api cold start | Loading state shown while Cloud Run wakes up |
| Avatar too large | Client-side: reject >10MB input; Canvas resizes to 128×128 before save |
| Non-member room access | 403 Forbidden on API, socket emits `error` event |
| Non-owner room edit | 403 Forbidden |
| Drift > 1s | Viewer auto-corrects to host position on next `sync:state` |
| Embed source blank | AdBlocker warning shown, source switcher offered |
