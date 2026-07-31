import test from "node:test";
import assert from "node:assert/strict";
import { imageFallbackToast, withoutFallbackNotice } from "../src/image-fallback-notice.js";

test("formats known model ids and a live fallback reason for the toast", () => {
  const toast = imageFallbackToast({
    id: "notice-1",
    fromModel: "google/gemini-3.1-flash-image",
    toModel: "bytedance-seed/seedream-4.5",
    reason: "it flagged the request as explicit or sexual content",
  });

  assert.equal(toast.title, "Trying another image model");
  assert.equal(
    toast.message,
    "Gemini 3.1 Flash Image denied generating this image because it flagged the request as explicit or sexual content. Wardrobe is now trying Seedream 4.5.",
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
