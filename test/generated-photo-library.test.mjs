import test from "node:test";
import assert from "node:assert/strict";
import {
  collectGeneratedPhotoLibrary,
  generatedPhotoGarmentSnapshots,
  normalizeGeneratedPhotoProvenance,
} from "../src/generated-photo-library.js";

const items = [{
  id: "shirt",
  name: "Linen shirt",
  image: "/shirt.png",
  thumbnail: "/shirt-thumb.webp",
  color: "#ffffff",
  colorVariants: [{ id: "blue", image: "/shirt-blue.png", primaryColor: "#224488" }],
  modeledLooks: [{
    id: "garment-look",
    image: "/garment-look.png",
    variantId: "blue",
    generatedAt: "2026-07-01T10:00:00Z",
    context: { pose: "walking", imageRatio: "portrait" },
  }],
}];

test("collects garment, Outfit Studio, and Planner photos with their source metadata", () => {
  const user = {
    id: "owner",
    name: "Rafael",
    wardrobeOutfits: [{
      id: "outfit-one",
      name: "Dinner look",
      garments: [{ itemId: "shirt", variantId: "blue" }],
      context: { occasion: "dinner", weather: ["mild"], season: "summer" },
      presentation: { background: "restaurant", style: "editorial", pose: "standing" },
      modeledLooks: [{ id: "studio-look", image: "/studio.png", generatedAt: "2026-07-02T10:00:00Z" }],
    }],
    wardrobePlans: [{
      id: "plan-one",
      input: { kind: "trip", title: "Lisbon", location: "Lisbon", startDate: "2026-08-01", endDate: "2026-08-03" },
      result: {
        expectedWeather: { summary: "Warm and sunny", temperatureRange: "22–29 °C", conditions: ["sun"] },
        outfitIdeas: [{
          name: "Arrival day",
          itemIds: ["shirt"],
          note: "Comfortable for walking",
          modeledLooks: [{ id: "plan-look", image: "/plan.png", generatedAt: "2026-07-03T10:00:00Z" }],
        }],
      },
    }],
  };

  const photos = collectGeneratedPhotoLibrary(items, user);

  assert.deepEqual(photos.map((photo) => photo.source), ["planner", "outfit-studio", "garment"]);
  assert.equal(photos[0].details.find((entry) => entry.label === "Expected weather").value, "Warm and sunny");
  assert.equal(photos[1].details.find((entry) => entry.label === "Occasion").value, "Dinner");
  assert.equal(photos[2].garments[0].version, "Color version 2 of 2");
  assert.equal(photos[2].garments[0].thumbnail, "/shirt-thumb.webp");
});

test("uses immutable provenance snapshots instead of a later edited outfit", () => {
  const photos = collectGeneratedPhotoLibrary(items, {
    wardrobeOutfits: [{
      id: "outfit-one",
      name: "Renamed outfit",
      garments: [],
      context: { occasion: "work" },
      modeledLooks: [{
        id: "look-one",
        image: "/look.png",
        provenance: {
          source: "outfit-studio",
          garments: [{ itemId: "shirt", name: "Linen shirt", variantId: "blue", version: "Color version 2 of 2" }],
          outfit: { id: "outfit-one", name: "Original dinner look", context: { occasion: "dinner" }, presentation: {} },
        },
      }],
    }],
  });

  assert.equal(photos.find((photo) => photo.source === "outfit-studio").title, "Original dinner look");
  assert.equal(photos.find((photo) => photo.source === "outfit-studio").details[0].value, "Dinner");
});

test("normalizes provenance and builds wearer-aware garment snapshots", () => {
  const snapshots = generatedPhotoGarmentSnapshots(
    [{ itemId: "shirt", variantId: "blue", wearerId: "owner" }],
    items,
    [{ id: "owner", name: "Rafael" }],
  );
  const provenance = normalizeGeneratedPhotoProvenance({
    source: "outfit-studio",
    garments: snapshots,
    outfit: { id: "one", name: "Look", context: { occasion: "dinner" } },
  });

  assert.equal(provenance.garments[0].wearerName, "Rafael");
  assert.equal(provenance.garments[0].primaryColor, "#224488");
  assert.equal(provenance.outfit.name, "Look");
});
