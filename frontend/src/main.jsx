import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { AuthProvider } from './hooks/useAuth.jsx';

// Register WebTorrent service worker for browser-side torrent streaming
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/webtorrent.sw.js', { scope: '/' }).catch(() => {});
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
)
