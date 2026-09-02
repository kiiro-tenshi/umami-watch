import { auth } from '../firebase.js';

const BACKEND = `${import.meta.env.VITE_API_BASE_URL || ''}/api/anime/megavid`;

export async function getMegaVidSource(malId, ep, type = 'sub') {
  const url = new URL(`${BACKEND}/sources`, window.location.origin);
  url.searchParams.set('malId', String(malId));
  url.searchParams.set('ep', String(ep));
  url.searchParams.set('type', type);
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch(url.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Backup anime provider error: ${response.status}`);
    error.status = response.status;
    error.code = data.code;
    error.provider = data.provider || 'megavid';
    throw error;
  }
  return data;
}
