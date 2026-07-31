const MAX_WARM_VIDEOS = 3;
const warmedVideos = new Map();

function releaseOldestVideo() {
  if (warmedVideos.size <= MAX_WARM_VIDEOS) return;
  const [oldestSource, oldest] = warmedVideos.entries().next().value || [];
  if (!oldestSource) return;
  warmedVideos.delete(oldestSource);
  oldest.promise.then((resolved) => {
    if (resolved !== oldestSource && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(resolved);
    }
  }).catch(() => {});
}

export function warmVideo(src) {
  if (!src || typeof fetch !== "function") return Promise.resolve(src);
  const existing = warmedVideos.get(src);
  if (existing) {
    warmedVideos.delete(src);
    warmedVideos.set(src, existing);
    return existing.promise;
  }
  const entry = { promise: null, resolved: null };
  entry.promise = fetch(src, {
    credentials: "same-origin",
    cache: "force-cache",
    priority: "low",
  }).then((response) => {
    if (!response.ok) throw new Error(`Video preload failed (${response.status})`);
    return response.blob();
  }).then((blob) => (
    blob.size && typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
      ? URL.createObjectURL(blob)
      : src
  )).catch(() => src);
  entry.promise.then((resolved) => { entry.resolved = resolved; }).catch(() => {});
  warmedVideos.set(src, entry);
  releaseOldestVideo();
  return entry.promise;
}

export function warmedVideoSource(src) {
  return warmedVideos.get(src)?.resolved || null;
}

export function clearWarmedVideos() {
  for (const [src, entry] of warmedVideos) {
    entry.promise.then((resolved) => {
      if (resolved !== src && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(resolved);
    }).catch(() => {});
  }
  warmedVideos.clear();
}
