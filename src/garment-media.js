export const GARMENT_MEDIA_ORIGINAL = "original";
export const GARMENT_MEDIA_GENERATED = "generated";

export function garmentMediaId(kind, id) {
  return `${kind === GARMENT_MEDIA_GENERATED ? "modeled" : "source"}:${id}`;
}

export function garmentMediaPreviewSource(media) {
  return media?.preview || media?.image || null;
}

export function garmentMediaPreloadSources(media = [], activeIndex = 0, radius = 1) {
  if (!Array.isArray(media) || !media.length) return [];
  const center = Number.isInteger(activeIndex) && activeIndex >= 0 && activeIndex < media.length
    ? activeIndex
    : 0;
  const distance = Math.max(0, Math.min(media.length - 1, Math.round(Number(radius) || 0)));
  const offsets = [0];
  for (let step = 1; step <= distance; step += 1) offsets.push(step, -step);
  return [...new Set(offsets.map((offset) => (
    garmentMediaPreviewSource(media[(center + offset + media.length) % media.length])
  )).filter(Boolean))];
}

function uniqueMedia(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    if (!entry.id || seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

export function orderedGarmentMedia({ sourcePhotos = [], modeledLooks = [], mediaOrder = [] } = {}) {
  const generated = uniqueMedia(modeledLooks
    .filter((look) => look?.id && look?.image)
    .map((look) => ({
      id: garmentMediaId(GARMENT_MEDIA_GENERATED, look.id),
      kind: GARMENT_MEDIA_GENERATED,
      sourceId: look.id,
      image: look.image,
      preview: look.preview || look.image,
      data: look,
    })))
    .reverse();
  const originals = uniqueMedia(sourcePhotos
    .filter((photo) => photo?.id && photo?.image)
    .map((photo) => ({
      id: garmentMediaId(GARMENT_MEDIA_ORIGINAL, photo.id),
      kind: GARMENT_MEDIA_ORIGINAL,
      sourceId: photo.id,
      image: photo.image,
      preview: photo.preview || photo.image,
      data: photo,
    })));
  const available = [...generated, ...originals];
  const byId = new Map(available.map((entry) => [entry.id, entry]));
  const seen = new Set();
  const saved = Array.isArray(mediaOrder) ? mediaOrder.flatMap((id) => {
    if (typeof id !== "string" || seen.has(id) || !byId.has(id)) return [];
    seen.add(id);
    return [byId.get(id)];
  }) : [];
  if (!saved.length) return available;

  const newGenerated = generated.filter((entry) => !seen.has(entry.id));
  const newOriginals = originals.filter((entry) => !seen.has(entry.id));
  return [...newGenerated, ...saved, ...newOriginals];
}

export function normalizeGarmentMediaOrder(record = {}) {
  return orderedGarmentMedia(record).map((entry) => entry.id);
}

export function isCompleteGarmentMediaOrder(record = {}, ids) {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) return false;
  const available = orderedGarmentMedia({ ...record, mediaOrder: [] }).map((entry) => entry.id);
  return ids.length === available.length
    && new Set(ids).size === ids.length
    && available.every((id) => ids.includes(id));
}

export function moveGarmentMedia(ids, draggedId, targetId) {
  if (!Array.isArray(ids) || draggedId === targetId) return Array.isArray(ids) ? [...ids] : [];
  const from = ids.indexOf(draggedId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0) return [...ids];
  const next = [...ids];
  const [dragged] = next.splice(from, 1);
  next.splice(to, 0, dragged);
  return next;
}
