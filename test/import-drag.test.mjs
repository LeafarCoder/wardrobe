import assert from "node:assert/strict";
import test from "node:test";
import { hasFileDrag } from "../src/import-drag.js";

test("recognizes external file drags before files are available", () => {
  assert.equal(hasFileDrag({ types: ["Files"], files: [] }), true);
});

test("recognizes file drops even when the Files type is unavailable", () => {
  assert.equal(hasFileDrag({ types: [], files: [{ type: "image/png" }] }), true);
});

test("ignores internal carousel and wardrobe reorder drags", () => {
  assert.equal(hasFileDrag({ types: ["text/plain"], files: [] }), false);
  assert.equal(hasFileDrag({ types: ["text/uri-list", "text/html"], files: [] }), false);
  assert.equal(hasFileDrag(null), false);
});
