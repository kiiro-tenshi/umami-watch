import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useState } from 'react';
import logoImg from '../../logo.webp';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    navigate('/auth');
  };

  return (
    <nav className="fixed top-0 left-0 right-0 h-14 bg-surface border-b border-border z-40 px-4 md:px-8 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-6">
        <Link to="/home" className="text-xl font-bold text-primary flex items-center gap-2">
          <img src={logoImg} alt="UmamiStream" className="w-8 h-8 rounded-full object-cover shadow-sm" />
          <span className="hidden sm:inline">UmamiStream</span>
        </Link>
        <div className="hidden md:flex items-center gap-4 text-sm font-semibold text-secondary">
          <Link to="/home" className="hover:text-accent-blue transition-colors">Home</Link>
          <Link to="/anime" className="hover:text-accent-blue transition-colors">Anime</Link>
          <Link to="/movies" className="hover:text-accent-blue transition-colors">Movies</Link>
          <Link to="/tv" className="hover:text-accent-blue transition-colors">TV Shows</Link>
          <Link to="/rooms" className="hover:text-accent-blue transition-colors">Rooms</Link>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Mobile menu button */}
        <button className="md:hidden text-secondary" onClick={() => setMenuOpen(!menuOpen)}>☰</button>
        
        <div className="relative">
          <button onClick={() => setDropdownOpen(!dropdownOpen)} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <img src={user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName}`} alt="Avatar" className="w-8 h-8 rounded-full border border-border" />
          </button>
          
          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-surface rounded-xl shadow-lg border border-border-subtle py-2 overflow-hidden">
              <div className="px-4 py-2 border-b border-border-subtle text-sm">
                <p className="font-bold text-primary">{user.displayName}</p>
                <p className="text-xs text-muted truncate">{user.email}</p>
              </div>
              <Link to="/profile" onClick={() => setDropdownOpen(false)} className="block px-4 py-2 text-sm text-secondary hover:bg-surface-raised hover:text-accent-blue font-medium">Profile & Settings</Link>
              <button onClick={() => { setDropdownOpen(false); handleLogout(); }} className="w-full text-left px-4 py-2 text-sm text-accent-blue hover:bg-surface-raised font-bold">Log Out</button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Drawer */}
      {menuOpen && (
        <div className="md:hidden absolute top-14 left-0 w-full bg-surface border-b border-border shadow-lg flex flex-col p-4 gap-4 font-semibold text-secondary text-lg">
          <Link to="/home" onClick={() => setMenuOpen(false)}>Home</Link>
          <Link to="/anime" onClick={() => setMenuOpen(false)}>Anime</Link>
          <Link to="/movies" onClick={() => setMenuOpen(false)}>Movies</Link>
          <Link to="/tv" onClick={() => setMenuOpen(false)}>TV Shows</Link>
          <Link to="/rooms" onClick={() => setMenuOpen(false)}>Rooms</Link>
        </div>
      )}
    </nav>
  );
}
