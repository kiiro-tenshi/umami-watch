import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export function useSocket(apiBaseUrl, getToken) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    if (!getToken || !apiBaseUrl) return;

    let socket;
    let tokenRefreshTimer;

    getToken().then((token) => {
      if (!token) return;

      socket = io(apiBaseUrl, {
        auth: { token },
        transports: ['websocket', 'polling'], // polling fallback
        reconnection: true,
        reconnectionAttempts: Infinity, // keep trying forever
        reconnectionDelay: 1000, // start at 1s
        reconnectionDelayMax: 10000, // max 10s between attempts
        randomizationFactor: 0.5,
        timeout: 20000, // 20s connection timeout
      });

      socket.on('connect', () => {
        setConnected(true);
        setReconnecting(false);
      });

      socket.on('disconnect', async (reason) => {
        setConnected(false);
        // transport close = server went away (cold start/scale to zero)
        if (reason === 'transport close' || reason === 'transport error') {
          setReconnecting(true);
        }
        // Force-refresh token before Socket.IO auto-retries
        try {
          const freshToken = await getToken(true);
          if (freshToken) socket.auth = { token: freshToken };
        } catch {}
      });

      socket.on('connect_error', async () => {
        setReconnecting(true);
        // Force-refresh token so the next retry uses a fresh one
        try {
          const freshToken = await getToken(true);
          if (freshToken) socket.auth = { token: freshToken };
        } catch {}
      });

      socketRef.current = socket;

      // Proactively refresh the token every 50 min so socket.auth never holds
      // an expired credential when a disconnect/reconnect happens near the 1-hour mark.
      tokenRefreshTimer = setInterval(async () => {
        try {
          const fresh = await getToken(true);
          if (fresh) socket.auth = { token: fresh };
        } catch {}
      }, 50 * 60 * 1000);
    });

    return () => {
      clearInterval(tokenRefreshTimer);
      socket?.disconnect();
    };
  }, [getToken, apiBaseUrl]);

  return { socketRef, connected, reconnecting };
}
