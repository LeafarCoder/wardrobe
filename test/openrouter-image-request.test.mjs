import test from "node:test";
import assert from "node:assert/strict";
import { openRouterImageRequest } from "../scripts/import-job-api.mjs";

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
