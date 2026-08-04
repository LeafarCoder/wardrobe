import { RECOMMENDED_VIDEO_MODEL, VIDEO_GENERATION_MODELS } from "./video-generation.js";

export const AI_IMAGE_RESOLUTIONS = Object.freeze([
  Object.freeze({ id: "512", label: "512 px", note: "Lowest cost and fastest for previews." }),
  Object.freeze({ id: "1K", label: "1K", note: "Standard detail for everyday generated images." }),
  Object.freeze({ id: "2K", label: "2K", note: "More detail for larger displays and crops." }),
  Object.freeze({ id: "4K", label: "4K", note: "Maximum detail with higher generation cost and latency." }),
]);

export const DEFAULT_AI_IMAGE_RESOLUTION = "512";

export const AI_TASKS = [
  {
    id: "analysisModel",
    fallbackId: "analysisFallbackModel",
    operation: "analysis",
    label: "Photo analysis",
    description: "Finds every garment, draws its crop box, and suggests its name, category, colors, tags, materials, fit, and seasons.",
    options: [
      { id: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", badge: "Lowest cost", pricing: "Input $0.25 · output $1.50 / 1M tokens", note: "Fast, inexpensive multimodal analysis for clear photos and bulk imports." },
      { id: "google/gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite", badge: "Recommended", pricing: "Input $0.30 · output $2.50 / 1M tokens", note: "The best default balance for identifying garments and returning structured metadata." },
      { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash", badge: "High quality", pricing: "Input $1.50 · output $9.00 / 1M tokens", note: "Stronger multimodal reasoning for crowded outfits, overlaps, and ambiguous accessories." },
      { id: "google/gemini-3.6-flash", label: "Gemini 3.6 Flash", badge: "Latest quality", pricing: "Input $1.50 · output $7.50 / 1M tokens", note: "The latest top-tier Flash option for the most difficult photos and crop decisions." },
    ],
  },
  {
    id: "garmentModel",
    fallbackId: "garmentFallbackModel",
    operation: "garment",
    label: "Clean garment generation",
    description: "Reconstructs the detected piece as a centered, person-free product cutout.",
    options: [
      {
        id: "black-forest-labs/flux.2-klein-4b",
        label: "FLUX.2 Klein 4B",
        badge: "Lowest cost",
        pricing: "Input references included · output $0.014 / megapixel",
        note: "Lowest price. This route does not offer zero data retention, so the provider may keep your garment images or request data under its own policy.",
        zeroDataRetention: false,
      },
      { id: "bytedance-seed/seedream-4.5", label: "Seedream 4.5", badge: "Recommended", pricing: "Input references included · output $0.04 / image", note: "Predictable low-cost garment reconstruction with multiple reference images and zero-data-retention routes." },
      { id: "google/gemini-3.1-flash-lite-image", label: "Gemini 3.1 Flash Lite Image", badge: "Private alternative", pricing: "Input text/images $0.25 / 1M tokens · output images $30 / 1M tokens", note: "Cost-efficient image editing with up to 14 references and zero-data-retention routes." },
      { id: "google/gemini-3.1-flash-image", label: "Gemini 3.1 Flash Image", badge: "Better detail", pricing: "Input text/images $0.50 / 1M tokens · output images $60 / 1M tokens", note: "Better construction and pattern fidelity, with up to 14 input references." },
      { id: "google/gemini-3-pro-image", label: "Gemini 3 Pro Image", badge: "Highest quality", pricing: "Input $2.00 / 1M image tokens · output $120 / 1M image tokens", note: "Top-tier reconstruction when small accessories or intricate details matter more than price." },
    ],
  },
  {
    id: "modeledModel",
    fallbackId: "modeledFallbackModel",
    operation: "modeled",
    label: "Modeled look · one reference",
    description: "Creates a styled editorial image using one identity photo and the exact garment.",
    options: [
      { id: "google/gemini-3.1-flash-lite-image", label: "Gemini 3.1 Flash Lite Image", badge: "Lowest cost", pricing: "Input text/images $0.25 / 1M tokens · output images $30 / 1M tokens", note: "Use when one clear identity photo is available and economy matters more than the strongest identity match." },
      { id: "bytedance-seed/seedream-4.5", label: "Seedream 4.5", badge: "Flat price", pricing: "Input references included · output $0.04 / image", note: "A predictable-price alternative when another provider refuses an ordinary fashion image." },
      { id: "google/gemini-3.1-flash-image", label: "Gemini 3.1 Flash Image", badge: "Recommended", pricing: "Input text/images $0.50 / 1M tokens · output images $60 / 1M tokens", note: "Nano Banana 2: the default for stronger face, fabric, and garment consistency." },
      { id: "google/gemini-3-pro-image", label: "Gemini 3 Pro Image", badge: "Highest quality", pricing: "Input $2.00 / 1M image tokens · output $120 / 1M image tokens", note: "Top-tier editorial fidelity when price is secondary." },
    ],
  },
  {
    id: "modeledMultiReferenceModel",
    fallbackId: "modeledMultiReferenceFallbackModel",
    operation: "modeled-multi",
    label: "Modeled look · two or three references",
    description: "Combines complementary identity photos for a stronger face and body match.",
    options: [
      { id: "google/gemini-3.1-flash-lite-image", label: "Gemini 3.1 Flash Lite Image", badge: "Lowest cost", pricing: "Input text/images $0.25 / 1M tokens · output images $30 / 1M tokens", note: "Accepts up to 14 references, but identity matching is less reliable than the stronger models." },
      { id: "bytedance-seed/seedream-4.5", label: "Seedream 4.5", badge: "Flat price", pricing: "Input references included · output $0.04 / image", note: "Supports up to 14 references at a predictable price and is useful as an alternative route." },
      { id: "google/gemini-3.1-flash-image", label: "Gemini 3.1 Flash Image", badge: "Recommended", pricing: "Input text/images $0.50 / 1M tokens · output images $60 / 1M tokens", note: "Nano Banana 2: best balance for combining two or three identity references with garments." },
      { id: "google/gemini-3-pro-image", label: "Gemini 3 Pro Image", badge: "Highest quality", pricing: "Input $2.00 / 1M image tokens · output $120 / 1M image tokens", note: "Strongest multi-reference fidelity when price is secondary." },
    ],
  },
  {
    id: "videoModel",
    operation: "modeled-video",
    label: "Modeled look video",
    description: "Animates a saved modeled look into a short identity- and outfit-preserving video clip.",
    options: VIDEO_GENERATION_MODELS.map((model) => ({
      id: model.id,
      label: model.label,
      badge: model.id === RECOMMENDED_VIDEO_MODEL ? "Recommended" : model.badge,
      pricing: model.pricing,
      note: model.note,
    })),
  },
  {
    id: "plannerModel",
    fallbackId: "plannerFallbackModel",
    operation: "planner",
    label: "Trip and event planner",
    description: "Uses wardrobe metadata, destination, dates, climate expectations, and preferences to build outfits and a missing-items list.",
    options: [
      { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", badge: "Lowest cost", pricing: "Input $0.10 · output $0.40 / 1M tokens", note: "The least expensive reliable option for straightforward events and short trips." },
      { id: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", badge: "Economy", pricing: "Input $0.25 · output $1.50 / 1M tokens", note: "Good inexpensive reasoning for routine packing and event plans." },
      { id: "google/gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite", badge: "Recommended", pricing: "Input $0.30 · output $2.50 / 1M tokens", note: "Best default balance for varied outfits, climate context, and missing-item suggestions." },
      { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash", badge: "High quality", pricing: "Input $1.50 · output $9.00 / 1M tokens", note: "More deliberate planning for longer trips, mixed dress codes, and large wardrobes." },
      { id: "google/gemini-3.6-flash", label: "Gemini 3.6 Flash", badge: "Latest quality", pricing: "Input $1.50 · output $7.50 / 1M tokens", note: "Latest top-tier Flash reasoning for complex itineraries and maximum variety." },
    ],
  },
];

export const DEFAULT_AI_PREFERENCES = Object.freeze({
  imageResolution: DEFAULT_AI_IMAGE_RESOLUTION,
  ...Object.fromEntries(AI_TASKS.flatMap((task) => [[task.id, ""], [task.fallbackId, ""]])),
});

export const LEGACY_AI_MODEL_IDS = Object.freeze({
  "google/gemini-3.1-flash": "google/gemini-3.6-flash",
});

export function migrateAiModelId(model) {
  const normalized = typeof model === "string" ? model.trim().slice(0, 160) : "";
  return LEGACY_AI_MODEL_IDS[normalized] || normalized;
}

export function normalizeAiImageResolution(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return AI_IMAGE_RESOLUTIONS.some((option) => option.id.toUpperCase() === normalized)
    ? AI_IMAGE_RESOLUTIONS.find((option) => option.id.toUpperCase() === normalized).id
    : DEFAULT_AI_IMAGE_RESOLUTION;
}

export function normalizeAiPreferences(value = {}) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    imageResolution: normalizeAiImageResolution(input.imageResolution),
    ...Object.fromEntries(AI_TASKS.flatMap((task) => {
      const model = migrateAiModelId(input[task.id]);
      const preferred = task.options.some((option) => option.id === model) ? model : "";
      const fallbackModel = migrateAiModelId(input[task.fallbackId]);
      const fallback = fallbackModel !== preferred && task.options.some((option) => option.id === fallbackModel)
        ? fallbackModel
        : "";
      return [[task.id, preferred], [task.fallbackId, fallback]];
    })),
  };
}

export function aiModelLabel(model) {
  const normalized = typeof model === "string" ? model.trim() : "";
  if (!normalized) return "another image model";
  return AI_TASKS
    .flatMap((task) => task.options)
    .find((option) => option.id === normalized)?.label || normalized;
}

export function recommendedAiOption(task) {
  return task?.options?.find((option) => option.badge === "Recommended") || task?.options?.[0] || null;
}

export function operationGroup(operation) {
  const normalized = String(operation || "other");
  if (normalized === "modeled-outfit" || normalized.startsWith("outfit-")) return "outfit";
  if (normalized.startsWith("garment")) return "garment";
  return normalized.startsWith("modeled") ? "modeled" : normalized;
}

export function formatAiCost(cost) {
  if (!Number.isFinite(cost)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(cost);
}

export const AI_OPERATION_LABELS = {
  analysis: "Photo analysis",
  garment: "Clean garments",
  modeled: "Modeled looks",
  "modeled-video": "Modeled look videos",
  outfit: "Outfit Studio",
  planner: "Trip and event plans",
  other: "Other AI",
};

export const AI_ACTIVITY_LABELS = {
  import: "Imported photo",
  modeled: "Modeled look",
  "modeled-video": "Modeled look video",
  outfit: "Outfit Studio look",
  planner: "Trip and event plan",
  other: "Other AI activity",
};

const IMPORT_OPERATION_GROUPS = new Set(["analysis", "garment"]);

export function publicAiRequest(entry) {
  return {
    id: entry.id,
    operation: entry.operation,
    operationGroup: entry.operationGroup,
    label: AI_OPERATION_LABELS[entry.operationGroup] || AI_OPERATION_LABELS.other,
    provider: entry.provider,
    model: entry.model,
    cost: Number.isFinite(entry.cost) ? entry.cost : null,
    completed: Boolean(entry.completed),
    status: entry.status,
    durationMs: entry.durationMs,
    itemName: entry.itemName || null,
    jobId: entry.jobId || null,
    garmentId: entry.garmentId || null,
    planId: entry.planId || null,
    outfitId: entry.outfitId || null,
    outfitTitle: entry.outfitTitle || null,
    wardrobeUserId: entry.wardrobeUserId || entry.userId || null,
    fallbackFrom: entry.fallbackFrom || null,
    upstream: entry.upstream || null,
    inputTokens: Number.isFinite(entry.inputTokens) ? entry.inputTokens : null,
    outputTokens: Number.isFinite(entry.outputTokens) ? entry.outputTokens : null,
    totalTokens: Number.isFinite(entry.totalTokens) ? entry.totalTokens : null,
    createdAt: entry.createdAt,
  };
}

export function aiUsageWardrobeUserId(entry = {}) {
  return entry?.wardrobeUserId || entry?.userId || null;
}

export function aiUsageEntriesForWardrobe(entries = [], wardrobeUserId) {
  return (Array.isArray(entries) ? entries : []).filter(
    (entry) => aiUsageWardrobeUserId(entry) === wardrobeUserId,
  );
}

function costOf(entry) {
  return Number.isFinite(entry?.cost) ? entry.cost : 0;
}

function newestTimestamp(entries = [], fallback = null) {
  return entries.reduce(
    (latest, entry) => (String(entry.createdAt) > String(latest || "") ? entry.createdAt : latest),
    fallback,
  );
}

// Finds the photo an import actually came from. Records written before source
// photos preserved `importUploadId` are matched through the job ids the upload
// created instead, so older imports still show their original photo.
export function uploadedPhotoFor(uploadId, items = [], garments = []) {
  const sourcePhotos = garments.flatMap((garment) => (
    (Array.isArray(garment.sourcePhotos) ? garment.sourcePhotos : [])
      .map((photo) => ({ ...photo, importJobId: photo.importJobId || garment.importJobId || null }))
  ));
  const byUpload = sourcePhotos.find((photo) => photo.importUploadId === uploadId);
  if (byUpload) return byUpload;
  const jobIds = new Set(items.map((item) => item?.jobId).filter(Boolean));
  if (!jobIds.size) return null;
  return sourcePhotos.find((photo) => photo.importJobId && jobIds.has(photo.importJobId)) || null;
}

function activityTotals(requests = []) {
  return {
    requestCount: requests.length,
    unpricedRequestCount: requests.filter((entry) => !Number.isFinite(entry.cost)).length,
    failedRequestCount: requests.filter((entry) => !entry.completed).length,
    totalCost: requests.reduce((total, entry) => total + costOf(entry), 0),
  };
}

// A single AI call is rarely meaningful on its own. Callers want to see the thing
// they did — imported this photo, modeled this garment, planned this trip — with
// every request it caused underneath it.
export function aiUsageActivities(entries = [], {
  uploads = [],
  garments = [],
  plans = [],
  outfits = [],
} = {}) {
  const garmentById = new Map(garments.map((garment) => [garment.id, garment]));
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const outfitById = new Map(outfits.map((outfit) => [outfit.id, outfit]));
  const uploadById = new Map(uploads.map((upload) => [upload.id, upload]));
  const uploadByJob = new Map();
  const uploadByGarment = new Map();
  for (const upload of uploads) {
    for (const item of Array.isArray(upload.items) ? upload.items : []) {
      if (item?.jobId) uploadByJob.set(item.jobId, upload.id);
      if (item?.garmentId) uploadByGarment.set(item.garmentId, upload.id);
    }
  }

  const uploadRequests = new Map(uploads.map((upload) => [upload.id, []]));
  const modeledRequests = new Map();
  const plannerRequests = new Map();
  const outfitRequests = new Map();
  const otherRequests = [];

  for (const entry of entries) {
    if (entry.operationGroup === "outfit") {
      const outfitKey = entry.outfitId || `outfit:${entry.id}`;
      const bucket = outfitRequests.get(outfitKey) || [];
      bucket.push(entry);
      outfitRequests.set(outfitKey, bucket);
      continue;
    }
    if (entry.operationGroup === "planner" || entry.operationGroup === "modeled") {
      // A modeled look and a plan are their own activities even when they descend
      // from an imported photo, so they are grouped before the upload is consulted.
      const planKey = entry.planId || (entry.operationGroup === "planner" ? `planner:${entry.id}` : null);
      if (planKey) {
        const bucket = plannerRequests.get(planKey) || [];
        bucket.push(entry);
        plannerRequests.set(planKey, bucket);
        continue;
      }
      const garmentKey = entry.garmentId || entry.jobId;
      if (garmentKey) {
        const bucket = modeledRequests.get(garmentKey) || [];
        bucket.push(entry);
        modeledRequests.set(garmentKey, bucket);
        continue;
      }
      otherRequests.push(entry);
      continue;
    }
    const uploadId = entry.uploadId
      || uploadByJob.get(entry.jobId)
      || uploadByGarment.get(entry.garmentId);
    if (uploadId && uploadRequests.has(uploadId)) uploadRequests.get(uploadId).push(entry);
    else if (IMPORT_OPERATION_GROUPS.has(entry.operationGroup) && entry.jobId) {
      const bucket = uploadRequests.get(`job:${entry.jobId}`) || [];
      bucket.push(entry);
      uploadRequests.set(`job:${entry.jobId}`, bucket);
    } else otherRequests.push(entry);
  }

  const activities = [];

  for (const [uploadId, requests] of uploadRequests) {
    const upload = uploadById.get(uploadId);
    if (!upload && !requests.length) continue;
    const items = Array.isArray(upload?.items) ? upload.items : [];
    const acceptedItems = items.filter((item) => ["added", "merged"].includes(item.outcome));
    const detailedItems = items.map((item) => {
      const garment = item.garmentId ? garmentById.get(item.garmentId) : null;
      return {
        ...item,
        image: garment?.thumbnail || garment?.imagePreview || garment?.image || null,
      };
    });
    const sourceGarment = detailedItems.find((item) => item.image);
    const uploadPhoto = uploadedPhotoFor(uploadId, items, garments);
    const uploadImage = uploadPhoto?.preview || uploadPhoto?.image || null;
    activities.push({
      id: `import:${uploadId}`,
      type: "import",
      label: AI_ACTIVITY_LABELS.import,
      title: upload?.fileName || "Uploaded image",
      image: uploadImage || sourceGarment?.image || null,
      sourceImage: uploadImage,
      previews: [
        ...(uploadImage ? [{ id: "source", kind: "source", label: "Uploaded photo", image: uploadImage }] : []),
        ...detailedItems
          .filter((item) => item.image)
          .map((item) => ({
            id: item.garmentId || item.jobId,
            kind: "generated",
            label: item.name,
            image: item.image,
          })),
      ].slice(0, 12),
      createdAt: upload?.createdAt || newestTimestamp(requests),
      status: upload?.status || "complete",
      detectedCount: Number.isInteger(upload?.detectedCount) ? upload.detectedCount : items.length,
      garmentCount: acceptedItems.length,
      createdGarmentCount: items.filter((item) => item.outcome === "added").length,
      duplicateCount: items.filter((item) => item.duplicateStatus && item.duplicateStatus !== "none").length,
      mergedCount: items.filter((item) => item.outcome === "merged").length,
      unselectedCount: items.filter((item) => ["unselected", "deleted"].includes(item.outcome)).length,
      items: detailedItems,
      requests,
      ...activityTotals(requests),
    });
  }

  for (const [garmentId, requests] of modeledRequests) {
    const garment = garmentById.get(garmentId);
    const garmentImage = garment?.thumbnail || garment?.imagePreview || garment?.image || null;
    const looks = Array.isArray(garment?.modeledLooks) ? garment.modeledLooks : [];
    activities.push({
      id: `modeled:${garmentId}`,
      type: "modeled",
      label: AI_ACTIVITY_LABELS.modeled,
      title: garment?.name || requests.find((entry) => entry.itemName)?.itemName || "Modeled look",
      image: garmentImage,
      sourceImage: garmentImage,
      previews: [
        ...(garmentImage ? [{ id: "garment", kind: "source", label: "Garment", image: garmentImage }] : []),
        ...looks.map((look) => ({
          id: look.id,
          kind: "generated",
          label: "Modeled look",
          image: look.preview || look.image,
        })).filter((preview) => preview.image),
      ].slice(0, 12),
      createdAt: newestTimestamp(requests),
      garmentId,
      lookCount: requests.filter((entry) => entry.completed).length,
      items: [],
      requests,
      ...activityTotals(requests),
    });
  }

  for (const [planKey, requests] of plannerRequests) {
    const plan = planById.get(planKey);
    const outfitLooks = requests.filter((entry) => entry.operationGroup === "modeled");
    const named = requests.find((entry) => entry.planTitle || entry.itemName);
    const plannedLooks = (plan?.result?.outfitIdeas || []).flatMap((outfit) => (
      (outfit.modeledLooks?.length ? outfit.modeledLooks : outfit.modeledLook ? [outfit.modeledLook] : [])
        .map((look) => ({
          id: look.id,
          kind: "generated",
          label: outfit.name || "Planned outfit",
          image: look.preview || look.image,
        }))
    )).filter((preview) => preview.image);
    activities.push({
      id: `planner:${planKey}`,
      type: "planner",
      label: AI_ACTIVITY_LABELS.planner,
      title: plan?.input?.title || plan?.input?.location || named?.planTitle || named?.itemName || "Wardrobe plan",
      image: plannedLooks[0]?.image || null,
      sourceImage: null,
      previews: plannedLooks.slice(0, 12),
      createdAt: plan?.createdAt || newestTimestamp(requests),
      planId: plan?.id || null,
      planKind: plan?.input?.kind || "trip",
      location: plan?.input?.location || null,
      startDate: plan?.input?.startDate || null,
      endDate: plan?.input?.endDate || null,
      outfitCount: plan?.result?.outfitIdeas?.length || 0,
      outfitLookCount: outfitLooks.length,
      items: [],
      requests,
      ...activityTotals(requests),
    });
  }

  for (const [outfitKey, requests] of outfitRequests) {
    const outfit = outfitById.get(outfitKey);
    const named = requests.find((entry) => entry.outfitTitle || entry.itemName);
    const looks = Array.isArray(outfit?.modeledLooks) ? outfit.modeledLooks : [];
    const garmentPreviews = (outfit?.garments || []).map((selection) => {
      const garment = garmentById.get(selection.itemId);
      return garment ? {
        id: garment.id,
        kind: "source",
        label: garment.name,
        image: garment.thumbnail || garment.imagePreview || garment.image,
      } : null;
    }).filter((preview) => preview?.image);
    const generatedPreviews = looks.map((look) => ({
      id: look.id,
      kind: "generated",
      label: outfit?.name || "Outfit Studio look",
      image: look.preview || look.image,
    })).filter((preview) => preview.image);
    activities.push({
      id: `outfit:${outfitKey}`,
      type: "outfit",
      label: AI_ACTIVITY_LABELS.outfit,
      title: outfit?.name || named?.outfitTitle || named?.itemName || "Outfit Studio look",
      image: generatedPreviews[0]?.image || garmentPreviews[0]?.image || null,
      sourceImage: garmentPreviews[0]?.image || null,
      previews: [...garmentPreviews, ...generatedPreviews].slice(0, 12),
      createdAt: outfit?.createdAt || newestTimestamp(requests),
      outfitId: outfit?.id || null,
      lookCount: generatedPreviews.length,
      items: [],
      requests,
      ...activityTotals(requests),
    });
  }

  if (otherRequests.length) {
    activities.push({
      id: "other",
      type: "other",
      label: AI_ACTIVITY_LABELS.other,
      title: "Other and earlier requests",
      image: null,
      sourceImage: null,
      previews: [],
      createdAt: newestTimestamp(otherRequests),
      items: [],
      requests: otherRequests,
      ...activityTotals(otherRequests),
    });
  }

  return activities
    .map((activity) => ({
      ...activity,
      requests: [...activity.requests]
        .sort((first, second) => String(first.createdAt).localeCompare(String(second.createdAt)))
        .map(publicAiRequest),
    }))
    .sort((first, second) => String(second.createdAt).localeCompare(String(first.createdAt)));
}

export function paginateAiActivities(activities = [], { offset = 0, limit = 20 } = {}) {
  const start = Math.max(0, Number.isFinite(Number(offset)) ? Math.trunc(Number(offset)) : 0);
  const size = Math.max(1, Math.min(100, Number.isFinite(Number(limit)) ? Math.trunc(Number(limit)) : 20));
  const page = activities.slice(start, start + size);
  return {
    activities: page,
    offset: start,
    limit: size,
    total: activities.length,
    nextOffset: start + page.length < activities.length ? start + page.length : null,
  };
}

export function summarizeAiUsage(allEntries = [], userId, importHistory = [], wardrobeNames = {}) {
  const entries = aiUsageEntriesForWardrobe(allEntries, userId)
    .sort((first, second) => String(second.createdAt).localeCompare(String(first.createdAt)));
  const uploads = (Array.isArray(importHistory) ? importHistory : [])
    .filter((upload) => upload?.userId === userId)
    .sort((first, second) => String(second.createdAt).localeCompare(String(first.createdAt)));
  const uploadByJob = new Map();
  const uploadByGarment = new Map();
  for (const upload of uploads) {
    for (const item of Array.isArray(upload.items) ? upload.items : []) {
      if (item?.jobId) uploadByJob.set(item.jobId, upload.id);
      if (item?.garmentId) uploadByGarment.set(item.garmentId, upload.id);
    }
  }
  const entriesByUpload = new Map(uploads.map((upload) => [upload.id, []]));
  const unlinkedRequests = [];
  for (const entry of entries) {
    const uploadId = entry.uploadId
      || uploadByJob.get(entry.jobId)
      || uploadByGarment.get(entry.garmentId);
    if (uploadId && entriesByUpload.has(uploadId)) entriesByUpload.get(uploadId).push(entry);
    else unlinkedRequests.push(entry);
  }
  const publicRequest = publicAiRequest;
  const uploadDetails = uploads.map((upload) => {
    const requests = entriesByUpload.get(upload.id) || [];
    const items = Array.isArray(upload.items) ? upload.items : [];
    const acceptedItems = items.filter((item) => ["added", "merged"].includes(item.outcome));
    return {
      id: upload.id,
      fileName: upload.fileName || "Uploaded image",
      createdAt: upload.createdAt,
      status: upload.status || "active",
      detectedCount: Number.isInteger(upload.detectedCount) ? upload.detectedCount : items.length,
      garmentCount: acceptedItems.length,
      createdGarmentCount: items.filter((item) => item.outcome === "added").length,
      duplicateCount: items.filter((item) => (
        item.duplicateStatus && item.duplicateStatus !== "none"
      )).length,
      mergedCount: items.filter((item) => item.outcome === "merged").length,
      unselectedCount: items.filter((item) => ["unselected", "deleted"].includes(item.outcome)).length,
      items,
      requests: requests.map(publicRequest),
      requestCount: requests.length,
      unpricedRequestCount: requests.filter((entry) => !Number.isFinite(entry.cost)).length,
      totalCost: requests.reduce((total, entry) => total + (Number.isFinite(entry.cost) ? entry.cost : 0), 0),
    };
  });
  const linkedCost = uploadDetails.reduce((total, upload) => total + upload.totalCost, 0);
  const acceptedGarmentCount = uploadDetails.reduce((total, upload) => total + upload.garmentCount, 0);
  const summarize = (key, labelFor) => {
    const groups = new Map();
    for (const entry of entries) {
      const id = entry[key] || "other";
      const current = groups.get(id) || {
        id,
        label: labelFor(id),
        cost: 0,
        requests: 0,
        unpricedRequests: 0,
      };
      current.requests += 1;
      if (Number.isFinite(entry.cost)) current.cost += entry.cost;
      else current.unpricedRequests += 1;
      groups.set(id, current);
    }
    return [...groups.values()].sort((first, second) => (
      second.cost - first.cost || second.requests - first.requests
    ));
  };
  return {
    currency: "USD",
    totalCost: entries.reduce((total, entry) => total + (Number.isFinite(entry.cost) ? entry.cost : 0), 0),
    requestCount: entries.length,
    unpricedRequestCount: entries.filter((entry) => !Number.isFinite(entry.cost)).length,
    byOperation: summarize("operationGroup", (id) => AI_OPERATION_LABELS[id] || AI_OPERATION_LABELS.other),
    byModel: summarize("model", (id) => id),
    // Kept in the response for compatibility with the existing costs UI. Usage
    // now belongs to the wardrobe where the work happened, independently of the
    // account whose key paid for it.
    byWardrobe: summarize("wardrobeUserId", (id) => wardrobeNames[id] || (id === userId ? "This wardrobe" : "Another wardrobe"))
      .map((group) => ({ ...group, isOwn: group.id === userId })),
    recent: entries.slice(0, 20),
    uploads: uploadDetails,
    uploadCount: uploadDetails.length,
    acceptedGarmentCount,
    linkedCost,
    averageCostPerUpload: uploadDetails.length ? linkedCost / uploadDetails.length : null,
    averageCostPerGarment: acceptedGarmentCount ? linkedCost / acceptedGarmentCount : null,
    unlinkedRequests: unlinkedRequests.map(publicRequest),
    lastUpdated: entries[0]?.createdAt || null,
  };
}
