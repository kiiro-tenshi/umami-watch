export const TELEGRAM_STICKER_PACKS = [
  { name: 'kiiromiko_by_kiiro_sticker_bot', title: 'Kiiro Miko' },
  { name: 'kiirouniform_by_kiiro_sticker_bot', title: 'Kiiro Uniform' },
];

const ALLOWED_PACKS = new Set(TELEGRAM_STICKER_PACKS.map(pack => pack.name));

export async function getTelegramStickerPack(packName, workerBase = import.meta.env.VITE_HLS_PROXY_URL, fetchFn = fetch) {
  if (!ALLOWED_PACKS.has(packName)) throw new Error('Sticker pack is not allowed.');
  if (!workerBase) throw new Error('Telegram stickers are not configured.');

  const url = new URL(workerBase);
  url.searchParams.set('stickerPack', packName);
  const response = await fetchFn(url.toString());
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Sticker pack failed: ${response.status}`);
  return data;
}
