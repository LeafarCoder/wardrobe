import assert from "node:assert/strict";
import test from "node:test";
import { aiUsageActivities, paginateAiActivities } from "../src/ai-preferences.js";

const GARMENT = {
  id: "import-a",
  name: "Linen shirt",
  thumbnail: "/api/import/library/import-a-thumb.webp",
  image: "/api/import/library/import-a-garment.png",
  sourcePhotos: [{
    id: "s1",
    image: "/api/import/library/import-a-original.png",
    preview: "/api/import/library/import-a-original-preview.webp",
    importUploadId: "upload-1",
  }],
};

const UPLOAD = {
  id: "upload-1",
  userId: "rafael",
  fileName: "IMG_20260721_183045.jpg",
  status: "complete",
  detectedCount: 2,
  createdAt: "2026-07-21T09:59:00.000Z",
  items: [
    { jobId: "job-1", garmentId: "import-a", name: "Linen shirt", outcome: "added", duplicateStatus: "none" },
    { jobId: "job-2", name: "Beige trousers", outcome: "merged", duplicateStatus: "merged" },
  ],
};

const PLAN = {
  id: "plan-lisbon",
  createdAt: "2026-07-22T09:00:00.000Z",
  input: { kind: "trip", title: "Lisbon weekend", location: "Lisbon", startDate: "2026-08-01", endDate: "2026-08-03" },
  result: {
    outfitIdeas: [{
      name: "Day one",
      itemIds: ["import-a"],
      modeledLooks: [{ id: "l1", image: "/api/import/library/plan-look.png", preview: "/api/import/library/plan-look-preview.webp" }],
    }],
  },
};

const entry = (id, operation, operationGroup, cost, createdAt, extra = {}) => ({
  id,
  operation,
  operationGroup,
  cost,
  createdAt,
  completed: true,
  model: "google/gemini-3.1-flash-lite",
  ...extra,
});

const ENTRIES = [
  entry("u1", "analysis", "analysis", 0.002, "2026-07-21T10:00:00.000Z", { uploadId: "upload-1" }),
  entry("u2", "garment", "garment", 0.014, "2026-07-21T10:01:00.000Z", { jobId: "job-1", uploadId: "upload-1" }),
  entry("m1", "modeled-on-demand", "modeled", 0.068, "2026-07-23T10:00:00.000Z", { garmentId: "import-a", itemName: "Linen shirt", uploadId: "upload-1" }),
  entry("p1", "planner", "planner", 0.001, "2026-07-22T09:00:00.000Z", { planId: "plan-lisbon", planTitle: "Lisbon weekend" }),
  entry("p2", "modeled-plan", "modeled", 0.061, "2026-07-22T09:05:00.000Z", { planId: "plan-lisbon", itemName: "Day one" }),
  entry("o1", "analysis", "analysis", 0.0005, "2026-07-20T08:00:00.000Z"),
];

function activitiesFor(entries = ENTRIES) {
  return aiUsageActivities(entries, { uploads: [UPLOAD], garments: [GARMENT], plans: [PLAN] });
}

test("separates imports, modeled looks, and plans into their own activities", () => {
  const activities = activitiesFor();
  assert.deepEqual(activities.map((activity) => activity.type), ["modeled", "planner", "import", "other"]);
});

test("a modeled look is its own activity even though it descends from an import", () => {
  const modeled = activitiesFor().find((activity) => activity.type === "modeled");

  assert.equal(modeled.title, "Linen shirt");
  assert.deepEqual(modeled.requests.map((request) => request.id), ["m1"]);
  assert.equal(modeled.totalCost, 0.068);
  const importActivity = activitiesFor().find((activity) => activity.type === "import");
  assert.equal(importActivity.requests.some((request) => request.id === "m1"), false);
});

test("planner runs and their generated outfit images share one plan activity", () => {
  const planner = activitiesFor().find((activity) => activity.type === "planner");

  assert.equal(planner.title, "Lisbon weekend");
  assert.equal(planner.location, "Lisbon");
  assert.equal(planner.planKind, "trip");
  assert.deepEqual(planner.requests.map((request) => request.id), ["p1", "p2"]);
  assert.equal(planner.outfitLookCount, 1);
  assert.equal(Number(planner.totalCost.toFixed(4)), 0.062);
});

test("Outfit Studio refinement and modeled generation share the saved outfit activity", () => {
  const outfit = {
    id: "outfit-dinner",
    name: "Dinner look",
    createdAt: "2026-07-24T10:00:00.000Z",
    garments: [{ itemId: "import-a", variantId: null }],
    modeledLooks: [{ id: "ol1", image: "/api/import/library/outfit-look.png", preview: "/api/import/library/outfit-look-preview.webp" }],
  };
  const activities = aiUsageActivities([
    entry("or1", "outfit-refine", "outfit", 0.001, "2026-07-24T10:00:00.000Z", { outfitId: outfit.id, outfitTitle: outfit.name }),
    entry("or2", "modeled-outfit", "outfit", 0.07, "2026-07-24T10:02:00.000Z", { outfitId: outfit.id, outfitTitle: outfit.name }),
  ], { uploads: [], garments: [GARMENT], plans: [], outfits: [outfit] });

  assert.equal(activities.length, 1);
  assert.equal(activities[0].type, "outfit");
  assert.equal(activities[0].title, "Dinner look");
  assert.deepEqual(activities[0].requests.map((request) => request.id), ["or1", "or2"]);
  assert.equal(activities[0].previews.some((preview) => preview.image.endsWith("outfit-look-preview.webp")), true);
  assert.equal(activities[0].totalCost, 0.07100000000000001);
});

test("activities carry an image so a filename like IMG_2026… is recognizable", () => {
  const activities = activitiesFor();
  const importActivity = activities.find((activity) => activity.type === "import");
  const modeled = activities.find((activity) => activity.type === "modeled");
  const planner = activities.find((activity) => activity.type === "planner");

  assert.equal(importActivity.image, "/api/import/library/import-a-original-preview.webp");
  assert.equal(modeled.image, "/api/import/library/import-a-thumb.webp");
  assert.equal(planner.image, "/api/import/library/plan-look-preview.webp");
  assert.equal(importActivity.items.find((item) => item.garmentId === "import-a").image, "/api/import/library/import-a-thumb.webp");
});

test("finds the uploaded photo of an import saved before importUploadId was preserved", () => {
  // Records written before the field was kept only carry importJobId.
  const legacyGarment = {
    ...GARMENT,
    importJobId: "job-1",
    sourcePhotos: [{
      id: "original",
      image: "/api/import/library/import-a-original.png",
      preview: "/api/import/library/import-a-original-preview.webp",
      importJobId: "job-1",
      importUploadId: null,
    }],
  };
  const [activity] = aiUsageActivities(
    [entry("u1", "analysis", "analysis", 0.002, "2026-07-21T10:00:00.000Z", { uploadId: "upload-1" })],
    { uploads: [UPLOAD], garments: [legacyGarment], plans: [] },
  );

  assert.equal(activity.sourceImage, "/api/import/library/import-a-original-preview.webp");
  assert.equal(activity.image, "/api/import/library/import-a-original-preview.webp");
});

test("an import shows the uploaded photo next to what was generated from it", () => {
  const importActivity = activitiesFor().find((activity) => activity.type === "import");
  const kinds = importActivity.previews.map((preview) => preview.kind);

  assert.equal(importActivity.previews[0].kind, "source");
  assert.equal(importActivity.previews[0].image, "/api/import/library/import-a-original-preview.webp");
  assert.equal(kinds.includes("generated"), true);
  assert.equal(
    importActivity.previews.find((preview) => preview.kind === "generated").image,
    "/api/import/library/import-a-thumb.webp",
  );
  assert.equal(importActivity.previews.every((preview) => preview.image), true);
});

test("modeled and planner activities preview their generated images too", () => {
  const activities = activitiesFor();
  const modeled = activities.find((activity) => activity.type === "modeled");
  const planner = activities.find((activity) => activity.type === "planner");

  assert.equal(modeled.previews[0].kind, "source");
  assert.equal(planner.previews.length, 1);
  assert.equal(planner.previews[0].kind, "generated");
  assert.equal(planner.previews[0].image, "/api/import/library/plan-look-preview.webp");
});

test("previews stay bounded so one busy upload cannot bloat the payload", () => {
  const manyItems = Array.from({ length: 30 }, (_, index) => ({
    jobId: `job-${index}`,
    garmentId: `g-${index}`,
    name: `Garment ${index}`,
    outcome: "added",
  }));
  const manyGarments = manyItems.map((item) => ({ id: item.garmentId, name: item.name, thumbnail: `/thumb-${item.garmentId}.webp` }));
  const [activity] = aiUsageActivities(
    [entry("u1", "analysis", "analysis", 0.002, "2026-07-21T10:00:00.000Z", { uploadId: "upload-many" })],
    { uploads: [{ ...UPLOAD, id: "upload-many", items: manyItems }], garments: manyGarments, plans: [] },
  );

  assert.equal(activity.previews.length, 12);
});

test("an import falls back to a garment image when the source photo predates upload linking", () => {
  const garment = { ...GARMENT, sourcePhotos: [] };
  const [activity] = aiUsageActivities(
    [entry("u1", "analysis", "analysis", 0.002, "2026-07-21T10:00:00.000Z", { uploadId: "upload-1" })],
    { uploads: [UPLOAD], garments: [garment], plans: [] },
  );

  assert.equal(activity.image, "/api/import/library/import-a-thumb.webp");
});

test("every recorded request lands in exactly one activity", () => {
  const activities = activitiesFor();
  const grouped = activities.flatMap((activity) => activity.requests.map((request) => request.id));

  assert.equal(grouped.length, ENTRIES.length);
  assert.equal(new Set(grouped).size, ENTRIES.length);
  const total = activities.reduce((sum, activity) => sum + activity.totalCost, 0);
  assert.equal(Number(total.toFixed(4)), 0.1465);
});

test("every listed request carries a human-readable task label", () => {
  const labels = activitiesFor().flatMap((activity) => activity.requests.map((request) => request.label));

  assert.equal(labels.some((label) => !label || label === "undefined"), false);
  assert.deepEqual(new Set(labels), new Set([
    "Photo analysis",
    "Clean garments",
    "Modeled looks",
    "Trip and event plans",
  ]));
});

test("requests without a plan, garment, or upload still appear under other activity", () => {
  const other = activitiesFor().find((activity) => activity.type === "other");
  assert.deepEqual(other.requests.map((request) => request.id), ["o1"]);
});

test("activities are newest first and their requests read oldest first", () => {
  const activities = activitiesFor();
  const dates = activities.map((activity) => activity.createdAt);
  assert.deepEqual(dates, [...dates].sort((first, second) => second.localeCompare(first)));

  const planner = activities.find((activity) => activity.type === "planner");
  assert.deepEqual(planner.requests.map((request) => request.createdAt), [
    "2026-07-22T09:00:00.000Z",
    "2026-07-22T09:05:00.000Z",
  ]);
});

test("counts unpriced and failed requests per activity", () => {
  const [activity] = aiUsageActivities([
    entry("a", "planner", "planner", null, "2026-07-22T09:00:00.000Z", { planId: "plan-lisbon", completed: false }),
    entry("b", "planner", "planner", 0.001, "2026-07-22T09:01:00.000Z", { planId: "plan-lisbon" }),
  ], { uploads: [], garments: [], plans: [PLAN] });

  assert.equal(activity.requestCount, 2);
  assert.equal(activity.unpricedRequestCount, 1);
  assert.equal(activity.failedRequestCount, 1);
  assert.equal(activity.totalCost, 0.001);
});

test("pagination walks the whole list without repeating or dropping an activity", () => {
  const activities = activitiesFor();
  const seen = [];
  let offset = 0;
  for (let guard = 0; guard < 10 && offset !== null; guard += 1) {
    const page = paginateAiActivities(activities, { offset, limit: 2 });
    seen.push(...page.activities.map((activity) => activity.id));
    offset = page.nextOffset;
  }

  assert.equal(offset, null);
  assert.deepEqual(seen, activities.map((activity) => activity.id));
});

test("pagination clamps hostile offsets and limits", () => {
  const activities = activitiesFor();

  assert.equal(paginateAiActivities(activities, { offset: -20, limit: 0 }).offset, 0);
  assert.equal(paginateAiActivities(activities, { offset: 0, limit: 5000 }).limit, 100);
  assert.equal(paginateAiActivities(activities, { offset: "abc", limit: "abc" }).offset, 0);
  assert.deepEqual(paginateAiActivities(activities, { offset: 999, limit: 20 }).activities, []);
  assert.equal(paginateAiActivities(activities, { offset: 999, limit: 20 }).nextOffset, null);
});

test("an empty ledger produces no activities", () => {
  assert.deepEqual(aiUsageActivities([], { uploads: [], garments: [], plans: [] }), []);
});
