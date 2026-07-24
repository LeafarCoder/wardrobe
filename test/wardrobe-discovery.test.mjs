import test from "node:test";
import assert from "node:assert/strict";
import {
  activeFilterCount,
  collectFacetOptions,
  groupWardrobeItems,
  normalizeGarmentSeasons,
  normalizeSavedViews,
  normalizeWardrobeDisplayPreferences,
  normalizeWardrobePlans,
  WARDROBE_ITEM_TYPES,
  wardrobeItemMatches,
} from "../src/wardrobe-discovery.js";

const wardrobe = [
  {
    id: "linen-shirt",
    name: "Teal Linen Shirt",
    part: "upperbody",
    color: "#316a62",
    brand: "Arket",
    tags: ["linen", "relaxed", "button-up"],
    sizes: ["M"],
    fits: ["Relaxed"],
    materials: ["Linen"],
    seasons: ["spring", "summer"],
  },
  {
    id: "wool-trousers",
    name: "Charcoal Trousers",
    part: "lowerbody",
    color: "#343638",
    brand: "COS",
    tags: ["tailored", "wool"],
    sizes: ["EU 42"],
    fits: ["Tailored"],
    materials: ["Wool"],
    seasons: ["autumn", "winter"],
  },
];

test("uses four explicit seasons and expands legacy all-season garments", () => {
  assert.deepEqual(normalizeGarmentSeasons(["all-season"]), [
    "spring",
    "summer",
    "autumn",
    "winter",
  ]);
  assert.deepEqual(normalizeGarmentSeasons(["Summer", "winter", "invalid"]), [
    "summer",
    "winter",
  ]);
});

test("supports dresses and one-pieces as a distinct wardrobe category", () => {
  assert.equal(WARDROBE_ITEM_TYPES.has("wholebody"), true);
  assert.equal(wardrobeItemMatches({ part: "wholebody" }, { type: "wholebody" }), true);
});

test("searches names, brands, and tags while combining facets", () => {
  assert.equal(wardrobeItemMatches(wardrobe[0], {
    query: "arket button",
    type: "upperbody",
    materials: ["linen"],
    seasons: ["summer"],
  }), true);
  assert.equal(wardrobeItemMatches(wardrobe[1], {
    query: "arket",
  }), false);
  assert.equal(wardrobeItemMatches(wardrobe[0], {
    materials: ["linen", "wool"],
    fits: ["tailored"],
  }), false);
});

test("collects visible facet counts and recognizes material tags on legacy items", () => {
  const facets = collectFacetOptions([
    ...wardrobe,
    { id: "legacy", name: "Cotton tee", part: "upperbody", color: "#ffffff", tags: ["cotton", "regular"] },
  ]);
  assert.equal(facets.materials.find((option) => option.id === "cotton")?.count, 1);
  assert.equal(facets.fits.find((option) => option.id === "regular")?.count, 1);
  assert.equal(facets.brands.find((option) => option.id === "arket")?.count, 1);
});

test("normalizes portable saved filter combinations", () => {
  const [view] = normalizeSavedViews([{
    id: "summer-work",
    name: "Summer work",
    filters: { query: "linen", type: "upperbody", materials: ["Linen"], seasons: ["summer"] },
    organizationMode: "color",
    density: "compact",
  }]);
  assert.equal(view.name, "Summer work");
  assert.equal(view.filters.query, "linen");
  assert.deepEqual(view.filters.materials, ["Linen"]);
  assert.equal(view.sortMode, "custom");
  assert.equal(view.groupMode, "color");
  assert.equal(view.density, "compact");
  assert.equal(activeFilterCount(view.filters), 4);
});

test("groups garments by type, brand, and purchase year while preserving item order", () => {
  const items = [
    { id: "one", name: "First", part: "upperbody", brand: "Zara", purchaseMonth: "2024-05" },
    { id: "two", name: "Second", part: "lowerbody", brand: "", purchaseMonth: "" },
    { id: "three", name: "Third", part: "upperbody", brand: "Zara", purchaseMonth: "2025-01" },
  ];
  const byType = groupWardrobeItems(items, "type", {
    typeGroups: [
      { id: "all", label: "All" },
      { id: "upperbody", label: "Tops" },
      { id: "lowerbody", label: "Bottoms" },
    ],
  });
  assert.deepEqual(byType.map((section) => section.label), ["Tops", "Bottoms"]);
  assert.deepEqual(byType[0].items.map((item) => item.id), ["one", "three"]);

  const byBrand = groupWardrobeItems(items, "brand");
  assert.deepEqual(byBrand.map((section) => section.label), ["Zara", "Unbranded"]);
  assert.deepEqual(byBrand[0].items.map((item) => item.id), ["one", "three"]);

  const byYear = groupWardrobeItems(items, "purchase-year");
  assert.deepEqual(byYear.map((section) => section.label), ["2025", "2024", "Unknown purchase year"]);
});

test("normalizes portable per-user wardrobe display preferences", () => {
  assert.deepEqual(normalizeWardrobeDisplayPreferences({
    mode: "details",
    density: "compact",
    detailFields: ["name", "brand", "tags", "unknown", "name"],
    tileBackground: true,
  }), {
    mode: "details",
    density: "compact",
    detailFields: ["name", "brand", "tags"],
    backgroundStyle: "soft-gray",
  });
  assert.deepEqual(normalizeWardrobeDisplayPreferences({
    backgroundStyle: "light-blue",
  }).backgroundStyle, "light-blue");
  assert.deepEqual(normalizeWardrobeDisplayPreferences(), {
    mode: "pieces",
    density: "comfortable",
    detailFields: ["name", "brand", "tags"],
    backgroundStyle: "none",
  });
});

test("normalizes saved planner results for personal-data portability", () => {
  const importedId = "import-12345678-1234-1234-1234-123456789012";
  const [plan] = normalizeWardrobePlans([{
    id: "porto-weekend",
    input: {
      kind: "trip",
      title: "Porto weekend",
      location: "Porto, Portugal",
      startDate: "2026-10-02",
      endDate: "2026-10-04",
    },
    result: {
      summary: "Layer for changeable autumn weather.",
      expectedWeather: {
        summary: "Mild with possible rain.",
        temperatureRange: "13–20 °C",
        conditions: ["mild", "showers"],
      },
      recommendedItems: [{ itemId: importedId, reason: "Works for dinner and daytime." }],
      outfitIdeas: [{ name: "Dinner", itemIds: [importedId], note: "Add a light jacket." }],
      missingItems: [{ name: "Packable rain shell", category: "outerwear", reason: "No waterproof layer found.", priority: "useful" }],
      packingNotes: ["Check the live forecast before leaving."],
      disclaimer: "Seasonal expectations are not a live forecast.",
    },
  }]);
  assert.equal(plan.input.location, "Porto, Portugal");
  assert.equal(plan.result.expectedWeather.conditions.length, 2);
  assert.equal(plan.result.outfitIdeas[0].itemIds[0], importedId);
  assert.equal(plan.result.missingItems[0].priority, "useful");
});

test("keeps generated outfit images inside saved wardrobe plans", () => {
  const [plan] = normalizeWardrobePlans([{
    id: "trip-look",
    input: { location: "Paris, France" },
    result: {
      outfitIdeas: [{
        name: "Museum afternoon",
        itemIds: ["shirt", "trousers"],
        note: "Quiet tailoring",
        modeledLook: {
          id: "look-1",
          image: "/api/import/library/trip-look.png",
          preview: "/api/import/library/trip-look-preview.webp",
          model: "example/image-model",
          generatedAt: "2026-07-24T12:00:00.000Z",
        },
      }],
    },
  }]);

  assert.equal(plan.result.outfitIdeas[0].modeledLook.id, "look-1");
  assert.equal(plan.result.outfitIdeas[0].modeledLook.preview, "/api/import/library/trip-look-preview.webp");
});
