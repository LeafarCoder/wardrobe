import { aiModelLabel } from "./ai-preferences.js";
import { tr } from "./i18n.js";

export function imageFallbackToast(notice, { completed = false } = {}) {
  if (!notice?.fromModel || !notice?.toModel) return null;
  const values = {
    deniedModel: aiModelLabel(notice.fromModel),
    fallbackModel: aiModelLabel(notice.toModel),
    reason: tr(notice.reason || "it could not accept this image"),
  };
  return {
    id: notice.id || `${notice.fromModel}:${notice.toModel}:${notice.createdAt || "fallback"}`,
    tone: "notice",
    title: tr("Trying another image model"),
    message: completed
      ? tr("{deniedModel} denied generating this image because {reason}. Wardrobe completed it with {fallbackModel} instead.", values)
      : tr("{deniedModel} denied generating this image because {reason}. Wardrobe is now trying {fallbackModel}.", values),
  };
}

export function withoutFallbackNotice(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const { fallbackNotice: _fallbackNotice, ...rest } = value;
  return rest;
}
