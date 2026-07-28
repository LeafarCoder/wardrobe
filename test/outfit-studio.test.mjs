import assert from "node:assert/strict";
import test from "node:test";
import {
  currentNorthernSeason,
  generateLocalOutfitCandidates,
  normalizeWardrobeOutfits,
  wardrobeOutfitAssets,
  wardrobeOutfitsAfterGarmentMerge,
} from "../src/outfit-studio.js";

const ITEMS = [
  { id: "top-a", part: "upperbody", name: "Linen shirt", seasons: ["summer"], materials: ["linen"] },
  { id: "top-b", part: "upperbody", name: "Black evening top", seasons: ["summer"], tags: ["evening"] },
  { id: "bottom-a", part: "lowerbody", name: "Cotton trousers", seasons: ["summer"], materials: ["cotton"] },
  { id: "bottom-b", part: "lowerbody", name: "Dark skirt", seasons: ["summer"], tags: ["elegant"] },
  { id: "dress-a", part: "wholebody", name: "Dinner dress", seasons: ["summer"], tags: ["elegant"] },
  { id: "shoe-a", part: "shoes", name: "Walking sneakers", tags: ["comfortable"] },
  { id: "shoe-b", part: "shoes", name: "Evening shoes", tags: ["evening"] },
  { id: "bag-a", part: "accessories_up", name: "Small bag" },
];

test("derives the Northern Hemisphere season from the local calendar", () => {
  assert.equal(currentNorthernSeason(new Date(2026, 0, 20)), "winter");
  assert.equal(currentNorthernSeason(new Date(2026, 3, 20)), "spring");
  assert.equal(currentNorthernSeason(new Date(2026, 6, 20)), "summer");
  assert.equal(currentNorthernSeason(new Date(2026, 9, 20)), "autumn");
});

test("creates three distinct editable local outfit candidates", () => {
  let seed = 0;
  const candidates = generateLocalOutfitCandidates(ITEMS, {
    occasion: "dinner",
    weather: ["hot"],
    season: "summer",
  }, { random: () => ((seed += 37) % 101) / 101 });
  assert.equal(candidates.length, 3);
  assert.equal(new Set(candidates.map((candidate) => candidate.garments.map((item) => item.itemId).sort().join("|"))).size, 3);
  for (const candidate of candidates) {
    const ids = candidate.garments.map((item) => item.itemId);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.length <= 6);
  }
});

test("normalizes saved outfits, retargets merges, and collects modeled assets", () => {
  const outfits = normalizeWardrobeOutfits([{
    id: "saved-one",
    name: "Dinner",
    garments: [
      { itemId: "discarded", variantId: "blue" },
      { itemId: "keeper" },
      { itemId: "discarded" },
    ],
    context: { occasion: "dinner", weather: ["mild", "unknown"], season: "summer" },
    presentation: { background: "restaurant", style: "editorial", pose: "sitting", direction: "Warm evening" },
    modeledLooks: [{ id: "look", image: "/look.png", preview: "/look.webp" }],
  }]);
  assert.equal(outfits[0].garments.length, 2);
  assert.deepEqual(outfits[0].context.weather, ["mild"]);
  const merged = wardrobeOutfitsAfterGarmentMerge(outfits, "keeper", "discarded");
  assert.deepEqual(merged[0].garments.map((item) => item.itemId), ["keeper"]);
  assert.deepEqual(wardrobeOutfitAssets(merged), ["/look.png", "/look.webp"]);
});
