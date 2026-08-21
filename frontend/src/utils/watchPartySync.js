export function reconcileRoomStream(currentUrl, data) {
  if (!data?.streamUrl) return null;

  const streamType = data.streamType
    || (data.streamUrl.includes('.m3u8') ? 'hls' : 'direct');
  const sources = data.streamSources?.length
    ? data.streamSources
    : [{ type: streamType, url: data.streamUrl, label: 'Stream', tracks: data.tracks || [] }];
  const foundIndex = sources.findIndex(source => source.url === data.streamUrl);
  const activeIndex = foundIndex >= 0 ? foundIndex : 0;

  return {
    streamChanged: currentUrl !== data.streamUrl,
    streamUrl: data.streamUrl,
    sources,
    activeIndex,
    tracks: sources[activeIndex]?.tracks || data.tracks || [],
  };
}

export function shouldJoinRoomSocket(lastSocketId, currentSocketId) {
  return Boolean(currentSocketId && lastSocketId !== currentSocketId);
}

export function canApplySyncPosition(player) {
  const media = player?.media || player;
  if (!media) return false;
  if (media.seeking) return false;
  return typeof media.readyState !== 'number' || media.readyState >= 3;
}
