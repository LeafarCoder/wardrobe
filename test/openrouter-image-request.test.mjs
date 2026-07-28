import test from "node:test";
import assert from "node:assert/strict";
import {
  analysisPrompt,
  buildGarmentPrompt,
  buildPlannedOutfitPrompt,
  editWithSafetyFallback,
  garmentSemanticMismatch,
  modeledModelForReferenceCount,
  openRouterHeaders,
  openRouterImageRequest,
  openRouterPlannerRequest,
  OPENROUTER_WARDROBE_PLAN_SCHEMA,
  plannerModelCandidates,
  providerResponseError,
  WARDROBE_PLAN_SCHEMA,
  wardrobePlanPrompt,
} from "../scripts/import-job-api.mjs";

test("makes a Portuguese bracelet correction override watch-like crop ambiguity", () => {
  const prompt = buildGarmentPrompt({
    name: "Pulseira de prata",
    part: "accessories_up",
    color: "#c0c0c0",
    tags: ["brilhante", "acessório"],
  }, "#00ff00", {
    hasContextReference: true,
    userDirection: "Não é para gerar um relógio. É uma pulseira de prata com várias peças.",
  });

  assert.match(prompt, /bracelet or wrist chain/i);
  assert.match(prompt, /not a watch or timepiece/i);
  assert.match(prompt, /USER CORRECTION — AUTHORITATIVE AND HIGHEST PRIORITY/);
  assert.match(prompt, /Não é para gerar um relógio/);
  assert.doesNotMatch(prompt, /face or body, case, crown, strap/i);
  assert.equal(garmentSemanticMismatch(
    { name: "Pulseira de prata", part: "accessories_up" },
    [{ name: "Silver wristwatch", part: "accessories_up", tags: ["watch", "dial"] }],
  ), "generated a watch instead of a bracelet");
});

test("keeps women's pointed high heels from becoming men's dress shoes", () => {
  const metadata = {
    name: "Sapatos pretos de salto",
    part: "shoes",
    color: "#000000",
    tags: ["sapatos", "salto alto", "scarpin"],
  };
  const prompt = buildGarmentPrompt(metadata, "#00ff00", {
    userDirection: "These are women's shoes with a pointy front and a high heel.",
  });

  assert.match(prompt, /women's high-heeled footwear/i);
  assert.match(prompt, /pointed toe/i);
  assert.match(prompt, /Do not create a men's Oxford/i);
  assert.equal(garmentSemanticMismatch(
    metadata,
    [{ name: "Black Oxford shoe", part: "shoes", tags: ["lace-up", "menswear"] }],
  ), "generated men's or flat dress footwear instead of a high heel");
});

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

test("constrains planner response shape without provider state-heavy array bounds", () => {
  const request = openRouterPlannerRequest({
    provider: { zdr: true },
    model: "google/gemini-3.1-flash-lite",
    prompt: "Create a wardrobe plan and return JSON.",
  });

  assert.equal(request.response_format.type, "json_schema");
  assert.equal(request.response_format.json_schema.name, "wardrobe_plan");
  assert.equal(request.response_format.json_schema.strict, true);
  assert.deepEqual(request.response_format.json_schema.schema, OPENROUTER_WARDROBE_PLAN_SCHEMA);
  assert.deepEqual(OPENROUTER_WARDROBE_PLAN_SCHEMA.required, WARDROBE_PLAN_SCHEMA.required);
  assert.match(JSON.stringify(WARDROBE_PLAN_SCHEMA), /maxItems/);
  assert.doesNotMatch(JSON.stringify(OPENROUTER_WARDROBE_PLAN_SCHEMA), /(?:minItems|maxItems)/);
  assert.equal(request.provider.require_parameters, true);
  assert.equal(request.provider.data_collection, "deny");
  assert.equal(request.provider.zdr, true);
});

test("leaves enough output headroom for a long multi-day plan", () => {
  const request = openRouterPlannerRequest({
    provider: {},
    model: "google/gemini-3.1-flash-lite",
    prompt: "Create a wardrobe plan and return JSON.",
  });

  assert.ok(request.max_tokens >= 8192, "a truncated plan costs a paid retry on the fallback model");
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
  assert.match(prompt, /exactly one individually purchasable garment or accessory/i);
  assert.match(prompt, /gloves, a scarf, and a beanie as three separate entries/i);
  assert.match(prompt, /normally two to four words/i);
  assert.match(prompt, /do not add its category/i);
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
