# Movie/TV provider verification — 2026-09-09

Replacement: VidZee `dcloud`. Source API:

- `https://core.vidzee.wtf/streams/movie/{tmdbId}?s=dcloud&e=0`
- `https://core.vidzee.wtf/streams/tv/{tmdbId}/{season}/{episode}?s=dcloud&e=0`
- Referer: `https://player.vidzee.wtf/`

Before implementation, source API requests, playlists, and media were fetched
through the deployed `umami-hls-proxy.identityonlyforgaming.workers.dev` Worker
using its existing `url` proxy. No media was relayed through Cloud Run.

| Content | Source API / playlist | First media segment | Midpoint segment |
| --- | --- | --- | --- |
| TV 108978, season 1, episode 1 | Passed | 1,222,564 bytes | 1,943,544 bytes |
| Movie 550 | Passed | 5,684,556 bytes | 4,848,332 bytes |

MPEG-TS packet synchronization and program-map stream types confirmed H.264
(`0x1b`) and AAC (`0x0f`) in both first segments. Audio is muxed with video in
these samples; no separate audio playlist or encryption key was required.

Other candidate servers (`tik`, `ipcloud`) failed source or media requests and
were excluded. VixSrc's source API returned 403 from the deployed Worker while
working locally, so it is no longer selected.

These checks establish Cloudflare-network access for the samples at test time,
not availability of the entire catalog or a complete two-browser watch session.
Provider language, quality variants, and subtitle availability are title-dependent.
Deploy the updated Worker before deploying the app's new source descriptors.
