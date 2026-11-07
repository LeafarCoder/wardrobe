import path from "node:path";
import { garmentColorVariants } from "../src/garment-variants.js";
import { normalizeWardrobePlans } from "../src/wardrobe-discovery.js";
import { normalizeWardrobeOutfits } from "../src/outfit-studio.js";
import { importGenerationCandidates } from "../src/import-candidates.js";

const ROLE_ORDER = ["original", "original-preview", "reference", "avatar", "background", "background-preview", "cutout", "candidate", "thumbnail", "image", "preview", "video", "hover-video", "crop", "mask"];
const TYPE_ORDER = ["profile", "garment", "outfit", "plan", "job", "unassigned"];
const linkFor = (entry) => ({ entityType: entry.entityType, entityId: entry.entityId, role: entry.role, lookId: entry.lookId || null });
const canonicalOrder = (entry) => [
  String(TYPE_ORDER.indexOf(entry.entityType)).padStart(2, "0"), entry.entityId || "",
  entry.lookId || "", String(ROLE_ORDER.indexOf(entry.role)).padStart(2, "0"), entry.role,
].join("\0");

export function mergeMediaContexts(...collections) {
  const result = new Map();
  for (const collection of collections) for (const entry of collection.values()) {
    const prior = result.get(entry.sourcePath);
    if (prior && prior.ownerUserId !== entry.ownerUserId) throw new Error("Conflicting media ownership");
    const chosen = !prior || canonicalOrder(entry) < canonicalOrder(prior) ? entry : prior;
    const links = [...(prior?.links || (prior ? [linkFor(prior)] : [])), ...(entry.links || [linkFor(entry)])];
    const unique = [...new Map(links.map((link) => [JSON.stringify(link), link])).values()]
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    result.set(entry.sourcePath, { ...chosen, links: unique });
  }
  return result;
}

function add(result, value, context, folder = "imported") {
  if (!value || typeof value !== "string") return;
  const fileName = path.basename(new URL(value, "http://localhost").pathname);
  const sourcePath = `${folder}/${fileName}`;
  const cachePolicy = /\.(webp|mp4)$/i.test(fileName) ? "private-immutable" : "private-no-store";
  const entry = { ...context, fileName, sourcePath, cachePolicy };
  const merged = mergeMediaContexts(result, new Map([[sourcePath, entry]]));
  result.set(sourcePath, merged.get(sourcePath));
}

export function garmentMediaContexts(record, { assets = [], sources = [], looks = [], candidate = null } = {}) {
  const result = new Map();
  const base = { ownerUserId: record.userId || null, entityType: "garment", entityId: record.id, mediaKind: "garment-media", createdAt: record.createdAt || null };
  const put = (value, role, extra = {}) => add(result, value, { ...base, role, ...extra });
  put(record.originalImage, "original"); put(record.originalPreview, "original-preview");
  for (const source of sources) {
    put(source.image, "original", { createdAt: source.addedAt || base.createdAt });
    put(source.preview, "original-preview", { createdAt: source.addedAt || base.createdAt });
  }
  put(record.image, "cutout"); put(record.imagePreview, "preview"); put(record.thumbnail, "thumbnail");
  for (const variant of garmentColorVariants(record)) {
    put(variant.image, "cutout", { createdAt: variant.createdAt || base.createdAt });
    put(variant.preview, "preview", { createdAt: variant.createdAt || base.createdAt });
    put(variant.thumbnail, "thumbnail", { createdAt: variant.createdAt || base.createdAt });
  }
  if (candidate) {
    for (const value of [candidate.image, candidate.preview, candidate.thumbnail]) put(value, "candidate", { createdAt: candidate.generatedAt || base.createdAt });
  }
  for (const look of looks) {
    const context = { lookId: look.id, mediaKind: "modeled-look", createdAt: look.generatedAt || base.createdAt };
    put(look.image, "image", context); put(look.preview, "preview", context);
    for (const clip of look.videoClips || []) {
      put(clip.video, "video", { ...context, mediaKind: "modeled-video", createdAt: clip.createdAt || context.createdAt });
      put(clip.hoverVideo, "hover-video", { ...context, mediaKind: "modeled-video", createdAt: clip.createdAt || context.createdAt });
    }
  }
  for (const asset of assets) {
    const name = path.basename(new URL(asset, "http://localhost").pathname);
    if (!result.has(`imported/${name}`)) put(asset, "cutout");
  }
  return result;
}

export function profileMediaContexts(profile) {
  const result = new Map();
  const base = { ownerUserId: profile.id, entityType: "profile", entityId: profile.id, createdAt: profile.createdAt || null };
  for (const reference of profile.referenceImages || []) {
    add(result, reference.fileName, { ...base, role: "reference", mediaKind: "profile-reference" }, `profiles/${profile.id}/references`);
    add(result, reference.avatarFileName, { ...base, role: "avatar", mediaKind: "profile-avatar" }, `profiles/${profile.id}/references`);
  }
  for (const background of profile.backgroundReferences || []) {
    add(result, background.fileName, { ...base, role: "background", mediaKind: "profile-background" }, `profiles/${profile.id}/backgrounds`);
    add(result, background.previewFileName, { ...base, role: "background-preview", mediaKind: "profile-background" }, `profiles/${profile.id}/backgrounds`);
  }
  for (const outfit of normalizeWardrobeOutfits(profile.wardrobeOutfits)) for (const look of outfit.modeledLooks) {
    const context = { ...base, entityType: "outfit", entityId: outfit.id, lookId: look.id, createdAt: look.generatedAt || outfit.createdAt, mediaKind: "modeled-look" };
    add(result, look.image, { ...context, role: "image" }); add(result, look.preview, { ...context, role: "preview" });
  }
  for (const plan of normalizeWardrobePlans(profile.wardrobePlans)) for (const outfit of plan.result.outfitIdeas) {
    const looks = outfit.modeledLooks?.length ? outfit.modeledLooks : outfit.modeledLook ? [outfit.modeledLook] : [];
    for (const look of looks) {
      const context = { ...base, entityType: "plan", entityId: plan.id, lookId: look.id || outfit.id || "legacy", createdAt: look.generatedAt || plan.createdAt, mediaKind: "modeled-look" };
      add(result, look.image, { ...context, role: "image" }); add(result, look.preview, { ...context, role: "preview" });
    }
  }
  return result;
}

export function jobMediaAssetNames(job) {
  return new Set([
    ...Object.values(job.internal || {}).filter((value) => typeof value === "string" && /\.[a-z0-9]+$/i.test(value)),
    ...Object.values(job.stages || {}).flatMap((stage) => [stage?.assetUrl, stage?.failedAssetUrl, stage?.cleanupPreviewUrl, stage?.maskSourceUrl, stage?.maskUrl, ...importGenerationCandidates(stage || {}).map((candidate) => candidate.assetUrl)]
      .filter(Boolean).map((value) => path.basename(new URL(value, "http://localhost").pathname))),
  ]);
}

export function jobMediaContexts(job) {
  const result = new Map();
  const base = { ownerUserId: job.userId || null, entityType: "job", entityId: job.id, createdAt: job.createdAt || null, mediaKind: "import-job" };
  const folder = `jobs/${job.id}`;
  add(result, job.internal?.originalFile, { ...base, role: "original" }, folder);
  add(result, job.internal?.cropFile, { ...base, role: "crop" }, folder);
  for (const [stageName, stage] of Object.entries(job.stages || {})) {
    const role = stageName === "modeled" ? "image" : stageName === "garment" ? "cutout" : stageName === "crop" ? "crop" : "source";
    for (const value of [stage?.assetUrl, stage?.failedAssetUrl, stage?.maskSourceUrl, ...importGenerationCandidates(stage || {}).map((candidate) => candidate.assetUrl)]) add(result, value, { ...base, role }, folder);
    add(result, stage?.maskUrl, { ...base, role: "mask" }, folder);
    add(result, stage?.cleanupPreviewUrl, { ...base, role: "preview" }, folder);
  }
  for (const name of jobMediaAssetNames(job)) if (!result.has(`${folder}/${name}`)) add(result, name, { ...base, role: "source" }, folder);
  return result;
}
