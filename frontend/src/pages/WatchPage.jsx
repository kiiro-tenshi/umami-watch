import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import { getAnimeById } from '../api/anilist';
import { getMovieDetail, getTVDetail } from '../api/tmdb';
import { getAniwatchSources, getAniwatchEpisodes } from '../api/aniwatch';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import VideoPlayer from '../components/VideoPlayer';
import ChatPanel from '../components/ChatPanel';
import ReconnectOverlay from '../components/ReconnectOverlay';
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
  const animeId = searchParams.get('animeId');
  const aniwatchEpisodeId = searchParams.get('aniwatchEpisodeId');
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
  const [mobileTab, setMobileTab] = useState('episodes'); // 'episodes' | 'chat'

  const playerRef = useRef(null);
  const hasJoinedRoomRef = useRef(false);
  const episodeListRef = useRef(null);
  const pendingSyncRef = useRef(null); // buffers sync:state that arrives before player is ready

  const { socketRef, reconnecting } = useSocket(import.meta.env.VITE_API_BASE_URL, token);
  const isHost = roomData?.hostId === user?.uid;

  // Derived: current episode index + next episode
  const currentEpIdx = animeEpisodes.findIndex(ep => ep.number === epNum);
  const nextEp = currentEpIdx >= 0 && currentEpIdx < animeEpisodes.length - 1
    ? animeEpisodes[currentEpIdx + 1]
    : null;

  function buildEpUrl(ep) {
    const base = `/watch?type=anime&animeId=${animeId}&aniwatchEpisodeId=${encodeURIComponent(ep.id)}&epNum=${ep.number}`;
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
          // Set sources so isHls is correct for the viewer's player
          if (data.contentType === 'anime') {
            const tracks = data.tracks || [];
            setSources([{ type: 'hls', url: data.streamUrl, label: 'Stream', tracks }]);
            setActiveTracks(tracks);
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

        if (type === 'anime') {
          const data = await getAnimeById(animeId);
          title = `${data.title?.english || data.title?.romaji || 'Anime'} — Episode ${epNum}`;
          poster = data.coverImage?.large || '';

          if (!aniwatchEpisodeId) {
            setError('Episode not available — no HiAnime source found.');
            setLoading(false);
            return;
          }

          const decoded = decodeURIComponent(aniwatchEpisodeId);

          const SERVERS = [
            { key: 'hd-1',        label: 'HD-1' },
            { key: 'vidstreaming',label: 'Vidstreaming' },
            { key: 'vidcloud',    label: 'Vidcloud' },
          ];

          const CF_PROXY     = import.meta.env.VITE_HLS_PROXY_URL;
          const SERVER_PROXY = `${import.meta.env.VITE_API_BASE_URL}/api/proxy/hls`;

          const buildSource = async (res, label) => {
            const srcList = res?.data?.sources || [];
            if (!srcList.length) return null;
            const src = srcList.find(s => s.isM3U8) || srcList[0];
            if (!src?.url) return null;
            const referer = res.data.headers?.Referer || 'https://hianime.to/';

            // Try CF Worker — reuse the response body if it works, fall back to Server proxy if blocked
            let proxy = SERVER_PROXY;
            try {
              const cfUrl = `${CF_PROXY}?url=${encodeURIComponent(src.url)}&referer=${encodeURIComponent(referer)}`;
              const test = await fetch(cfUrl);
              if (test.ok) proxy = CF_PROXY;
            } catch {
              // CF unreachable — server proxy is already set
            }

            const makeUrl = (u) => `${proxy}?url=${encodeURIComponent(u)}&referer=${encodeURIComponent(referer)}`;
            const tracks = (res.data.subtitles || [])
              .filter(s => s.lang !== 'Thumbnails')
              .map(s => ({
                kind: 'metadata',
                label: s.lang,
                srclang: s.lang.toLowerCase().slice(0, 2),
                src: makeUrl(s.url),
              }));
            return { label, url: makeUrl(src.url), type: 'hls', tracks };
          };

          // Fetch all servers in parallel — auto-retry up to 2 times on cold start failures
          const fetchSources = () => Promise.allSettled(
            SERVERS.map(s => getAniwatchSources(decoded, s.key))
          );
          const toSrcs = async (results) => {
            const built = await Promise.all(
              results.map((r, i) =>
                r.status === 'fulfilled' ? buildSource(r.value, SERVERS[i].label) : Promise.resolve(null)
              )
            );
            return built.filter(Boolean);
          };

          let srcs = await toSrcs(await fetchSources());

          if (srcs.length === 0) {
            // Aniwatch-api may be cold-starting — wait and retry up to 2 times
            for (let attempt = 1; attempt <= 2 && srcs.length === 0; attempt++) {
              if (cancelled) return;
              await new Promise(r => setTimeout(r, attempt * 2000));
              srcs = await toSrcs(await fetchSources());
            }
          }

          if (srcs.length === 0) {
            setError('This episode is not available on HiAnime. The anime may not be indexed there yet.');
            setLoading(false);
            return;
          }

          if (!cancelled) {
            setSources(srcs);
            setActiveSourceIdx(0);
            setActiveTracks(srcs[0].tracks || []);
          }
          subtitleTracks = srcs[0].tracks || [];
          url = srcs[0].url;

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

        setContentDetails({ title, posterUrl: poster, id: type === 'anime' ? animeId : tmdbId, type });

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
                contentId: type === 'anime' ? animeId : tmdbId,
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
  }, [type, animeId, aniwatchEpisodeId, epNum, tmdbId, season, episode, isHost, roomId, roomData]);

  // 4. Fetch all episodes for the sidebar (anime only)
  useEffect(() => {
    if (type !== 'anime' || !aniwatchEpisodeId) return;
    const decoded = decodeURIComponent(aniwatchEpisodeId);
    const showId = decoded.split('?ep=')[0];
    getAniwatchEpisodes(showId)
      .then(res => {
        if (res?.data?.episodes) {
          setAnimeEpisodes(res.data.episodes.map(ep => ({
            id: ep.episodeId || ep.id,
            number: ep.number,
            title: ep.title,
            isFiller: ep.isFiller,
          })));
        }
      })
      .catch(() => {});
  }, [type, aniwatchEpisodeId]);

  // 5. Auto-scroll episode list to current episode
  useEffect(() => {
    if (!episodeListRef.current || !epNum || animeEpisodes.length === 0) return;
    const el = episodeListRef.current.querySelector(`[data-ep="${epNum}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [animeEpisodes, epNum]);

  // 6. Socket: join room + playback sync
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !roomId || !roomData || !token) return;

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
      if (typeof position === 'number' && Math.abs(p.currentTime - position) > 1) {
        p.currentTime = position;
      }
      if (playing && p.paused) p.play().catch(() => {});
      if (!playing && !p.paused) p.pause();
    };
    const onPlay = (pos) => {
      const p = playerRef.current;
      if (!p || isHost) return;
      if (Math.abs(p.currentTime - pos) > 1) p.currentTime = pos;
      p.play().catch(() => {});
    };
    const onPause = (pos) => {
      const p = playerRef.current;
      if (!p || isHost) return;
      p.currentTime = pos;
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
    // Non-host: receive real-time content updates when host patches the room
    const onRoomContentUpdated = (data) => {
      if (isHost) return;
      if (data.streamUrl) {
        setStreamUrl(data.streamUrl);
        if (data.contentType === 'anime') {
          const tracks = data.tracks || [];
          setSources([{ type: 'hls', url: data.streamUrl, label: 'Stream', tracks }]);
          setActiveTracks(tracks);
        } else if (data.contentType) {
          setSources([{ type: 'iframe', url: data.streamUrl, label: 'Stream' }]);
        }
      }
      setRoomData(prev => prev ? { ...prev, ...data } : prev);
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
  }, [socketRef.current, roomId, !!roomData, isHost, token]);

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
  }, [socketRef.current, roomId, user?.displayName, user?.photoURL]);

  // Host: emit heartbeat every 3s so viewers auto-correct drift
  useEffect(() => {
    if (!roomId || !isHost || !socketRef.current) return;
    const interval = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      socketRef.current?.emit('playback:heartbeat', { position: p.currentTime, playing: !p.paused });
    }, 3000);
    return () => clearInterval(interval);
  }, [roomId, isHost, socketRef.current]);

  // Viewer: request a fresh sync every 10s (catches buffering drift)
  useEffect(() => {
    if (!roomId || isHost) return;
    const interval = setInterval(() => {
      socketRef.current?.emit('request-sync');
    }, 10000);
    return () => clearInterval(interval);
  }, [roomId, isHost, socketRef.current]);

  // 7. Save watch history per episode
  useEffect(() => {
    if (!type || !user || roomId) return;
    const histKey = type === 'anime' ? `anime_${animeId}_ep${epNum}` : (tmdbId || 'unknown');
    const interval = setInterval(async () => {
      const p = playerRef.current;
      if (!p || p.paused) return;
      const pos = p.currentTime;
      const dur = p.duration;
      if (pos < 5 || !dur) return;
      const histRef = doc(db, 'users', user.uid, 'history', histKey);
      await setDoc(histRef, {
        contentId: type === 'anime' ? animeId : tmdbId,
        contentType: type,
        title: contentDetails?.title || 'Unknown',
        posterUrl: contentDetails?.posterUrl || '',
        position: pos, duration: dur,
        updatedAt: serverTimestamp(),
        ...(type === 'anime' && { epNum }),
        ...(season && { seasonNum: season }),
        ...(episode && { episodeNum: episode })
      }, { merge: true }).catch(console.error);
    }, 15000);
    return () => clearInterval(interval);
  }, [type, animeId, epNum, tmdbId, season, episode, user, contentDetails, roomId]);

  const handlePlayerReady = (player) => {
    playerRef.current = player;
    if (!roomId && user && type === 'anime' && animeId) {
      const histKey = `anime_${animeId}_ep${epNum}`;
      getDoc(doc(db, 'users', user.uid, 'history', histKey)).then(snap => {
        if (snap.exists() && snap.data().position) player.currentTime = snap.data().position;
      });
    }
    if (roomId && isHost) {
      player.on('play', () => socketRef.current?.emit('playback:play', player.currentTime));
      player.on('pause', () => socketRef.current?.emit('playback:pause', player.currentTime));
      player.on('seeked', () => socketRef.current?.emit('playback:seek', player.currentTime));
    }
    // Apply buffered sync:state that arrived before player was ready
    if (roomId && !isHost && pendingSyncRef.current) {
      const { position, playing } = pendingSyncRef.current;
      pendingSyncRef.current = null;
      if (typeof position === 'number') player.currentTime = position;
      if (playing) player.play().catch(() => {});
    }
  };

  const handleSourceSwitch = (idx) => {
    const src = sources[idx];
    setActiveSourceIdx(idx);
    setStreamUrl(src.url);
    setActiveTracks(src.tracks || []);
  };

  if (loading) return <LoadingSpinner fullScreen />;

  const isHls = sources[activeSourceIdx]?.type === 'hls';

  const videoOptions = {
    autoplay: false,
    sources: isHls ? [{ src: streamUrl, type: 'application/x-mpegURL' }] : [],
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
              isHls ? (
                <VideoPlayer options={videoOptions} tracks={activeTracks} onReady={handlePlayerReady} token={token} />
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
          {streamUrl && !isHls && (
            <div className="mx-4 mt-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded-lg font-medium flex items-center gap-2">
              <span>⚠️</span>
              <span>If the player is blank, disable your <strong>ad blocker</strong> for this site, or switch source above.</span>
            </div>
          )}
          {roomId && streamUrl && !isHls && (
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
                You are a viewer. {isHls ? 'The host controls playback in sync.' : 'Start playback at the same time as the host.'}
              </div>
            )}
          </div>
        </div>

        {/* Right: episode list + chat */}
        {hasSidebar && (
          <div className="w-full lg:w-80 xl:w-96 flex-shrink-0 flex flex-col gap-3 pb-6 lg:pb-0">

            {/* Mobile tab bar — only when BOTH sections exist */}
            {hasEpisodeSidebar && hasChatSidebar && (
              <div className="flex lg:hidden border-b border-border bg-surface">
                <button
                  onClick={() => setMobileTab('episodes')}
                  className={`flex-1 py-3 text-sm font-bold transition-colors ${mobileTab === 'episodes' ? 'text-accent-teal border-b-2 border-accent-teal' : 'text-muted'}`}
                >
                  Episodes ({animeEpisodes.length})
                </button>
                <button
                  onClick={() => setMobileTab('chat')}
                  className={`flex-1 py-3 text-sm font-bold transition-colors ${mobileTab === 'chat' ? 'text-accent-teal border-b-2 border-accent-teal' : 'text-muted'}`}
                >
                  Live Chat
                </button>
              </div>
            )}

            {/* Episode list (anime only) */}
            {hasEpisodeSidebar && (
              <div
                className={`bg-surface border border-border lg:rounded-xl overflow-hidden flex flex-col ${hasEpisodeSidebar && hasChatSidebar ? (mobileTab === 'episodes' ? 'flex lg:flex' : 'hidden lg:flex') : 'flex'}`}
                style={{ maxHeight: hasChatSidebar ? undefined : 'calc(100vh - 160px)', height: hasChatSidebar ? '60vh' : undefined }}
              >
                <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
                  <span className="font-bold text-sm text-primary">Episodes</span>
                  <span className="text-xs text-muted">{animeEpisodes.length} eps</span>
                </div>
                <div ref={episodeListRef} className="overflow-y-auto flex-1">
                  {animeEpisodes.map(ep => (
                    <Link
                      key={ep.id}
                      to={buildEpUrl(ep)}
                      data-ep={ep.number}
                      className={`flex items-center gap-3 px-4 py-3 border-b border-border text-sm transition-colors hover:bg-surface-raised ${ep.number === epNum ? 'bg-accent-teal/10 border-l-4 border-l-accent-teal' : 'border-l-4 border-l-transparent'}`}
                    >
                      <span className={`font-bold w-7 text-right flex-shrink-0 text-xs ${ep.number === epNum ? 'text-accent-teal' : 'text-muted'}`}>{ep.number}</span>
                      <span className={`truncate flex-1 ${ep.number === epNum ? 'text-primary font-semibold' : 'text-secondary'}`}>
                        {ep.title || `Episode ${ep.number}`}
                      </span>
                      {ep.isFiller && <span className="text-xs bg-orange-100 text-orange-600 px-1 py-0.5 rounded flex-shrink-0">F</span>}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Chat (rooms only) */}
            {hasChatSidebar && (
              <div
                className={`bg-surface border border-border lg:rounded-xl overflow-hidden flex-col flex-shrink-0 ${hasEpisodeSidebar && hasChatSidebar ? (mobileTab === 'chat' ? 'flex lg:flex' : 'hidden lg:flex') : 'flex'}`}
                style={{ height: hasEpisodeSidebar ? '60vh' : '70vh' }}
              >
                <ChatPanel roomId={roomId} socket={socketRef.current} user={user} />
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
