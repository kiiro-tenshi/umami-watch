// MangaBuddy — scraped server-side, exposed via /api/manga/*
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export async function searchComick(title) {
  const res = await fetch(`${API_BASE}/api/manga/search?q=${encodeURIComponent(title)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data?.[0] ?? null; // { slug, title }
}

export async function getComickChapters(slug) {
  const res = await fetch(`${API_BASE}/api/manga/chapters?slug=${encodeURIComponent(slug)}`);
  if (!res.ok) return [];
  return res.json();
}

export async function getComickChapterImages(chapterId) {
  // chapterId = "{mangaSlug}~{chapterSlug}"
  const [slug, chapter] = chapterId.split('~');
  const res = await fetch(`${API_BASE}/api/manga/pages?slug=${encodeURIComponent(slug)}&chapter=${encodeURIComponent(chapter)}`);
  if (!res.ok) throw new Error('Failed to load chapter pages');
  const urls = await res.json();
  // Proxy through server to inject Referer: mangabuddy.com
  return urls.map(url => `${API_BASE}/api/proxy/manga-image?url=${encodeURIComponent(url)}`);
}
