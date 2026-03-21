import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { auth } from '../firebase';
import LoadingSpinner from '../components/LoadingSpinner';
import CreateRoomModal from '../components/CreateRoomModal';

export default function RoomsPage({ autoJoin }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');

  const handleDelete = async (e, roomId) => {
    e.stopPropagation();
    if (!confirm('Delete this room? This cannot be undone.')) return;
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/rooms/${roomId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setRooms(prev => prev.filter(r => r.id !== roomId));
    } catch (e) {
      console.error('Failed to delete room', e);
    }
  };

  const fetchRooms = async () => {
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/rooms`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setRooms(await res.json());
      }
    } catch (e) {
      console.error("Failed to fetch rooms", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchRooms();
  }, [user]);

  useEffect(() => {
    if (autoJoin) {
      const code = window.location.pathname.split('/').pop();
      if (code && code.length === 6) {
        setJoinCode(code);
        handleJoin(null, code);
      }
    }
  }, [autoJoin]);

  const handleJoin = async (e, codeOverride) => {
    if (e) e.preventDefault();
    const code = codeOverride || joinCode;
    if (!code || code.length !== 6) return setJoinError('Code must be 6 characters');
    
    setJoinError('');
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/rooms/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ inviteCode: code })
      });
      if (res.ok) {
        const data = await res.json();
        navigate(`/watch?roomId=${data.id}`);
      } else {
         const err = await res.json();
         setJoinError(err.error || 'Failed to join room');
      }
    } catch (err) {
      setJoinError('Network error');
    }
  };

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto flex flex-col md:flex-row gap-8">
      {/* Left Column: Actions */}
      <div className="w-full md:w-80 shrink-0 space-y-6">
        <div className="bg-surface rounded-2xl p-6 shadow-md border border-border">
          <h2 className="text-2xl font-bold text-primary mb-2">Host a Room</h2>
          <p className="text-secondary text-sm mb-6">Create a watch party, invite friends, and watch in perfect sync.</p>
          <button onClick={() => setShowCreate(true)} className="w-full bg-accent-blue hover:bg-red-700 text-white font-bold py-3 rounded-xl shadow-lg transition-transform hover:scale-105 flex items-center justify-center gap-2">
            <span className="text-xl">+</span> Create New Room
          </button>
        </div>

        <div className="bg-surface rounded-2xl p-6 shadow-md border border-border">
          <h2 className="text-xl font-bold text-primary mb-4">Join a Room</h2>
          <form onSubmit={handleJoin}>
             <input type="text" placeholder="6-digit Invite Code" value={joinCode} onChange={e => {setJoinCode(e.target.value.toUpperCase()); setJoinError('');}} maxLength={6}
               className="w-full bg-page border border-border font-mono text-center text-xl font-bold tracking-widest text-primary p-3 rounded-xl mb-4 focus:outline-none focus:ring-2 focus:ring-accent-teal shadow-sm" />
             {joinError && <p className="text-red-500 text-sm font-bold mb-3 bg-red-50 p-2 rounded text-center border border-red-200">{joinError}</p>}
             <button type="submit" disabled={joinCode.length !== 6} className="w-full bg-surface-raised border border-border hover:bg-page text-primary font-bold py-3 rounded-xl disabled:opacity-50 transition-colors shadow-sm">
               Join Room
             </button>
          </form>
        </div>
      </div>

      {/* Right Column: Active Rooms */}
      <div className="flex-1">
        <h1 className="text-3xl font-bold text-primary mb-6 flex items-center gap-3">
          Your Watch Parties
          <span className="bg-accent-teal text-white text-sm px-2 py-0.5 rounded-full font-bold">{rooms.length}</span>
        </h1>
        
        {rooms.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-dashed border-border p-12 text-center shadow-sm">
            <div className="text-5xl text-border mb-4">🍿</div>
            <h3 className="text-xl font-bold text-primary mb-2">No active rooms</h3>
            <p className="text-secondary max-w-sm mx-auto">You aren't a member of any watch parties. Create or join one to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {rooms.map(room => (
              <div onClick={() => navigate(`/watch?roomId=${room.id}`)} key={room.id} className="bg-surface border border-border rounded-xl p-5 shadow-sm hover:shadow-md cursor-pointer transition-all hover:scale-[1.02] group">
                 <div className="flex justify-between items-start mb-4">
                   <h3 className="font-bold text-primary text-xl line-clamp-1 group-hover:text-accent-blue transition-colors">{room.name}</h3>
                   <div className="flex items-center gap-2">
                     <span className="text-xs font-mono bg-page border border-border text-muted px-2 py-1 rounded shadow-sm">{room.inviteCode}</span>
                     {room.ownerId === user?.uid && (
                       <button
                         onClick={(e) => handleDelete(e, room.id)}
                         className="text-muted hover:text-red-500 transition-colors p-1 rounded"
                         title="Delete room"
                       >
                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                       </button>
                     )}
                   </div>
                 </div>
                 
                 {room.contentTitle ? (
                   <div className="bg-surface-raised border border-border rounded-lg p-3 mb-4">
                     <p className="text-xs text-muted font-bold uppercase mb-1">Now Watching</p>
                     <p className="font-semibold text-primary line-clamp-1 text-sm">{room.contentTitle}</p>
                   </div>
                 ) : (
                   <div className="bg-page border border-dashed border-border rounded-lg p-3 mb-4 flex items-center justify-center">
                     <p className="text-sm font-medium text-muted italic text-center">No content selected</p>
                   </div>
                 )}
                 
                 <div className="flex items-center justify-between mt-auto">
                    <div className="flex -space-x-2">
                      {room.members.slice(0, 3).map((m, i) => (
                        <div key={i} className="w-8 h-8 rounded-full bg-border border-2 border-surface flex items-center justify-center text-xs font-bold text-white shadow-sm pt-0.5">U</div>
                      ))}
                      {room.members.length > 3 && <div className="w-8 h-8 rounded-full bg-surface-raised border-2 border-surface flex items-center justify-center text-xs font-bold text-primary shadow-sm">+{room.members.length - 3}</div>}
                    </div>
                    <span className="text-sm font-bold text-accent-blue bg-red-50 px-3 py-1 rounded-lg border border-red-100 group-hover:bg-accent-blue group-hover:text-white transition-colors">Enter Room →</span>
                 </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && <CreateRoomModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
