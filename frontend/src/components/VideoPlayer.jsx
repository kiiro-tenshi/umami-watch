import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Plyr from 'plyr';
import Hls from 'hls.js';
import 'plyr/dist/plyr.css';

const TEXT_COLORS = [
  { label: 'White',  value: '#ffffff' },
  { label: 'Yellow', value: '#facc15' },
  { label: 'Cyan',   value: '#22d3ee' },
  { label: 'Green',  value: '#4ade80' },
];

const DEFAULT_CC = { enabled: false, activeLang: '', size: 100, bgOpacity: 75, color: '#ffffff', bold: false };

function parseCueText(text) {
  return (text || '')
    .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, '')
    .replace(/<c[.\w]*>(.*?)<\/c>/gs, '$1')
    .replace(/<v[^>]*>/g, '').replace(/<\/v>/g, '')
    .replace(/<ruby>/g, '').replace(/<\/ruby>/g, '')
    .replace(/<rt>.*?<\/rt>/gs, '');
}

export default function VideoPlayer({ options, tracks = [], onReady, onError, token, loadingMessage }) {
  const videoRef    = useRef(null);
  const playerRef   = useRef(null);
  const hlsRef      = useRef(null);
  const cueTrackRef = useRef(null);

  const [isLoading,     setIsLoading]     = useState(true);
  const [playerError,   setPlayerError]   = useState(null);
  const [ccOpen,        setCcOpen]        = useState(false);
  const [cc,            setCC]            = useState(DEFAULT_CC);
  const [cueText,       setCueText]       = useState('');
  const [plyrContainer, setPlyrContainer] = useState(null); // .plyr element — portal target for subtitle overlay
  const [ccMountEl,     setCcMountEl]     = useState(null); // mount point inside Plyr controls bar

  const updateCC = (patch) => setCC(prev => ({ ...prev, ...patch }));

  // Extract primitive values from options so effects only re-run when the actual
  // URL or mode changes — not when WatchPage creates a new sources array reference
  const src      = options.sources?.[0]?.src ?? '';
  const isM3u8   = options.sources?.[0]?.type === 'application/x-mpegURL';
  const isViewer = options.isViewer === true;

  // CC track: hide all native rendering, listen to cuechange for custom overlay
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (cueTrackRef.current) {
      cueTrackRef.current.track.removeEventListener('cuechange', cueTrackRef.current.handler);
      cueTrackRef.current = null;
    }
    setCueText('');
    Array.from(video.textTracks).forEach(t => { t.mode = 'hidden'; });

    if (!cc.enabled || !cc.activeLang) return;

    const setup = () => {
      const track = Array.from(video.textTracks).find(t => t.label === cc.activeLang);
      if (!track) return;
      track.mode = 'hidden';
      const handler = () => {
        const cue = track.activeCues?.[0];
        setCueText(cue ? parseCueText(cue.text) : '');
      };
      track.addEventListener('cuechange', handler);
      cueTrackRef.current = { track, handler };
    };

    if (video.textTracks.length > 0) {
      setup();
    } else {
      video.addEventListener('loadeddata', setup, { once: true });
      return () => video.removeEventListener('loadeddata', setup);
    }
  }, [cc.enabled, cc.activeLang, src]);

  // Main player setup
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const defaultControls = ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'settings', 'pip', 'airplay', 'fullscreen'];
    const viewerControls  = ['mute', 'volume', 'fullscreen'];
    const controls = isViewer ? viewerControls : defaultControls;

    if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null; }
    if (hlsRef.current)    { hlsRef.current.destroy();    hlsRef.current    = null; }

    setIsLoading(true);
    setPlayerError(null);
    setCC(DEFAULT_CC);
    setCueText('');
    setPlyrContainer(null);
    setCcMountEl(null);

    if (!src) { setIsLoading(false); return; }

    const plyrOpts = {
      controls,
      autoplay: options.autoplay || false,
      captions: { active: false },
      settings: isViewer ? [] : ['quality', 'speed', 'loop'],
      clickToPlay: !isViewer,
      keyboard: { focused: false, global: false },
    };

    // After Plyr is created: store container + insert CC mount point in controls bar
    const initPlayer = (player) => {
      playerRef.current = player;
      setPlyrContainer(player.elements.container);

      // Insert a mount div just before the fullscreen button in Plyr's controls
      const controlsBar = player.elements.controls;
      if (controlsBar) {
        const mount = document.createElement('div');
        mount.style.cssText = 'position:relative;display:flex;align-items:center;';
        const fsBtn = controlsBar.querySelector('[data-plyr="fullscreen"]');
        if (fsBtn) controlsBar.insertBefore(mount, fsBtn);
        else controlsBar.appendChild(mount);
        setCcMountEl(mount);
      }
    };

    let cleanedUp = false;

    if (isM3u8 && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        autoStartLoad: true,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 30 * 1000 * 1000,
        backBufferLength: 30,
        startLevel: -1,
        abrEwmaDefaultEstimate: 1_000_000,
        fragLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 10_000,
            maxLoadTimeMs: 60_000,
            timeoutRetry: { maxNumRetry: 3, retryDelayMs: 1000, maxRetryDelayMs: 8000 },
            errorRetry:   { maxNumRetry: 4, retryDelayMs: 1000, maxRetryDelayMs: 8000 },
          },
        },
        manifestLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 10_000,
            maxLoadTimeMs: 20_000,
            timeoutRetry: { maxNumRetry: 3, retryDelayMs: 1000, maxRetryDelayMs: 4000 },
            errorRetry:   { maxNumRetry: 3, retryDelayMs: 1000, maxRetryDelayMs: 4000 },
          },
        },
      });
      hlsRef.current = hls;

      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          setPlayerError(`Stream error: ${data.type}`);
          setIsLoading(false);
          if (onError) onError(data);
        }
      });

      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (cleanedUp) return;
        const levels = [...hls.levels.map(l => l.height).filter(Boolean)].reverse();
        const qualityOptions = levels.length > 0 ? {
          default: levels[0], options: levels, forced: true,
          onChange: (q) => { hls.levels.forEach((l, i) => { if (l.height === q) hls.currentLevel = i; }); }
        } : undefined;
        const player = new Plyr(video, {
          ...plyrOpts,
          ...(qualityOptions && { quality: qualityOptions }),
        });
        initPlayer(player);
        setIsLoading(false);
        if (onReady) onReady(player);
      });

    } else {
      // Set src and force metadata load BEFORE creating Plyr.
      // Plyr's init resets video.preload to "none" and calls cancelRequests(),
      // which clears video.src. Setting src first and waiting for loadedmetadata
      // ensures the browser has committed to the resource before Plyr can interfere.
      video.preload = 'metadata';
      video.src = src;

      let settled = false;
      const settle = (errMsg, player) => {
        if (settled || cleanedUp) return;
        settled = true;
        setIsLoading(false);
        if (errMsg) { setPlayerError(errMsg); if (onError) onError(new Error(errMsg)); }
        else if (onReady) { try { onReady(player); } catch(e) { console.error('[VideoPlayer] onReady threw:', e); } }
      };

      const timeout = setTimeout(
        () => settle('Stream timed out — source may be unavailable. Try another source.', null),
        60_000
      );

      video.addEventListener('loadedmetadata', () => {
        clearTimeout(timeout);
        if (cleanedUp) return;
        // Only now create Plyr — the browser already has the resource committed,
        // so Plyr's cancelRequests() won't interfere.
        const player = new Plyr(video, plyrOpts);
        initPlayer(player);
        settle(null, player);
      }, { once: true });

      video.addEventListener('error', () => {
        clearTimeout(timeout);
        settle('Failed to load video source.', null);
      }, { once: true });
    }

    return () => {
      cleanedUp = true;
      if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null; }
      if (hlsRef.current)    { hlsRef.current.destroy();    hlsRef.current    = null; }
      setPlyrContainer(null);
      setCcMountEl(null);
    };
  }, [src, isM3u8, isViewer, options.autoplay, token]);

  // Global keyboard shortcuts — skip when user is typing in any input/textarea
  useEffect(() => {
    const onKey = (e) => {
      const player = playerRef.current;
      if (!player) return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) return;

      switch (e.key) {
        case ' ':
          if (!isViewer) { e.preventDefault(); player.togglePlay(); }
          break;
        case 'ArrowLeft':
          if (!isViewer) { e.preventDefault(); player.currentTime = Math.max(0, player.currentTime - 5); }
          break;
        case 'ArrowRight':
          if (!isViewer) { e.preventDefault(); player.currentTime = Math.min(player.duration || Infinity, player.currentTime + 5); }
          break;
        case 'ArrowUp':
          e.preventDefault();
          player.volume = Math.min(1, Math.round((player.volume + 0.1) * 10) / 10);
          break;
        case 'ArrowDown':
          e.preventDefault();
          player.volume = Math.max(0, Math.round((player.volume - 0.1) * 10) / 10);
          break;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isViewer]);

  const hasTracks = tracks.length > 0;

  return (
    <div className="w-full h-full relative bg-black">
      <video ref={videoRef} playsInline crossOrigin="anonymous" className="w-full h-full">
        {tracks.map((t, i) => (
          <track key={i} kind={t.kind} label={t.label} srcLang={t.srclang} src={t.src} />
        ))}
      </video>

      {/* Subtitle overlay — portaled into .plyr so it stays visible in fullscreen */}
      {cueText && cc.enabled && plyrContainer && createPortal(
        <div className="absolute bottom-16 left-0 right-0 flex justify-center px-8 z-[100] pointer-events-none">
          <span
            dangerouslySetInnerHTML={{ __html: cueText }}
            style={{
              fontSize: `${cc.size / 100 * 1.3}em`,
              backgroundColor: `rgba(0,0,0,${cc.bgOpacity / 100})`,
              color: cc.color,
              fontWeight: cc.bold ? '700' : '400',
              padding: '3px 10px',
              borderRadius: '4px',
              textAlign: 'center',
              lineHeight: 1.6,
              whiteSpace: 'pre-line',
              display: 'inline-block',
              maxWidth: '80%',
            }}
          />,
        </div>,
        plyrContainer
      )}

      {/* CC button — portaled into Plyr's controls bar, sits beside fullscreen */}
      {hasTracks && !isLoading && !playerError && ccMountEl && createPortal(
        <>
          <button
            onClick={() => setCcOpen(o => !o)}
            title="Subtitle settings"
            className="plyr__control"
            style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.05em', minWidth: 36, color: cc.enabled ? 'var(--plyr-color-main, #00b2ff)' : undefined }}
          >
            CC
          </button>

          {ccOpen && (
            <div
              className="absolute bottom-full right-0 mb-2 w-64 rounded-xl p-4 flex flex-col gap-4 shadow-2xl"
              style={{ background: 'rgba(0,0,0,0.92)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', zIndex: 200 }}
            >
              <div>
                <p className="text-[10px] text-white/40 uppercase tracking-widest mb-2 font-semibold">Language</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => updateCC({ enabled: false })}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors
                      ${!cc.enabled ? 'bg-[#f43f5e] text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}
                  >Off</button>
                  {tracks.map(t => (
                    <button key={t.label}
                      onClick={() => updateCC({ enabled: true, activeLang: t.label })}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors
                        ${cc.enabled && cc.activeLang === t.label ? 'bg-[#f43f5e] text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}
                    >{t.label}</button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <p className="text-[10px] text-white/40 uppercase tracking-widest font-semibold">Size</p>
                  <span className="text-xs text-white/60 font-mono">{cc.size}%</span>
                </div>
                <input type="range" min="50" max="200" step="10" value={cc.size}
                  onChange={e => updateCC({ size: Number(e.target.value) })}
                  className="w-full accent-[#f43f5e] cursor-pointer h-1.5 rounded-full" />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <p className="text-[10px] text-white/40 uppercase tracking-widest font-semibold">Background</p>
                  <span className="text-xs text-white/60 font-mono">{cc.bgOpacity}%</span>
                </div>
                <input type="range" min="0" max="100" step="5" value={cc.bgOpacity}
                  onChange={e => updateCC({ bgOpacity: Number(e.target.value) })}
                  className="w-full accent-[#f43f5e] cursor-pointer h-1.5 rounded-full" />
              </div>

              <div>
                <p className="text-[10px] text-white/40 uppercase tracking-widest mb-2 font-semibold">Color</p>
                <div className="flex gap-2">
                  {TEXT_COLORS.map(c => (
                    <button key={c.value} title={c.label}
                      onClick={() => updateCC({ color: c.value })}
                      style={{ background: c.value }}
                      className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110
                        ${cc.color === c.value ? 'border-[#f43f5e] scale-110' : 'border-transparent'}`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-[10px] text-white/40 uppercase tracking-widest font-semibold">Bold</p>
                <button
                  onClick={() => updateCC({ bold: !cc.bold })}
                  className={`w-10 h-5 rounded-full transition-colors relative ${cc.bold ? 'bg-[#f43f5e]' : 'bg-white/20'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${cc.bold ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>
            </div>
          )}
        </>,
        ccMountEl
      )}

      {/* Loading overlay */}
      {isLoading && !playerError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
          <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin mb-3" />
          <p className="text-white/60 text-sm font-medium">{loadingMessage || 'Loading stream...'}</p>
        </div>
      )}

      {/* Error overlay */}
      {playerError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-10 gap-3 p-6 text-center">
          <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-red-400 font-semibold">{playerError}</p>
          <button
            onClick={() => { setPlayerError(null); setIsLoading(true); videoRef.current?.load(); }}
            className="text-sm bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg transition-colors"
          >Retry</button>
        </div>
      )}
    </div>
  );
}
