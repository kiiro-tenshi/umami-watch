import { useState, useEffect, useRef } from 'react';
import { auth } from '../firebase';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

const GIPHY_KEY = import.meta.env.VITE_GIPHY_API_KEY;

function formatTime(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ChatPanel({ roomId, socket, user }) {
  const [messages, setMessages]       = useState([]);
  const [input, setInput]             = useState('');
  const [typers, setTypers]           = useState([]);
  const [showEmoji, setShowEmoji]     = useState(false);
  const [showGif, setShowGif]         = useState(false);
  const [gifQuery, setGifQuery]       = useState('');
  const [gifResults, setGifResults]   = useState([]);
  const [loadingGifs, setLoadingGifs] = useState(false);

  const messagesContainerRef = useRef(null);
  const typingTimersRef   = useRef({});
  const typingEmitRef     = useRef(null);
  const inputRef          = useRef(null);
  const emojiRef          = useRef(null);

  // ── Message history ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    auth.currentUser?.getIdToken().then(token =>
      fetch(`${import.meta.env.VITE_API_BASE_URL}/api/rooms/${roomId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      })
    ).then(r => r?.ok ? r.json() : [])
      .then(msgs => setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const fresh = msgs.filter(m => !existingIds.has(m.id));
        return [...fresh, ...prev];
      }))
      .catch(() => {});
  }, [roomId]);

  // ── Live socket events ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const onMsg     = (msg) => setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
    const onJoined  = ({ displayName }) => setMessages(prev => [...prev, { id: `sys-join-${Date.now()}`, system: true, text: `${displayName} joined the room` }]);
    const onLeft    = ({ displayName }) => setMessages(prev => [...prev, { id: `sys-left-${Date.now()}`, system: true, text: `${displayName} left the room` }]);
    const onTyping  = ({ displayName }) => {
      setTypers(prev => prev.includes(displayName) ? prev : [...prev, displayName]);
      clearTimeout(typingTimersRef.current[displayName]);
      typingTimersRef.current[displayName] = setTimeout(() => {
        setTypers(prev => prev.filter(n => n !== displayName));
        delete typingTimersRef.current[displayName];
      }, 3000);
    };
    socket.on('chat:message', onMsg);
    socket.on('user-joined',  onJoined);
    socket.on('user-left',    onLeft);
    socket.on('chat:typing',  onTyping);
    return () => {
      socket.off('chat:message', onMsg);
      socket.off('user-joined',  onJoined);
      socket.off('user-left',    onLeft);
      socket.off('chat:typing',  onTyping);
      Object.values(typingTimersRef.current).forEach(clearTimeout);
    };
  }, [socket]);

  // ── Auto-scroll (scroll the chat container, not the page) ─────────────────
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // ── Close emoji picker on outside click ───────────────────────────────────
  useEffect(() => {
    if (!showEmoji) return;
    const handler = (e) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target)) setShowEmoji(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmoji]);

  // ── GIF search with debounce (Giphy API) ──────────────────────────────────
  useEffect(() => {
    if (!showGif || !GIPHY_KEY) return;
    const endpoint = gifQuery.trim()
      ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(gifQuery)}&limit=16&rating=pg-13`
      : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=16&rating=pg-13`;

    setLoadingGifs(true);
    const timer = setTimeout(() =>
      fetch(endpoint)
        .then(r => r.json())
        .then(d => setGifResults(d.data || []))
        .catch(() => setGifResults([]))
        .finally(() => setLoadingGifs(false))
    , gifQuery.trim() ? 500 : 0);

    return () => clearTimeout(timer);
  }, [gifQuery, showGif]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (!socket || !e.target.value) return;
    if (!typingEmitRef.current) socket.emit('chat:typing');
    clearTimeout(typingEmitRef.current);
    typingEmitRef.current = setTimeout(() => { typingEmitRef.current = null; }, 2000);
  };

  const sendText = (e) => {
    e.preventDefault();
    if (!input.trim() || !socket) return;
    socket.emit('chat:message', { type: 'text', text: input.trim() });
    setInput('');
    clearTimeout(typingEmitRef.current);
    typingEmitRef.current = null;
  };

  const sendGif = (gif) => {
    if (!socket) return;
    // Use fixed_height_small (100px tall) — good balance of quality vs size in chat
    const url = gif.images?.fixed_height_small?.url || gif.images?.downsized?.url;
    if (!url) return;
    socket.emit('chat:message', { type: 'gif', gifUrl: url });
    setShowGif(false);
    setGifQuery('');
  };

  const onEmojiSelect = (emoji) => {
    setInput(prev => prev + emoji.native);
    setShowEmoji(false);
    inputRef.current?.focus();
  };

  const toggleGif = () => {
    setShowGif(v => !v);
    setShowEmoji(false);
    if (!showGif) setGifQuery('');
  };

  const toggleEmoji = () => {
    setShowEmoji(v => !v);
    setShowGif(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Header */}
      <div className="p-4 border-b border-border bg-surface-raised font-bold text-primary flex items-center gap-2 flex-shrink-0">
        <span className="text-xl">💬</span> Live Chat
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 scrollbar-themed overscroll-contain">
        {messages.length === 0 && (
          <p className="text-center text-muted text-sm mt-10">No messages yet. Say hi!</p>
        )}
        {messages.map((m, i) => {
          if (m.system) return (
            <div key={m.id || i} className="text-center text-xs text-muted py-0.5 italic">{m.text}</div>
          );
          const isMe  = m.uid === user?.uid;
          const isGif = m.type === 'gif';
          return (
            <div key={m.id || i} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
              {!isMe && (
                <img
                  src={m.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(m.displayName)}`}
                  className="w-7 h-7 rounded-full border border-border flex-shrink-0 mt-1"
                  alt=""
                />
              )}
              <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[80%]`}>
                {!isMe && (
                  <span className="text-xs text-muted mb-1 font-semibold">{m.displayName}</span>
                )}
                {isGif ? (
                  <img
                    src={m.gifUrl}
                    alt="GIF"
                    className="rounded-xl max-w-[140px] max-h-[100px] object-cover shadow-sm"
                    loading="lazy"
                  />
                ) : (
                  <div className={`px-3 py-2 rounded-2xl text-sm shadow-sm break-words ${
                    isMe
                      ? 'bg-accent-blue text-white rounded-br-none'
                      : 'bg-surface-raised border border-border text-primary rounded-tl-none'
                  }`}>
                    {m.text}
                  </div>
                )}
                {m.createdAt && (
                  <span className="text-[10px] text-muted mt-0.5 px-1 select-none">
                    {formatTime(m.createdAt)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Typing indicator */}
      {typers.length > 0 && (
        <div className="px-4 py-1 text-xs text-muted italic flex-shrink-0">
          {typers.join(', ')} {typers.length === 1 ? 'is' : 'are'} typing...
        </div>
      )}

      {/* GIF picker */}
      {showGif && (
        <div className="flex-shrink-0 border-t border-border bg-surface">
          <div className="p-2">
            <input
              autoFocus
              type="text"
              placeholder="Search GIFs..."
              value={gifQuery}
              onChange={e => setGifQuery(e.target.value)}
              className="w-full bg-page border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent-blue"
            />
          </div>
          <div className="h-44 overflow-y-auto px-2 pb-2">
            {!GIPHY_KEY ? (
              <p className="text-center text-muted text-xs py-6">GIF search not configured.</p>
            ) : loadingGifs ? (
              <p className="text-center text-muted text-xs py-6">Loading...</p>
            ) : gifResults.length > 0 ? (
              <div className="grid grid-cols-4 gap-1">
                {gifResults.map(gif => (
                  <button
                    key={gif.id}
                    type="button"
                    onClick={() => sendGif(gif)}
                    className="rounded overflow-hidden hover:opacity-80 transition-opacity aspect-square"
                  >
                    <img
                      src={gif.images?.fixed_height_small?.url}
                      alt={gif.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted text-xs py-6">
                {gifQuery ? 'No GIFs found.' : 'Trending GIFs unavailable.'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Emoji picker */}
      {showEmoji && (
        <div ref={emojiRef} className="flex-shrink-0 border-t border-border">
          <Picker
            data={data}
            onEmojiSelect={onEmojiSelect}
            theme="auto"
            previewPosition="none"
            skinTonePosition="none"
            maxFrequentRows={2}
            perLine={8}
          />
        </div>
      )}

      {/* Input bar */}
      <form onSubmit={sendText} className="p-3 border-t border-border bg-surface-raised flex items-center gap-2 flex-shrink-0">
        {/* GIF button */}
        <button
          type="button"
          onClick={toggleGif}
          className={`text-xs font-bold px-2 py-1.5 rounded-lg border transition-colors flex-shrink-0 ${
            showGif
              ? 'bg-accent-blue text-white border-accent-blue'
              : 'bg-surface border-border text-muted hover:text-primary'
          }`}
        >
          GIF
        </button>

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={handleInputChange}
          placeholder="Type a message..."
          className="flex-1 bg-surface border border-border rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue min-w-0"
        />

        {/* Emoji button */}
        <button
          type="button"
          onClick={toggleEmoji}
          className={`text-lg leading-none p-1.5 rounded-lg border transition-colors flex-shrink-0 ${
            showEmoji
              ? 'bg-accent-blue/10 border-accent-blue'
              : 'border-transparent hover:bg-surface-raised'
          }`}
        >
          😊
        </button>

        {/* Send button */}
        <button
          type="submit"
          disabled={!input.trim()}
          className="bg-accent-blue text-white rounded-full p-2.5 disabled:opacity-50 transition-transform hover:scale-105 shadow-sm flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
    </div>
  );
}
