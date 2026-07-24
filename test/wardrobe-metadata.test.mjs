import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeBrand,
  normalizePreferenceList,
  normalizePurchaseCurrency,
  normalizePurchaseMonth,
  normalizePurchasePrice,
  normalizeSizeProfile,
  purchaseMonthValue,
  sizeProfileSummary,
} from "../src/wardrobe-metadata.js";
import { buildModeledPrompt } from "../scripts/import-job-api.mjs";

test("normalizes portable garment purchase metadata", () => {
  assert.equal(normalizeBrand("  Massimo Dutti  "), "Massimo Dutti");
  assert.equal(normalizePurchaseMonth("2025-02"), "2025-02");
  assert.equal(normalizePurchaseMonth("2025-13"), null);
  assert.equal(normalizePurchaseMonth("February 2025"), null);
  assert.equal(normalizePurchasePrice("79.90"), 79.9);
  assert.equal(normalizePurchasePrice(""), null);
  assert.equal(normalizePurchasePrice("-4"), null);
  assert.equal(normalizePurchaseCurrency("gbp"), "GBP");
  assert.equal(normalizePurchaseCurrency("unsupported"), "EUR");
});

test("sort values put known purchase months chronologically before unknown dates", () => {
  const items = [
    { id: "unknown", purchaseMonth: null },
    { id: "newer", purchaseMonth: "2025-02" },
    { id: "older", purchaseMonth: "2021-11" },
  ];
  assert.deepEqual(
    items.sort((first, second) => purchaseMonthValue(first) - purchaseMonthValue(second)).map((item) => item.id),
    ["older", "newer", "unknown"],
  );
});

test("keeps region-specific size fields structured and rejects unsupported values", () => {
  assert.deepEqual(normalizeSizeProfile({
    system: "uk",
    fit: "relaxed",
    tops: ["UK 10", "UK 12"],
    bottoms: ["UK 12", "W30"],
    shoes: "UK 7",
    rings: ["UK N"],
    ignored: "not persisted",
  }), {
    system: "uk",
    fit: "relaxed",
    tops: ["UK 10", "UK 12"],
    bottoms: ["UK 12", "W30"],
    outerwear: [],
    shoes: ["UK 7"],
    rings: ["UK N"],
  });

  assert.equal(normalizeSizeProfile({ system: "unsupported", fit: "unsupported" }).system, "");
  assert.equal(normalizeSizeProfile({ system: "unsupported", fit: "unsupported" }).fit, "");
});

test("does not invent a sizing region for a legacy profile", () => {
  assert.equal(sizeProfileSummary(), "");
  assert.equal(
    sizeProfileSummary({ system: "eu", tops: ["S", "M"], bottoms: ["EU 42", "W32"], shoes: "EU 42", fit: "regular" }),
    "sizing system: EU / International; tops: S / M; trousers & bottoms: EU 42 / W32; shoes: EU 42; preferred fit: Regular",
  );
});

test("normalizes favorite colors and materials as concise unique lists", () => {
  assert.deepEqual(
    normalizePreferenceList([" Linen ", "cotton", "linen", "", "Merino wool"]),
    ["Linen", "cotton", "Merino wool"],
  );
  assert.deepEqual(normalizePreferenceList("Olive, navy, cream"), ["Olive", "navy", "cream"]);
});

test("includes structured sizing context in modeled-look prompts", () => {
  const prompt = buildModeledPrompt(1, {
    name: "Rafael",
    sizeProfile: { system: "eu", tops: ["S", "M"], bottoms: ["EU 42", "W32"], shoes: ["EU 42"], fit: "regular" },
    preferredMaterials: ["linen", "cotton"],
    favoriteColors: ["olive", "navy"],
  }, { part: "upperbody" });
  assert.match(prompt, /sizing system: EU \/ International/);
  assert.match(prompt, /tops: S \/ M/);
  assert.match(prompt, /trousers & bottoms: EU 42 \/ W32/);
  assert.match(prompt, /shoes: EU 42/);
  assert.match(prompt, /preferred fit: Regular/);
  assert.match(prompt, /Preferred materials: linen, cotton/);
  assert.match(prompt, /Favorite colors: olive, navy/);
});
