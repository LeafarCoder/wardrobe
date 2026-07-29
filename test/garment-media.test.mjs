import test from "node:test";
import assert from "node:assert/strict";
import {
  isCompleteGarmentMediaOrder,
  moveGarmentMedia,
  normalizeGarmentMediaOrder,
  orderedGarmentMedia,
} from "../src/garment-media.js";

const record = {
  sourcePhotos: [
    { id: "source-1", image: "/original-1.jpg" },
    { id: "source-2", image: "/original-2.jpg" },
  ],
  modeledLooks: [
    { id: "look-1", image: "/look-1.jpg" },
    { id: "look-2", image: "/look-2.jpg" },
  ],
};

test("mixes generated looks and originals with the newest generated look first", () => {
  assert.deepEqual(normalizeGarmentMediaOrder(record), [
    "modeled:look-2",
    "modeled:look-1",
    "source:source-1",
    "source:source-2",
  ]);
  assert.deepEqual(orderedGarmentMedia(record).map((media) => media.kind), [
    "generated",
    "generated",
    "original",
    "original",
  ]);
});

test("preserves a custom mixed order and prepends a newly generated look", () => {
  const custom = {
    ...record,
    mediaOrder: ["source:source-2", "modeled:look-1", "source:source-1", "modeled:look-2"],
  };
  assert.deepEqual(normalizeGarmentMediaOrder(custom), custom.mediaOrder);
  assert.deepEqual(normalizeGarmentMediaOrder({
    ...custom,
    modeledLooks: [...custom.modeledLooks, { id: "look-3", image: "/look-3.jpg" }],
  }), ["modeled:look-3", ...custom.mediaOrder]);
});

test("drops deleted media, appends a newly connected original, and validates complete orders", () => {
  const changed = {
    ...record,
    modeledLooks: [{ id: "look-2", image: "/look-2.jpg" }],
    sourcePhotos: [...record.sourcePhotos, { id: "source-3", image: "/original-3.jpg" }],
    mediaOrder: ["modeled:look-1", "source:source-2", "modeled:look-2", "source:source-1"],
  };
  assert.deepEqual(normalizeGarmentMediaOrder(changed), [
    "source:source-2",
    "modeled:look-2",
    "source:source-1",
    "source:source-3",
  ]);
  assert.equal(isCompleteGarmentMediaOrder(record, normalizeGarmentMediaOrder(record)), true);
  assert.equal(isCompleteGarmentMediaOrder(record, ["modeled:look-2"]), false);
});

test("moves a dragged thumbnail before its drop target", () => {
  assert.deepEqual(
    moveGarmentMedia(["one", "two", "three", "four"], "four", "two"),
    ["one", "four", "two", "three"],
  );
});
