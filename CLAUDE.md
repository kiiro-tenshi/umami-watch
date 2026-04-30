# CLAUDE.md — UmamiStream

---

## 1. Project Overview

UmamiStream is a private, invite-only streaming portal for anime, manga, movies, and TV shows, with real-time synchronized watch parties and live chat. It aggregates content metadata and streams from multiple third-party sources (GogoAnime/anitaku.to, Kitsu, AniList, TMDB, MangaDex, ComicK) and proxies video/image traffic to bypass CORS and CDN restrictions. The project targets a small, trusted user group ("PIW — Pure, Innocent, and Wholesome") and is deployed as a single Cloud Run service with a Cloudflare Worker handling video bandwidth.

**Status:** Deployed / production (tagged releases trigger Cloud Build → Cloud Run).

---

## 2. Tech Stack

### Runtime & Language
- **Node.js 20** (required by CI; both frontend build and backend server)
- **JavaScript (ESM)** throughout — `"type": "module"` in all `package.json` files
- **Python 3.12** for pure-logic test suite in `tests/`

### Frontend (`frontend/`)
| Package | Version | Role |
|---------|---------|------|
| `react` | 18.2.0 | UI framework |
| `react-dom` | 18.2.0 | DOM rendering |
| `react-router-dom` | 6.22.0 | Client-side routing (`BrowserRouter`) |
| `firebase` | 10.8.0 | Auth + Firestore client SDK |
| `socket.io-client` | 4.7.2 | WebSocket client for room sync |
| `plyr` | 3.7.8 | HTML5 video player wrapper |
| `hls.js` | 1.5.8 | HLS stream decoding |
| `emoji-mart` | 5.6.0 | Emoji picker (chat feature) |
| `@emoji-mart/react` | 1.1.1 | React binding for emoji-mart |
| `vite` | 5.1.3 | Dev server + bundler |
| `tailwindcss` | 3.4.1 | Utility CSS (dark-mode: `class` strategy) |
| `vitest` | 1.6.0 | Test runner |
| `@testing-library/react` | 14.3.0 | Component testing |
| `jsdom` | 24.0.0 | DOM environment for tests |

### Backend (`server/`)
| Package | Version | Role |
|---------|---------|------|
| `express` | 4.18.2 | HTTP server + REST API |
| `socket.io` | 4.7.2 | WebSocket server (watch party sync) |
| `firebase-admin` | 12.0.0 | Auth token verification + Firestore admin |
| `compression` | 1.7.4 | HTTP gzip (disabled for HLS proxy route) |
| `cors` | 2.8.5 | CORS middleware |
| `torrent-stream` | (undeclared version) | BitTorrent streaming (legacy feature) |
| `fluent-ffmpeg` | (undeclared version) | MKV → fMP4 remux for torrent files |
| `vitest` | 1.6.0 | Test runner |
| `supertest` | 7.0.0 | HTTP assertion for route tests |

### Database
- **Google Firestore** (NoSQL, document/collection model)
- Accessed server-side via `firebase-admin` SDK; client-side via `firebase` SDK
- No ORM — raw Admin SDK calls and Firestore queries throughout

### Auth
- **Firebase Authentication** — email/password only (Google OAuth exists in code but is not exposed in the UI)
- **Cloudflare Turnstile** — bot protection on the login form; token verified server-side before Firebase auth is attempted

### Hosting / Deployment
- **Google Cloud Run** — serves both the Express backend and the built Vite frontend as static files from `/public`; session affinity enabled for Socket.IO
- **Google Container Registry** — Docker images tagged by git tag (`$TAG_NAME`)
- **Google Cloud Build** — CI/CD triggered by git tags (`cloudbuild.yaml`)
- **Google Cloud Secret Manager** — all production secrets stored here and injected at deploy time
- **Cloudflare Worker** (`cloudflare-worker/`) — primary HLS manifest rewriting + MP4 range proxy; routes video bandwidth away from Cloud Run to avoid egress charges

### Build Tools
- **Vite** — frontend bundler; `vite build` outputs to `frontend/dist/`
- **Docker** multi-stage build — Stage 1: Vite build with `--build-arg` env vars; Stage 2: Node server + static files
- **Dockerfile**, **Dockerfile.dev**, **Dockerfile.firebase** at repo root

### Testing
- **Vitest** — frontend and server unit/integration tests
- **pytest** (Python 3.12) — pure-logic tests in `tests/`; covers `pickBestShow()` title matching, torrentio parsing, Kitsu normalization, socket event logic
- **GitHub Actions** (`.github/workflows/test.yml`) — runs all three test suites on push to `main`/`develop` and on PRs

---

## 3. Architecture Overview

### Pattern
**Monorepo** with four top-level subdirectories: `frontend/`, `server/`, `seed/`, `tests/`, plus `cloudflare-worker/`. There is no root `package.json` — each component manages its own dependencies.

### Frontend ↔ Backend Communication
- **REST API** — authenticated with Firebase ID tokens (`Authorization: Bearer <token>` or `?token=<token>` query param), handled by `server/middleware/requireAuth.js`
- **Socket.IO** (WebSocket with polling fallback) — real-time watch party sync; auth via `socket.handshake.auth.token`
- **Direct third-party API calls from browser** — Kitsu, AniList GraphQL, TMDB (no backend proxy needed for these)
- **Backend-proxied calls** — GogoAnime, MangaDex, ComicK, video CDN (all require CORS bypass or Referer injection)

### Data Flow (Anime Watch Example)
1. User navigates to `/watch?type=anime&kitsuId=12345&epNum=3`
2. Frontend fetches Firebase ID token → calls `GET /api/rooms/{roomId}` (if watch party)
3. Frontend calls GogoAnime API via `GET /api/anime/gogoanime/search`, then `/sources`
4. Server scrapes `anitaku.to` HTML to find the vibeplayer embed ID, returns `hlsUrl` pointing to `vibeplayer.site/public/stream/{id}/master.m3u8`
5. Frontend proxies HLS stream through Cloudflare Worker (with `referer=vibeplayer.site`) or `GET /api/proxy/hls` — video segments served by ByteDance CDN with no IP restrictions
6. Plyr + HLS.js render video; position saved to Firestore `users/{uid}/history` every 15 seconds
7. If in a room: Socket.IO events (`playback:play`, `playback:pause`, `playback:seek`, `playback:heartbeat`) sync state between host and viewers; Firestore stores authoritative `rooms/{roomId}.playback`

### Background Jobs
- **Room cleanup** — in-process `setInterval` in `server/routes/rooms.js`, runs every 10 minutes, deletes Firestore room documents where `expiresAt < now()`
- **Torrent engine cache** — in-process `setTimeout` per magnet link, destroys `torrent-stream` engine after 2 hours

### External Services / Integrations
| Service | Direction | Purpose |
|---------|-----------|---------|
| AniList GraphQL (`graphql.anilist.co`) | Frontend → direct | Anime search, seasonal trending, detail pages |
| Kitsu REST API (`kitsu.io/api/edge`) | Frontend → direct | Anime info, episode lists, category browse |
| TMDB REST API v3 | Frontend → direct | Movie/TV metadata, genres, trailers, cast |
| GogoAnime (`anitaku.to`) | Backend scrape | Anime search, episode list — no auth/CAPTCHA required |
| vibeplayer.site | Backend → Cloudflare Worker | HLS master manifest; no auth required |
| ByteDance CDN (`p16-ad-sg.ibyteimg.com`) | Frontend → Cloudflare Worker | HLS video segments; no IP restrictions, no Referer required |
| MangaDex API (`api.mangadex.org`) | Frontend → backend proxy | Manga search, chapter metadata |
| MangaDex CDN (`uploads.mangadex.org`) | Frontend → backend proxy | Cover images (Referer required) |
| ComicK API (`comick.art/api`) | Frontend → backend proxy | Comics search, chapter lists |
| ComicK HTML (`comick.art/comic/...`) | Backend scrape | Chapter image extraction |
| ComicK CDN (`cdn*.comicknew.pictures`) | Frontend → backend proxy | Chapter images (Referer required) |
| Giphy CDN (`media*.giphy.com`) | Frontend → direct | GIF chat messages (validated server-side) |
| Cloudflare Turnstile | Frontend widget + backend verify | Bot protection on login |
| Cloudflare Workers | Frontend → Worker → upstream | HLS proxy (primary video path) |
| Firebase Authentication | Frontend + backend | User auth, ID token issuance/verification |
| Google Firestore | Frontend + backend | All persistent data |

---

## 4. Folder Structure

```
umami-watch/
├── frontend/                    # React SPA (Vite)
│   ├── src/
│   │   ├── api/                 # External service integration modules
│   │   │   ├── anilist.js       # AniList GraphQL: trending, seasonal, search, detail, weekly airing schedule, browse/filter, genre list, studio lookup
│   │   │   ├── kitsu.js         # Kitsu REST: anime info, episodes (with airdate), categories; normalizes to shared shape
│   │   │   ├── tmdb.js          # TMDB REST: movies, TV, genres, trending
│   │   │   ├── gogoanime.js     # GogoAnime via backend proxy: search, sources, pickBestShow; HLS from vibeplayer.site
│   │   │   ├── mangadex.js      # MangaDex via backend proxy: manga, chapters, covers; browseManga with search/tag/status/sort/offset
│   │   │   ├── comick.js        # ComicK via backend proxy: search, chapters, images
│   │   │   └── torrentio.js     # Unused in pages; test file only
│   │   ├── components/          # Reusable React components
│   │   │   ├── VideoPlayer.jsx  # Core player: Plyr + HLS.js, double-tap seek, subtitle overlay (465 lines)
│   │   │   ├── ChatPanel.jsx    # Socket.IO live chat with emoji/GIF support
│   │   │   ├── EpisodeList.jsx  # Episode selector with watched checkmarks + context menu; airdate display per episode ("Released" or "Release: Apr 30, 2026")
│   │   │   ├── EpisodeContextMenu.jsx  # Right-click menu for manual watch toggle
│   │   │   ├── SeasonSelector.jsx      # TV season/episode picker
│   │   │   ├── AiringCalendar.jsx  # Weekly (Mon–Sun) airing schedule; fetches AniList airingSchedules; top 5 per day by popularity; prev/next week navigation; live countdown timers (updates every minute); shows "Released" for past episodes
│   │   │   ├── ContentCard.jsx  # Poster card for all content types
│   │   │   ├── Navbar.jsx       # Top nav: logo, links, dark mode toggle, user avatar
│   │   │   ├── BottomNav.jsx    # Mobile bottom tab bar (hidden on /watch and manga reader)
│   │   │   ├── ProtectedRoute.jsx      # Auth guard; redirects to /auth if no user
│   │   │   ├── CreateRoomModal.jsx     # Modal to create a watch party room
│   │   │   ├── InviteModal.jsx  # Modal showing room invite code with copy button
│   │   │   ├── RoomContentModal.jsx    # Modal for host to pick content for the room
│   │   │   ├── ReconnectOverlay.jsx    # Banner shown during Socket.IO reconnection
│   │   │   ├── LoadingSpinner.jsx      # Full-screen or inline loading indicator
│   │   │   └── ErrorBoundary.jsx       # React error boundary
│   │   ├── hooks/               # Custom React hooks
│   │   │   ├── useAuth.jsx      # Firebase auth context + Firestore user doc sync
│   │   │   ├── useTheme.jsx     # Dark/light mode toggle; persists to localStorage
│   │   │   ├── useSocket.js     # Socket.IO connection manager with token refresh on reconnect
│   │   │   ├── useWatchlist.js  # Firestore `watchlist` collection CRUD
│   │   │   ├── useHistory.js    # Fetches last 20 history entries from `users/{uid}/history`
│   │   │   ├── useWatchedEps.js # Tracks per-episode watched state for an anime (batch writes)
│   │   │   └── useReadChapters.js      # Tracks per-chapter read state for manga (batch writes)
│   │   ├── pages/               # Route-level components
│   │   │   ├── AuthPage.jsx     # Login + password reset with Turnstile CAPTCHA
│   │   │   ├── HomePage.jsx     # Airing calendar + continue watching + seasonal trending + movies/TV rows (hero banner removed); personalized "Hi, {firstName}!" greeting in PIW motto
│   │   │   ├── AnimeBrowsePage.jsx     # Anime search (Kitsu IDs) + AniList browse with season/year/genre/sort filters + load more; search uses Kitsu, filtered browse uses AniList + source=anilist on links
│   │   │   ├── AnimeDetailPage.jsx     # Anime detail: episodes, watchlist, start watch party; studio name fetched from AniList and shown in info sidebar; source=anilist param triggers title-based Kitsu lookup with AniList fallback
│   │   │   ├── MovieBrowsePage.jsx     # Movie/TV search + TMDB discover with genre/year/sort filters + load more; uses getTrending when no filters, discoverContent otherwise
│   │   │   ├── MovieDetailPage.jsx     # Movie/TV detail: cast, trailer, seasons
│   │   │   ├── WatchPage.jsx    # Video player + room sync + sidebar; most complex page (740 lines)
│   │   │   ├── RoomsPage.jsx    # Create/join/list watch party rooms
│   │   │   ├── ProfilePage.jsx  # Settings, watchlist, history, avatar upload
│   │   │   ├── MangaBrowsePage.jsx     # Manga search + MangaDex browse with tag/status/sort filters + load more (offset-based pagination)
│   │   │   ├── MangaDetailPage.jsx     # Manga detail: chapters, ComicK fallback, watchlist
│   │   │   └── MangaReaderPage.jsx     # Chapter reader: vertical scroll + page-by-page modes
│   │   ├── App.jsx              # BrowserRouter + ThemeProvider + Navbar + routes + BottomNav
│   │   ├── main.jsx             # ReactDOM.createRoot + AuthProvider + PWA service worker registration
│   │   ├── firebase.js          # Firebase app init; connects to emulators if VITE_USE_EMULATOR=true
│   │   └── index.css            # Tailwind directives + CSS variables for light/dark theme + Plyr overrides
│   ├── public/
│   │   └── sw.js                # PWA service worker
│   ├── index.html               # Entry HTML; loads Turnstile script, DM Sans font, PWA meta tags
│   ├── vite.config.js           # Vite config: React plugin, polling file watcher
│   ├── tailwind.config.js       # Tailwind: dark mode `class`, custom colors from CSS vars, DM Sans font
│   ├── postcss.config.js        # PostCSS: tailwindcss + autoprefixer
│   └── package.json             # Frontend dependencies + scripts
│
├── server/                      # Express backend
│   ├── index.js                 # App entry: Firebase Admin init, Express setup, all routes, HLS/video proxies
│   ├── middleware/
│   │   └── requireAuth.js       # Firebase token verification middleware (Bearer or ?token=)
│   ├── routes/
│   │   ├── users.js             # GET/PATCH /api/me — user profile; DELETE /api/me/history
│   │   ├── rooms.js             # Full CRUD for watch party rooms + room expiry cleanup job
│   │   ├── gogoanime.js         # GogoAnime proxy: /search (scrapes anitaku.to), /episodes, /sources (picks vibeplayer ID → HLS URL + VTT subtitles)
│   │   └── torrent.js           # Torrent streaming: /stream (FFmpeg remux), /seed (raw bytes), /status
│   ├── socket/
│   │   └── roomSocket.js        # Socket.IO server: auth middleware, room join/leave, playback sync, chat
│   └── package.json             # Server dependencies + scripts
│
├── cloudflare-worker/           # Cloudflare Worker (zero-egress HLS proxy)
│   ├── hls-proxy.js             # Worker script: HLS manifest rewriting + MP4 range proxy
│   └── wrangler.toml            # Worker config: name=umami-hls-proxy, cpu_ms=50
│
├── seed/                        # One-shot Firebase emulator seeder
│   ├── seed.js                  # Creates test accounts (test@dev.local, viewer@dev.local) via Admin SDK
│   └── package.json             # Only firebase-admin dependency
│
├── tests/                       # Python pure-logic tests (no server needed)
│   ├── run_all.py               # Test runner: discovers and runs all test files
│   ├── test_allanime_matching.py # Tests for `pickBestShow()` title matching algorithm
│   ├── test_server_logic.py     # Tests for server-side business logic
│   ├── test_socket_logic.py     # Tests for room sync/socket event logic
│   ├── test_kitsu.py            # Tests for Kitsu API normalization
│   └── test_torrentio.py        # Tests for torrentio URL parsing
│
├── Dockerfile                   # Multi-stage production build (Vite build + Node server)
├── Dockerfile.dev               # Dev server with Node --watch
├── Dockerfile.firebase          # Firebase emulator with Java + Node
├── docker-compose.dev.yml       # Full local stack: firebase + backend + frontend + seed
├── firebase.json                # Firebase emulator config (Auth:9099, Firestore:8088, UI:4000)
├── firestore.rules              # Dev-only: allow all reads/writes (NOT for production)
├── cloudbuild.yaml              # GCP Cloud Build: docker build + push + Cloud Run deploy
└── .github/workflows/test.yml  # CI: server tests + frontend tests + Python tests + build check
```

---

## 5. Key Conventions & Patterns

### Naming
- **Files:** `camelCase.js` for modules/hooks, `PascalCase.jsx` for React components
- **Components:** `PascalCase` — e.g., `VideoPlayer`, `ChatPanel`, `EpisodeContextMenu`
- **Hooks:** `use` prefix, camelCase — e.g., `useWatchedEps`, `useReadChapters`
- **API modules:** lowercase, named after the service — `anilist.js`, `kitsu.js`, `tmdb.js`
- **Firestore collections:** lowercase snake_case — `users`, `watchlist`, `rooms`
- **Firestore doc IDs:** compound strings with underscores — `{uid}_{contentId}` (watchlist), `anime_kitsu{id}_ep{n}` (history), `manga_{id}_ch_{n}` (chapter tracking)

### Code Style
- No linter or formatter config present (no `.eslintrc`, no `prettier.config.js`)
- ESM imports throughout (`import`/`export`); no CommonJS
- React functional components only; no class components
- No TypeScript

### State Management
- **React Context API** for global state: `AuthContext` (from `useAuth.jsx`), `ThemeContext` (from `useTheme.jsx`)
- **`useState` + `useEffect`** for per-page/component async state
- **Firestore real-time** as the source of truth for watchlist and history (polled, not subscribed)
- **Socket.IO** for ephemeral real-time room state (playback position, chat)
- **`useRef`** for Plyr player instance, Socket.IO socket, debounce timers, and buffered sync state (`pendingSyncRef`)

### Async Effect Pattern
All data-fetching `useEffect` hooks use a cancellation flag to prevent stale state updates:
```js
let cancelled = false;
useEffect(() => {
  (async () => {
    const data = await fetchSomething();
    if (cancelled) return;
    setState(data);
  })();
  return () => { cancelled = true; };
}, [deps]);
```

### Error Handling
- API modules throw `Error` with descriptive messages; callers use `.catch(() => fallbackValue)`
- `ErrorBoundary.jsx` wraps the app router for uncaught render errors
- Server routes use `try/catch` → `res.status(500).json({ error: error.message })`
- GogoAnime sources: if no show found or no vibeplayer ID found, shows error state in `WatchPage`

### API Response Structure
- Server returns `{ success: true }` for mutations on success
- Server returns `{ error: string }` with appropriate HTTP status on failure
- Proxy routes pipe responses directly; no JSON wrapping

### Authentication Flow in Code
1. `AuthPage.jsx` → Turnstile widget → `POST /api/verify-turnstile` → Firebase `signInWithEmailAndPassword()`
2. `onAuthStateChanged()` in `useAuth.jsx` → fetch/create `users/{uid}` doc in Firestore
3. All protected routes wrapped in `<ProtectedRoute>` which checks `user` from `useAuth()`
4. API calls: `auth.currentUser.getIdToken()` → `Authorization: Bearer <token>` header
5. Socket.IO: token passed in `socket.auth = { token }` on connection handshake

---

## 6. Data Models

### `users/{uid}` (Firestore)
| Field | Type | Notes |
|-------|------|-------|
| `uid` | string | Firebase Auth UID |
| `email` | string | |
| `displayName` | string | Falls back to email prefix if not set |
| `photoURL` | string \| null | Base64 JPEG data URL (128×128, resized client-side) |
| `lastSeen` | Timestamp | Updated on every auth state change |
| `createdAt` | Timestamp | Set only on first creation (merge: true) |
| `rdApiKey` | string | Optional; RealDebrid API key (future torrent feature) |

### `users/{uid}/history/{docId}` (Firestore)
Document ID format varies by content type:
- Anime episode: `anime_kitsu{kitsuId}_ep{epNum}`
- Movie/TV: `{tmdbId}`
- Manga progress: `manga_{mangaId}`
- Manga chapter: `manga_{mangaId}_ch_{chapterNum}`

| Field | Type | Notes |
|-------|------|-------|
| `contentId` | string | Kitsu ID (anime), TMDB ID (movie/TV), MangaDex ID (manga) |
| `contentType` | string | `"anime"`, `"movie"`, `"tv"`, `"manga"`, `"manga-chapter"` |
| `title` | string | Display title |
| `posterUrl` | string | Cover/poster image URL |
| `position` | number | Seconds watched (video) or 0 (manga) |
| `duration` | number | Total duration in seconds |
| `updatedAt` | Timestamp | |
| `epNum` | number | Anime: episode number |
| `seasonNum` | number | TV: season number |
| `episodeNum` | number | TV: episode number |
| `chapterId` | string | Manga: chapter ID |
| `chapterNum` | string | Manga: chapter number |
| `pageNum` | number | Manga: 1-indexed page |
| `manuallyWatched` | boolean \| undefined | `true` = force watched, `false` = force unwatched, `undefined` = auto (85% threshold) |
| `manuallyRead` | boolean \| undefined | Same three-state logic for manga chapters |

### `watchlist/{uid}_{contentId}` (Firestore)
| Field | Type | Notes |
|-------|------|-------|
| `uid` | string | |
| `contentId` | string | Always coerced to string |
| `contentType` | string | `"anime"`, `"movie"`, `"tv"`, `"manga"` |
| `title` | string | |
| `posterUrl` | string | |
| `addedAt` | Timestamp | |

### `rooms/{roomId}` (Firestore)
| Field | Type | Notes |
|-------|------|-------|
| `name` | string | Room display name |
| `ownerId` | string | UID of creator |
| `hostId` | string | UID of current host (controls playback) |
| `members` | string[] | Array of UIDs |
| `inviteCode` | string | 6-char uppercase hex |
| `contentId` | string \| null | |
| `contentType` | string \| null | `"anime"`, `"movie"`, `"tv"` |
| `contentTitle` | string \| null | |
| `streamUrl` | string \| null | HLS/MP4/iframe URL |
| `streamType` | string \| null | `"hls"`, `"direct"`, `"iframe"` |
| `tracks` | array \| null | Subtitle track objects |
| `episodeId` | string | Legacy AllAnime episode ID (unused since GogoAnime migration) |
| `magnetFileIdx` | number \| null | For torrent content |
| `playback.playing` | boolean | |
| `playback.position` | number | Seconds |
| `playback.updatedAt` | Timestamp | |
| `playback.updatedBy` | string | UID |
| `createdAt` | Timestamp | |
| `expiresAt` | Timestamp | 6 hours after creation; auto-deleted by cleanup job |

### `rooms/{roomId}/messages/{autoId}` (Firestore)
| Field | Type | Notes |
|-------|------|-------|
| `uid` | string | |
| `displayName` | string | |
| `photoURL` | string \| null | |
| `type` | string | `"text"` or `"gif"` |
| `text` | string | Max 500 chars; only for `type: "text"` |
| `gifUrl` | string | Must match `/^https:\/\/media\d*\.giphy\.com\//`; only for `type: "gif"` |
| `createdAt` | Timestamp | |

---

## 7. Environment Variables

### Frontend (Vite — baked into bundle at build time as `import.meta.env.VITE_*`)

| Variable | Controls | Required | Example |
|----------|----------|----------|---------|
| `VITE_FIREBASE_API_KEY` | Firebase project API key | Yes | `AIzaSy...` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain | Yes | `myproject.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID | Yes | `umami-watch` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket | Yes | `myproject.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase FCM sender | Yes | `123456789012` |
| `VITE_FIREBASE_APP_ID` | Firebase app ID | Yes | `1:123:web:abc` |
| `VITE_API_BASE_URL` | Backend service base URL | Yes | `http://localhost:8080` |
| `VITE_TMDB_API_KEY` | TMDB v3 API key (movies/TV) | Yes | `abc123...` |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key | Yes | `0x4AAAAAAA...` |
| `VITE_HLS_PROXY_URL` | Cloudflare Worker HLS proxy base URL | No | `https://umami-hls-proxy.*.workers.dev` |
| `VITE_GIPHY_API_KEY` | Giphy API key for GIF search in chat | No | `...` |
| `VITE_USE_EMULATOR` | Connect to local Firebase emulators | No (dev only) | `true` |
| `VITE_CONSUMET_API_URL` | Deprecated — unused; passed as build arg in `cloudbuild.yaml` but ignored | No | — |

### Backend (`process.env.*`)

| Variable | Controls | Required | Example |
|----------|----------|----------|---------|
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to Firebase service account JSON | Yes (prod) | `/run/secrets/firebase-sa.json` |
| `FIREBASE_PROJECT_ID` | Firebase project ID for Admin SDK init | Yes | `umami-watch` |
| `FIREBASE_STORAGE_BUCKET` | Firebase storage bucket | No | `umami-watch.firebasestorage.app` |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | No | `https://umami.example.com` |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret for server verification | No | `1x000...AA` (test key) |
| `PORT` | Express listen port | No (default: 8080) | `8080` |
| `FIRESTORE_EMULATOR_HOST` | Points Admin SDK to local Firestore emulator | No (dev only) | `firebase:8088` |
| `FIREBASE_AUTH_EMULATOR_HOST` | Points Admin SDK to local Auth emulator | No (dev only) | `firebase:9099` |

---

## 8. How to Run Locally

### Option A: Docker Compose (recommended — full stack)

```bash
# 1. Create a .env file at repo root with your TMDB and Giphy keys:
#    VITE_TMDB_API_KEY=your_tmdb_key
#    VITE_GIPHY_API_KEY=your_giphy_key

# 2. Start everything (Firebase emulator + backend + frontend + seeder)
docker compose -f docker-compose.dev.yml up --build

# Frontend:  http://localhost:5173
# Backend:   http://localhost:8080
# Firebase emulator UI: http://localhost:4000

# Seeded test accounts:
#   test@dev.local   / password123
#   viewer@dev.local / password123
```

### Option B: Manual (without Docker)

**Prerequisites:** Node.js 20, Java (for Firebase emulator), Firebase CLI

```bash
# Terminal 1: Firebase emulator
firebase emulators:start --project umami-watch --import=./firebase-data

# Terminal 2: Backend
cd server
npm install
FIREBASE_PROJECT_ID=umami-watch \
FIRESTORE_EMULATOR_HOST=localhost:8088 \
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
ALLOWED_ORIGINS=http://localhost:5173 \
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA \
node --watch index.js

# Terminal 3: Frontend
cd frontend
npm install
# Create frontend/.env.local with VITE_* variables (copy from docker-compose.dev.yml environment section)
# Set VITE_USE_EMULATOR=true for local emulators
npm run dev
```

### Seed data

```bash
cd seed
npm install
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
FIRESTORE_EMULATOR_HOST=localhost:8088 \
node seed.js
```

### Run tests

```bash
# Server tests
cd server && npm test

# Frontend tests
cd frontend && npm test

# Python logic tests (from repo root)
python3 tests/run_all.py

# With coverage
cd server && npm run test:coverage
cd frontend && npm run test:coverage
```

### Build for production

```bash
cd frontend
npm run build
# Output: frontend/dist/

# Build Docker image (mirrors what Cloud Build does)
docker build -t umami-watch:local \
  --build-arg VITE_FIREBASE_API_KEY=... \
  --build-arg VITE_FIREBASE_PROJECT_ID=... \
  # ... all other VITE_* args
  .
```

---

## 9. Key Business Logic Locations

### GogoAnime Stream Resolution (`server/routes/gogoanime.js`)
Three endpoints: `/search` scrapes `anitaku.to/search.html`, `/episodes` scrapes `anitaku.to/category/{slug}`, `/sources` scrapes the episode page to extract `data-video` attributes. The sources endpoint picks the **short vibeplayer ID** (exactly 16 lowercase hex chars, no `ag` prefix, no trailing `h`) from the embed URLs — long IDs return 404. Returns `hlsUrl` = `https://vibeplayer.site/public/stream/{id}/master.m3u8` plus optional subtitle VTT from the `?sub=` query param on the embed URL.

**Why GogoAnime:** No CAPTCHA, no token decryption, no third-party decoding service. anitaku.to is freely scrapable server-side; vibeplayer.site requires no auth; video segments are served by **ByteDance CDN** (`p16-ad-sg.ibyteimg.com`) which has no IP blocking — Cloudflare Worker can fetch segments freely, meaning zero video egress through Cloud Run.

**Why AllAnime was dropped (Apr 2026):** `api.allanime.day/api` returns `{"message":"NEED_CAPTCHA"}` at the application level on `sourceUrls` queries. The Cloudflare Turnstile site key (`0x4AAAAAADAXQmN7FOUbtiV8`) is validated server-side — fake tokens return "Error Re-captcha!" — requiring a paid CAPTCHA solving service (~$6 minimum top-up) per session.

**Why AnimeKai was dropped:** MegaUp CDN (`megaup.nl`, `hub26link.site`) actively blocks Cloudflare datacenter IPs, making it impossible to route video through the Worker. All video bytes would pass through Cloud Run, generating significant egress charges.

### GogoAnime Title Matching (`frontend/src/api/gogoanime.js` — `pickBestShow()`)
Word-count scoring: for each result, count how many search title words appear in the result title, then subtract a penalty of 0.5× extra words (words in result title beyond the search title length). Sorts descending by score. Determines which GogoAnime slug maps to a given Kitsu/AniList anime title.

### Watch Position & Episode Completion (`frontend/src/pages/WatchPage.jsx` ~lines 428–454)
Saves to Firestore every 15 seconds while playing. Auto-marks episode as watched at 85% of duration (`position >= duration * 0.85`). Three-state `manuallyWatched` flag overrides auto-detection.

### HLS Manifest Rewriting (`server/index.js` ~lines 105–204)
Intercepts `.m3u8` responses, rewrites all segment/variant URLs to point through the backend (or Cloudflare Worker). 50MB in-memory LRU cache for `.ts` segments with coalescing to prevent upstream hammering in watch parties.

### Room Expiry Cleanup (`server/routes/rooms.js` lines ~8–19)
`setInterval` runs every 10 minutes; queries Firestore for rooms where `expiresAt < now()` and batch-deletes them. Rooms live for 6 hours from creation.

### Manga Chapter Source Fallback (`frontend/src/pages/MangaDetailPage.jsx` ~line 85)
If MangaDex returns fewer than 10 chapters for a manga, the app searches ComicK by title and stores the ComicK slug in `localStorage` for that manga ID. The reader then uses ComicK images instead of MangaDex.

### Batch Write Chunking (`frontend/src/hooks/useWatchedEps.js`, `useReadChapters.js`)
Firestore batch operations are split into chunks of 499 (`BATCH_LIMIT`) because the SDK limits a single batch to 500 operations. Handles anime with very large episode counts.

### Socket.IO Playback Sync (`server/socket/roomSocket.js`, `frontend/src/pages/WatchPage.jsx`)
Host emits heartbeat every 5 seconds; viewers emit `request-sync` every 20 seconds. Viewers apply drift correction if position differs by more than 6 seconds. Playback state written to Firestore asynchronously (non-blocking) on every host event using dot-notation update (`playback.position`, `playback.playing`) to avoid clobbering sibling fields.

### High-Risk Files to Change
- `server/index.js` — HLS proxy cache, video range proxy, all route mounts; changes here affect all streaming
- `frontend/src/components/VideoPlayer.jsx` — 465 lines; Plyr + HLS.js integration, subtitle system, double-tap seek, viewer mode controls
- `frontend/src/pages/WatchPage.jsx` — 740 lines; the entire watch experience, room sync, history saving
- `server/socket/roomSocket.js` — all real-time room logic; wrong dot-notation can corrupt `playback` field
- `server/routes/gogoanime.js` — HTML regex scraping; if anitaku.to changes its markup, all anime streaming breaks

---

## 10. Testing

### What Is Tested
- **Server routes** — `vitest` + `supertest`; covers route logic, proxy behavior, auth middleware
- **Frontend hooks/components** — `vitest` + `@testing-library/react`; covers hook logic and component rendering
- **Python logic tests** — pure-logic tests with no network/Firebase dependency:
  - `test_allanime_matching.py` — `pickBestShow()` scoring algorithm (same logic used by GogoAnime title matching)
  - `test_server_logic.py` — server-side business rules
  - `test_socket_logic.py` — room sync event logic
  - `test_kitsu.py` — Kitsu response normalization
  - `test_torrentio.py` — torrentio URL parsing

### What Is Not Tested
- End-to-end browser tests (no Cypress or Playwright)
- Firebase emulator integration tests
- The Cloudflare Worker (`hls-proxy.js`)
- GogoAnime HTML scraping (no server-side test for regex parsers in `server/routes/gogoanime.js`)
- Socket.IO connection lifecycle

### Running Tests

```bash
cd server && npm test              # Vitest, watch mode off
cd server && npm run test:coverage # With v8 coverage report
cd frontend && npm test
cd frontend && npm run test:coverage
python3 tests/run_all.py           # All Python tests
```

### Test Locations
- Server tests: `server/__tests__/` or `server/**/*.test.js` (discovered by Vitest)
- Frontend tests: `frontend/src/**/*.test.jsx` and `frontend/src/**/*.test.js`
- Frontend test setup: `frontend/src/test/setup.js` (configures `@testing-library/jest-dom`)
- Python tests: `tests/*.py`

---

## 11. Gotchas & Known Issues

### Firestore Rules Are Dev-Only
`firestore.rules` allows all reads and writes unconditionally (`if true`). This is intentional for local development but **must not be deployed to production**. Production rules are managed separately in the Firebase console.

### `firebase-service-account.json` in Repo Root
A service account JSON file exists at the repo root. This is used for local development convenience. It should not contain production credentials, but **never commit real service account keys** — rotate immediately if exposed.

### Session Affinity Is Critical for Socket.IO
Cloud Run is configured with `--session-affinity`. Without it, Socket.IO polling requests can land on different instances and break room sync. Do not remove this flag.

### Vite Env Vars Are Baked In at Build Time
`VITE_*` variables are inlined at build time by Vite. Changing them requires a full rebuild + redeploy. There is no runtime config injection.

### `VITE_CONSUMET_API_URL` Is Deprecated
This variable appears in `cloudbuild.yaml` as `$_VITE_CONSUMET_API_URL` from when the project used Consumet, then AllAnime. It is passed as a build arg but not meaningfully used. Safe to ignore.

### Kitsu ID Expiry
Kitsu periodically renumbers or removes entries. `AnimeDetailPage.jsx` handles 404 responses by searching Kitsu by title and redirecting to the new ID. `WatchPage.jsx` does the same for watch party room content. If you see redirect loops, Kitsu may have deprecated that ID entirely.

### ComicK Is Behind Cloudflare Bot Management
Cloud Run's outbound IPs are frequently blocked by ComicK's Cloudflare protection. The backend proxy adds appropriate headers, but if ComicK returns 403, this is a CDN block — not a code bug. No reliable fix without residential proxies.

### HLS Compression Is Disabled
`compression()` middleware explicitly skips the `/api/proxy/hls` path because gzip-compressing a streaming response breaks the pipe. If you add new streaming routes, exclude them from compression the same way.

### Torrent Feature Is Unfinished
`server/routes/torrent.js` implements torrent streaming with FFmpeg remux. It is **not mounted in `server/index.js`** and not accessible in production. The `rdApiKey` field in user docs is a placeholder for future RealDebrid integration.

### Double-Tap Seek Uses Ref-Based State
`VideoPlayer.jsx` uses `useRef` for double-tap detection (`lastTapRef`, `doubleTapRef`) to avoid React re-renders on each tap. If you refactor this to `useState`, the 300ms timing window will break because state updates are asynchronous.

### `pendingSyncRef` Pattern in WatchPage
Socket.IO sync events (`sync:state`) can arrive before the video player mounts. `WatchPage.jsx` buffers them in `pendingSyncRef` and applies them in `handlePlayerReady`. If the player is ever re-instantiated (e.g., stream URL changes), the ref is cleared and re-populated — see line ~340 where `playerRef.current = null` is set when content updates.

### Watchlist Doc ID Is a Compound String
Watchlist entries use `{uid}_{contentId}` as the document ID (not a subcollection). This means `contentId` values must not contain underscores, or the split will be ambiguous. All current content IDs (Kitsu, TMDB, MangaDex) are numeric or UUID-format, so this is safe in practice.

### No Linter or Formatter
There is no ESLint or Prettier configuration. Code style is enforced only by convention.

---

## 12. Deployment

### Pipeline
Deployment is triggered by **pushing a git tag** (e.g., `git tag v1.2.3 && git push --tags`). Cloud Build picks up the tag, runs `cloudbuild.yaml`:

1. **Build Docker image** — Vite frontend built inside Docker with `--build-arg` secrets from Cloud Secret Manager; output is a single image with frontend static files in `/public` and the Node server
2. **Push to GCR** — tagged as both `gcr.io/$PROJECT_ID/umami-watch:$TAG_NAME` and `:latest`
3. **Deploy to Cloud Run** — `gcloud run deploy umami-watch` with session affinity, secrets mounted, 0–5 instances

### Secret Management
All sensitive values are stored in **Google Cloud Secret Manager** and injected at deploy time:
- **Frontend secrets** → passed as Docker `--build-arg` values during the build step
- **Backend secrets** → mounted as Cloud Run env vars (`FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `ALLOWED_ORIGINS`, `TURNSTILE_SECRET_KEY`) and as a file (`/run/secrets/firebase-sa.json`)

### Cloudflare Worker
The HLS proxy worker (`cloudflare-worker/hls-proxy.js`) is deployed separately via the Cloudflare dashboard or `wrangler deploy`. It is independent of Cloud Build. Its URL is baked into the frontend bundle as `VITE_HLS_PROXY_URL`.

### Environment Differences

| Aspect | Local Dev | Production |
|--------|-----------|------------|
| Firebase | Emulator (Docker) | Real Firebase project |
| Secrets | `.env` files / docker-compose env | Cloud Secret Manager |
| Backend | `node --watch index.js` | Cloud Run container |
| Frontend | Vite dev server (HMR) | Static files served by Express |
| CORS | `localhost:5173` | Configured via `ALLOWED_ORIGINS` secret |
| Turnstile | Test secret (always passes) | Real Cloudflare secret |
| Firestore rules | `if true` (allow all) | Managed in Firebase console (separate) |

### Manual Steps Required
- Cloudflare Worker must be deployed separately with `wrangler`
- Firebase security rules for production are managed in the Firebase console, not from this repo
- Cloud Build trigger must be manually configured in GCP to trigger on tag push
- `ALLOWED_ORIGINS` secret must be updated when the Cloud Run service URL changes

### Rollback
Re-deploy a previous tag:
```bash
gcloud run deploy umami-watch \
  --image gcr.io/$PROJECT_ID/umami-watch:$PREVIOUS_TAG \
  --region $REGION \
  --session-affinity
```
Images are retained in GCR indefinitely unless manually deleted.
