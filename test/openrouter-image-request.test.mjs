import test from "node:test";
import assert from "node:assert/strict";
import {
  analysisPrompt,
  buildPlannedOutfitPrompt,
  editWithSafetyFallback,
  modeledModelForReferenceCount,
  openRouterHeaders,
  openRouterImageRequest,
  openRouterPlannerRequest,
  plannerModelCandidates,
  providerResponseError,
  wardrobePlanPrompt,
} from "../scripts/import-job-api.mjs";

test("grounds a planned modeled outfit in every garment, place, date, and occasion", () => {
  const prompt = buildPlannedOutfitPrompt(
    2,
    { name: "Rafael", fashionStyle: "quiet tailoring" },
    {
      input: {
        location: "Paris, France",
        startDate: "2026-12-04",
        endDate: "2026-12-07",
      },
      result: {
        expectedWeather: {
          temperatureRange: "3–9 °C",
          summary: "Cold with occasional rain",
          conditions: ["cold", "rain"],
        },
      },
    },
    {
      name: "Formal winter dinner",
      note: "A composed evening look for a formal restaurant",
    },
    [
      { name: "Navy wool jacket", part: "wholebody_up", color: "#14213d", materials: ["wool"] },
      { name: "Black leather shoes", part: "shoes", color: "#181818", materials: ["leather"] },
    ],
  );

  assert.match(prompt, /Images 1 through 2/);
  assert.match(prompt, /Image 3 is the exact reference for "Navy wool jacket"/);
  assert.match(prompt, /Image 4 is the exact reference for "Black leather shoes"/);
  assert.match(prompt, /EVERY supplied garment reference/);
  assert.match(prompt, /Paris, France/);
  assert.match(prompt, /2026-12-04 through 2026-12-07/);
  assert.match(prompt, /formal restaurant/);
  assert.match(prompt, /Cold with occasional rain/);
});

test("retries a fallback model when garment quality validation rejects the primary output", async () => {
  const calls = [];
  const result = await editWithSafetyFallback({
    editImage: async ({ model }) => {
      calls.push(model);
      return Buffer.from(model);
    },
    provider: { label: "OpenRouter" },
    model: "primary-image-model",
    fallbackModels: ["fallback-image-model"],
    validateImage: async (_bytes, { model }) => {
      if (model === "primary-image-model") {
        const error = new Error("wrong product");
        error.code = "garment_type_mismatch";
        throw error;
      }
    },
    prompt: "reconstruct a watch",
    images: [],
    operation: "garment",
  });

  assert.deepEqual(calls, ["primary-image-model", "fallback-image-model"]);
  assert.equal(result.model, "fallback-image-model");
  assert.equal(result.fallbackUsed, true);
});

test("uses Flash Lite for one identity reference and Flash for multiple references", () => {
  const provider = {
    modeledModel: "google/gemini-3.1-flash-lite-image",
    modeledMultiReferenceModel: "google/gemini-3.1-flash-image",
  };

  assert.equal(modeledModelForReferenceCount(provider, 1), "google/gemini-3.1-flash-lite-image");
  assert.equal(modeledModelForReferenceCount(provider, 2), "google/gemini-3.1-flash-image");
  assert.equal(modeledModelForReferenceCount(provider, 3), "google/gemini-3.1-flash-image");
});

test("falls back to the economy model when no multi-reference override is configured", () => {
  const provider = { modeledModel: "google/gemini-3.1-flash-lite-image" };
  assert.equal(modeledModelForReferenceCount(provider, 3), "google/gemini-3.1-flash-lite-image");
});

test("attributes every OpenRouter request to the Wardrobe app", () => {
  const headers = openRouterHeaders({
    key: "test-key",
    appUrl: "https://wardrobe.example/",
    appTitle: "Wardrobe",
  });

  assert.equal(headers["HTTP-Referer"], "https://wardrobe.example/");
  assert.equal(headers["X-OpenRouter-Title"], "Wardrobe");
});

test("does not send unsupported normalized dimensions to FLUX.2 Klein", () => {
  const request = openRouterImageRequest({
    model: "black-forest-labs/flux.2-klein-4b",
    prompt: "reconstruct this garment",
    inputReferences: [{ type: "image_url", image_url: { url: "data:image/png;base64,AA==" } }],
    size: "1024x1024",
    resolution: "1K",
    quality: "high",
    background: "transparent",
    routing: { only: ["black-forest-labs"], allow_fallbacks: false },
  });

  assert.deepEqual(request, {
    model: "black-forest-labs/flux.2-klein-4b",
    prompt: "reconstruct this garment",
    n: 1,
    input_references: [{ type: "image_url", image_url: { url: "data:image/png;base64,AA==" } }],
    output_format: "png",
    provider: { only: ["black-forest-labs"], allow_fallbacks: false },
  });
});

test("keeps normalized dimensions for models that advertise them", () => {
  const request = openRouterImageRequest({
    model: "google/gemini-3.1-flash-lite-image",
    prompt: "create a modeled look",
    inputReferences: [],
    size: "1536x1024",
    resolution: "1K",
    quality: "auto",
  });

  assert.equal(request.resolution, "1K");
  assert.equal(request.aspect_ratio, "3:2");
  assert.equal("output_format" in request, false);
});

test("maps an exhausted OpenRouter balance to a human-readable credit error", () => {
  const error = providerResponseError(
    { status: 400 },
    { error: { message: "Insufficient credits" } },
    {
      provider: {
        id: "openrouter",
        label: "OpenRouter",
        keyEnv: "OPENROUTER_API_KEY",
      },
      model: "google/gemini-3.1-flash-lite",
      operation: "planner",
    },
  );

  assert.equal(error.status, 402);
  assert.equal(error.code, "openrouter_credits_exhausted");
  assert.match(error.message, /no available credit/i);
});

test("uses portable JSON mode for planner responses", () => {
  const request = openRouterPlannerRequest({
    provider: { zdr: true },
    model: "google/gemini-3.1-flash-lite",
    prompt: "Create a wardrobe plan and return JSON.",
  });

  assert.deepEqual(request.response_format, { type: "json_object" });
  assert.equal(request.provider.require_parameters, true);
  assert.equal(request.provider.data_collection, "deny");
  assert.equal(request.provider.zdr, true);
  assert.equal("json_schema" in request.response_format, false);
});

test("puts the locally validated planner shape in the prompt", () => {
  const prompt = wardrobePlanPrompt(
    { kind: "trip", location: "Paris", startDate: "2026-08-14", endDate: "2026-08-16" },
    { name: "Test", sizeProfile: {} },
    [],
  );

  for (const key of ["expectedWeather", "recommendedItems", "outfitIdeas", "missingItems", "packingNotes", "disclaimer"]) {
    assert.match(prompt, new RegExp(`\"${key}\"`));
  }
  assert.match(prompt, /Return only one valid JSON object/i);
});

test("asks AI-generated wardrobe copy to use the person's language", () => {
  const prompt = wardrobePlanPrompt(
    { kind: "trip", location: "Paris", startDate: "2026-08-14", endDate: "2026-08-16" },
    { name: "Test", language: "pt-PT", sizeProfile: {} },
    [],
  );

  assert.match(prompt, /European Portuguese \(Portugal\)/);
  assert.match(analysisPrompt("pt-PT"), /European Portuguese/);
  assert.match(analysisPrompt("pt-PT"), /Keep category ids and season ids exactly/i);
  assert.match(analysisPrompt("en-US"), /Do not box the whole person or the whole outfit/i);
  assert.match(analysisPrompt("en-US"), /stop at the jacket hem; exclude the trousers/i);
  assert.match(analysisPrompt("en-US"), /secondaryColor as null.*shadow.*darker interior.*jacket lining/i);
});

test("deduplicates the selected planner model and its fallbacks", () => {
  assert.deepEqual(
    plannerModelCandidates(
      { plannerFallbackModels: ["google/gemini-3.1-flash-lite", "google/gemini-2.5-flash-lite"] },
      "google/gemini-3.1-flash-lite",
    ),
    ["google/gemini-3.1-flash-lite", "google/gemini-2.5-flash-lite"],
  );
});

test("surfaces the upstream planner error without calling it an image or balance failure", () => {
  const error = providerResponseError(
    { status: 400 },
    {
      error: {
        message: "Provider returned error",
        metadata: {
          raw: JSON.stringify({
            error: {
              code: 400,
              message: "Request contains an invalid argument.",
              status: "INVALID_ARGUMENT",
            },
          }),
        },
      },
    },
    {
      provider: {
        id: "openrouter",
        label: "OpenRouter",
        keyEnv: "OPENROUTER_API_KEY",
      },
      model: "google/gemini-3.1-flash-lite",
      operation: "planner",
    },
  );

  assert.equal(error.status, 400);
  assert.equal(error.code, "openrouter_provider_error");
  assert.match(error.message, /could not create the wardrobe plan/i);
  assert.match(error.message, /request contains an invalid argument/i);
  assert.doesNotMatch(error.message, /balance|spending limit/i);
  assert.doesNotMatch(error.message, /requested image/i);
});
