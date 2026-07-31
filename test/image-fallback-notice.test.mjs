import test from "node:test";
import assert from "node:assert/strict";
import { imageFallbackToast, withoutFallbackNotice } from "../src/image-fallback-notice.js";

test("formats known model ids and a live fallback reason for the toast", () => {
  const toast = imageFallbackToast({
    id: "notice-1",
    fromModel: "google/gemini-3.1-flash-image",
    toModel: "bytedance-seed/seedream-4.5",
    reason: "it flagged the request as explicit or sexual content",
    kind: "safety",
  });

  assert.equal(toast.title, "Trying another image model");
  assert.equal(
    toast.message,
    "Gemini 3.1 Flash Image denied generating this image because it flagged the request as explicit or sexual content. Wardrobe is now trying Seedream 4.5.",
  );
});

test("describes a failed transparency check as a rejected result, not a model denial", () => {
  const toast = imageFallbackToast({
    id: "notice-quality",
    fromModel: "google/gemini-3.1-flash-lite-image",
    toModel: "bytedance-seed/seedream-4.5",
    reason: "the result did not isolate the garment from its background",
    reasonCode: "garment_background_not_transparent",
    kind: "quality",
  });

  assert.equal(
    toast.message,
    "Gemini 3.1 Flash Lite Image returned an image, but Wardrobe's transparency check found that it still had an opaque background. Wardrobe is now trying Seedream 4.5.",
  );
});

test("formats completed synchronous fallbacks and removes transport metadata", () => {
  const response = {
    id: "garment-1",
    fallbackNotice: {
      fromModel: "primary/custom-model",
      toModel: "fallback/custom-model",
      reason: "it could not accept this image",
    },
  };
  const toast = imageFallbackToast(response.fallbackNotice, { completed: true });

  assert.match(toast.message, /Wardrobe completed it with fallback\/custom-model instead\.$/);
  assert.deepEqual(withoutFallbackNotice(response), { id: "garment-1" });
});
