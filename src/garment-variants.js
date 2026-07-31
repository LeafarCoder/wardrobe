import { normalizeHexColor } from "./garment-recolor.js";

export const GARMENT_VARIANT_THRESHOLD_MIN = 40;
export const GARMENT_VARIANT_THRESHOLD_MAX = 160;
export const GARMENT_VARIANT_THRESHOLD_DEFAULT = 100;
export const GARMENT_VERSION_FAN_PARTS = new Set(["upperbody", "wholebody"]);
export const GARMENT_VERSION_FAN_MAX = 3;
export const GARMENT_VERSION_STACK_MAX = 5;

export function normalizeVariantThreshold(value) {
  if (value == null || value === "") return GARMENT_VARIANT_THRESHOLD_DEFAULT;
  const number = Number(value);
  if (!Number.isFinite(number)) return GARMENT_VARIANT_THRESHOLD_DEFAULT;
  return Math.round(Math.max(GARMENT_VARIANT_THRESHOLD_MIN, Math.min(GARMENT_VARIANT_THRESHOLD_MAX, number)));
}

export function garmentColorVariants(value = {}) {
  const source = Array.isArray(value) ? value : value.colorVariants;
  const seen = new Set();
  return (Array.isArray(source) ? source : []).flatMap((variant, index) => {
    if (!variant || typeof variant.image !== "string" || !variant.image.trim()) return [];
    const candidate = typeof variant.id === "string" && /^[a-z0-9-]{1,80}$/i.test(variant.id)
      ? variant.id
      : `variant-${index + 1}`;
    let id = candidate;
    let suffix = 2;
    while (seen.has(id)) {
      id = `${candidate}-${suffix}`;
      suffix += 1;
    }
    seen.add(id);
    const primaryColor = normalizeHexColor(variant.primaryColor);
    const secondaryColor = normalizeHexColor(variant.secondaryColor);
    return [{
      id,
      image: variant.image,
      preview: typeof variant.preview === "string" && variant.preview ? variant.preview : null,
      thumbnail: typeof variant.thumbnail === "string" && variant.thumbnail ? variant.thumbnail : null,
      primaryColor,
      secondaryColor,
      primaryThreshold: normalizeVariantThreshold(variant.primaryThreshold),
      secondaryThreshold: normalizeVariantThreshold(variant.secondaryThreshold),
      createdAt: typeof variant.createdAt === "string" ? variant.createdAt : null,
    }];
  });
}

export function selectedGarmentVariantId(value = {}) {
  const selected = typeof value.selectedColorVariantId === "string"
    ? value.selectedColorVariantId
    : null;
  return selected && garmentColorVariants(value).some((variant) => variant.id === selected)
    ? selected
    : null;
}

export function garmentVersionLayout(part, versionCount, hasHeroImage = true) {
  if (!hasHeroImage || !GARMENT_VERSION_FAN_PARTS.has(part) || !Number.isInteger(versionCount)) return "carousel";
  if (versionCount > 1 && versionCount <= GARMENT_VERSION_FAN_MAX) return "fan";
  if (versionCount > GARMENT_VERSION_FAN_MAX && versionCount <= GARMENT_VERSION_STACK_MAX) return "stack";
  return "carousel";
}

export function supportsGarmentVersionFan(part, versionCount, hasHeroImage = true) {
  return garmentVersionLayout(part, versionCount, hasHeroImage) === "fan";
}

export function garmentVersionFanSlot(index, versionCount) {
  if (
    !Number.isInteger(index)
    || !Number.isInteger(versionCount)
    || versionCount < 1
    || index < 0
    || index >= versionCount
  ) return 0;

  return index - ((versionCount - 1) / 2);
}
