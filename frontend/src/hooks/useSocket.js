import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export function useSocket(apiBaseUrl, token) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    if (!token || !apiBaseUrl) return;

    const socket = io(apiBaseUrl, {
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

    socket.on('disconnect', (reason) => {
      setConnected(false);
      // transport close = server went away (cold start/scale to zero)
      if (reason === 'transport close' || reason === 'transport error') {
        setReconnecting(true);
      }
    });

    socket.on('connect_error', () => {
      setReconnecting(true);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [token, apiBaseUrl]);

  return { socketRef, connected, reconnecting };
}
