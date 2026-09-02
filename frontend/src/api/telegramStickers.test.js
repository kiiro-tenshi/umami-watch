import { describe, expect, it, vi } from 'vitest';
import { getTelegramStickerPack } from './telegramStickers.js';

describe('getTelegramStickerPack', () => {
  it('loads an allowlisted pack through the Cloudflare Worker', async () => {
    const fetchFn = vi.fn().mockResolvedValue(Response.json({
      name: 'kiiromiko_by_kiiro_sticker_bot', title: 'Kiiro Miko', stickers: [],
    }));

    await expect(getTelegramStickerPack(
      'kiiromiko_by_kiiro_sticker_bot', 'https://worker.example/', fetchFn,
    )).resolves.toMatchObject({ title: 'Kiiro Miko' });
    expect(new URL(fetchFn.mock.calls[0][0]).searchParams.get('stickerPack'))
      .toBe('kiiromiko_by_kiiro_sticker_bot');
  });

  it('rejects packs outside the curated allowlist', async () => {
    await expect(getTelegramStickerPack('unknown', 'https://worker.example/'))
      .rejects.toThrow(/not allowed/i);
  });
});
