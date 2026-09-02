import { searchGogoanime, getGogoanimeSource, pickBestShow, buildProxiedHlsSources, probeAvailableHlsSources } from './gogoanime.js';
import { getMegaVidSource } from './megavid.js';

async function resolvePrimary(animeData, epNum, workerBase, dependencies) {
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
  const candidates = dependencies.build(data, workerBase);
  return probeCandidates(candidates, dependencies.probe, 'primary');
}

async function probeCandidates(candidates, probe, provider) {
  const sourceProbe = probe(candidates);
  const source = await sourceProbe.first;
  if (!source) {
    sourceProbe.cancel();
    throw new Error(`No working HLS source was found on the ${provider} provider.`);
  }
  return {
    source,
    sources: [source],
    complete: sourceProbe.complete,
    cancel: sourceProbe.cancel,
    provider,
  };
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

  try {
    return await resolvePrimary(animeData, epNum, workerBase, dependencies);
  } catch (primaryError) {
    if (!animeData.idMal) {
      const error = new Error('Streaming providers are temporarily unavailable. Please retry in a moment.');
      error.cause = primaryError;
      throw error;
    }

    try {
      const data = await dependencies.backupSource(animeData.idMal, epNum);
      const candidates = dependencies.build(data, workerBase);
      return await probeCandidates(candidates, dependencies.probe, 'backup');
    } catch (backupError) {
      const error = new Error('No working stream is available for this episode right now. Please retry in a moment.');
      error.cause = { primaryError, backupError };
      throw error;
    }
  }
}
