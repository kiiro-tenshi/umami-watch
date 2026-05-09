import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './hooks/useTheme';
import Navbar from './components/Navbar';
import BottomNav from './components/BottomNav';
import ProtectedRoute from './components/ProtectedRoute';
import LoadingSpinner from './components/LoadingSpinner';

const AuthPage        = lazy(() => import('./pages/AuthPage'));
const HomePage        = lazy(() => import('./pages/HomePage'));
const AnimeBrowsePage = lazy(() => import('./pages/AnimeBrowsePage'));
const AnimeDetailPage = lazy(() => import('./pages/AnimeDetailPage'));
const MovieBrowsePage = lazy(() => import('./pages/MovieBrowsePage'));
const MovieDetailPage = lazy(() => import('./pages/MovieDetailPage'));
const WatchPage       = lazy(() => import('./pages/WatchPage'));
const RoomsPage       = lazy(() => import('./pages/RoomsPage'));
const ProfilePage     = lazy(() => import('./pages/ProfilePage'));

function App() {
  return (
    <ThemeProvider>
    <BrowserRouter>
      <Navbar />
      <main className="pt-14 min-h-screen pb-16 md:pb-0">
        <Suspense fallback={<LoadingSpinner fullScreen />}>
          <Routes>
            <Route path="/" element={<Navigate to="/home" />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/home" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
            <Route path="/anime" element={<ProtectedRoute><AnimeBrowsePage /></ProtectedRoute>} />
            <Route path="/anime/:kitsuId" element={<ProtectedRoute><AnimeDetailPage /></ProtectedRoute>} />
            <Route path="/movies" element={<ProtectedRoute><MovieBrowsePage type="movie" /></ProtectedRoute>} />
            <Route path="/tv" element={<ProtectedRoute><MovieBrowsePage type="tv" /></ProtectedRoute>} />
            <Route path="/movie/:tmdbId" element={<ProtectedRoute><MovieDetailPage type="movie" /></ProtectedRoute>} />
            <Route path="/tv/:tmdbId" element={<ProtectedRoute><MovieDetailPage type="tv" /></ProtectedRoute>} />
            <Route path="/watch" element={<ProtectedRoute><WatchPage /></ProtectedRoute>} />
            <Route path="/rooms" element={<ProtectedRoute><RoomsPage /></ProtectedRoute>} />
            <Route path="/join/:code" element={<ProtectedRoute><RoomsPage autoJoin={true} /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
<Route path="*" element={<Navigate to="/home" />} />
          </Routes>
        </Suspense>
      </main>
      <BottomNav />
      <footer className="hidden md:block border-t border-border bg-surface py-4 text-center text-xs text-muted">
        Created exclusively for Umami Dream precious members by The Boss Lady ©2026
      </footer>
    </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
