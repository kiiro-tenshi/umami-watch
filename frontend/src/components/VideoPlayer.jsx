import { useEffect, useRef, useState } from 'react';
import Plyr from 'plyr';
import Hls from 'hls.js';
import 'plyr/dist/plyr.css';

export default function VideoPlayer({ options, tracks = [], onReady, onError }) {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const hlsRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [playerError, setPlayerError] = useState(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const src = options.sources?.[0]?.src;
    const srcType = options.sources?.[0]?.type;
    const isM3u8 = srcType === 'application/x-mpegURL';

    const defaultControls = ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'];
    const viewerControls = ['fullscreen', 'volume', 'mute'];
    const isViewer = options.controlBar?.playToggle === false;
    const controls = isViewer ? viewerControls : defaultControls;

    // Clean up previous instances when src changes
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setIsLoading(true);
    setPlayerError(null);

    if (!src) {
      setIsLoading(false);
      return;
    }

    if (isM3u8 && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, autoStartLoad: true });
      hlsRef.current = hls;

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          const msg = `Stream error: ${data.type}`;
          setPlayerError(msg);
          setIsLoading(false);
          if (onError) onError(data);
        }
      });

      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // Build quality levels from HLS manifest for Plyr settings
        const levels = [...hls.levels.map(l => l.height).filter(Boolean)].reverse();
        const qualityOptions = levels.length > 0 ? {
          default: levels[0],
          options: levels,
          forced: true,
          onChange: (newQuality) => {
            hls.levels.forEach((level, idx) => {
              if (level.height === newQuality) hls.currentLevel = idx;
            });
          }
        } : undefined;

        const plyrOptions = {
          controls,
          autoplay: options.autoplay || false,
          captions: { active: true, update: true, language: 'en' },
          settings: ['captions', 'quality', 'speed', 'loop'],
          ...(qualityOptions && { quality: qualityOptions })
        };

        const player = new Plyr(video, plyrOptions);
        playerRef.current = player;
        setIsLoading(false);
        if (onReady) onReady(player);
      });

    } else {
      // Native playback (Safari HLS or direct MP4)
      const plyrOptions = {
        controls,
        autoplay: options.autoplay || false,
        captions: { active: true, update: true, language: 'en' },
        settings: ['captions', 'quality', 'speed', 'loop']
      };

      video.src = src;
      const player = new Plyr(video, plyrOptions);
      playerRef.current = player;

      video.addEventListener('loadedmetadata', () => {
        setIsLoading(false);
        if (onReady) onReady(player);
      }, { once: true });

      video.addEventListener('error', (e) => {
        const msg = 'Failed to load video source.';
        setPlayerError(msg);
        setIsLoading(false);
        if (onError) onError(e);
      }, { once: true });
    }

    return () => {
      if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null; }
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    };
  }, [options.sources, options.controlBar, options.autoplay]);

  return (
    <div className="w-full h-full relative group bg-black">
      <video ref={videoRef} playsInline className="w-full h-full">
        {tracks.map((t, i) => (
          <track key={i} kind={t.kind} label={t.label} srcLang={t.srclang} src={t.src} />
        ))}
      </video>

      {/* Loading Overlay */}
      {isLoading && !playerError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
          <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin mb-3"></div>
          <p className="text-white/60 text-sm font-medium">Loading stream...</p>
        </div>
      )}

      {/* Error Overlay */}
      {playerError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-10 gap-3 p-6 text-center">
          <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-red-400 font-semibold">{playerError}</p>
          <button
            onClick={() => { setPlayerError(null); setIsLoading(true); if (videoRef.current) videoRef.current.load(); }}
            className="text-sm bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
