import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_TASKS,
  aiUsageEntriesForWardrobe,
  formatAiCost,
  migrateAiModelId,
  normalizeAiPreferences,
  operationGroup,
  summarizeAiUsage,
} from "../src/ai-preferences.js";
import { providerWithProfilePreferences } from "../scripts/import-job-api.mjs";

test("normalizes independent model choices for every AI task", () => {
  const preferences = normalizeAiPreferences({
    analysisModel: "google/gemini-3.1-flash",
    garmentModel: "black-forest-labs/flux.2-klein-4b",
    modeledModel: "google/gemini-3.1-flash-lite-image",
    modeledMultiReferenceModel: "google/gemini-3.1-flash-image",
    modeledMultiReferenceFallbackModel: "google/gemini-3.1-flash-image",
    plannerModel: "not a model id",
    plannerFallbackModel: "google/gemini-2.5-flash-lite",
  });

  assert.equal(preferences.analysisModel, "google/gemini-3.6-flash");
  assert.equal(preferences.garmentModel, "black-forest-labs/flux.2-klein-4b");
  assert.equal(preferences.modeledMultiReferenceModel, "google/gemini-3.1-flash-image");
  assert.equal(preferences.modeledMultiReferenceFallbackModel, "");
  assert.equal(preferences.plannerModel, "");
  assert.equal(preferences.plannerFallbackModel, "google/gemini-2.5-flash-lite");
});

test("migrates the retired Gemini 3.1 Flash id to a live higher-quality route", () => {
  assert.equal(migrateAiModelId("google/gemini-3.1-flash"), "google/gemini-3.6-flash");
  assert.equal(migrateAiModelId("google/gemini-3.1-flash-lite"), "google/gemini-3.1-flash-lite");
});

test("groups Outfit Studio text and image calls under the saved outfit", () => {
  assert.equal(operationGroup("outfit-refine"), "outfit");
  assert.equal(operationGroup("outfit-name"), "outfit");
  assert.equal(operationGroup("modeled-outfit"), "outfit");
  assert.equal(operationGroup("modeled-plan"), "modeled");
  assert.equal(operationGroup("garment-regeneration"), "garment");
});

test("offers only compatible live models for each AI task and includes pricing", () => {
  const analysis = AI_TASKS.find((task) => task.id === "analysisModel");
  const garment = AI_TASKS.find((task) => task.id === "garmentModel");
  const planner = AI_TASKS.find((task) => task.id === "plannerModel");

  assert.ok(analysis.options.some((option) => option.id === "google/gemini-3.6-flash"));
  assert.ok(analysis.options.some((option) => option.id === "google/gemini-3.5-flash"));
  assert.ok(!analysis.options.some((option) => option.id.endsWith("-image")));
  assert.ok(garment.options.some((option) => option.id === "google/gemini-3-pro-image"));
  assert.equal(garment.options.find((option) => option.badge === "Recommended")?.id, "bytedance-seed/seedream-4.5");
  assert.ok(garment.options.every((option) => option.pricing));
  assert.ok(!planner.options.some((option) => option.id.endsWith("-image")));
  assert.ok(AI_TASKS.every((task) => task.options.every((option) => option.pricing)));
});

test("clearly marks the garment option that may retain uploaded images", () => {
  const garmentTask = AI_TASKS.find((task) => task.id === "garmentModel");
  const klein = garmentTask.options.find((option) => option.id === "black-forest-labs/flux.2-klein-4b");
  assert.equal(klein.zeroDataRetention, false);
  assert.match(klein.note, /provider may keep your garment images/i);
});

test("keeps small AI costs visible without unnecessary trailing zeros", () => {
  assert.equal(formatAiCost(0), "$0.00");
  assert.equal(formatAiCost(0.002), "$0.002");
  assert.equal(formatAiCost(0.0016), "$0.0016");
  assert.equal(formatAiCost(0.07), "$0.07");
  assert.equal(formatAiCost(Number.NaN), "—");
});

test("applies personal model choices only to OpenRouter and language to every provider", () => {
  const base = {
    id: "openrouter",
    visionModel: "default/analysis",
    garmentModel: "default/garment",
    modeledModel: "default/modeled",
    modeledMultiReferenceModel: "default/multi",
    plannerModel: "default/planner",
  };
  const profile = {
    language: "pt-PT",
    aiPreferences: {
      analysisModel: "google/gemini-3.1-flash",
      garmentModel: "",
      modeledModel: "google/gemini-3.1-flash-image",
      modeledMultiReferenceModel: "",
      modeledMultiReferenceFallbackModel: "bytedance-seed/seedream-4.5",
      plannerModel: "google/gemini-3.1-flash-lite",
      plannerFallbackModel: "google/gemini-2.5-flash-lite",
    },
  };

  const selected = providerWithProfilePreferences(base, profile);
  assert.equal(selected.visionModel, "google/gemini-3.6-flash");
  assert.equal(selected.garmentModel, "default/garment");
  assert.equal(selected.modeledModel, "google/gemini-3.1-flash-image");
  assert.equal(selected.modeledMultiReferenceModel, "default/multi");
  assert.deepEqual(selected.modeledMultiReferenceFallbackModels, ["bytedance-seed/seedream-4.5"]);
  assert.equal(selected.plannerModel, "google/gemini-3.1-flash-lite");
  assert.deepEqual(selected.plannerFallbackModels, ["google/gemini-2.5-flash-lite"]);
  assert.equal(selected.responseLanguage, "pt-PT");
  assert.deepEqual(
    providerWithProfilePreferences({ ...base, id: "openai" }, profile),
    { ...base, id: "openai", responseLanguage: "pt-PT", wardrobeUserId: null },
  );
});

test("records which wardrobe a request served, separately from who paid", () => {
  const provider = providerWithProfilePreferences(
    { id: "openrouter", key: "sk-or-v1-server000000000000000000", userId: "rafael" },
    { id: "sara", name: "Sara" },
    { id: "rafael", name: "Rafael", openRouterApiKey: "sk-or-v1-rafael000000000000000000" },
  );

  assert.equal(provider.wardrobeUserId, "sara", "the work was done in Sara's wardrobe");
  assert.equal(provider.userId, "rafael", "but Rafael's account is billed");
});

test("attributes existing payer-owned ledger rows to the wardrobe where the work happened", () => {
  const entries = [
    {
      id: "owner-in-target",
      userId: "owner",
      wardrobeUserId: "target",
      operationGroup: "modeled",
      model: "google/gemini-3.1-flash-image",
      cost: 0.08,
      createdAt: "2026-07-29T10:00:00.000Z",
    },
    {
      id: "target-own-call",
      userId: "target",
      operationGroup: "analysis",
      model: "google/gemini-3.1-flash-lite",
      cost: 0.002,
      createdAt: "2026-07-29T09:00:00.000Z",
    },
    {
      id: "owner-own-call",
      userId: "owner",
      wardrobeUserId: "owner",
      operationGroup: "analysis",
      model: "google/gemini-3.1-flash-lite",
      cost: 1,
      createdAt: "2026-07-29T08:00:00.000Z",
    },
  ];

  assert.deepEqual(
    aiUsageEntriesForWardrobe(entries, "target").map((entry) => entry.id),
    ["owner-in-target", "target-own-call"],
  );
  const summary = summarizeAiUsage(entries, "target");
  assert.equal(summary.requestCount, 2);
  assert.equal(summary.totalCost, 0.082);
  assert.deepEqual(summary.recent.map((entry) => entry.id), ["owner-in-target", "target-own-call"]);
});

test("summarizes recorded AI spend by person, task, and model", () => {
  const summary = summarizeAiUsage([
    {
      id: "one",
      userId: "rafael",
      operationGroup: operationGroup("modeled-primary"),
      model: "google/gemini-3.1-flash-image",
      cost: 0.0684,
      createdAt: "2026-07-24T10:00:00.000Z",
    },
    {
      id: "two",
      userId: "rafael",
      operationGroup: operationGroup("analysis"),
      model: "google/gemini-3.1-flash-lite",
      cost: 0.0016,
      createdAt: "2026-07-24T11:00:00.000Z",
    },
    {
      id: "failed",
      userId: "rafael",
      operationGroup: operationGroup("garment"),
      model: "black-forest-labs/flux.2-klein-4b",
      cost: null,
      createdAt: "2026-07-24T12:00:00.000Z",
    },
    {
      id: "someone-else",
      userId: "other",
      operationGroup: "analysis",
      model: "google/gemini-3.1-flash-lite",
      cost: 10,
      createdAt: "2026-07-24T13:00:00.000Z",
    },
  ], "rafael");

  assert.equal(summary.requestCount, 3);
  assert.equal(summary.unpricedRequestCount, 1);
  assert.equal(summary.totalCost, 0.07);
  assert.equal(summary.byOperation.find((group) => group.id === "modeled").label, "Modeled looks");
  assert.equal(summary.byModel.find((group) => group.id.includes("flash-image")).cost, 0.0684);
  assert.equal(summary.recent[0].id, "failed");
});

test("groups AI calls by uploaded image and calculates useful import averages", () => {
  const summary = summarizeAiUsage([
    {
      id: "analysis",
      userId: "rafael",
      uploadId: "upload-one",
      operation: "analysis",
      operationGroup: "analysis",
      model: "google/gemini-3.1-flash-lite",
      completed: true,
      cost: 0.002,
      createdAt: "2026-07-24T10:00:00.000Z",
    },
    {
      id: "garment-one",
      userId: "rafael",
      jobId: "job-one",
      operation: "garment",
      operationGroup: "garment",
      model: "black-forest-labs/flux.2-klein-4b",
      completed: true,
      cost: 0.014,
      createdAt: "2026-07-24T10:01:00.000Z",
    },
    {
      id: "planner",
      userId: "rafael",
      operation: "planner",
      operationGroup: "planner",
      model: "google/gemini-3.1-flash-lite",
      completed: true,
      cost: 0.001,
      createdAt: "2026-07-24T10:02:00.000Z",
    },
  ], "rafael", [{
    id: "upload-one",
    userId: "rafael",
    fileName: "summer-look.png",
    detectedCount: 2,
    createdAt: "2026-07-24T09:59:00.000Z",
    items: [
      { jobId: "job-one", garmentId: "garment-one", name: "Linen shirt", outcome: "added", duplicateStatus: "none" },
      { jobId: "job-two", name: "Beige trousers", outcome: "merged", duplicateStatus: "merged" },
    ],
  }]);

  assert.equal(summary.uploadCount, 1);
  assert.equal(summary.acceptedGarmentCount, 2);
  assert.equal(summary.uploads[0].fileName, "summer-look.png");
  assert.equal(summary.uploads[0].requestCount, 2);
  assert.equal(summary.uploads[0].mergedCount, 1);
  assert.equal(summary.uploads[0].totalCost, 0.016);
  assert.equal(summary.averageCostPerUpload, 0.016);
  assert.equal(summary.averageCostPerGarment, 0.008);
  assert.deepEqual(summary.unlinkedRequests.map((entry) => entry.id), ["planner"]);
});
