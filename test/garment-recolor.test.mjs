import test from "node:test";
import assert from "node:assert/strict";
import {
  garmentVariationColors,
  normalizeHexColor,
  recolorGarmentPixels,
} from "../src/garment-recolor.js";

test("normalizes garment preview colors", () => {
  assert.equal(normalizeHexColor("#AbC"), "#aabbcc");
  assert.equal(normalizeHexColor("#12ef90"), "#12ef90");
  assert.equal(normalizeHexColor("red"), null);
});

test("selectively recolors the chosen color while preserving another color and alpha", () => {
  const pixels = new Uint8ClampedArray([
    192, 48, 48, 255,
    112, 24, 28, 255,
    42, 138, 64, 255,
    192, 48, 48, 0,
  ]);
  const originalGreen = [...pixels.slice(8, 11)];
  recolorGarmentPixels(pixels, "#c03030", "#355c7d", "#2a8a40");

  assert.ok(pixels[2] > pixels[0], "the red fabric should become blue-dominant");
  assert.ok(pixels[6] > pixels[4], "the darker red shadow should retain the target hue");
  assert.ok(
    Math.max(...originalGreen.map((value, index) => Math.abs(value - pixels[index + 8]))) < 18,
    "the alternate green area should remain substantially unchanged",
  );
  assert.deepEqual([...pixels.slice(12, 16)], [192, 48, 48, 0]);
});

test("recolors warm and cool texture variations across a near-neutral garment", () => {
  const pixels = new Uint8ClampedArray([
    163, 163, 135, 255,
    176, 160, 148, 255,
    130, 116, 105, 255,
    187, 178, 166, 255,
  ]);

  recolorGarmentPixels(pixels, "#a3a387", "#304b65");

  for (let index = 0; index < pixels.length; index += 4) {
    assert.ok(
      pixels[index + 2] > pixels[index],
      `textured garment pixel ${index / 4} should become blue-dominant`,
    );
  }
});

test("gives black leather a visible color while protecting bright metal", () => {
  const pixels = new Uint8ClampedArray([
    18, 18, 18, 255,
    50, 48, 45, 255,
    90, 88, 85, 255,
    214, 214, 212, 255,
  ]);
  const originalMetal = [...pixels.slice(12, 15)];

  recolorGarmentPixels(pixels, "#000000", "#91532f");

  for (let index = 0; index < 12; index += 4) {
    assert.ok(
      pixels[index] > pixels[index + 2],
      `leather pixel ${index / 4} should receive a visible warm-brown tone`,
    );
  }
  assert.ok(
    Math.max(...originalMetal.map((value, index) => Math.abs(value - pixels[index + 12]))) < 12,
    "bright metal hardware should stay substantially unchanged",
  );
});

test("recolors footwear leather while keeping a pale rubber sole neutral", () => {
  const pixels = new Uint8ClampedArray([
    58, 43, 36, 255,
    103, 70, 50, 255,
    232, 226, 210, 255,
    188, 183, 169, 255,
  ]);
  const originalLeather = [...pixels.slice(0, 6)];
  const originalSole = [...pixels.slice(8, 15)];

  recolorGarmentPixels(pixels, "#684331", "#91532f", null, {
    name: "Brown leather loafers",
    part: "shoes",
    tags: ["leather", "slip-on"],
  });

  assert.ok(
    Math.max(...originalLeather.map((value, index) => Math.abs(value - pixels[index]))) > 14,
    "the leather upper should visibly adopt the cognac color",
  );
  assert.ok(
    Math.max(...originalSole.map((value, index) => Math.abs(value - pixels[index + 8]))) < 10,
    "the pale rubber sole and its shadow should remain substantially neutral",
  );
});

test("recolors worn leather texture continuously instead of leaving neutral patches", () => {
  const pixels = new Uint8ClampedArray([
    159, 120, 98, 255,
    128, 93, 76, 255,
    91, 82, 77, 255,
    66, 60, 57, 255,
    238, 231, 204, 255,
  ]);
  const originalSole = [...pixels.slice(16, 19)];

  recolorGarmentPixels(pixels, "#9f7862", "#242321", "#fbf4cb", {
    name: "Brown leather loafers",
    part: "shoes",
    tags: ["leather", "slip-on"],
    materials: ["leather"],
    channel: "primary",
  });

  for (let index = 0; index < 16; index += 4) {
    assert.ok(
      Math.max(pixels[index], pixels[index + 1], pixels[index + 2])
        - Math.min(pixels[index], pixels[index + 1], pixels[index + 2]) < 24,
      `leather texture pixel ${index / 4} should consistently approach charcoal`,
    );
  }
  assert.ok(
    Math.max(...originalSole.map((value, index) => Math.abs(value - pixels[index + 16]))) < 10,
    "the contrasting pale sole should remain protected",
  );
});

test("treats a darker same-hue jacket color as shading rather than protected material", () => {
  const pixels = new Uint8ClampedArray([
    35, 61, 108, 255,
    24, 43, 79, 255,
    42, 50, 64, 255,
    14, 25, 48, 255,
  ]);

  recolorGarmentPixels(pixels, "#233d6c", "#4f6847", "#0e1930", {
    name: "Dark blue suit jacket",
    part: "wholebody_up",
    tags: ["suit", "tailored"],
    materials: ["wool"],
    channel: "primary",
  });

  for (let index = 0; index < pixels.length; index += 4) {
    assert.ok(
      pixels[index + 1] > pixels[index + 2],
      `jacket shade pixel ${index / 4} should become green rather than stay blue`,
    );
  }
});

test("still allows a pale shoe upper to change when pale material is the selected color", () => {
  const pixels = new Uint8ClampedArray([
    235, 232, 222, 255,
    210, 206, 194, 255,
  ]);

  recolorGarmentPixels(pixels, "#eeeae0", "#304b65", null, {
    name: "Off-white canvas sneakers",
    part: "shoes",
    tags: ["canvas"],
  });

  assert.ok(pixels[2] > pixels[0], "a selected off-white footwear material should remain recolorable");
  assert.ok(pixels[6] > pixels[4], "the shaded upper should also receive the selected blue");
});

test("uses a saved neutral secondary shoe color as a protected material boundary", () => {
  const pixels = new Uint8ClampedArray([
    187, 184, 183, 255,
    150, 148, 147, 255,
    221, 220, 221, 255,
    238, 238, 238, 255,
  ]);
  const protectedPixels = [...pixels.slice(8)];

  recolorGarmentPixels(pixels, "#bbb8b7", "#304b65", "#dddCDD", {
    name: "Grey sneakers",
    part: "shoes",
    threshold: 100,
    softness: 35,
    strength: 100,
  });

  assert.ok(pixels[2] > pixels[0], "the primary grey upper should become blue");
  assert.ok(pixels[6] > pixels[4], "a darker upper shade should retain the target hue");
  assert.deepEqual([...pixels.slice(8)], protectedPixels, "the lighter secondary material should remain unchanged");
});

test("makes color range and strength materially affect the recolor mask", () => {
  const original = [110, 105, 100, 255];
  const narrow = new Uint8ClampedArray(original);
  const wide = new Uint8ClampedArray(original);
  const zeroStrength = new Uint8ClampedArray([187, 184, 183, 255]);

  recolorGarmentPixels(narrow, "#bbb8b7", "#304b65", null, { threshold: 40, softness: 20 });
  recolorGarmentPixels(wide, "#bbb8b7", "#304b65", null, { threshold: 160, softness: 20 });
  recolorGarmentPixels(zeroStrength, "#bbb8b7", "#304b65", null, { strength: 0 });

  assert.deepEqual([...narrow], original, "minimum range should protect a more distant neutral shade");
  assert.ok(wide[2] > wide[0], "maximum range should include the same neutral shade");
  assert.deepEqual([...zeroStrength], [187, 184, 183, 255], "zero strength should leave selected pixels unchanged");
});

test("offers five distinct local preview colors", () => {
  const suggestions = garmentVariationColors("#355c7d", "#7a3d49", 5);
  assert.equal(suggestions.length, 5);
  assert.equal(new Set(suggestions.map((suggestion) => suggestion.color)).size, 5);
  assert.ok(suggestions.every((suggestion) => suggestion.label && normalizeHexColor(suggestion.color)));
});

test("suggests realistic leather colors for belts and shoes", () => {
  const belt = garmentVariationColors("#000000", null, 5, {
    name: "Leather belt",
    part: "accessories_up",
    tags: ["leather"],
  });
  const shoes = garmentVariationColors("#93563c", null, 5, {
    name: "Brown leather shoes",
    part: "shoes",
  });

  assert.deepEqual(belt.map((suggestion) => suggestion.label), [
    "Espresso",
    "Dark brown",
    "Brown",
    "Cognac",
    "Tan",
  ]);
  assert.ok(shoes.every((suggestion) => [
    "Black",
    "Espresso",
    "Dark brown",
    "Cognac",
    "Tan",
    "Oxblood",
  ].includes(suggestion.label)));
});

test("uses category-aware palettes for shirts and trousers", () => {
  const shirt = garmentVariationColors("#0b292f", null, 5, {
    name: "Teal button-down shirt",
    part: "upperbody",
  });
  const chinos = garmentVariationColors("#a3a387", null, 5, {
    name: "Beige chino pants",
    part: "lowerbody",
  });

  assert.ok(shirt.some((suggestion) => suggestion.label === "Sky blue"));
  assert.ok(shirt.some((suggestion) => suggestion.label === "Off-white"));
  assert.ok(chinos.some((suggestion) => suggestion.label === "Olive"));
  assert.ok(chinos.some((suggestion) => suggestion.label === "Charcoal"));
});
