import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import logoImg from '../../logo.webp';

// Use Cloudflare's always-pass test key on localhost (avoids domain whitelist requirement).
// In production the real site key is used automatically.
const SITE_KEY =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? '1x00000000000000000000AA'
    : (import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA');

export default function AuthPage() {
  const [mode, setMode] = useState('login'); // login | reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const turnstileRef = useRef(null);
  const widgetIdRef = useRef(null);

  const { user, login, resetPassword } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate('/home');
  }, [user, navigate]);

  // Render Turnstile widget once the script is loaded
  useEffect(() => {
    let interval;

    const render = () => {
      if (!turnstileRef.current || !window.turnstile) return;
      if (widgetIdRef.current !== null) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
      setTurnstileToken('');
      widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
        sitekey: SITE_KEY,
        theme: 'light',
        callback: (token) => setTurnstileToken(token),
        'expired-callback': () => setTurnstileToken(''),
        'error-callback': () => setTurnstileToken(''),
      });
      setTurnstileReady(true);
    };

    if (window.turnstile) {
      render();
    } else {
      interval = setInterval(() => {
        if (window.turnstile) {
          clearInterval(interval);
          render();
        }
      }, 100);
    }

    return () => {
      clearInterval(interval);
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [mode]); // re-render widget when switching login ↔ reset

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResetSent(false);

    if (!turnstileToken) {
      setError('Please complete the security check.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Verify Turnstile token server-side
      const verifyRes = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/verify-turnstile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: turnstileToken }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        setError('Security check failed. Please try again.');
        if (widgetIdRef.current !== null && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
        }
        setTurnstileToken('');
        return;
      }

      if (mode === 'login') {
        await login(email, password);
      } else {
        await resetPassword(email);
        setResetSent(true);
      }
    } catch (err) {
      setError(err.message.replace('Firebase: ', ''));
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
      }
      setTurnstileToken('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-page">
      <div className="bg-surface p-8 rounded-xl shadow-lg border border-border w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src={logoImg} alt="UmamiStream" className="w-20 h-20 rounded-full object-cover shadow-lg mb-3" />
          <h1 className="text-2xl font-bold text-primary tracking-tight">UmamiStream</h1>
          <p className="text-muted text-sm mt-1">Members only</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm font-medium border border-red-200">{error}</div>
        )}
        {resetSent && (
          <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4 text-sm font-medium border border-green-200">
            Password reset email sent — check your inbox.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-secondary mb-1">Email</label>
            <input
              type="email" required value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full p-3 rounded-lg bg-surface-raised border border-border focus:outline-none focus:ring-2 focus:ring-accent-teal transition-all"
            />
          </div>

          {mode === 'login' && (
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">Password</label>
              <input
                type="password" required value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full p-3 rounded-lg bg-surface-raised border border-border focus:outline-none focus:ring-2 focus:ring-accent-teal transition-all"
              />
            </div>
          )}

          {/* Cloudflare Turnstile */}
          <div className="flex justify-center py-1">
            <div ref={turnstileRef} />
          </div>

          <button
            type="submit"
            disabled={!turnstileReady || !turnstileToken || isSubmitting}
            className="w-full py-3 bg-accent-teal hover:opacity-90 text-white font-bold rounded-lg transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting && (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {isSubmitting ? 'Signing in...' : mode === 'login' ? 'Sign In' : 'Send Reset Link'}
          </button>
        </form>

        <div className="mt-5 text-center text-sm">
          {mode === 'login' ? (
            <button onClick={() => { setMode('reset'); setError(''); setResetSent(false); }} className="text-muted hover:text-secondary transition-colors">
              Forgot password?
            </button>
          ) : (
            <button onClick={() => { setMode('login'); setError(''); setResetSent(false); }} className="text-accent-teal hover:opacity-80 font-bold transition-opacity">
              Back to Sign In
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
