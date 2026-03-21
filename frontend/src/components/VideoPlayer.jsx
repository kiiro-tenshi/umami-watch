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

// Strip VTT-specific tags but keep basic HTML formatting
function parseCueText(text) {
  return (text || '')
    .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, '')
    .replace(/<c[.\w]*>(.*?)<\/c>/gs, '$1')
    .replace(/<v[^>]*>/g, '').replace(/<\/v>/g, '')
    .replace(/<ruby>/g, '').replace(/<\/ruby>/g, '')
    .replace(/<rt>.*?<\/rt>/gs, '');
}

export default function VideoPlayer({ options, tracks = [], onReady, onError, token }) {
  const videoRef  = useRef(null);
  const playerRef = useRef(null);
  const hlsRef    = useRef(null);
  const cueTrackRef = useRef(null);

  const [isLoading,   setIsLoading]   = useState(true);
  const [playerError, setPlayerError] = useState(null);
  const [ccOpen,      setCcOpen]      = useState(false);
  const [cc,          setCC]          = useState(DEFAULT_CC);
  const [cueText,     setCueText]     = useState('');

  const updateCC = (patch) => setCC(prev => ({ ...prev, ...patch }));

  // Apply active track and set up cue listener for custom rendering
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Tear down previous track listener
    if (cueTrackRef.current) {
      cueTrackRef.current.track.removeEventListener('cuechange', cueTrackRef.current.handler);
      cueTrackRef.current = null;
    }
    setCueText('');

    // Hide all tracks (suppress native rendering)
    Array.from(video.textTracks).forEach(t => { t.mode = 'hidden'; });

    if (!cc.enabled || !cc.activeLang) return;

    const setup = () => {
      const track = Array.from(video.textTracks).find(t => t.label === cc.activeLang);
      if (!track) return;
      // 'hidden' mode: no native rendering, but cuechange still fires and activeCues is populated
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
  }, [cc.enabled, cc.activeLang, options.sources]);

  // Main player setup
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const src     = options.sources?.[0]?.src;
    const srcType = options.sources?.[0]?.type;
    const isM3u8  = srcType === 'application/x-mpegURL';

    const defaultControls = ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'settings', 'pip', 'airplay', 'fullscreen'];
    const viewerControls  = ['mute', 'volume', 'fullscreen'];
    const isViewer = options.isViewer === true;
    const controls = isViewer ? viewerControls : defaultControls;

    if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null; }
    if (hlsRef.current)    { hlsRef.current.destroy();    hlsRef.current    = null; }

    setIsLoading(true);
    setPlayerError(null);
    setCC(DEFAULT_CC);
    setCueText('');

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
          settings: isViewer ? [] : ['quality', 'speed', 'loop'],
          clickToPlay: !isViewer,
          keyboard: { focused: !isViewer, global: false },
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
        settings: isViewer ? [] : ['quality', 'speed', 'loop'],
        clickToPlay: !isViewer,
        keyboard: { focused: !isViewer, global: false },
      });
      playerRef.current = player;
      video.addEventListener('loadedmetadata', () => { setIsLoading(false); if (onReady) onReady(player); }, { once: true });
      video.addEventListener('error', (e) => { setPlayerError('Failed to load video source.'); setIsLoading(false); if (onError) onError(e); }, { once: true });
    }

    return () => {
      if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null; }
      if (hlsRef.current)    { hlsRef.current.destroy();    hlsRef.current    = null; }
    };
  }, [options.sources, options.isViewer, options.autoplay, token]);

  const hasTracks = tracks.length > 0;

  return (
    <div className="w-full h-full relative group bg-black">
      <video ref={videoRef} playsInline crossOrigin="anonymous" className="w-full h-full">
        {tracks.map((t, i) => (
          <track key={i} kind={t.kind} label={t.label} srcLang={t.srclang} src={t.src} />
        ))}
      </video>

      {/* Custom subtitle overlay */}
      {cueText && cc.enabled && (
        <div className="absolute bottom-20 left-0 right-0 flex justify-center px-8 z-10 pointer-events-none">
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
          />
        </div>
      )}

      {/* CC panel */}
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
