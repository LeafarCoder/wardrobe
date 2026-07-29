import assert from "node:assert/strict";
import test from "node:test";

import { cropCenteredCoverPosition, originalPhotoPosition } from "../src/original-photo-position.js";

test("shoe crop is lifted as far as a portrait cover image allows", () => {
  assert.equal(cropCenteredCoverPosition({
    box: { x: 506, y: 935, width: 272, height: 64 },
    imageWidth: 1200,
    imageHeight: 1600,
    frameWidth: 520,
    frameHeight: 370,
  }), "50.0% 100.0%");
});

test("shoe fallback starts bottom-aligned before image dimensions are known", () => {
  assert.equal(originalPhotoPosition({
    part: "shoes",
    boundingBox: { x: 506, y: 935, width: 272, height: 64 },
    originalFocusBox: { x: 462, y: 313, width: 381, height: 687 },
  }), "64.2% 100%");
});

test("cover positioning centers a crop when there is enough image overflow", () => {
  assert.equal(cropCenteredCoverPosition({
    box: { x: 350, y: 350, width: 100, height: 100 },
    imageWidth: 1200,
    imageHeight: 1600,
    frameWidth: 520,
    frameHeight: 370,
  }), "50.0% 28.6%");
});

test("original photo positioning keeps the established non-shoe fallback", () => {
  assert.equal(originalPhotoPosition({ part: "lowerbody" }), "50% 68%");
});

test("invalid dimensions do not produce a cover position", () => {
  assert.equal(cropCenteredCoverPosition({
    box: { x: 0, y: 0, width: 100, height: 100 },
    imageWidth: 0,
    imageHeight: 1600,
    frameWidth: 520,
    frameHeight: 370,
  }), null);
});
