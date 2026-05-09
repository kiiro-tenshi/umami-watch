import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const tabs = [
  {
    to: '/home',
    label: 'Home',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    ),
  },
  {
    to: '/anime',
    label: 'Anime',
    icon: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </>
    ),
  },
  {
    to: '/movies',
    label: 'Movies',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
    ),
  },
  {
    to: '/rooms',
    label: 'Rooms',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    ),
  },
  {
    to: '/profile',
    label: 'Profile',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    ),
  },
];

export default function BottomNav() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  if (!user) return null;
  if (pathname.startsWith('/watch')) return null;

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-border flex items-stretch"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {tabs.map(({ to, label, icon }) => {
        const isActive = pathname === to || (to !== '/home' && pathname.startsWith(to));
        return (
          <Link
            key={to}
            to={to}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
              isActive ? 'text-accent-teal' : 'text-muted hover:text-secondary'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {icon}
            </svg>
            <span className="text-[10px] font-semibold">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
