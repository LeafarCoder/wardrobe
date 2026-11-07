import path from "node:path";

export const MEDIA_LAYOUT_VERSION = 2;

const ROLE_DIRECTORIES = Object.freeze({
  original: "originals", source: "originals", "original-preview": "original-previews",
  cutout: "cutouts", garment: "cutouts", preview: "previews", "garment-preview": "previews",
  derivative: "previews", thumbnail: "thumbnails", candidate: "candidates",
  modeled: "images", "modeled-look": "images", "generated-look": "images", image: "images",
  "modeled-preview": "previews", video: "videos", "modeled-video": "videos", "hover-video": "hover-videos",
  reference: "references", "profile-reference": "references", avatar: "avatars", "profile-avatar": "avatars",
  background: "backgrounds", "profile-background": "backgrounds", "background-preview": "background-previews",
  mask: "masks", crop: "crops", "cleanup-preview": "previews",
});

function segment(value, label) {
  const text = String(value || "");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(text) || text === "." || text === "..") {
    throw new Error(`Invalid media ${label}`);
  }
  return text;
}

/** IDs/source paths remain in the catalog; object keys describe their purpose. */
export function mediaObjectKey({ ownerUserId, entityType = "unassigned", entityId,
  role = "image", assetId, sha256, fileName, lookId = null } = {}) {
  const id = segment(assetId, "asset ID");
  const digest = String(sha256 || "");
  if (!/^[a-f0-9]{64}$/i.test(digest)) throw new Error("Invalid media SHA-256");
  const extension = path.extname(String(fileName || "")).toLowerCase();
  if (!/^\.[a-z0-9]{1,12}$/.test(extension)) throw new Error("Invalid media extension");
  const filename = `${id}-${digest.slice(0, 16).toLowerCase()}${extension}`;
  if (!ownerUserId) {
    return { key: `_unassigned/media/recovery/${filename}`, layoutVersion: MEDIA_LAYOUT_VERSION,
      category: "recovery", role, entityType: "unassigned", entityId: null, lookId: null };
  }
  const owner = segment(ownerUserId, "owner ID");
  const directory = ROLE_DIRECTORIES[role] || segment(role, "role");
  let parts;
  let category;
  if (entityType === "profile") {
    category = "profile";
    parts = [owner, "media", category, directory];
  } else if (entityType === "garment") {
    category = "garments";
    const garment = segment(segment(entityId, "garment ID").replace(/^import-/, ""), "garment ID");
    parts = [owner, "media", category, garment];
    if (lookId) parts.push("looks", segment(lookId, "look ID"));
    parts.push(directory);
  } else if (entityType === "outfit" || entityType === "plan") {
    category = entityType === "outfit" ? "outfits" : "plans";
    parts = [owner, "media", category, segment(entityId, "entity ID")];
    if (lookId) parts.push("looks", segment(lookId, "look ID"));
    parts.push(directory);
  } else if (entityType === "job") {
    category = "processing";
    parts = [owner, "media", category, segment(entityId, "job ID"), directory];
  } else {
    // Owned recovery media retains access policy; never invent an entity link.
    category = "recovery";
    parts = [owner, "media", category];
  }
  return { key: [...parts, filename].join("/"), layoutVersion: MEDIA_LAYOUT_VERSION,
    category, role, entityType, entityId: entityId || null, lookId };
}
