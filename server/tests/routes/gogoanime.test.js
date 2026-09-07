import { describe, expect, it } from 'vitest';
import { parseHlsEmbedSources } from '../../routes/gogoanime.js';

describe('parseHlsEmbedSources', () => {
  it('returns labeled Cloudflare-resolvable HLS embeds and subtitle tracks', () => {
    const html = [
      '<button data-video="https://vivibebe.site/aaaaaaaaaaaaaaaa">HD-1 <span>Hard Sub</span></button>',
      '<button data-video="https://otakuhg.site/e/server2">HD-2 <span>Hard Sub</span></button>',
      '<button data-video="https://otakuvid.online/embed/server3">HD-3 <span>Hard Sub</span></button>',
      '<button data-video="https://playmogo.com/e/not-supported">HD-4 <span>Hard Sub</span></button>',
      '<button data-video="https://vivibebe.site/bbbbbbbbbbbbbbbb">HD-1 <span>DUB</span></button>',
    ].join('');

    expect(parseHlsEmbedSources(html)).toEqual([
      {
        kind: 'Hard Sub',
        label: 'Hard Sub 3',
        embedUrl: 'https://otakuvid.online/embed/server3',
        tracks: [],
      },
      {
        kind: 'Hard Sub',
        label: 'Hard Sub 2',
        embedUrl: 'https://otakuhg.site/e/server2',
        tracks: [],
      },
      {
        kind: 'Hard Sub',
        label: 'Hard Sub 1',
        embedUrl: 'https://vivibebe.site/aaaaaaaaaaaaaaaa',
        tracks: [],
      },
    ]);
  });

  it('uses dub mirrors only when the episode has no marked sub source', () => {
    const html = [
      '<button data-video="https://vivibebe.site/dub1"><span>DUB</span></button>',
      '<button data-video="https://otakuhg.site/e/dub2"><span>English Dub</span></button>',
    ].join('');

    expect(parseHlsEmbedSources(html).map(source => source.label)).toEqual([
      'Dub 2',
      'Dub 1',
    ]);
  });

  it('prioritizes Grand Blue soft-sub mirrors by reliable provider', () => {
    const html = [
      '<button data-video="https://vivibebe.site/soft1?sub=https%3A%2F%2Fsub.example%2Fen.vtt"><span>Soft Sub</span></button>',
      '<button data-video="https://otakuhg.site/e/soft2?caption_1=https%3A%2F%2Fsub.example%2Fen.vtt&amp;sub_1=English"><span>Soft Sub</span></button>',
      '<button data-video="https://otakuvid.online/embed/soft3?caption_1=https%3A%2F%2Fsub.example%2Fen.vtt&amp;sub_1=English"><span>Soft Sub</span></button>',
    ].join('');

    expect(parseHlsEmbedSources(html).map(source => source.label)).toEqual([
      'Soft Sub 3',
      'Soft Sub 2',
      'Soft Sub 1',
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
