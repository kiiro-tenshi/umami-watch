const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export class ProviderUnavailableError extends Error {
  constructor(provider, message, options = {}) {
    super(message, options);
    this.name = 'ProviderUnavailableError';
    this.code = 'PROVIDER_UNAVAILABLE';
    this.provider = provider;
    this.statusCode = 503;
    this.retryAfter = 60;
  }
}

export function createAniNekoClient({
  fetchFn = fetch,
  now = Date.now,
  timeoutMs = 2_500,
  retries = 1,
  circuitMs = 60_000,
  freshMs = 5 * 60_000,
  staleMs = 24 * 60 * 60_000,
  maxEntries = 100,
} = {}) {
  const cache = new Map();
  let circuitUntil = 0;

  function cached(url, maxAge) {
    const entry = cache.get(url);
    if (!entry || now() - entry.savedAt > maxAge) return null;
    cache.delete(url);
    cache.set(url, entry);
    return entry.html;
  }

  function save(url, html) {
    cache.delete(url);
    cache.set(url, { html, savedAt: now() });
    while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
  }

  async function attempt(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchFn(url, {
        signal: controller.signal,
        headers: { 'User-Agent': DEFAULT_UA },
      });
      if (!response.ok) {
        const error = new Error(`AniNeko responded with ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchHtml(url) {
    const fresh = cached(url, freshMs);
    if (fresh !== null) return fresh;

    if (circuitUntil > now()) {
      const stale = cached(url, staleMs);
      if (stale !== null) return stale;
      const error = new ProviderUnavailableError('anineko', 'Primary anime provider is temporarily unavailable.');
      error.retryAfter = Math.max(1, Math.ceil((circuitUntil - now()) / 1000));
      throw error;
    }

    let lastError;
    for (let index = 0; index <= retries; index += 1) {
      try {
        const html = await attempt(url);
        save(url, html);
        circuitUntil = 0;
        return html;
      } catch (error) {
        lastError = error;
        if (error.status === 404) throw error;
      }
    }

    circuitUntil = now() + circuitMs;
    const stale = cached(url, staleMs);
    if (stale !== null) return stale;
    throw new ProviderUnavailableError(
      'anineko',
      'Primary anime provider is temporarily unavailable.',
      { cause: lastError },
    );
  }

  return { fetchHtml };
}

export const aniNekoClient = createAniNekoClient();
