import { useEffect, useRef, useState } from 'react';

export function useTorrent(magnetUri, videoRef) {
  const [torrentState, setTorrentState] = useState({
    ready: false,
    progress: 0,
    peers: 0,
    downloadSpeed: 0,
    fileName: '',
    error: null,
  });
  const clientRef = useRef(null);

  useEffect(() => {
    if (!magnetUri) return;

    let cancelled = false;
    let intervalId = null;

    const init = async () => {
      try {
        const { default: WebTorrent } = await import('webtorrent');
        if (cancelled) return;

        const client = new WebTorrent();
        clientRef.current = client;

        client.add(magnetUri, (torrent) => {
          if (cancelled) return;

          // Pick largest file (the video)
          const file = torrent.files.reduce((a, b) => a.length > b.length ? a : b);

          setTorrentState(s => ({ ...s, fileName: file.name }));

          // Stream directly into the video element via MSE
          if (videoRef?.current) {
            file.renderTo(videoRef.current);
          }

          setTorrentState(s => ({ ...s, ready: true }));

          intervalId = setInterval(() => {
            if (cancelled) return;
            setTorrentState(s => ({
              ...s,
              progress: Math.round(torrent.progress * 100),
              peers: torrent.numPeers,
              downloadSpeed: torrent.downloadSpeed,
            }));
          }, 1000);
        });

        client.on('error', (err) => {
          if (!cancelled) setTorrentState(s => ({ ...s, error: err.message }));
        });

      } catch (err) {
        if (!cancelled) setTorrentState(s => ({ ...s, error: err.message }));
      }
    };

    init();

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      clientRef.current?.destroy();
      clientRef.current = null;
    };
  }, [magnetUri]);

  return torrentState;
}
