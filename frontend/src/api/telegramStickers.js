import { STICKER_PACK_NAME } from '../utils/stickerLibrary';

export async function getTelegramStickerPack(packName, workerBase = import.meta.env.VITE_HLS_PROXY_URL, fetchFn = fetch) {
  if (typeof packName !== 'string' || !STICKER_PACK_NAME.test(packName)) throw new Error('Invalid sticker pack name.');
  if (!workerBase) throw new Error('Telegram stickers are not configured.');

  const url = new URL(workerBase);
  url.searchParams.set('stickerPack', packName);
  const response = await fetchFn(url.toString());
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Sticker pack failed: ${response.status}`);
  return data;
}
