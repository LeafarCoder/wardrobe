import assert from "node:assert/strict";
import test from "node:test";
import {
  GARMENT_VARIANT_THRESHOLD_DEFAULT,
  GARMENT_VARIANT_THRESHOLD_MAX,
  GARMENT_VARIANT_THRESHOLD_MIN,
  garmentColorVariants,
  garmentVersionFanSlot,
  normalizeVariantThreshold,
  supportsGarmentVersionFan,
} from "../src/garment-variants.js";

test("normalizes saved garment color versions without duplicating the wardrobe item", () => {
  assert.deepEqual(garmentColorVariants({
    colorVariants: [{
      id: "cognac",
      image: "/api/import/library/cognac.png",
      preview: "/api/import/library/cognac-preview.webp",
      primaryColor: "#91532F",
      secondaryColor: "#F2E2B8",
      primaryThreshold: 145,
      secondaryThreshold: 65,
      createdAt: "2026-07-25T12:00:00.000Z",
    }],
  }), [{
    id: "cognac",
    image: "/api/import/library/cognac.png",
    preview: "/api/import/library/cognac-preview.webp",
    thumbnail: null,
    primaryColor: "#91532f",
    secondaryColor: "#f2e2b8",
    primaryThreshold: 145,
    secondaryThreshold: 65,
    createdAt: "2026-07-25T12:00:00.000Z",
  }]);
});

test("keeps each recolor threshold within the supported range", () => {
  assert.equal(normalizeVariantThreshold(null), GARMENT_VARIANT_THRESHOLD_DEFAULT);
  assert.equal(normalizeVariantThreshold(0), GARMENT_VARIANT_THRESHOLD_MIN);
  assert.equal(normalizeVariantThreshold(999), GARMENT_VARIANT_THRESHOLD_MAX);
  assert.equal(normalizeVariantThreshold(127.6), 128);
});

test("offers the color-version fan only for tops and one-pieces with media", () => {
  assert.equal(supportsGarmentVersionFan("upperbody", 3, true), true);
  assert.equal(supportsGarmentVersionFan("wholebody", 2, true), true);
  assert.equal(supportsGarmentVersionFan("wholebody_up", 3, true), false);
  assert.equal(supportsGarmentVersionFan("upperbody", 1, true), false);
  assert.equal(supportsGarmentVersionFan("upperbody", 4, true), true);
  assert.equal(supportsGarmentVersionFan("upperbody", 5, true), false);
  assert.equal(supportsGarmentVersionFan("upperbody", 3, false), false);
});

test("fans two to four versions symmetrically around the vertical center", () => {
  assert.deepEqual(Array.from({ length: 2 }, (_, index) => garmentVersionFanSlot(index, 2)), [-0.5, 0.5]);
  assert.deepEqual(Array.from({ length: 3 }, (_, index) => garmentVersionFanSlot(index, 3)), [-1, 0, 1]);
  assert.deepEqual(Array.from({ length: 4 }, (_, index) => garmentVersionFanSlot(index, 4)), [-1.5, -0.5, 0.5, 1.5]);
  assert.equal(garmentVersionFanSlot(-1, 3), 0);
});
