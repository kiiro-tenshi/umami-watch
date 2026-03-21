import { useState, useEffect, useRef } from 'react';
import { auth } from '../firebase';

export default function ChatPanel({ roomId, socket, user }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  // Load message history via server API (no Firestore client rules needed)
  useEffect(() => {
    if (!roomId) return;
    auth.currentUser?.getIdToken().then(token =>
      fetch(`${import.meta.env.VITE_API_BASE_URL}/api/rooms/${roomId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      })
    ).then(r => r?.ok ? r.json() : [])
      .then(msgs => setMessages(msgs))
      .catch(() => {});
  }, [roomId]);

  // Live messages via socket
  useEffect(() => {
    if (!socket) return;
    const handleMsg = (msg) => {
      setMessages(prev => {
        if (prev.find(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };
    socket.on('chat:message', handleMsg);
    return () => socket.off('chat:message', handleMsg);
  }, [socket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!input.trim() || !socket) return;
    socket.emit('chat:message', input.trim());
    setInput('');
  };

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="p-4 border-b border-border bg-surface-raised font-bold text-primary flex items-center gap-2 flex-shrink-0">
        <span className="text-xl">💬</span> Live Chat
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && <p className="text-center text-muted text-sm mt-10">No messages yet. Say hi!</p>}
        {messages.map((m, i) => {
          const isMe = m.uid === user?.uid;
          return (
            <div key={m.id || i} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
              {!isMe && (
                <img
                  src={m.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${m.displayName}`}
                  className="w-8 h-8 rounded-full border border-border flex-shrink-0"
                  alt=""
                />
              )}
              <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[80%]`}>
                {!isMe && <span className="text-xs text-muted mb-1 font-semibold">{m.displayName}</span>}
                <div className={`p-2.5 rounded-2xl text-sm shadow-sm ${isMe ? 'bg-accent-blue text-white rounded-br-none' : 'bg-surface-raised border border-border text-primary rounded-tl-none'}`}>
                  {m.text}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={sendMessage} className="p-3 border-t border-border bg-surface-raised flex gap-2 flex-shrink-0">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-surface border border-border rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue"
        />
        <button type="submit" disabled={!input.trim()} className="bg-accent-blue text-white rounded-full p-2 disabled:opacity-50 transition-transform hover:scale-105 shadow-sm">
          <svg className="w-5 h-5 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
    </div>
  );
}
