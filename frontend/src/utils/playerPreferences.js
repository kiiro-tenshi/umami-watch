// Storage may be unavailable in private browsing or when the quota is full.
export function readPreference(name, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(`umami-${name}`));
    if (value == null || typeof value !== typeof fallback || Array.isArray(value)) return fallback;
    return value;
  } catch { return fallback; }
}

export function writePreference(name, value) {
  try { localStorage.setItem(`umami-${name}`, JSON.stringify(value)); } catch { /* optional persistence */ }
}

export function mergeLocalProgress(uid, history) {
  const items = new Map(history.map(item => [item.id, item]));
  const timestamp = item => Math.max(item?.updatedAtMs || 0, item?.updatedAt?.toMillis?.() || 0);
  try {
    const prefix = `umami-progress-${uid}-`;
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const item = readPreference(key.slice('umami-'.length), {});
      const id = key.slice(prefix.length);
      if (item.contentId && timestamp(item) > timestamp(items.get(id))) items.set(id, { ...item, id });
    }
  } catch { /* Cloud history remains available when storage is blocked. */ }
  return [...items.values()].sort((a, b) => timestamp(b) - timestamp(a)).slice(0, 40);
}

export function clearLocalProgress(uid) {
  try {
    const prefix = `umami-progress-${uid}-`;
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) localStorage.removeItem(key);
    }
  } catch { /* Storage may be disabled. */ }
}
