import { useEffect, useRef, useState } from 'react';
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

export default function VideoPlayer({ options, tracks = [], onReady, onError, token }) {
  const videoRef   = useRef(null);
  const playerRef  = useRef(null);
  const hlsRef     = useRef(null);
  const styleRef   = useRef(null);

  const [isLoading,   setIsLoading]   = useState(true);
  const [playerError, setPlayerError] = useState(null);
  const [ccOpen,      setCcOpen]      = useState(false);
  const [cc,          setCC]          = useState(DEFAULT_CC);

  const updateCC = (patch) => setCC(prev => ({ ...prev, ...patch }));

  // Inject ::cue styles whenever cc settings change
  useEffect(() => {
    if (!styleRef.current) {
      styleRef.current = document.createElement('style');
      styleRef.current.id = 'umami-cue-style';
      document.head.appendChild(styleRef.current);
    }
    styleRef.current.textContent = `::cue {
      font-size: ${cc.size / 100}em;
      background-color: rgba(0,0,0,${cc.bgOpacity / 100});
      color: ${cc.color};
      font-weight: ${cc.bold ? '700' : '400'};
    }`;
  }, [cc.size, cc.bgOpacity, cc.color, cc.bold]);

  useEffect(() => () => { styleRef.current?.remove(); styleRef.current = null; }, []);

  // Apply active track based on cc state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    Array.from(video.textTracks).forEach(t => {
      t.mode = (cc.enabled && t.label === cc.activeLang) ? 'showing' : 'hidden';
    });
  }, [cc.enabled, cc.activeLang]);

  // Main player setup
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const src     = options.sources?.[0]?.src;
    const srcType = options.sources?.[0]?.type;
    const isM3u8  = srcType === 'application/x-mpegURL';

    // We manage captions ourselves — exclude from Plyr controls
    const defaultControls = ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'settings', 'pip', 'airplay', 'fullscreen'];
    const viewerControls  = ['fullscreen', 'volume', 'mute'];
    const isViewer = options.controlBar?.playToggle === false;
    const controls = isViewer ? viewerControls : defaultControls;

    if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null; }
    if (hlsRef.current)    { hlsRef.current.destroy();    hlsRef.current    = null; }

    setIsLoading(true);
    setPlayerError(null);
    setCC(DEFAULT_CC);

    if (!src) { setIsLoading(false); return; }

    if (isM3u8 && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        autoStartLoad: true,
        xhrSetup: (xhr) => { if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`); },
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
        const levels = [...hls.levels.map(l => l.height).filter(Boolean)].reverse();
        const qualityOptions = levels.length > 0 ? {
          default: levels[0], options: levels, forced: true,
          onChange: (q) => { hls.levels.forEach((l, i) => { if (l.height === q) hls.currentLevel = i; }); }
        } : undefined;

        const player = new Plyr(video, {
          controls,
          autoplay: options.autoplay || false,
          captions: { active: false },
          settings: ['quality', 'speed', 'loop'],
          ...(qualityOptions && { quality: qualityOptions }),
        });
        playerRef.current = player;
        setIsLoading(false);
        if (onReady) onReady(player);
      });

    } else {
      video.src = src;
      const player = new Plyr(video, {
        controls,
        autoplay: options.autoplay || false,
        captions: { active: false },
        settings: ['quality', 'speed', 'loop'],
      });
      playerRef.current = player;
      video.addEventListener('loadedmetadata', () => { setIsLoading(false); if (onReady) onReady(player); }, { once: true });
      video.addEventListener('error', (e) => { setPlayerError('Failed to load video source.'); setIsLoading(false); if (onError) onError(e); }, { once: true });
    }

    return () => {
      if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null; }
      if (hlsRef.current)    { hlsRef.current.destroy();    hlsRef.current    = null; }
    };
  }, [options.sources, options.controlBar, options.autoplay, token]);

  const hasTracks = tracks.length > 0;

  return (
    <div className="w-full h-full relative group bg-black">
      <video ref={videoRef} playsInline className="w-full h-full">
        {tracks.map((t, i) => (
          <track key={i} kind={t.kind} label={t.label} srcLang={t.srclang} src={t.src} />
        ))}
      </video>

      {/* CC panel — visible on hover when tracks exist */}
      {hasTracks && !isLoading && !playerError && (
        <div className="absolute top-3 right-3 z-20">
          <button
            onClick={() => setCcOpen(o => !o)}
            title="Subtitle settings"
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200
              ${ccOpen ? 'bg-[#f43f5e] text-white opacity-100' : 'bg-black/60 text-white/80 hover:bg-black/80 opacity-0 group-hover:opacity-100'}`}
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2 6a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm4 4h3v2H6v-2zm5 0h6v2h-6v-2zm-5 4h6v2H6v-2zm8 0h3v2h-3v-2z"/>
            </svg>
            CC
          </button>

          {ccOpen && (
            <div className="absolute top-9 right-0 w-64 bg-black/92 border border-white/10 rounded-xl p-4 flex flex-col gap-4 shadow-2xl backdrop-blur-sm">

              {/* Language */}
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

              {/* Font size */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <p className="text-[10px] text-white/40 uppercase tracking-widest font-semibold">Size</p>
                  <span className="text-xs text-white/60 font-mono">{cc.size}%</span>
                </div>
                <input type="range" min="50" max="200" step="10" value={cc.size}
                  onChange={e => updateCC({ size: Number(e.target.value) })}
                  className="w-full accent-[#f43f5e] cursor-pointer h-1.5 rounded-full" />
              </div>

              {/* Background opacity */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <p className="text-[10px] text-white/40 uppercase tracking-widest font-semibold">Background</p>
                  <span className="text-xs text-white/60 font-mono">{cc.bgOpacity}%</span>
                </div>
                <input type="range" min="0" max="100" step="5" value={cc.bgOpacity}
                  onChange={e => updateCC({ bgOpacity: Number(e.target.value) })}
                  className="w-full accent-[#f43f5e] cursor-pointer h-1.5 rounded-full" />
              </div>

              {/* Text color */}
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

              {/* Bold toggle */}
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
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && !playerError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
          <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin mb-3" />
          <p className="text-white/60 text-sm font-medium">Loading stream...</p>
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
