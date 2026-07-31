import test from "node:test";
import assert from "node:assert/strict";
import { colorGroup, compareWardrobeColors, hexToHsl } from "../src/color-organization.js";

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

test("sorts garments around the hue spectrum before light-to-dark neutrals", () => {
  const garments = [
    { id: "invalid", name: "Unknown", color: "transparent" },
    { id: "black", name: "Black", color: "#111111" },
    { id: "purple", name: "Purple", color: "#7f32b8" },
    { id: "green", name: "Green", color: "#36a852" },
    { id: "white", name: "White", color: "#f4f4f2" },
    { id: "yellow", name: "Yellow", color: "#e3c72f" },
    { id: "blue", name: "Blue", color: "#3267b8" },
    { id: "red-high", name: "Warm red", color: "#cf3040" },
    { id: "orange", name: "Orange", color: "#d97528" },
    { id: "red-low", name: "Cool red", color: "#cf3050" },
    { id: "gray", name: "Gray", color: "#777777" },
  ];

  assert.deepEqual(
    garments.sort(compareWardrobeColors).map((item) => item.id),
    ["red-low", "red-high", "orange", "yellow", "green", "blue", "purple", "white", "gray", "black", "invalid"],
  );
});
