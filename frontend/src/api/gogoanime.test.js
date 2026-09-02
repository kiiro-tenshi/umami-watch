import { describe, it, expect } from 'vitest';
import {
  pickBestShow,
  buildProxiedHlsSources,
  filterAvailableHlsSources,
  probeAvailableHlsSources,
  findNextHlsSource,
  planHlsRecovery,
} from './gogoanime.js';

const FRIEREN_SHOWS = [
  { slug: 'sousou-no-frieren-season-2', title: 'Frieren: Beyond Journey\'s End Season 2' },
  { slug: 'sousou-no-frieren-mini', title: 'Frieren: Beyond Journey\'s End Mini Anime' },
  { slug: 'sousou-no-frieren-mini-2', title: 'Sousou no Frieren no Mahou Part 2' },
  { slug: 'sousou-no-frieren', title: 'Frieren: Beyond Journey\'s End' },
];

const OSHI_SHOWS = [
  { slug: 'oshi-no-ko-season-3', title: '[Oshi No Ko] Season 3' },
  { slug: 'oshi-no-ko-season-2', title: '[Oshi No Ko] Season 2' },
  { slug: 'oshi-no-ko', title: '[Oshi No Ko]' },
];

const DUB_MIXED_SHOWS = [
  { slug: 'naruto-dub', title: 'Naruto (Dub)' },
  { slug: 'naruto', title: 'Naruto' },
  { slug: 'naruto-shippuden-dub', title: 'Naruto: Shippuden (Dub)' },
];

describe('pickBestShow', () => {
  it('returns null for empty list', () => {
    expect(pickBestShow([], 'Naruto')).toBeNull();
    expect(pickBestShow(null, 'Naruto')).toBeNull();
  });

  it('returns null when no show has a meaningful match (avoids returning wrong anime)', () => {
    const unrelated = [
      { slug: 'dragon-ball-z', title: 'Dragon Ball Z' },
      { slug: 'one-piece', title: 'One Piece' },
    ];
    expect(pickBestShow(unrelated, 'Naruto')).toBeNull();
  });

  it('Frieren S1 — picks base show over Season 2', () => {
    const result = pickBestShow(FRIEREN_SHOWS, "Frieren: Beyond Journey's End");
    expect(result.slug).toBe('sousou-no-frieren');
  });

  it('Oshi no Ko S1 — picks base show over Season 2 and 3', () => {
    const result = pickBestShow(OSHI_SHOWS, 'Oshi no Ko');
    expect(result.slug).toBe('oshi-no-ko');
  });

  it('Oshi no Ko S2 — picks Season 2 specifically', () => {
    const result = pickBestShow(OSHI_SHOWS, 'Oshi no Ko Season 2');
    expect(result.slug).toBe('oshi-no-ko-season-2');
  });

  it('Oshi no Ko S3 — picks Season 3 specifically', () => {
    const result = pickBestShow(OSHI_SHOWS, 'Oshi no Ko Season 3');
    expect(result.slug).toBe('oshi-no-ko-season-3');
  });

  it('ignores punctuation differences in matching', () => {
    const result = pickBestShow(FRIEREN_SHOWS, 'Frieren Beyond Journeys End');
    expect(result.slug).toBe('sousou-no-frieren');
  });

  // Compact match: AniList may store a title as one concatenated word (e.g. "MARRIAGETOXIN")
  // while GogoAnime indexes it with spaces ("Marriage Toxin"). Strip spaces from both and compare.
  it('compact match — "MARRIAGETOXIN" matches "Marriage Toxin"', () => {
    const shows = [
      { slug: 'some-romance-show', title: 'My Lovely Marriage' },
      { slug: 'marriage-toxin', title: 'Marriage Toxin' },
    ];
    expect(pickBestShow(shows, 'MARRIAGETOXIN').slug).toBe('marriage-toxin');
  });

  it('compact match — "MARRIAGETOXIN" beats unrelated show even when listed first', () => {
    const shows = [
      { slug: 'random-show', title: 'Random Show' },
      { slug: 'marriage-toxin', title: 'Marriage Toxin' },
    ];
    expect(pickBestShow(shows, 'MARRIAGETOXIN').slug).toBe('marriage-toxin');
  });

  it('prefers sub over dub when titles otherwise match equally', () => {
    const result = pickBestShow(DUB_MIXED_SHOWS, 'Naruto');
    expect(result.slug).toBe('naruto');
  });

  it('skips dub even when dub slug appears first in results', () => {
    const reversed = [...DUB_MIXED_SHOWS].reverse();
    const result = pickBestShow(reversed, 'Naruto');
    expect(result.slug).toBe('naruto');
  });

  it('returns null for dub-only list — caller should try romaji fallback', () => {
    const dubOnly = [{ slug: 'one-piece-dub', title: 'One Piece (Dub)' }];
    expect(pickBestShow(dubOnly, 'One Piece')).toBeNull();
  });

  it('returns match even when extra words in result title push score negative', () => {
    // "Overlord" matches "Overlord IV: The Half-Elf Demihuman" even though extraWords penalty > matchCount
    const shows = [{ slug: 'overlord-iv', title: 'Overlord IV: The Half-Elf Demihuman' }];
    expect(pickBestShow(shows, 'Overlord IV')).not.toBeNull();
    expect(pickBestShow(shows, 'Overlord IV').slug).toBe('overlord-iv');
  });
});

describe('Cloudflare HLS source helpers', () => {
  it('routes every embed through the configured Worker', () => {
    const sources = buildProxiedHlsSources({
      sources: [
        { label: 'Hard Sub 1', embedUrl: 'https://vivibebe.site/abc', tracks: [] },
        { label: 'Hard Sub 2', embedUrl: 'https://otakuhg.site/e/def', tracks: [] },
      ],
    }, 'https://worker.example/');

    expect(sources).toHaveLength(2);
    expect(sources.every(source => source.url.startsWith('https://worker.example/'))).toBe(true);
    expect(new URL(sources[0].url).searchParams.get('embed')).toBe('https://vivibebe.site/abc');
    expect(new URL(sources[1].url).searchParams.get('embed')).toBe('https://otakuhg.site/e/def');
  });

  it('routes a direct HLS backup and its subtitles through the Worker', () => {
    const [source] = buildProxiedHlsSources({
      sources: [{
        label: 'Backup HLS',
        hlsUrl: 'https://cp.megavid.buzz/hls/show/playlist.m3u8',
        referer: 'https://megavid.buzz/',
        tracks: [{ kind: 'subtitles', label: 'English', srclang: 'en', src: 'https://megavid.buzz/sub/en.vtt' }],
      }],
    }, 'https://worker.example/');

    expect(new URL(source.url).searchParams.get('url')).toContain('playlist.m3u8');
    expect(new URL(source.url).searchParams.get('referer')).toBe('https://megavid.buzz/');
    expect(source.tracks[0]).toMatchObject({ kind: 'subtitles', srclang: 'en' });
    expect(new URL(source.tracks[0].src).origin).toBe('https://worker.example');
    expect(new URL(source.tracks[0].src).searchParams.get('url')).toBe('https://megavid.buzz/sub/en.vtt');
  });

  it('refuses the old Cloud Run video fallback when the Worker is missing', () => {
    expect(() => buildProxiedHlsSources({ sources: [] }, '')).toThrow(/Cloudflare HLS proxy/);
  });

  it('finds the next unfailed HLS source', () => {
    const sources = [
      { type: 'hls', url: 'one' },
      { type: 'hls', url: 'two' },
      { type: 'hls', url: 'three' },
    ];
    expect(findNextHlsSource(sources, 0, new Set(['two']))).toBe(2);
    expect(findNextHlsSource(sources, 2)).toBe(0);
    expect(findNextHlsSource(sources, 2, new Set(['one', 'two']))).toBe(-1);
  });

  it('switches circularly, retries a sole source once, then stops', () => {
    const sources = [
      { type: 'hls', url: 'one' },
      { type: 'hls', url: 'two' },
    ];
    expect(planHlsRecovery(sources, 1, new Set(), 0)).toEqual({ action: 'switch', nextIndex: 0 });
    expect(planHlsRecovery([sources[0]], 0, new Set(), 0)).toEqual({ action: 'retry' });
    expect(planHlsRecovery([sources[0]], 0, new Set(), 1)).toEqual({ action: 'error' });
    expect(planHlsRecovery(sources, 1, new Set(['one']), 1)).toEqual({ action: 'error' });
  });

  it('keeps only verified sources and caps the displayed list at two', async () => {
    const sources = [
      { type: 'hls', label: 'Soft Sub 3', url: 'https://worker.example/?embed=three' },
      { type: 'hls', label: 'Soft Sub 2', url: 'https://worker.example/?embed=two' },
      { type: 'hls', label: 'Soft Sub 1', url: 'https://worker.example/?embed=one' },
    ];
    const fetchFn = async url => Response.json({ available: !url.includes('embed=two') });

    await expect(filterAvailableHlsSources(sources, fetchFn)).resolves.toEqual([
      sources[0],
      sources[2],
    ]);
  });

  it('accepts a manifest response from an older Worker during deployment', async () => {
    const source = { type: 'hls', url: 'https://worker.example/?embed=one' };
    const fetchFn = async () => new Response('#EXTM3U', {
      headers: { 'Content-Type': 'application/vnd.apple.mpegurl' },
    });

    await expect(filterAvailableHlsSources([source], fetchFn)).resolves.toEqual([source]);
  });

  it('returns the first working source immediately and adds a second in the background', async () => {
    const sources = [
      { type: 'hls', label: 'Slow', url: 'https://worker.example/?embed=slow' },
      { type: 'hls', label: 'Fast', url: 'https://worker.example/?embed=fast' },
      { type: 'hls', label: 'Backup', url: 'https://worker.example/?embed=backup' },
    ];
    let resolveBackup;
    let slowAborted = false;
    const fetchFn = (url, { signal }) => {
      const embed = new URL(url).searchParams.get('embed');
      if (embed === 'fast') return Promise.resolve(Response.json({ available: true }));
      if (embed === 'backup') {
        return new Promise(resolve => { resolveBackup = resolve; });
      }
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          slowAborted = true;
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    };

    const probe = probeAvailableHlsSources(sources, fetchFn);
    await expect(probe.first).resolves.toBe(sources[1]);

    resolveBackup(Response.json({ available: true }));
    await expect(probe.complete).resolves.toEqual([sources[1], sources[2]]);
    expect(slowAborted).toBe(true);
  });

  it('stops waiting for an unresponsive source after four seconds', async () => {
    vi.useFakeTimers();
    const source = { type: 'hls', url: 'https://worker.example/?embed=slow' };
    const fetchFn = (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    });

    try {
      const probe = probeAvailableHlsSources([source], fetchFn);
      await vi.advanceTimersByTimeAsync(4_000);
      await expect(probe.first).resolves.toBeNull();
      await expect(probe.complete).resolves.toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
