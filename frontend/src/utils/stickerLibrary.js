export const MAX_STICKER_PACKS = 30;
export const STICKER_PACK_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

export function getUserStickerPacks(user) {
  return Array.isArray(user?.telegramStickerPacks)
    ? user.telegramStickerPacks
    : [];
}

export function parseTelegramStickerUrl(value) {
  let url;
  try { url = new URL(value.trim()); } catch { /* handled below */ }
  const match = url?.pathname.match(/^\/addstickers\/([A-Za-z][A-Za-z0-9_]{0,63})\/?$/);
  if (!url || url.protocol !== 'https:' || !['t.me', 'telegram.me', 'www.t.me', 'www.telegram.me'].includes(url.hostname)
    || url.username || url.password || url.port || !match) {
    throw new Error('Enter a Telegram sticker pack URL, like https://t.me/addstickers/PackName.');
  }
  return match[1];
}
