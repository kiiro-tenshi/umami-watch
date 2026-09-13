import { searchGogoanime, getGogoanimeSource, pickBestShow, buildProxiedHlsSources, probeAvailableHlsSources } from './gogoanime.js';
import { getMegaVidSource } from './megavid.js';

export const MAX_VERIFIED_ANIME_SOURCES = 5;

async function getAniNekoCandidates(animeData, epNum, workerBase, dependencies) {
  const englishTitle = animeData.title?.english || '';
  const romajiTitle = animeData.title?.romaji || '';
  let matchedShow = null;

  if (englishTitle) {
    const { shows } = await dependencies.search(englishTitle);
    matchedShow = dependencies.pick(shows, englishTitle);
  }
  if (!matchedShow && romajiTitle && romajiTitle !== englishTitle) {
    const { shows } = await dependencies.search(romajiTitle);
    matchedShow = dependencies.pick(shows, romajiTitle);
  }
  if (!matchedShow) throw new Error('Anime not found on the primary streaming service.');

  const data = await dependencies.primarySource(matchedShow.slug, epNum);
  return dependencies.build(data, workerBase);
}

function labelProviderSources(sources, provider) {
  const providerLabel = provider === 'megavid' ? 'MegaVid' : 'AniNeko';
  return sources.map(source => ({
    ...source,
    provider,
    label: `${providerLabel} - ${source.label || 'HLS'}`,
  }));
}

function mergeVerifiedSources(firstSource, groups) {
  const seen = new Set();
  const priority = source => source.provider === 'anineko' ? (source.tracks?.length ? 0 : 1) : 2;
  return [firstSource, ...groups.flat().sort((a, b) => priority(a) - priority(b))].filter(source => {
    if (!source?.url || seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  }).slice(0, MAX_VERIFIED_ANIME_SOURCES);
}

function friendlyUnavailableError(errors) {
  const error = new Error('No working stream is available for this episode right now. Please retry in a moment.');
  error.cause = errors;
  return error;
}

function startProvider(provider, loadCandidates, dependencies, activeProbes, isCancelled) {
  return (async () => {
    const candidates = labelProviderSources(await loadCandidates(), provider);
    if (isCancelled()) throw new Error('Source check cancelled.');

    // Probe both groups concurrently but select a soft-sub source first.
    const soft = candidates.filter(source => source.tracks?.length);
    const other = candidates.filter(source => !source.tracks?.length);
    const groups = provider === 'anineko' && soft.length && other.length ? [soft, other] : [candidates];
    const probes = groups.map(group => {
      const probe = dependencies.probe(group, undefined, MAX_VERIFIED_ANIME_SOURCES, 10_000, { retry: true });
      activeProbes.add(probe);
      return probe;
    });
    const firsts = probes.map(probe => probe.first.then(source => {
      if (!source) throw new Error(`No working HLS source was found on the ${provider} provider.`);
      return source;
    }));
    firsts.forEach(promise => { promise.catch(() => {}); });
    const source = await firsts[0].catch(() => firstSuccessful(firsts.slice(1)));
    return {
      source,
      complete: Promise.all(probes.map(probe => probe.complete)).then(groups => groups.flat()),
      provider,
    };
  })();
}

async function firstSuccessful(promises) {
  const errors = [];
  return new Promise((resolve, reject) => {
    let remaining = promises.length;
    promises.forEach((promise, index) => {
      promise.then(resolve).catch(error => {
        errors[index] = error;
        remaining -= 1;
        if (remaining === 0) reject(errors);
      });
    });
    if (remaining === 0) reject(errors);
  });
}

export async function resolveAnimeStream(animeData, epNum, workerBase, overrides = {}) {
  const dependencies = {
    search: searchGogoanime,
    pick: pickBestShow,
    primarySource: getGogoanimeSource,
    backupSource: getMegaVidSource,
    build: buildProxiedHlsSources,
    probe: probeAvailableHlsSources,
    ...overrides,
  };

  let cancelled = false;
  const activeProbes = new Set();
  const providers = [];
  // Caption files remain usable even when the same episode's video mirrors fail.
  const primaryCandidates = getAniNekoCandidates(animeData, epNum, workerBase, dependencies);
  const primaryCaptions = primaryCandidates.then(candidates =>
    candidates.find(source => source.tracks?.length)?.tracks || []
  ).catch(() => []);

  // Resolve MegaVid concurrently as a fallback while preferring AniNeko.
  if (animeData.idMal) {
    providers.push({
      name: 'megavid',
      load: async () => dependencies.build(
        await dependencies.backupSource(animeData.idMal, epNum, 'sub'),
        workerBase,
      ),
    });
  }
  providers.push({
    name: 'anineko',
    load: () => primaryCandidates,
  });

  const providerRuns = providers.map(provider => startProvider(
    provider.name,
    provider.load,
    dependencies,
    activeProbes,
    () => cancelled,
  ));

  providerRuns.forEach(run => { run.catch(() => {}); });

  let winner;
  try {
    const primaryIndex = providers.findIndex(provider => provider.name === 'anineko');
    winner = await providerRuns[primaryIndex].catch(() => firstSuccessful(
      providerRuns.filter((_, index) => index !== primaryIndex),
    ));
  } catch (errors) {
    throw friendlyUnavailableError(errors);
  }

  if (winner.provider === 'megavid' && !winner.source.tracks?.length) {
    let timer;
    try {
      // Bound the caption wait so a primary-provider outage cannot stall video.
      winner.source.tracks = await Promise.race([
        primaryCaptions,
        new Promise(resolve => { timer = setTimeout(() => resolve([]), 3000); }),
      ]);
    } finally { clearTimeout(timer); }
  }

  const complete = Promise.allSettled(providerRuns.map(async runPromise => {
    const run = await runPromise;
    return run.complete;
  })).then(results => mergeVerifiedSources(
    winner.source,
    results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []),
  ));

  return {
    source: winner.source,
    sources: [winner.source],
    complete,
    cancel: () => {
      cancelled = true;
      activeProbes.forEach(probe => probe.cancel());
      activeProbes.clear();
    },
    provider: winner.provider,
  };
}
