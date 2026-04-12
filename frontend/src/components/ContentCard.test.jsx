import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ContentCard from './ContentCard';

const BASE = { id: '123', title: 'Naruto', posterUrl: 'https://cdn.example.com/poster.jpg', contentType: 'anime' };

function renderCard(props = {}) {
  return render(
    <MemoryRouter>
      <ContentCard {...BASE} {...props} />
    </MemoryRouter>
  );
}

describe('ContentCard', () => {
  // ── Rendering ─────────────────────────────────────────────────────────────
  it('renders the title', () => {
    renderCard();
    expect(screen.getByText('Naruto')).toBeInTheDocument();
  });

  it('renders the poster image with correct src and alt', () => {
    renderCard();
    const img = screen.getByAltText('Naruto');
    expect(img).toHaveAttribute('src', 'https://cdn.example.com/poster.jpg');
  });

  it('uses placeholder image when posterUrl is null', () => {
    renderCard({ posterUrl: null });
    expect(screen.getByAltText('Naruto')).toHaveAttribute('src', '/placeholder.png');
  });

  it('images are lazy-loaded', () => {
    renderCard();
    expect(screen.getByAltText('Naruto')).toHaveAttribute('loading', 'lazy');
  });

  // ── Link routing ──────────────────────────────────────────────────────────
  it('links to /anime/:id with title query param for anime', () => {
    renderCard({ contentType: 'anime', id: '456', title: 'Naruto' });
    expect(screen.getByRole('link')).toHaveAttribute('href', '/anime/456?title=Naruto');
  });

  it('links to /movie/:id for movies', () => {
    renderCard({ contentType: 'movie', id: '789' });
    expect(screen.getByRole('link')).toHaveAttribute('href', '/movie/789');
  });

  it('links to /tv/:id for TV shows', () => {
    renderCard({ contentType: 'tv', id: '101' });
    expect(screen.getByRole('link')).toHaveAttribute('href', '/tv/101');
  });

  it('links to /manga/:id for manga', () => {
    renderCard({ contentType: 'manga', id: '202' });
    expect(screen.getByRole('link')).toHaveAttribute('href', '/manga/202');
  });

  it('uses continueUrl over default href when provided', () => {
    renderCard({ continueUrl: '/watch?type=anime&kitsuId=123&epNum=5' });
    expect(screen.getByRole('link')).toHaveAttribute('href', '/watch?type=anime&kitsuId=123&epNum=5');
  });

  // ── Rating ────────────────────────────────────────────────────────────────
  it('displays rating when provided as a number', () => {
    renderCard({ rating: 8.5 });
    expect(screen.getByText('★ 8.5')).toBeInTheDocument();
  });

  it('displays rating when provided as a string', () => {
    renderCard({ rating: '9.0' });
    expect(screen.getByText('★ 9.0')).toBeInTheDocument();
  });

  it('does not render rating when not provided', () => {
    renderCard();
    expect(screen.queryByText(/★/)).not.toBeInTheDocument();
  });

  // ── Progress bar ──────────────────────────────────────────────────────────
  it('renders a progress bar when progress > 0', () => {
    const { container } = renderCard({ progress: 60 });
    const bar = container.querySelector('div.bg-accent-teal');
    expect(bar).toBeInTheDocument();
    expect(bar.style.width).toBe('60%');
  });

  it('does not render a progress bar when progress is 0', () => {
    const { container } = renderCard({ progress: 0 });
    expect(container.querySelector('div.bg-accent-teal')).not.toBeInTheDocument();
  });

  it('clamps progress bar to 100% for values over 100', () => {
    const { container } = renderCard({ progress: 150 });
    expect(container.querySelector('div.bg-accent-teal').style.width).toBe('100%');
  });

  it('clamps progress bar to 0% for negative values', () => {
    const { container } = renderCard({ progress: -10 });
    expect(container.querySelector('div.bg-accent-teal')).not.toBeInTheDocument();
  });

  // ── Content type badge ────────────────────────────────────────────────────
  it('shows the content type badge', () => {
    renderCard({ contentType: 'movie' });
    expect(screen.getByText('movie')).toBeInTheDocument();
  });
});
