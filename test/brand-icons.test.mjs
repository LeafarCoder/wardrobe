import assert from "node:assert/strict";
import test from "node:test";
import { BRAND_MARKS, brandMarkFor, normalizeBrandIconKey } from "../src/brand-icons.js";
import { BRAND_OPTIONS } from "../src/wardrobe-metadata.js";

test("gives every suggested wardrobe brand its own local mark", () => {
  for (const brand of BRAND_OPTIONS) {
    const key = normalizeBrandIconKey(brand);
    assert.ok(BRAND_MARKS[key], `${brand} is missing a brand mark`);
    const mark = brandMarkFor(brand);
    assert.ok(mark.path || mark.glyph);
    assert.match(mark.hex, /^[0-9A-F]{6}$/i);
  }
});

test("uses maintained vector paths for the major bundled brand icons", () => {
  for (const brand of ["Adidas", "Nike", "Zara", "H&M", "Uniqlo"]) {
    const mark = brandMarkFor(brand);
    assert.equal(mark.type, "path");
    assert.equal(mark.source, "Simple Icons");
    assert.ok(mark.path.length > 20);
  }
});

test("creates a stable monogram for a custom brand", () => {
  assert.deepEqual(brandMarkFor("Local Atelier"), {
    type: "wordmark",
    glyph: "LA",
    hex: "68645E",
  });
});
