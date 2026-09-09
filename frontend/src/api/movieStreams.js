import { auth } from '../firebase.js';
import { buildProxiedHlsSources, probeAvailableHlsSources } from './gogoanime.js';

export async function resolveMovieStream(content, workerBase, overrides = {}) {
  if (!workerBase) throw new Error('Cloudflare HLS proxy is not configured.');
  const fetchFn = overrides.fetch || fetch;
  const token = await auth.currentUser?.getIdToken();
  const query = new URLSearchParams(content);
  const response = await fetchFn(`${import.meta.env.VITE_API_BASE_URL || ''}/api/movies/sources?${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not load movie sources.');
  const sources = buildProxiedHlsSources(data, workerBase);
  const probe = (overrides.probe || probeAvailableHlsSources)(sources, fetchFn, 1, 15_000);
  const source = await probe.first;
  if (!source) {
    probe.cancel();
    throw new Error('No working HLS stream is available for this title right now. Please retry later.');
  }
  return { source, sources: [source], complete: probe.complete, cancel: probe.cancel };
}
