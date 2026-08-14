import { describe, expect, it } from 'vitest';
import { parseHlsEmbedSources } from '../../routes/gogoanime.js';

describe('parseHlsEmbedSources', () => {
  it('returns labeled Cloudflare-resolvable HLS embeds and subtitle tracks', () => {
    const html = [
      '<button data-video="https://vivibebe.site/aaaaaaaaaaaaaaaa">HD-1 <span>Hard Sub</span></button>',
      '<button data-video="https://otakuhg.site/e/server2">HD-2 <span>Hard Sub</span></button>',
      '<button data-video="https://otakuvid.online/embed/server3?caption_1=https%3A%2F%2Fsub.example%2Fen.vtt&amp;sub_1=English">HD-3 <span>Sort Sub</span></button>',
      '<button data-video="https://playmogo.com/e/not-supported">HD-4 <span>Hard Sub</span></button>',
      '<button data-video="https://vivibebe.site/bbbbbbbbbbbbbbbb">HD-1 <span>DUB</span></button>',
    ].join('');

    expect(parseHlsEmbedSources(html)).toEqual([
      {
        kind: 'Hard Sub',
        label: 'Hard Sub 1',
        embedUrl: 'https://vivibebe.site/aaaaaaaaaaaaaaaa',
        tracks: [],
      },
      {
        kind: 'Hard Sub',
        label: 'Hard Sub 2',
        embedUrl: 'https://otakuhg.site/e/server2',
        tracks: [],
      },
      {
        kind: 'Soft Sub',
        label: 'Soft Sub 1',
        embedUrl: 'https://otakuvid.online/embed/server3?caption_1=https%3A%2F%2Fsub.example%2Fen.vtt&sub_1=English',
        tracks: [{ kind: 'captions', label: 'English', src: 'https://sub.example/en.vtt' }],
      },
      {
        kind: 'Dub',
        label: 'Dub 1',
        embedUrl: 'https://vivibebe.site/bbbbbbbbbbbbbbbb',
        tracks: [],
      },
    ]);
  });

  it('deduplicates identical embeds and ignores malformed URLs', () => {
    const html = [
      '<button data-video="https://vivibebe.site/aaaaaaaaaaaaaaaa"><span>Hard Sub</span></button>',
      '<button data-video="https://vivibebe.site/aaaaaaaaaaaaaaaa"><span>Hard Sub</span></button>',
      '<button data-video="not-a-url"><span>Hard Sub</span></button>',
    ].join('');

    expect(parseHlsEmbedSources(html)).toHaveLength(1);
  });
});
