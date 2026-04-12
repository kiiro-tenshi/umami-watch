import { useState } from 'react';

export default function InviteModal({ inviteCode, onClose }) {
  const url = `${window.location.origin}/join/${inviteCode}`;
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const copyWithFeedback = (text, setter) => {
    navigator.clipboard.writeText(text).then(() => {
      setter(true);
      setTimeout(() => setter(false), 2000);
    });
  };

  const handleNativeShare = async () => {
    try {
      await navigator.share({
        title: 'Join my UmamiStream room',
        text: `Join my room! Code: ${inviteCode}`,
        url,
      });
    } catch {
      // User cancelled or share failed — do nothing
    }
  };

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
            <span className="text-2xl sm:text-4xl font-mono font-bold text-accent-blue tracking-wider">{inviteCode}</span>
          </div>

          {'share' in navigator && (
            <button
              onClick={handleNativeShare}
              className="w-full mb-3 bg-accent-teal text-white font-bold py-3 rounded-xl shadow-sm transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share Invite
            </button>
          )}

          <div className="w-full flex gap-3">
            <button
              onClick={() => copyWithFeedback(inviteCode, setCodeCopied)}
              className="flex-1 bg-surface hover:bg-surface-raised text-primary font-bold py-2.5 rounded-lg border border-border shadow-sm transition-colors"
            >
              {codeCopied ? '✓ Copied!' : 'Copy Code'}
            </button>
            <button
              onClick={() => copyWithFeedback(url, setLinkCopied)}
              className="flex-1 bg-accent-blue hover:bg-red-700 text-white font-bold py-2.5 rounded-lg shadow-sm transition-colors"
            >
              {linkCopied ? '✓ Copied!' : 'Copy Link'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
