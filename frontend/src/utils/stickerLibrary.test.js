import { describe, expect, it } from 'vitest';
import { getUserStickerPacks, parseTelegramStickerUrl } from './stickerLibrary';

describe('sticker library', () => {
  it('starts with no packs and respects an explicitly empty library', () => {
    expect(getUserStickerPacks({ uid: 'old-user' })).toEqual([]);
    expect(getUserStickerPacks({ telegramStickerPacks: [] })).toEqual([]);
  });
  it.each(['https://t.me/addstickers/CatPack', ' https://telegram.me/addstickers/CatPack/ '])('parses %s', url => {
    expect(parseTelegramStickerUrl(url)).toBe('CatPack');
  });
  it.each(['http://t.me/addstickers/CatPack', 'https://t.me.evil.test/addstickers/CatPack',
    'https://evil.test/addstickers/CatPack', 'https://t.me/CatPack', 'https://t.me/addstickers/../x',
    'https://user@t.me/addstickers/CatPack', 'CatPack'])('rejects %s', url => {
    expect(() => parseTelegramStickerUrl(url)).toThrow(/Telegram sticker pack URL/);
  });
});
