import { describe, expect, it, vi } from 'vitest';
import { createAniNekoClient } from '../../services/aninekoClient.js';

describe('AniNeko resilient client', () => {
  it('retries once and caches successful HTML', async () => {
    const fetchFn = vi.fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(new Response('<html>ok</html>'));
    const client = createAniNekoClient({ fetchFn, timeoutMs: 100 });

    await expect(client.fetchHtml('https://anineko.to/browse?keyword=test')).resolves.toBe('<html>ok</html>');
    await expect(client.fetchHtml('https://anineko.to/browse?keyword=test')).resolves.toBe('<html>ok</html>');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('opens the circuit after repeated failures so later requests fail immediately', async () => {
    let timestamp = 1_000;
    const fetchFn = vi.fn().mockRejectedValue(new Error('origin timeout'));
    const client = createAniNekoClient({ fetchFn, now: () => timestamp, retries: 1, circuitMs: 60_000 });

    await expect(client.fetchHtml('https://anineko.to/one')).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      provider: 'anineko',
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);

    timestamp += 1_000;
    await expect(client.fetchHtml('https://anineko.to/two')).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      retryAfter: 59,
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('serves stale cached HTML while the provider circuit is open', async () => {
    let timestamp = 0;
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response('cached page'))
      .mockRejectedValue(new Error('origin timeout'));
    const client = createAniNekoClient({
      fetchFn,
      now: () => timestamp,
      retries: 0,
      freshMs: 10,
      staleMs: 1_000,
    });

    await expect(client.fetchHtml('https://anineko.to/page')).resolves.toBe('cached page');
    timestamp = 20;
    await expect(client.fetchHtml('https://anineko.to/page')).resolves.toBe('cached page');
    timestamp = 30;
    await expect(client.fetchHtml('https://anineko.to/page')).resolves.toBe('cached page');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
