import test from "node:test";
import assert from "node:assert/strict";
import {
  activeFilterCount,
  collectFacetOptions,
  groupWardrobeItems,
  normalizeGarmentSeasons,
  normalizePlannerGarmentVariants,
  normalizeSavedViews,
  normalizeWardrobeDisplayPreferences,
  normalizeWardrobePlans,
  WARDROBE_ITEM_TYPES,
  wardrobeItemMatches,
} from "../src/wardrobe-discovery.js";

test("normalizes planner garment version selections", () => {
  assert.deepEqual(normalizePlannerGarmentVariants({
    shirt: "navy",
    trousers: null,
    invalid: 42,
    empty: "",
  }), {
    shirt: "navy",
    trousers: null,
  });
});

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

test("preserves an explicit color sort without turning it into color grouping", () => {
  const [view] = normalizeSavedViews([{
    id: "spectrum",
    name: "Spectrum",
    sortMode: "color",
    groupMode: "none",
  }]);
  assert.equal(view.sortMode, "color");
  assert.equal(view.groupMode, "none");
});

test("groups garments by type, brand, and purchase year while preserving item order", () => {
  const items = [
    { id: "one", name: "First", part: "upperbody", brand: "Zara", purchaseMonth: "2024-05" },
    { id: "two", name: "Second", part: "lowerbody", brand: "", purchaseMonth: "" },
    { id: "three", name: "Third", part: "upperbody", brand: "Zara", purchaseMonth: "2025" },
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
  assert.deepEqual(byYear.map((section) => section.label), ["2025", "2024", "Unknown acquisition year"]);
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
      missingItems: [{ name: "Packable rain shell", searchQuery: "packable rain jacket", category: "outerwear", reason: "No waterproof layer found.", priority: "useful" }],
      packingNotes: ["Check the live forecast before leaving."],
      disclaimer: "Seasonal expectations are not a live forecast.",
    },
  }]);
  assert.equal(plan.input.location, "Porto, Portugal");
  assert.equal(plan.result.expectedWeather.conditions.length, 2);
  assert.equal(plan.result.outfitIdeas[0].itemIds[0], importedId);
  assert.equal(plan.result.missingItems[0].priority, "useful");
  assert.equal(plan.result.missingItems[0].searchQuery, "packable rain jacket");
});

test("enforces planner list limits locally after provider output is parsed", () => {
  const createItems = (count, mapper) => Array.from({ length: count }, (_, index) => mapper(index));
  const [plan] = normalizeWardrobePlans([{
    id: "oversized-plan",
    result: {
      expectedWeather: {
        conditions: createItems(10, (index) => `condition-${index}`),
      },
      recommendedItems: createItems(35, (index) => ({ itemId: `item-${index}`, reason: `reason-${index}` })),
      outfitIdeas: createItems(15, (index) => ({
        name: `outfit-${index}`,
        itemIds: createItems(15, (itemIndex) => `item-${itemIndex}`),
        note: `note-${index}`,
      })),
      missingItems: createItems(25, (index) => ({ name: `missing-${index}` })),
      packingNotes: createItems(15, (index) => `note-${index}`),
    },
  }]);

  assert.equal(plan.result.expectedWeather.conditions.length, 8);
  assert.equal(plan.result.recommendedItems.length, 30);
  assert.equal(plan.result.outfitIdeas.length, 12);
  assert.equal(plan.result.outfitIdeas[0].itemIds.length, 12);
  assert.equal(plan.result.missingItems.length, 20);
  assert.equal(plan.result.packingNotes.length, 12);
});

test("keeps multiple generated outfit images inside saved wardrobe plans", () => {
  const [plan] = normalizeWardrobePlans([{
    id: "trip-look",
    input: { location: "Paris, France" },
    result: {
      garmentVariants: { shirt: "navy", trousers: null },
      outfitIdeas: [{
        name: "Museum afternoon",
        itemIds: ["shirt", "trousers"],
        note: "Quiet tailoring",
        modeledLooks: [
          {
            id: "look-1",
            image: "/api/import/library/trip-look.png",
            preview: "/api/import/library/trip-look-preview.webp",
            model: "example/image-model",
            garmentVariants: { shirt: "navy", trousers: null },
            generatedAt: "2026-07-24T12:00:00.000Z",
          },
          {
            id: "look-2",
            image: "/api/import/library/trip-look-2.png",
            model: "example/image-model",
            generatedAt: "2026-07-24T12:05:00.000Z",
          },
        ],
      }],
    },
  }]);

  assert.deepEqual(plan.result.outfitIdeas[0].modeledLooks.map((look) => look.id), ["look-1", "look-2"]);
  assert.deepEqual(plan.result.garmentVariants, { shirt: "navy", trousers: null });
  assert.deepEqual(plan.result.outfitIdeas[0].modeledLooks[0].garmentVariants, { shirt: "navy", trousers: null });
  assert.equal(plan.result.outfitIdeas[0].modeledLooks[0].preview, "/api/import/library/trip-look-preview.webp");
  assert.equal(plan.result.outfitIdeas[0].modeledLook.id, "look-2");
});
