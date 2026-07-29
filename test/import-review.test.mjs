import assert from "node:assert/strict";
import test from "node:test";
import { garmentReviewImages } from "../src/import-review.js";

test("compares a generated garment with its approved source crop", () => {
  assert.deepEqual(garmentReviewImages({
    originalAssetUrl: "/original.png",
    stages: {
      crop: { assetUrl: "/approved-crop.png" },
      garment: { assetUrl: "/generated-garment.png" },
    },
  }), {
    source: "/approved-crop.png",
    generated: "/generated-garment.png",
  });
});

test("falls back to the original upload when an older job has no crop asset", () => {
  assert.deepEqual(garmentReviewImages({
    originalAssetUrl: "/original.png",
    stages: { garment: { assetUrl: "/generated-garment.png" } },
  }), {
    source: "/original.png",
    generated: "/generated-garment.png",
  });
});
