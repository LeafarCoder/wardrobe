import test from "node:test";
import assert from "node:assert/strict";
import {
  bestDuplicateCandidate,
  discardedAssetsAfterMerge,
  duplicateCandidateScore,
  garmentRegenerationCandidateForRecord,
  importedRecordAssets,
  mergeImportedRecords,
  modeledLooksForRecord,
  refineDetectedBoundingBoxes,
  recordWithSourcePhotos,
  selectGarmentRegenerationSources,
  sourcePhotosForRecord,
  wardrobePlansAfterGarmentMerge,
} from "../scripts/import-job-api.mjs";

test("never suggests a vaulted garment as an import duplicate", () => {
  const metadata = {
    name: "Teal linen button-down shirt",
    part: "upperbody",
    color: "#17666a",
    brand: "Zara",
    tags: ["button-down", "linen", "long-sleeve"],
  };
  const visible = {
    id: "visible",
    userId: "owner",
    ...metadata,
    color: "#557777",
  };
  const vaulted = {
    id: "vaulted",
    userId: "owner",
    ...metadata,
    vaultedAt: "2026-07-31T10:00:00.000Z",
  };

  assert.equal(bestDuplicateCandidate([vaulted], { userId: "owner", metadata }), null);
  assert.equal(bestDuplicateCandidate([visible, vaulted], { userId: "owner", metadata })?.record.id, "visible");
});

test("preserves a reviewed garment failure and its explicit alternative model", () => {
  const candidate = garmentRegenerationCandidateForRecord({
    garmentRegenerationCandidate: {
      id: "candidate-1",
      image: "/api/import/library/candidate-1.png",
      metadata: { name: "Satin chemise", part: "wholebody", color: "#111111" },
      backgroundTransparent: false,
      validationCode: "garment_background_not_transparent",
      validationMessage: "The generated image has an opaque background.",
      suggestedModel: "bytedance-seed/seedream-4.5",
    },
  });

  assert.equal(candidate.backgroundTransparent, false);
  assert.equal(candidate.validationCode, "garment_background_not_transparent");
  assert.equal(candidate.suggestedModel, "bytedance-seed/seedream-4.5");
});

test("selects at most three requested original photos for saved-garment regeneration", () => {
  const record = recordWithSourcePhotos({}, [
    { id: "one", image: "/api/import/library/one.png" },
    { id: "two", image: "/api/import/library/two.png" },
    { id: "three", image: "/api/import/library/three.png" },
    { id: "four", image: "/api/import/library/four.png" },
  ]);

  assert.deepEqual(
    selectGarmentRegenerationSources(record, ["four", "two", "one", "three"]).map((photo) => photo.id),
    ["four", "two", "one"],
  );
  assert.deepEqual(
    selectGarmentRegenerationSources(record, []).map((photo) => photo.id),
    ["one", "two", "three"],
  );
  assert.deepEqual(selectGarmentRegenerationSources(record, ["missing"]), []);
});

test("finds a strong same-category duplicate without auto-matching unrelated garments", () => {
  const existing = {
    name: "Teal linen button-down shirt",
    part: "upperbody",
    color: "#17666a",
    brand: "Zara",
    tags: ["button-down", "linen", "long-sleeve"],
  };
  const sameGarment = duplicateCandidateScore(existing, {
    name: "Teal button-down",
    part: "upperbody",
    color: "#1d6968",
    brand: "Zara",
    tags: ["linen", "button-down"],
  });
  assert.ok(sameGarment.score >= 0.68);
  assert.equal(sameGarment.brandMatch, true);

  const unrelatedCategory = duplicateCandidateScore(existing, {
    name: "Teal leather loafers",
    part: "shoes",
    color: "#1d6968",
    tags: ["leather"],
  });
  assert.equal(unrelatedCategory.score, 0);
});

test("treats navy and dark blue tailoring as a plausible duplicate", () => {
  const match = duplicateCandidateScore({
    name: "Dark blue suit trousers",
    part: "lowerbody",
    color: "#000080",
    tags: ["formal", "slacks", "tapered"],
    materials: ["wool"],
  }, {
    name: "Navy suit trousers",
    part: "lowerbody",
    color: "#0b1c4d",
    tags: ["formal", "tailored"],
    materials: ["wool"],
  });

  assert.ok(match.score >= 0.60);
  assert.ok(match.nameSimilarity >= 0.5);
  assert.ok(match.colorSimilarity >= 0.8);
  assert.equal(match.compatible, true);
});

test("rejects a black-and-white swirl print as a duplicate of solid pink trousers", () => {
  const match = duplicateCandidateScore({
    name: "pink wide leg trousers",
    part: "lowerbody",
    color: "#e08db4",
    tags: ["wide leg", "elastic waist", "pleated"],
  }, {
    name: "Wide Leg Swirl Print Trousers",
    part: "lowerbody",
    color: "#f3f1ea",
    secondaryColor: "#241c18",
    tags: ["wide leg", "elastic waist", "swirl print"],
  });

  assert.ok(match.score >= 0.48, "regression fixture should exercise the old score threshold");
  assert.equal(match.compatible, false);
  assert.ok(match.conflictReasons.includes("pattern"));
  assert.ok(match.conflictReasons.includes("color"));
});

test("rejects different garment subtypes within the same broad category", () => {
  const match = duplicateCandidateScore({
    name: "Black pleated midi skirt",
    part: "lowerbody",
    color: "#161616",
    tags: ["pleated", "midi"],
  }, {
    name: "Black pleated trousers",
    part: "lowerbody",
    color: "#171717",
    tags: ["pleated", "wide leg"],
  });

  assert.equal(match.compatible, false);
  assert.ok(match.conflictReasons.includes("subtype"));
});

test("matches Portuguese garment metadata against an English wardrobe", () => {
  const shirt = duplicateCandidateScore({
    name: "Teal Button-Down Shirt",
    part: "upperbody",
    color: "#0b292f",
    tags: ["long-sleeve", "button-up", "casual", "linen"],
  }, {
    name: "camisa de linho",
    part: "upperbody",
    color: "#008080",
    tags: ["casual", "gola colarinho", "abotoada"],
    materials: ["linho"],
  });
  assert.ok(shirt.score >= 0.48);
  assert.ok(shirt.descriptorSimilarity >= 0.5);

  const shoes = duplicateCandidateScore({
    name: "brown espadrille loafers",
    part: "shoes",
    color: "#8b4513",
    tags: ["loafers", "espadrille", "casual"],
    materials: ["suede", "jute"],
  }, {
    name: "mocassins",
    part: "shoes",
    color: "#5c4033",
    tags: ["confortável", "calçado"],
    materials: ["couro"],
  });
  assert.ok(shoes.score >= 0.48);
  assert.ok(shoes.nameSimilarity >= 0.7);
});

test("trims category boxes that swallow trousers or shoes", () => {
  const [shirt, trousers, shoes] = refineDetectedBoundingBoxes([
    {
      name: "camisa de linho",
      part: "upperbody",
      boundingBox: { x: 462, y: 313, width: 381, height: 655 },
    },
    {
      name: "calças chino",
      part: "lowerbody",
      boundingBox: { x: 523, y: 625, width: 269, height: 375 },
    },
    {
      name: "mocassins",
      part: "shoes",
      boundingBox: { x: 506, y: 935, width: 272, height: 64 },
    },
  ]);

  assert.deepEqual(shirt.providerBoundingBox, { x: 462, y: 313, width: 381, height: 655 });
  assert.deepEqual(shirt.boundingBox, { x: 462, y: 313, width: 381, height: 492 });
  assert.deepEqual(shirt.cropAdjustment, ["lowerbody-overlap"]);
  assert.deepEqual(trousers.boundingBox, { x: 523, y: 625, width: 269, height: 315 });
  assert.deepEqual(trousers.cropAdjustment, ["shoes-overlap"]);
  assert.deepEqual(shoes.boundingBox, shoes.providerBoundingBox);
});

test("keeps every unique source-photo occurrence and exposes its assets", () => {
  const record = recordWithSourcePhotos({
    id: "import-example",
    image: "/api/import/library/garment.png",
    garmentRegenerationCandidate: {
      id: "candidate",
      image: "/api/import/library/candidate.png",
      preview: "/api/import/library/candidate-preview.webp",
      thumbnail: "/api/import/library/candidate-thumbnail.webp",
      metadata: { name: "Rebuilt garment", part: "upperbody", color: "#112233" },
    },
  }, [
    {
      id: "first",
      image: "/api/import/library/source-one.png",
      preview: "/api/import/library/source-one-preview.webp",
      importJobId: "job-one",
    },
    {
      id: "second",
      image: "/api/import/library/source-two.png",
      importJobId: "job-two",
    },
    {
      id: "duplicate-asset",
      image: "/api/import/library/source-one.png",
    },
  ]);

  assert.deepEqual(sourcePhotosForRecord(record).map((photo) => photo.id), ["first", "second"]);
  assert.equal(record.originalImage, "/api/import/library/source-one.png");
  assert.ok(importedRecordAssets(record).includes("/api/import/library/source-two.png"));
  assert.ok(importedRecordAssets(record).includes("/api/import/library/candidate.png"));
  assert.ok(importedRecordAssets(record).includes("/api/import/library/candidate-preview.webp"));
});

test("merges existing garments without losing original photos or modeled looks", () => {
  const keeper = recordWithSourcePhotos({
    id: "import-keeper",
    name: "Linen shirt",
    image: "/api/import/library/keeper-garment.png",
    imagePreview: "/api/import/library/keeper-preview.webp",
    modeledLooks: [{
      id: "look",
      image: "/api/import/library/keeper-look.png",
      preview: "/api/import/library/keeper-look-preview.webp",
      generatedAt: "2026-07-28T10:00:00.000Z",
    }],
  }, [{
    id: "original",
    image: "/api/import/library/keeper-source.png",
    preview: "/api/import/library/keeper-source-preview.webp",
    importJobId: "keeper-job",
  }]);
  const discarded = recordWithSourcePhotos({
    id: "import-discarded",
    name: "Duplicate shirt",
    image: "/api/import/library/discarded-garment.png",
    imagePreview: "/api/import/library/discarded-preview.webp",
    modeledLooks: [{
      id: "look",
      image: "/api/import/library/discarded-look.png",
      preview: "/api/import/library/discarded-look-preview.webp",
      generatedAt: "2026-07-28T11:00:00.000Z",
      context: {
        pose: "walking",
        environmentType: "outside",
        setting: "city",
        expression: "smiling",
        additionalDirection: "Carry a newspaper.",
      },
    }],
  }, [{
    id: "original",
    image: "/api/import/library/discarded-source.png",
    preview: "/api/import/library/discarded-source-preview.webp",
    importJobId: "discarded-job",
  }]);

  const merged = mergeImportedRecords(keeper, discarded, "2026-07-28T12:00:00.000Z");
  const sources = sourcePhotosForRecord(merged);
  const looks = modeledLooksForRecord(merged);
  const removedAssets = discardedAssetsAfterMerge(merged, discarded);

  assert.equal(merged.id, keeper.id);
  assert.equal(merged.name, keeper.name);
  assert.equal(merged.updatedAt, "2026-07-28T12:00:00.000Z");
  assert.deepEqual(sources.map((photo) => photo.id), ["original", "original-2"]);
  assert.deepEqual(sources.map((photo) => photo.importJobId), ["keeper-job", "discarded-job"]);
  assert.deepEqual(looks.map((look) => look.id), ["look", "look-2"]);
  assert.deepEqual(looks.map((look) => look.image), [
    "/api/import/library/keeper-look.png",
    "/api/import/library/discarded-look.png",
  ]);
  assert.equal(merged.modeledImage, "/api/import/library/discarded-look.png");
  assert.equal(looks[1].context.pose, "walking");
  assert.equal(looks[1].context.additionalDirection, "Carry a newspaper.");
  assert.equal(merged.mediaOrder[0], "modeled:look-2");
  assert.equal(merged.originalImage, "/api/import/library/keeper-source.png");
  assert.ok(removedAssets.includes("/api/import/library/discarded-garment.png"));
  assert.equal(removedAssets.includes("/api/import/library/discarded-look.png"), false);
  assert.equal(removedAssets.includes("/api/import/library/discarded-look-preview.webp"), false);
  assert.equal(removedAssets.includes("/api/import/library/discarded-source.png"), false);
  assert.equal(removedAssets.includes("/api/import/library/discarded-source-preview.webp"), false);
});

test("retargets saved plan references when an existing garment is merged", () => {
  const plans = wardrobePlansAfterGarmentMerge([{
    id: "trip",
    input: { kind: "trip", title: "Weekend" },
    result: {
      recommendedItems: [
        { itemId: "import-keeper", reason: "Layer" },
        { itemId: "import-discarded", reason: "Duplicate layer" },
      ],
      garmentVariants: { "import-discarded": "navy-version" },
      outfitIdeas: [{ name: "Travel", itemIds: ["import-discarded", "import-shoes"] }],
    },
  }], "import-keeper", "import-discarded");

  assert.deepEqual(plans[0].result.recommendedItems.map((item) => item.itemId), ["import-keeper"]);
  assert.deepEqual(plans[0].result.garmentVariants, { "import-keeper": "navy-version" });
  assert.deepEqual(plans[0].result.outfitIdeas[0].itemIds, ["import-keeper", "import-shoes"]);
});
