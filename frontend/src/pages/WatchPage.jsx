import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import { getAnimeKitsuInfo, getKitsuEpisodes, searchAnimeKitsu } from '../api/kitsu';
import { searchAnimekai, getAnimekaiEpisodes, getAnimekaiSources, pickBestAnimekaiShow } from '../api/animekai';
import { getAnimeById } from '../api/anilist';
import { getMovieDetail, getTVDetail } from '../api/tmdb';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import VideoPlayer from '../components/VideoPlayer';
import ChatPanel from '../components/ChatPanel';
import ReconnectOverlay from '../components/ReconnectOverlay';
import EpisodeContextMenu from '../components/EpisodeContextMenu';
import { useWatchedEps } from '../hooks/useWatchedEps';
import LoadingSpinner from '../components/LoadingSpinner';
import InviteModal from '../components/InviteModal';
import RoomContentModal from '../components/RoomContentModal';

// Only two reliable embed sources for movies/TV
function buildEmbedSources(type, { tmdbId, season, episode }) {
  if (type === 'movie') return [
    { label: 'VidSrc CC', url: `https://vidsrc.cc/v2/embed/movie/${tmdbId}`, type: 'iframe' },
    { label: 'VidSrc Net', url: `https://vidsrc.net/embed/movie?tmdb=${tmdbId}`, type: 'iframe' },
  ];
  if (type === 'tv') return [
    { label: 'VidSrc CC', url: `https://vidsrc.cc/v2/embed/tv/${tmdbId}/${season}/${episode}`, type: 'iframe' },
    { label: 'VidSrc Net', url: `https://vidsrc.net/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}`, type: 'iframe' },
  ];
  return [];
}

export default function WatchPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const roomId = searchParams.get('roomId');
  const type = searchParams.get('type'); // anime | movie | tv
  const kitsuId = searchParams.get('kitsuId');
  const epNum = parseInt(searchParams.get('epNum') || '1', 10);
  const tmdbId = searchParams.get('tmdbId');
  const season = searchParams.get('season');
  const episode = searchParams.get('episode');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [sources, setSources] = useState([]);
  const [activeSourceIdx, setActiveSourceIdx] = useState(0);
  const [activeTracks, setActiveTracks] = useState([]);
  const [contentDetails, setContentDetails] = useState(null);
  const [roomData, setRoomData] = useState(null);
  const [token, setToken] = useState(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showContentPicker, setShowContentPicker] = useState(false);
  const [animeEpisodes, setAnimeEpisodes] = useState([]);
  const [mobileTab, setMobileTab] = useState('chat'); // 'chat' | 'episodes'
  const [epMenu, setEpMenu] = useState(null); // { x, y, epNum }

  const playerRef = useRef(null);
  const hasJoinedRoomRef = useRef(false);
  const episodeListRef = useRef(null);
  const pendingSyncRef = useRef(null); // buffers sync:state that arrives before player is ready

  const getToken = useCallback((forceRefresh = false) => auth.currentUser?.getIdToken(forceRefresh), []);
  const { socketRef, connected, reconnecting } = useSocket(import.meta.env.VITE_API_BASE_URL, getToken);
  const { watchedEps, toggleWatched, markAllWatched, markAllUnwatched, updateWatched } = useWatchedEps(
    type === 'anime' ? kitsuId : null, user, contentDetails?.title, contentDetails?.posterUrl
  );
  const isHost = roomData?.hostId === user?.uid;

  // Derived: current episode index + next episode
  const currentEpIdx = animeEpisodes.findIndex(ep => ep.number === epNum);
  const nextEp = currentEpIdx >= 0 && currentEpIdx < animeEpisodes.length - 1
    ? animeEpisodes[currentEpIdx + 1]
    : null;

  function buildEpUrl(ep) {
    const base = `/watch?type=anime&kitsuId=${kitsuId}&epNum=${ep.number}`;
    return roomId ? `${base}&roomId=${roomId}` : base;
  }

  // 1. Get fresh Firebase auth token
  useEffect(() => {
    if (!user) return;
    auth.currentUser?.getIdToken().then(setToken).catch(() => {});
  }, [user]);

  // 2. Fetch room data via authenticated API (avoids Firestore client rules)
  useEffect(() => {
    if (!roomId || !token) return;
    let cancelled = false;
    fetch(`${import.meta.env.VITE_API_BASE_URL}/api/rooms/${roomId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => {
        if (cancelled) return;
        if (!data.members?.includes(user?.uid)) {
          setError('Access denied — you are not a member of this room.');
          setLoading(false);
          return;
        }
        setRoomData(data);
        // Restore stream for non-host viewers — host will re-fetch via fetchStream
        if (data.streamUrl && data.hostId !== user?.uid) {
          setStreamUrl(data.streamUrl);
          if (data.contentType === 'anime') {
            const srcType = data.streamType || (data.streamUrl.includes('.m3u8') ? 'hls' : 'direct');
            setSources([{ type: srcType, url: data.streamUrl, label: 'Stream' }]);
            setActiveTracks(data.tracks || []);
          } else if (data.contentType) {
            setSources([{ type: 'iframe', url: data.streamUrl, label: 'Stream' }]);
          }
        }
        // If no content type to fetch, we're done loading
        if (!type) setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(`Could not load room: ${err.message}`);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [roomId, token]);

  // 3. Fetch content & build sources (host or solo watcher)
  useEffect(() => {
    if (!type) {
      // No content — resolve loading once room is known (or immediately if no room)
      if (!roomId || roomData !== null) setLoading(false);
      return;
    }
    // Non-host viewers get stream from socket/initial room fetch, not here
    if (roomId && !isHost && roomData !== null) return;
    // Wait for room to load before host runs fetchStream
    if (roomId && roomData === null) return;

    let cancelled = false;

    async function fetchStream() {
      setLoading(true);
      setError(null);
      try {
        let title = '';
        let poster = '';
        let url = null;
        let subtitleTracks = [];
        let streamType = 'iframe';

        if (type === 'anime') {
          if (!kitsuId) {
            setError('No Kitsu ID provided for this episode.');
            setLoading(false);
            return;
          }

          let animeData = await getAnimeKitsuInfo(kitsuId).catch(async err => {
            if (err.status !== 404) throw err;
            // Kitsu periodically renumbers entries — fall back to a title search.
            // roomData.contentTitle is "Anime Title — Episode N", strip the suffix.
            const storedTitle = roomData?.contentTitle?.replace(/\s*—\s*Episode\s*\d+.*$/i, '').trim();
            if (storedTitle) {
              const results = await searchAnimeKitsu(storedTitle);
              if (results.length) return results[0];
            }
            // kitsuId may actually be an AniList ID (AnimeDetailPage AniList fallback path)
            try {
              const anilistData = await getAnimeById(kitsuId);
              if (anilistData) return anilistData;
            } catch { /* ignore */ }
            throw new Error('Anime not found (Kitsu ID expired). Please re-open from the search page.');
          });
          title = `${animeData.title?.english || animeData.title?.romaji || 'Anime'} — Episode ${epNum}`;
          poster = animeData.coverImage?.large || '';

          // Search AnimeKai by title, pick best match
          const searchTitle = animeData.title?.english || animeData.title?.romaji || '';
          const searchData = await searchAnimekai(searchTitle);
          const shows = searchData?.shows || [];
          if (!shows.length) throw new Error('Anime not found on the streaming service.');
          const matchedShow = pickBestAnimekaiShow(shows, searchTitle);

          // Get episode list and find the requested episode token
          const { episodes: epList } = await getAnimekaiEpisodes(matchedShow.slug);
          const epData = epList.find(e => e.number === epNum);
          if (!epData) throw new Error(`Episode ${epNum} not available on this source.`);

          // Backend resolves all available AnimeKai servers in parallel.
          // Try each through the Cloudflare Worker — different CDNs have different IP
          // restrictions. First server whose .m3u8 fetches successfully through the
          // Worker is used (zero Cloud Run egress). Falls back to backend proxy if all
          // Worker attempts fail (e.g., all CDNs block Cloudflare IPs).
          const { servers } = await getAnimekaiSources(epData.token, 'sub');
          if (!servers?.length) throw new Error('No stream sources found for this episode.');

          const workerBase = import.meta.env.VITE_HLS_PROXY_URL;
          let proxiedUrl = null;
          let activeServer = null;

          if (workerBase) {
            // Worker is absolute — always route HLS through Cloudflare, never backend.
            // Probe each server to find one whose CDN doesn't block Cloudflare IPs.
            for (const srv of servers) {
              const hlsFile = srv.sources?.[0]?.file;
              if (!hlsFile) continue;
              const u = new URL(workerBase);
              u.searchParams.set('url', hlsFile);
              u.searchParams.set('referer', srv.referer || 'https://megaup.nl/');
              try {
                const probe = await fetch(u.toString());
                if (probe.ok) { proxiedUrl = u.toString(); activeServer = srv; break; }
              } catch { /* try next server */ }
            }
            if (!proxiedUrl) throw new Error('No stream server is available through the CDN proxy. Please try again later.');
          } else {
            // Dev / no Worker configured — use backend proxy
            activeServer = servers[0];
            const hlsFile = activeServer.sources[0].file;
            const base = `${import.meta.env.VITE_API_BASE_URL || ''}/api/proxy/hls`;
            const u = new URL(base, window.location.origin);
            u.searchParams.set('url', hlsFile);
            u.searchParams.set('referer', activeServer.referer || 'https://megaup.nl/');
            proxiedUrl = u.toString();
          }

          const animeSourceList = [{ label: 'AnimeKai', url: proxiedUrl, type: 'hls', tracks: activeServer.tracks }];

          if (!cancelled) {
            setSources(animeSourceList);
            setActiveSourceIdx(0);
            setActiveTracks(activeServer.tracks || []);
          }
          url = proxiedUrl;
          streamType = 'hls';
          subtitleTracks = activeServer.tracks || [];

        } else if (type === 'movie') {
          const data = await getMovieDetail(tmdbId);
          title = data.title;
          poster = `https://image.tmdb.org/t/p/w500${data.poster_path}`;
          const srcs = buildEmbedSources('movie', { tmdbId });
          if (!cancelled) {
            setSources(srcs);
            setActiveSourceIdx(0);
            setActiveTracks([]);
          }
          url = srcs[0].url;

        } else if (type === 'tv') {
          const data = await getTVDetail(tmdbId);
          title = `${data.name} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
          poster = `https://image.tmdb.org/t/p/w500${data.poster_path}`;
          const srcs = buildEmbedSources('tv', { tmdbId, season, episode });
          if (!cancelled) {
            setSources(srcs);
            setActiveSourceIdx(0);
            setActiveTracks([]);
          }
          url = srcs[0].url;
        }

        if (cancelled) return;

        setContentDetails({ title, posterUrl: poster, id: type === 'anime' ? kitsuId : tmdbId, type });

        if (url) {
          setStreamUrl(url);
          // Host: write stream URL to room so all viewers pick it up
          if (roomId && isHost) {
            const t = await auth.currentUser.getIdToken();
            await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/rooms/${roomId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
              body: JSON.stringify({
                streamUrl: url,
                streamType,
                contentId: type === 'anime' ? kitsuId : tmdbId,
                contentType: type,
                contentTitle: title,
                tracks: subtitleTracks
              })
            }).catch(console.error);
          }
        } else {
          setError('No stream found for this content.');
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setError(err.message || 'Failed to load stream.');
      }
      if (!cancelled) setLoading(false);
    }

    fetchStream();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, kitsuId, epNum, tmdbId, season, episode, isHost, roomId, roomData !== null]);

  // 4. Fetch all episodes for the sidebar (anime only)
  useEffect(() => {
    if (type !== 'anime' || !kitsuId) return;
    getKitsuEpisodes(kitsuId)
      .then(eps => { if (eps.length > 0) setAnimeEpisodes(eps); })
      .catch(() => {});
  }, [type, kitsuId]);

  // 5. Auto-scroll episode list to current episode
  useEffect(() => {
    if (!episodeListRef.current || !epNum || animeEpisodes.length === 0) return;
    const el = episodeListRef.current.querySelector(`[data-ep="${epNum}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [animeEpisodes, epNum]);

  // 6. Socket: join room + playback sync
  useEffect(() => {
    const socket = socketRef.current;
    if (!connected || !socket || !roomId || !roomData || !token) return;

    if (!hasJoinedRoomRef.current) {
      hasJoinedRoomRef.current = true;
      socket.emit('join-room', { roomId, displayName: user?.displayName || 'Viewer', photoURL: user?.photoURL || null });
    }

    // Viewer: apply sync state from server (periodic heartbeat or join event)
    const onSyncState = ({ position, playing } = {}) => {
      if (isHost) return;
      const p = playerRef.current;
      if (!p) {
        // Player not ready yet — buffer so handlePlayerReady can apply it
        pendingSyncRef.current = { position, playing };
        return;
      }
      if (typeof position === 'number' && Math.abs(p.currentTime - position) > 6) {
        p.currentTime = position;
      }
      if (playing && p.paused) p.play().catch(() => {});
      if (!playing && !p.paused) p.pause();
    };
    const onPlay = (pos) => {
      const p = playerRef.current;
      if (!p || isHost) return;
      if (Math.abs(p.currentTime - pos) > 6) p.currentTime = pos;
      p.play().catch(() => {});
    };
    const onPause = (pos) => {
      const p = playerRef.current;
      if (!p || isHost) return;
      // Only re-seek if significantly out of sync; minor drift doesn't need a seek on pause
      if (Math.abs(p.currentTime - pos) > 5) p.currentTime = pos;
      p.pause();
    };
    const onSeek = (pos) => {
      const p = playerRef.current;
      if (!p || isHost) return;
      p.currentTime = pos;
    };
    // Host: a viewer needs an immediate sync
    const onViewerNeedsSync = (viewerSocketId) => {
      const p = playerRef.current;
      if (!p || !isHost) return;
      socket.emit('sync-response', { viewerSocketId, position: p.currentTime, playing: !p.paused });
    };
    // Receive real-time content updates when host patches the room
    const onRoomContentUpdated = (data) => {
      // Always update room metadata (title, contentType, etc.) so "Now Watching" stays current for everyone
      setRoomData(prev => prev ? { ...prev, ...data } : prev);
      if (isHost) return; // host already has the new stream; skip player/source updates
      // Clear stale player ref so sync events during VideoPlayer remount buffer
      // in pendingSyncRef rather than being lost on the destroyed (zombie) Plyr.
      playerRef.current = null;
      setActiveSourceIdx(0);
      if (data.streamUrl) {
        setStreamUrl(data.streamUrl);
        if (data.contentType === 'anime') {
          const srcType = data.streamType || (data.streamUrl.includes('.m3u8') ? 'hls' : 'direct');
          setSources([{ type: srcType, url: data.streamUrl, label: 'Stream' }]);
          setActiveTracks(data.tracks || []);
        } else {
          setSources([{ type: 'iframe', url: data.streamUrl, label: 'Stream' }]);
        }
      }
    };

    // Room deleted by host — redirect everyone out
    const onRoomDeleted = () => navigate('/rooms');

    socket.on('sync:state', onSyncState);
    socket.on('playback:play', onPlay);
    socket.on('playback:pause', onPause);
    socket.on('playback:seek', onSeek);
    socket.on('viewer-needs-sync', onViewerNeedsSync);
    socket.on('room:content-updated', onRoomContentUpdated);
    socket.on('room:deleted', onRoomDeleted);

    return () => {
      socket.off('sync:state', onSyncState);
      socket.off('playback:play', onPlay);
      socket.off('playback:pause', onPause);
      socket.off('playback:seek', onSeek);
      socket.off('viewer-needs-sync', onViewerNeedsSync);
      socket.off('room:content-updated', onRoomContentUpdated);
      socket.off('room:deleted', onRoomDeleted);
    };
  }, [connected, roomId, !!roomData, isHost, token]);

  // Auto-rotate to landscape when any video enters fullscreen on mobile
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (document.fullscreenElement) {
        screen.orientation?.lock?.('landscape').catch(() => {});
      } else {
        screen.orientation?.unlock?.();
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      screen.orientation?.unlock?.();
    };
  }, []);

  // Re-join room on socket reconnect (server drops socket rooms on disconnect)
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !roomId) return;
    const onConnect = () => {
      if (hasJoinedRoomRef.current) {
        // Reconnect — the server's socket lost its room membership, re-join immediately
        socket.emit('join-room', { roomId, displayName: user?.displayName || 'Viewer', photoURL: user?.photoURL || null });
      }
      // Initial connect is handled by the main socket effect
    };
    socket.on('connect', onConnect);
    return () => socket.off('connect', onConnect);
  }, [connected, roomId, user?.displayName, user?.photoURL]);

  // Host: emit heartbeat every 3s so viewers auto-correct drift
  useEffect(() => {
    if (!roomId || !isHost || !socketRef.current) return;
    const interval = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      socketRef.current?.emit('playback:heartbeat', { position: p.currentTime, playing: !p.paused });
    }, 5000);
    return () => clearInterval(interval);
  }, [roomId, isHost, connected]);

  // Viewer: request a fresh sync every 10s (catches buffering drift)
  useEffect(() => {
    if (!roomId || isHost) return;
    const interval = setInterval(() => {
      socketRef.current?.emit('request-sync');
    }, 20000);
    return () => clearInterval(interval);
  }, [roomId, isHost, connected]);

  // 7. Save watch history per episode (solo + watch party)
  useEffect(() => {
    if (!type || !user) return;
    const histKey = type === 'anime' ? `anime_kitsu${kitsuId}_ep${epNum}` : (tmdbId || 'unknown');
    const interval = setInterval(async () => {
      const p = playerRef.current;
      if (!p || p.paused) return;
      const pos = p.currentTime;
      const dur = p.duration;
      if (pos < 5 || !dur) return;
      const histRef = doc(db, 'users', user.uid, 'history', histKey);
      await setDoc(histRef, {
        contentId: type === 'anime' ? kitsuId : tmdbId,
        contentType: type,
        title: contentDetails?.title || 'Unknown',
        posterUrl: contentDetails?.posterUrl || '',
        position: pos, duration: dur,
        updatedAt: serverTimestamp(),
        ...(type === 'anime' && { epNum }),
        ...(season && { seasonNum: season }),
        ...(episode && { episodeNum: episode })
      }, { merge: true }).catch(console.error);
      if (type === 'anime' && epNum && pos >= dur * 0.85) {
        updateWatched(epNum, true);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [type, kitsuId, epNum, tmdbId, season, episode, user, contentDetails]);

  const handlePlayerReady = (player) => {
    playerRef.current = player;
    if (!roomId && user && type === 'anime' && kitsuId) {
      const histKey = `anime_kitsu${kitsuId}_ep${epNum}`;
      getDoc(doc(db, 'users', user.uid, 'history', histKey)).then(snap => {
        if (snap.exists() && snap.data().position) player.currentTime = snap.data().position;
      });
    }
    if (roomId && isHost) {
      player.on('play', () => socketRef.current?.emit('playback:play', player.currentTime));
      player.on('pause', () => socketRef.current?.emit('playback:pause', player.currentTime));
      let seekTimer = null;
      player.on('seeked', () => {
        clearTimeout(seekTimer);
        seekTimer = setTimeout(() => socketRef.current?.emit('playback:seek', player.currentTime), 150);
      });
    }
    // Apply buffered sync:state that arrived before player was ready
    if (roomId && !isHost && pendingSyncRef.current) {
      const { position, playing } = pendingSyncRef.current;
      pendingSyncRef.current = null;
      if (typeof position === 'number') player.currentTime = position;
      if (playing) player.play().catch(() => {});
    } else if (roomId && !isHost) {
      // No buffered sync — request one immediately so we don't wait up to
      // 5 s for the next host heartbeat after a content change.
      socketRef.current?.emit('request-sync');
    }
  };

  const handleSourceSwitch = (idx) => {
    const src = sources[idx];
    setActiveSourceIdx(idx);
    setStreamUrl(src.url);
    setActiveTracks(src.tracks || []);
  };


  if (loading) return <LoadingSpinner fullScreen />;

  const isHls    = sources[activeSourceIdx]?.type === 'hls';
  const isDirect = sources[activeSourceIdx]?.type === 'direct';

  const videoOptions = {
    autoplay: false,
    sources: isHls
      ? [{ src: streamUrl, type: 'application/x-mpegURL' }]
      : isDirect && streamUrl
        ? [{ src: streamUrl, type: 'video/mp4' }]
        : [],
    isViewer: !!(roomId && !isHost),
  };

  const hasEpisodeSidebar = type === 'anime' && animeEpisodes.length > 0;
  const hasChatSidebar = !!roomId;
  const hasSidebar = hasEpisodeSidebar || hasChatSidebar;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-page">
      <ReconnectOverlay reconnecting={reconnecting} />

      {/* Source Switcher */}
      {sources.length > 1 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-surface-raised border-b border-border flex-wrap">
          <span className="text-xs text-muted font-semibold uppercase tracking-wider mr-1">Stream:</span>
          {sources.map((s, i) => (
            <button
              key={i}
              onClick={() => handleSourceSwitch(i)}
              className={`px-3 py-1 rounded text-xs font-bold transition-colors border ${i === activeSourceIdx ? 'bg-accent-teal text-white border-accent-teal' : 'bg-surface border-border text-secondary hover:text-primary'}`}
            >
              {s.label}
            </button>
          ))}
          <span className="text-xs text-muted ml-auto hidden sm:block">Try the other source if one doesn't work</span>
        </div>
      )}

      {/* Main layout */}
      <div className={`flex flex-col ${hasSidebar ? 'lg:flex-row' : ''} gap-0 lg:gap-6 p-0 lg:p-6 max-w-[1600px] mx-auto`}>

        {/* Left: video + meta */}
        <div className="flex-1 min-w-0">

          {/* Video — 16:9 */}
          <div className="w-full bg-black aspect-video relative rounded-none lg:rounded-xl overflow-hidden border-b border-border lg:border">
            {error ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 font-bold p-8 text-center bg-surface gap-4">
                <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="max-w-sm">{error}</p>
                <button onClick={() => window.location.reload()} className="text-sm bg-surface-raised border border-border px-4 py-2 rounded-lg text-secondary hover:text-primary transition-colors">
                  Retry
                </button>
              </div>
            ) : streamUrl ? (
              (isHls || isDirect) ? (
                <VideoPlayer key={streamUrl} options={videoOptions} tracks={activeTracks} onReady={handlePlayerReady} token={token} />
              ) : (
                <iframe
                  key={streamUrl}
                  src={streamUrl}
                  className="w-full h-full border-0 absolute inset-0 bg-black"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  title="Video Player"
                />
              )
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-surface">
                {roomId && isHost ? (
                  <>
                    <p className="text-muted text-sm font-medium">Nothing playing yet. Pick something to watch.</p>
                    <button
                      onClick={() => setShowContentPicker(true)}
                      className="bg-accent-teal text-white font-bold px-6 py-2.5 rounded-xl hover:opacity-90 transition-opacity flex items-center gap-2"
                    >
                      <span>🔍</span> Browse Content
                    </button>
                  </>
                ) : (
                  <p className="text-muted font-bold font-mono text-sm">
                    {roomId ? 'Waiting for host to select content...' : 'No stream available.'}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Next episode bar */}
          {nextEp && (
            <div className="flex items-center justify-between px-4 py-2 bg-surface-raised border-b border-border">
              <span className="text-xs text-muted">Up next: Episode {nextEp.number}{nextEp.title ? ` — ${nextEp.title}` : ''}</span>
              <Link
                to={buildEpUrl(nextEp)}
                className="flex items-center gap-1.5 bg-accent-teal text-white px-4 py-1.5 rounded-lg font-bold text-sm hover:opacity-90 transition-opacity"
              >
                Next Episode <span>→</span>
              </Link>
            </div>
          )}

          {/* Notices */}
          {streamUrl && !isHls && !isDirect && (
            <div className="mx-4 mt-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded-lg font-medium flex items-center gap-2">
              <span>⚠️</span>
              <span>If the player is blank, disable your <strong>ad blocker</strong> for this site, or switch source above.</span>
            </div>
          )}
          {roomId && streamUrl && !isHls && !isDirect && (
            <div className="mx-4 mt-2 bg-blue-50 border border-blue-200 text-blue-700 text-xs px-3 py-2 rounded-lg font-medium flex items-center gap-2">
              <span>ℹ️</span>
              <span>Embed sources don't support automatic sync. Everyone sees the same content — just start at the same time.</span>
            </div>
          )}

          {/* Meta Area */}
          <div className="p-4 md:p-6 bg-surface">
            <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-3">
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-primary mb-1">
                  {roomId ? roomData?.name : (contentDetails?.title || 'Unknown Video')}
                </h1>
                {roomId && (
                  <p className="text-secondary font-medium text-sm">
                    Now Watching: <span className="text-primary font-bold">{roomData?.contentTitle || 'Nothing selected'}</span>
                  </p>
                )}
              </div>
              {roomId && (
                <div className="flex gap-2 flex-shrink-0">
                  {isHost && (
                    <button onClick={() => setShowContentPicker(true)} className="bg-surface-raised border border-border hover:bg-page text-primary font-bold py-2 px-4 rounded-lg shadow-sm transition-colors flex items-center gap-2 text-sm">
                      <span>🎬</span> {streamUrl ? 'Change' : 'Select Content'}
                    </button>
                  )}
                  <button onClick={() => setShowInviteModal(true)} className="bg-surface-raised border border-border hover:bg-page text-primary font-bold py-2 px-4 rounded-lg shadow-sm transition-colors flex items-center gap-2 text-sm">
                    <span>🔗</span> Invite Friends
                  </button>
                </div>
              )}
            </div>
            {roomId && !isHost && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg font-medium shadow-sm max-w-2xl">
                You are a viewer. {(isHls || isDirect) ? 'The host controls playback in sync.' : 'Start playback at the same time as the host.'}
              </div>
            )}
          </div>
        </div>

        {/* Right: chat + episode list */}
        {hasSidebar && (
          <div className="w-full lg:w-80 xl:w-96 flex-shrink-0 flex flex-col gap-3 pb-6 lg:pb-0">

            {/* Mobile tab bar — only when BOTH sections exist */}
            {hasEpisodeSidebar && hasChatSidebar && (
              <div className="flex lg:hidden border-b border-border bg-surface">
                <button
                  onClick={() => setMobileTab('chat')}
                  className={`flex-1 py-3 text-sm font-bold transition-colors ${mobileTab === 'chat' ? 'text-accent-teal border-b-2 border-accent-teal' : 'text-muted'}`}
                >
                  Live Chat
                </button>
                <button
                  onClick={() => setMobileTab('episodes')}
                  className={`flex-1 py-3 text-sm font-bold transition-colors ${mobileTab === 'episodes' ? 'text-accent-teal border-b-2 border-accent-teal' : 'text-muted'}`}
                >
                  Episodes ({animeEpisodes.length})
                </button>
              </div>
            )}

            {/* Chat (rooms only) — positioned first so it's side-by-side with video */}
            {hasChatSidebar && (
              <div
                className={`bg-surface border border-border lg:rounded-xl overflow-hidden flex-col flex-shrink-0 ${hasEpisodeSidebar && hasChatSidebar ? (mobileTab === 'chat' ? 'flex lg:flex' : 'hidden lg:flex') : 'flex'}`}
                style={{ height: hasEpisodeSidebar ? '60vh' : '70vh' }}
              >
                <ChatPanel roomId={roomId} socket={socketRef.current} user={user} />
              </div>
            )}

            {/* Episode list (anime only) */}
            {hasEpisodeSidebar && (
              <div
                className={`bg-surface border border-border lg:rounded-xl overflow-hidden flex flex-col ${hasEpisodeSidebar && hasChatSidebar ? (mobileTab === 'episodes' ? 'flex lg:flex' : 'hidden lg:flex') : 'flex'}`}
                style={{ maxHeight: hasChatSidebar ? undefined : 'calc(100vh - 160px)', height: hasChatSidebar ? '60vh' : undefined }}
              >
                <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0 gap-2">
                  <span className="font-bold text-sm text-primary">Episodes</span>
                  <div className="flex items-center gap-2">
                    {user && animeEpisodes.length > 0 && (
                      <button
                        onClick={() => animeEpisodes.every(ep => watchedEps.has(ep.number)) ? markAllUnwatched() : markAllWatched(animeEpisodes)}
                        className="text-xs px-2 py-1 rounded border border-border hover:bg-surface-raised transition-colors text-muted"
                      >
                        {animeEpisodes.every(ep => watchedEps.has(ep.number)) ? 'Unwatch all' : 'Watch all'}
                      </button>
                    )}
                    <span className="text-xs text-muted">{animeEpisodes.length} eps</span>
                  </div>
                </div>
                <div ref={episodeListRef} className="overflow-y-auto scrollbar-themed flex-1">
                  {animeEpisodes.map(ep => (
                    <Link
                      key={ep.id}
                      to={buildEpUrl(ep)}
                      data-ep={ep.number}
                      onContextMenu={(e) => { e.preventDefault(); setEpMenu({ x: e.clientX, y: e.clientY, epNum: ep.number }); }}
                      className={`flex items-center gap-3 px-4 py-3 border-b border-border text-sm transition-colors hover:bg-surface-raised ${ep.number === epNum ? 'bg-accent-teal/10 border-l-4 border-l-accent-teal' : 'border-l-4 border-l-transparent'}`}
                    >
                      <span className={`font-bold w-7 text-right flex-shrink-0 text-xs ${ep.number === epNum ? 'text-accent-teal' : 'text-muted'}`}>{ep.number}</span>
                      <span className={`truncate flex-1 ${ep.number === epNum ? 'text-primary font-semibold' : watchedEps.has(ep.number) ? 'text-muted' : 'text-secondary'}`}>
                        {ep.title || `Episode ${ep.number}`}
                      </span>
                      {watchedEps.has(ep.number) && (
                        <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                      {ep.isFiller && <span className="text-xs bg-orange-100 text-orange-600 px-1 py-0.5 rounded flex-shrink-0">F</span>}
                    </Link>
                  ))}
                </div>
                {epMenu && (
                  <EpisodeContextMenu
                    x={epMenu.x}
                    y={epMenu.y}
                    epNum={epMenu.epNum}
                    isWatched={watchedEps.has(epMenu.epNum)}
                    onToggle={toggleWatched}
                    onClose={() => setEpMenu(null)}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {showInviteModal && <InviteModal inviteCode={roomData?.inviteCode} onClose={() => setShowInviteModal(false)} />}
      {showContentPicker && <RoomContentModal roomId={roomId} onClose={() => setShowContentPicker(false)} />}
    </div>
  );
}
