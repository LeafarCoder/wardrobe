export const AI_TASKS = [
  {
    id: "analysisModel",
    operation: "analysis",
    label: "Photo analysis",
    description: "Finds every garment, draws its crop box, and suggests its name, category, colors, tags, materials, fit, and seasons.",
    options: [
      { id: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", badge: "Cheapest", note: "Recommended for most imports and bulk analysis." },
      { id: "google/gemini-3.1-flash", label: "Gemini 3.1 Flash", badge: "More accurate", note: "Better for crowded outfits, overlaps, and difficult photos." },
    ],
  },
  {
    id: "garmentModel",
    operation: "garment",
    label: "Clean garment generation",
    description: "Reconstructs the detected piece as a centered, person-free product cutout.",
    options: [
      {
        id: "black-forest-labs/flux.2-klein-4b",
        label: "FLUX.2 Klein 4B",
        badge: "Cheapest",
        note: "Lowest price. This route does not offer zero data retention, so the provider may keep your garment images or request data under its own policy.",
        zeroDataRetention: false,
      },
      { id: "google/gemini-3.1-flash-lite-image", label: "Gemini 3.1 Flash Lite Image", badge: "Private economy", note: "Use when zero-data-retention matters more than the lowest price." },
      { id: "google/gemini-3.1-flash-image", label: "Gemini 3.1 Flash Image", badge: "Best detail", note: "Higher fidelity for complex patterns and construction." },
    ],
  },
  {
    id: "modeledModel",
    operation: "modeled",
    label: "Modeled look · one reference",
    description: "Creates a styled editorial image using one identity photo and the exact garment.",
    options: [
      { id: "google/gemini-3.1-flash-lite-image", label: "Gemini 3.1 Flash Lite Image", badge: "Economy", note: "Recommended when one clear identity photo is available." },
      { id: "google/gemini-3.1-flash-image", label: "Gemini 3.1 Flash Image", badge: "Better match", note: "Improves face, fabric, and garment consistency." },
      { id: "bytedance-seed/seedream-4.5", label: "Seedream 4.5", badge: "Alternative", note: "Useful when the primary provider refuses an otherwise ordinary fashion image." },
    ],
  },
  {
    id: "modeledMultiReferenceModel",
    operation: "modeled-multi",
    label: "Modeled look · two or three references",
    description: "Combines complementary identity photos for a stronger face and body match.",
    options: [
      { id: "google/gemini-3.1-flash-lite-image", label: "Gemini 3.1 Flash Lite Image", badge: "Cheapest", note: "Lower cost, with less reliable multi-reference identity matching." },
      { id: "google/gemini-3.1-flash-image", label: "Gemini 3.1 Flash Image", badge: "Recommended", note: "Best balance for multiple identity references." },
      { id: "google/gemini-3-pro-image", label: "Gemini 3 Pro Image", badge: "Highest quality", note: "Use for the strongest fidelity when price is secondary." },
    ],
  },
  {
    id: "plannerModel",
    operation: "planner",
    label: "Trip and event planner",
    description: "Uses wardrobe metadata, destination, dates, climate expectations, and preferences to build outfits and a missing-items list.",
    options: [
      { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", badge: "Cheapest private", note: "Lowest-cost option that does not retain your request data, and a reliable choice for routine plans." },
      { id: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", badge: "Recommended", note: "Better reasoning while remaining inexpensive for routine packing and event plans." },
      { id: "google/gemini-3.1-flash", label: "Gemini 3.1 Flash", badge: "More thoughtful", note: "Better for long trips, mixed dress codes, and larger wardrobes." },
    ],
  },
];

export const DEFAULT_AI_PREFERENCES = Object.freeze(Object.fromEntries(
  AI_TASKS.map((task) => [task.id, ""]),
));

const MODEL_ID = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i;

export function normalizeAiPreferences(value = {}) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(AI_TASKS.map((task) => {
    const model = typeof input[task.id] === "string" ? input[task.id].trim().slice(0, 160) : "";
    return [task.id, MODEL_ID.test(model) ? model : ""];
  }));
}

export function operationGroup(operation) {
  return String(operation || "").startsWith("modeled") ? "modeled" : String(operation || "other");
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
  planner: "Trip and event plans",
  other: "Other AI",
};

export function summarizeAiUsage(allEntries = [], userId, importHistory = []) {
  const entries = (Array.isArray(allEntries) ? allEntries : [])
    .filter((entry) => entry?.userId === userId)
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
  const publicRequest = (entry) => ({
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
    createdAt: entry.createdAt,
  });
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
