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
  return [firstSource, ...groups.flat()].filter(source => {
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

    // Every displayed source must pass the Worker probe, which verifies both the
    // HLS manifest and an actual media segment.
    const sourceProbe = dependencies.probe(
      candidates,
      undefined,
      MAX_VERIFIED_ANIME_SOURCES,
    );
    activeProbes.add(sourceProbe);
    const source = await sourceProbe.first;
    if (!source) {
      sourceProbe.cancel();
      throw new Error(`No working HLS source was found on the ${provider} provider.`);
    }

    return {
      source,
      complete: sourceProbe.complete,
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

  // MegaVid remains preferred, but AniNeko starts at the same time so it can
  // supply additional verified mirrors or take over immediately on failure.
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
    load: () => getAniNekoCandidates(animeData, epNum, workerBase, dependencies),
  });

  const providerRuns = providers.map(provider => startProvider(
    provider.name,
    provider.load,
    dependencies,
    activeProbes,
    () => cancelled,
  ));

  let winner;
  try {
    // Preserve the user's MegaVid preference without delaying AniNeko setup:
    // AniNeko resolves and probes concurrently, so it is ready immediately if
    // MegaVid fails.
    winner = providers[0]?.name === 'megavid'
      ? await providerRuns[0].catch(() => firstSuccessful(providerRuns.slice(1)))
      : await firstSuccessful(providerRuns);
  } catch (errors) {
    throw friendlyUnavailableError(errors);
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
