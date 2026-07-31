import assert from "node:assert/strict";
import test from "node:test";
import {
  GARMENT_VARIANT_THRESHOLD_DEFAULT,
  GARMENT_VARIANT_THRESHOLD_MAX,
  GARMENT_VARIANT_THRESHOLD_MIN,
  GARMENT_ORIGINAL_VERSION_ID,
  garmentColorVariants,
  garmentVersionLayout,
  garmentVersionFanSlot,
  garmentVersionOrder,
  garmentVersionSpreadAngle,
  garmentVersionSpreadMetrics,
  isCompleteGarmentVersionOrder,
  moveGarmentVersion,
  normalizeVariantThreshold,
  selectedGarmentVariantId,
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

test("keeps a saved color-version selection only while that version exists", () => {
  const record = {
    selectedColorVariantId: "cognac",
    colorVariants: [{ id: "cognac", image: "/cognac.png" }],
  };
  assert.equal(selectedGarmentVariantId(record), "cognac");
  assert.equal(selectedGarmentVariantId({ ...record, selectedColorVariantId: "missing" }), null);
  assert.equal(selectedGarmentVariantId({ ...record, selectedColorVariantId: null }), null);
});

test("keeps the first ordered version as the saved garment default", () => {
  const record = {
    colorVariants: [
      { id: "navy", image: "/navy.png" },
      { id: "cream", image: "/cream.png" },
    ],
    colorVariantOrder: ["cream", GARMENT_ORIGINAL_VERSION_ID, "navy"],
  };
  assert.deepEqual(garmentVersionOrder(record), ["cream", GARMENT_ORIGINAL_VERSION_ID, "navy"]);
  assert.equal(selectedGarmentVariantId(record), "cream");
  assert.equal(isCompleteGarmentVersionOrder(record, ["navy", "cream", GARMENT_ORIGINAL_VERSION_ID]), true);
  assert.equal(isCompleteGarmentVersionOrder(record, ["navy", GARMENT_ORIGINAL_VERSION_ID]), false);
  assert.deepEqual(
    moveGarmentVersion(garmentVersionOrder(record), "navy", "cream"),
    ["navy", "cream", GARMENT_ORIGINAL_VERSION_ID],
  );
});

test("uses a horizontal spread for every multi-version garment with hero media", () => {
  assert.equal(garmentVersionLayout("upperbody", 2, true), "spread");
  assert.equal(garmentVersionLayout("upperbody", 3, true), "spread");
  assert.equal(garmentVersionLayout("upperbody", 4, true), "spread");
  assert.equal(garmentVersionLayout("upperbody", 5, true), "spread");
  assert.equal(garmentVersionLayout("upperbody", 6, true), "spread");
  assert.equal(garmentVersionLayout("wholebody_up", 3, true), "spread");
  assert.equal(garmentVersionLayout("shoes", 2, true), "spread");
  assert.equal(garmentVersionLayout("wholebody", 3, false), "carousel");

  assert.equal(supportsGarmentVersionFan("upperbody", 3, true), false);
  assert.equal(supportsGarmentVersionFan("wholebody", 2, true), false);
  assert.equal(supportsGarmentVersionFan("wholebody_up", 3, true), false);
  assert.equal(supportsGarmentVersionFan("upperbody", 1, true), false);
  assert.equal(supportsGarmentVersionFan("upperbody", 4, true), false);
  assert.equal(supportsGarmentVersionFan("upperbody", 5, true), false);
  assert.equal(supportsGarmentVersionFan("upperbody", 3, false), false);
});

test("positions expanded versions symmetrically around the center", () => {
  assert.deepEqual(Array.from({ length: 2 }, (_, index) => garmentVersionFanSlot(index, 2)), [-0.5, 0.5]);
  assert.deepEqual(Array.from({ length: 3 }, (_, index) => garmentVersionFanSlot(index, 3)), [-1, 0, 1]);
  assert.deepEqual(Array.from({ length: 4 }, (_, index) => garmentVersionFanSlot(index, 4)), [-1.5, -0.5, 0.5, 1.5]);
  assert.deepEqual(Array.from({ length: 5 }, (_, index) => garmentVersionFanSlot(index, 5)), [-2, -1, 0, 1, 2]);
  assert.equal(garmentVersionFanSlot(-1, 3), 0);
});

test("keeps every horizontal version spread separated without rotation", () => {
  assert.deepEqual(garmentVersionSpreadMetrics(2), { scale: 0.82, stepPx: 94 });
  assert.deepEqual(garmentVersionSpreadMetrics(3), { scale: 0.74, stepPx: 76 });
  assert.deepEqual(garmentVersionSpreadMetrics(4), { scale: 0.68, stepPx: 62 });
  assert.deepEqual(garmentVersionSpreadMetrics(5), { scale: 0.62, stepPx: 58 });
  assert.deepEqual(garmentVersionSpreadMetrics(7), { scale: 0.54, stepPx: 50 });
  assert.deepEqual(Array.from({ length: 5 }, (_, index) => garmentVersionSpreadAngle(index, 5)), [0, 0, 0, 0, 0]);
  assert.equal(garmentVersionSpreadAngle(5, 5), 0);
});
