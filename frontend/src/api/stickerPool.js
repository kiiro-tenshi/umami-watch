import { auth } from '../firebase';

export async function getSharedStickerPacks() {
  const token = await auth.currentUser.getIdToken();
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/me/sticker-pool`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Could not load shared sticker packs.');
  return data.packs || [];
}
