import test from "node:test";
import assert from "node:assert/strict";
import { colorGroup, hexToHsl } from "../src/color-organization.js";

test("keeps the reported muted green trousers with greens and teals", () => {
  assert.deepEqual(hexToHsl("#406040"), {
    hue: 120,
    saturation: 0.2,
    lightness: 0.3137254901960784,
  });
  assert.equal(colorGroup({ color: "#406040" }).id, "greens");
});

test("recognizes muted chromatic colors before neutral buckets", () => {
  const cases = [
    ["muted olive", "#65704d", "greens"],
    ["sage", "#71866b", "greens"],
    ["navy", "#29394d", "blues"],
    ["burgundy", "#673b47", "reds"],
    ["brown", "#654a37", "browns"],
  ];

  for (const [name, color, expected] of cases) {
    assert.equal(colorGroup({ color }).id, expected, name);
  }
});

test("keeps genuinely neutral colors in neutral buckets", () => {
  const cases = [
    ["white", "#f4f4f2", "light-neutrals"],
    ["light gray", "#aaa8a3", "light-neutrals"],
    ["dark gray", "#393a3a", "dark-neutrals"],
    ["near-black", "#101111", "dark-neutrals"],
  ];

  for (const [name, color, expected] of cases) {
    assert.equal(colorGroup({ color }).id, expected, name);
  }
});

test("uses the primary color and does not let a secondary accent move the item", () => {
  assert.equal(colorGroup({ color: "#406040", secondaryColor: "#b0d0c0" }).id, "greens");
  assert.equal(colorGroup({ color: "#393a3a", secondaryColor: "#40a060" }).id, "dark-neutrals");
});
