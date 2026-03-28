import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './hooks/useTheme';
import Navbar from './components/Navbar';
import AuthPage from './pages/AuthPage';
import HomePage from './pages/HomePage';
import AnimeBrowsePage from './pages/AnimeBrowsePage';
import AnimeDetailPage from './pages/AnimeDetailPage';
import MovieBrowsePage from './pages/MovieBrowsePage';
import MovieDetailPage from './pages/MovieDetailPage';
import WatchPage from './pages/WatchPage';
import RoomsPage from './pages/RoomsPage';
import ProfilePage from './pages/ProfilePage';
import MangaBrowsePage from './pages/MangaBrowsePage';
import MangaDetailPage from './pages/MangaDetailPage';
import MangaReaderPage from './pages/MangaReaderPage';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <ThemeProvider>
    <BrowserRouter>
      <Navbar />
      <main className="pt-14 min-h-screen">
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
          <Route path="/manga" element={<ProtectedRoute><MangaBrowsePage /></ProtectedRoute>} />
          <Route path="/manga/:mangaId" element={<ProtectedRoute><MangaDetailPage /></ProtectedRoute>} />
          <Route path="/manga/:mangaId/chapter/:chapterId" element={<ProtectedRoute><MangaReaderPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/home" />} />
        </Routes>
      </main>
      <footer className="border-t border-border bg-surface py-4 text-center text-xs text-muted">
        Created exclusively for Umami Dream precious members by The Boss Lady ©2026
      </footer>
    </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
