import assert from "node:assert/strict";
import test from "node:test";
import {
  openRouterImageRequest,
  openRouterImageRouting,
  openRouterProviderPin,
  providerResponseError,
  providerSlugSuitsModel,
} from "../scripts/import-job-api.mjs";

// Mirrors the deployed Railway environment that produced the reported failure.
const DEPLOYED_PROVIDER = {
  zdr: true,
  garmentProvider: "black-forest-labs",
  imageFallbackProvider: "seed",
  imageProvider: "",
  modeledProvider: "",
};

test("keeps a provider override that belongs to the model's family", () => {
  assert.equal(providerSlugSuitsModel("black-forest-labs", "black-forest-labs/flux.2-klein-4b"), true);
  assert.equal(providerSlugSuitsModel("seed", "bytedance-seed/seedream-4.5"), true);
  assert.equal(providerSlugSuitsModel("google-vertex/global", "google/gemini-3.1-flash-image"), true);
  assert.equal(providerSlugSuitsModel("google-ai-studio", "google/gemini-3.1-flash-lite-image"), true);
});

test("rejects a provider override that cannot serve the model", () => {
  assert.equal(providerSlugSuitsModel("black-forest-labs", "google/gemini-3.1-flash-image"), false);
  assert.equal(providerSlugSuitsModel("seed", "google/gemini-3.1-flash-lite-image"), false);
  assert.equal(providerSlugSuitsModel("google-vertex/global", "black-forest-labs/flux.2-klein-4b"), false);
});

test("trusts an override for a model family it does not recognize", () => {
  assert.equal(providerSlugSuitsModel("some-provider", "unknown-vendor/some-model"), true);
});

test("drops a stale garment provider pin when the profile switches to another model", () => {
  // The exact production failure: OPENROUTER_GARMENT_PROVIDER was pinned for
  // FLUX Klein, then the profile chose a Gemini image model for garments.
  assert.deepEqual(openRouterProviderPin("black-forest-labs", "google/gemini-3.1-flash-image"), []);
  assert.deepEqual(
    openRouterProviderPin("black-forest-labs", "black-forest-labs/flux.2-klein-4b"),
    ["black-forest-labs"],
  );
});

test("keeps only the usable entries of a multi-provider override", () => {
  assert.deepEqual(
    openRouterProviderPin("black-forest-labs, google-vertex/global", "google/gemini-3.1-flash-image"),
    ["google-vertex/global"],
  );
});

test("an ignored override still leaves a zero-data-retention route for Google models", () => {
  const request = openRouterImageRequest({
    model: "google/gemini-3.1-flash-image",
    prompt: "a garment",
    inputReferences: [],
    size: "1024x1024",
    resolution: "1K",
    routing: undefined,
  });

  assert.equal(request.provider, undefined, "routing is decided before the request is built");
  assert.equal(request.model, "google/gemini-3.1-flash-image");
});

test("the deployed configuration routes every garment model it is allowed to pick", () => {
  const routeFor = (model) => openRouterImageRouting(DEPLOYED_PROVIDER, model, "", "garment");

  // The pin still applies to the model it was meant for.
  assert.deepEqual(routeFor("black-forest-labs/flux.2-klein-4b"), {
    only: ["black-forest-labs"],
    allow_fallbacks: false,
  });
  // Every other garment option in the AI preferences now routes instead of failing.
  for (const model of [
    "google/gemini-3.1-flash-lite-image",
    "google/gemini-3.1-flash-image",
    "google/gemini-3-pro-image",
  ]) {
    assert.deepEqual(routeFor(model), { only: ["google-vertex/global"], allow_fallbacks: false }, model);
  }
});

test("the deployed configuration keeps its Seedream fallback pin", () => {
  assert.deepEqual(
    openRouterImageRouting(DEPLOYED_PROVIDER, "bytedance-seed/seedream-4.5", "google/gemini-3.1-flash-image", "garment"),
    { only: ["seed"], allow_fallbacks: false },
  );
});

test("modeled looks route without a pin under zero data retention", () => {
  assert.deepEqual(
    openRouterImageRouting(DEPLOYED_PROVIDER, "google/gemini-3.1-flash-image", "", "modeled"),
    { only: ["google-vertex/global"], allow_fallbacks: false },
  );
});

test("explains a routing dead end instead of blaming the model name", () => {
  const error = providerResponseError(
    { status: 404 },
    {
      error: {
        message: "No allowed providers are available for the selected model.",
        code: 404,
        metadata: {
          available_providers: ["google-vertex", "google-ai-studio"],
          requested_providers: ["black-forest-labs"],
        },
      },
    },
    {
      provider: { id: "openrouter", label: "OpenRouter", keyEnv: "OPENROUTER_API_KEY" },
      model: "google/gemini-3.1-flash-image",
      operation: "garment",
    },
  );

  assert.equal(error.code, "openrouter_provider_unavailable");
  assert.match(error.message, /no allowed provider for google\/gemini-3\.1-flash-image/i);
  assert.match(error.message, /asked for black-forest-labs/i);
  assert.match(error.message, /served by google-vertex, google-ai-studio/i);
  assert.match(error.message, /OPENROUTER_GARMENT_PROVIDER/);
  assert.doesNotMatch(error.message, /Check the model name/i);
});

test("still reports a genuinely unknown model as a model problem", () => {
  const error = providerResponseError(
    { status: 404 },
    { error: { message: "The model does not exist", code: 404 } },
    {
      provider: { id: "openrouter", label: "OpenRouter", keyEnv: "OPENROUTER_API_KEY" },
      model: "google/not-a-real-model",
      operation: "garment",
    },
  );

  assert.equal(error.code, "openrouter_model_not_found");
  assert.match(error.message, /could not find or access google\/not-a-real-model/i);
});
