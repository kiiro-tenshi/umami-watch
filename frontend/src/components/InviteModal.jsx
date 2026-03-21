export default function InviteModal({ inviteCode, onClose }) {
  const url = `${window.location.origin}/join/${inviteCode}`;
  
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-surface-raised p-4 border-b border-border flex justify-between items-center">
          <h3 className="font-bold text-primary text-lg">Invite Friends</h3>
          <button onClick={onClose} className="text-muted hover:text-primary transition-colors text-2xl leading-none">&times;</button>
        </div>
        
        <div className="p-6 flex flex-col items-center">
          <p className="text-secondary text-sm text-center mb-6">Share this code or link with your friends to watch together.</p>
          
          <div className="w-full bg-page border-2 border-dashed border-border rounded-xl p-4 flex flex-col items-center justify-center mb-6">
            <span className="text-xs font-bold text-muted uppercase tracking-widest mb-1">Room Code</span>
            <span className="text-4xl font-mono font-bold text-accent-blue tracking-wider">{inviteCode}</span>
          </div>
          
          <div className="w-full flex gap-3">
            <button 
              onClick={() => { navigator.clipboard.writeText(inviteCode); alert('Code copied!'); }}
              className="flex-1 bg-surface hover:bg-surface-raised text-primary font-bold py-2.5 rounded-lg border border-border shadow-sm transition-colors">
              Copy Code
            </button>
            <button 
              onClick={() => { navigator.clipboard.writeText(url); alert('Link copied!'); }}
              className="flex-1 bg-accent-blue hover:bg-red-700 text-white font-bold py-2.5 rounded-lg shadow-sm transition-colors">
              Copy Link
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
