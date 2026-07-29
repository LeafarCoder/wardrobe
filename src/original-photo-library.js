function assetKey(source) {
  return typeof source === "string" ? source.split(/[?#]/, 1)[0] : "";
}

function sourcePhotoUploadId(item, photo) {
  if (typeof photo.importUploadId === "string" && photo.importUploadId) {
    return photo.importUploadId;
  }
  const photoMatchesPrimary = assetKey(photo.image) === assetKey(item.originalImage)
    || (photo.importJobId && photo.importJobId === item.importJobId);
  return photoMatchesPrimary && typeof item.importUploadId === "string"
    ? item.importUploadId
    : "";
}

function sourcePhotoKey(item, photo) {
  const uploadId = sourcePhotoUploadId(item, photo);
  return uploadId ? `upload:${uploadId}` : assetKey(photo.image);
}

function sourcePhotosForItem(item = {}) {
  const photos = Array.isArray(item.sourcePhotos)
    ? item.sourcePhotos.filter((photo) => photo?.image)
    : [];
  if (photos.length) return photos;
  if (!item.originalImage) return [];
  return [{
    id: "original",
    image: item.originalImage,
    preview: item.originalPreview || null,
    sourceFileName: item.sourceFileName || null,
    addedAt: item.createdAt || null,
  }];
}

function garmentSummary(item) {
  return {
    id: item.id,
    name: item.name || "",
    part: item.part || "",
    brand: item.brand || "",
    color: item.color || null,
    image: item.image || null,
    preview: item.imagePreview || item.image || null,
    thumbnail: item.thumbnail || item.imagePreview || item.image || null,
  };
}

function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function collectOriginalPhotoLibrary(items = []) {
  const photos = new Map();

  items.forEach((item, itemIndex) => {
    if (!item?.id) return;
    sourcePhotosForItem(item).forEach((photo, photoIndex) => {
      const imageAssetKey = assetKey(photo.image);
      if (!imageAssetKey) return;
      const key = sourcePhotoKey(item, photo);
      const existing = photos.get(key) || {
        id: key,
        image: photo.image,
        preview: photo.preview || null,
        sourceFileName: photo.sourceFileName || null,
        addedAt: photo.addedAt || item.createdAt || null,
        firstSeen: (itemIndex * 1000) + photoIndex,
        garments: [],
      };

      if (!existing.preview && photo.preview) existing.preview = photo.preview;
      if (!existing.sourceFileName && photo.sourceFileName) existing.sourceFileName = photo.sourceFileName;
      if (!existing.addedAt && (photo.addedAt || item.createdAt)) {
        existing.addedAt = photo.addedAt || item.createdAt;
      }
      if (!existing.garments.some((garment) => garment.id === item.id)) {
        existing.garments.push(garmentSummary(item));
      }
      photos.set(key, existing);
    });
  });

  return [...photos.values()].sort((first, second) => (
    timestamp(second.addedAt) - timestamp(first.addedAt)
    || first.firstSeen - second.firstSeen
  ));
}
