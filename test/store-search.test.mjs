import test from "node:test";
import assert from "node:assert/strict";
import {
  compactStoreSearchQuery,
  DEFAULT_PREFERRED_STORES,
  englishStoreSearchQuery,
  normalizePreferredStores,
  preferredStoreOptions,
  storeSearchUrl,
} from "../src/store-search.js";

test("normalizes known preferred stores and removes duplicates", () => {
  assert.deepEqual(
    normalizePreferredStores(["zara", "H&M", "Zara", "Unknown"]),
    ["Zara", "H&M"],
  );
});

test("uses approachable defaults when no preferred stores were saved", () => {
  assert.deepEqual(
    preferredStoreOptions([]).map((store) => store.id),
    [...DEFAULT_PREFERRED_STORES],
  );
});

test("opens a Portugal retailer search for Portuguese profiles and locations", () => {
  const url = storeSearchUrl("Zara", "casaco impermeável", {
    language: "pt-PT",
    city: "Lisbon, Portugal",
  });
  assert.match(url, /^https:\/\/www\.zara\.com\/pt\/pt\/search/);
  assert.match(url, /casaco%20imperme%C3%A1vel/);
});

test("uses Bershka's path search instead of its gender-gated search parameter", () => {
  const url = storeSearchUrl("Bershka", "roupa interior térmica", {
    language: "pt-PT",
  });
  assert.equal(url, "https://www.bershka.com/pt/q/roupa%20interior%20t%C3%A9rmica");
  assert.equal(url.includes("searchTerm"), false);
});

test("uses COS's EU route and an English product query", () => {
  assert.equal(englishStoreSearchQuery("óculos de sol"), "sunglasses");
  assert.equal(
    storeSearchUrl("COS", "óculos de sol", { language: "pt-PT" }),
    "https://www.cos.com/en-eu/search?search=sunglasses",
  );
  assert.equal(
    storeSearchUrl("COS", "óculos de sol", { language: "pt-PT", englishQuery: "round sunglasses" }),
    "https://www.cos.com/en-eu/search?search=round%20sunglasses",
  );
});

test("keeps retailer queries concise and removes parenthetical alternatives", () => {
  assert.equal(
    compactStoreSearchQuery("Sobretudo pesado (Parka ou lã) outerwear"),
    "Sobretudo pesado",
  );
  assert.equal(compactStoreSearchQuery("Roupa interior térmica underwear"), "Roupa interior térmica");
  assert.equal(compactStoreSearchQuery("thermal underwear"), "thermal underwear");
  assert.equal(
    compactStoreSearchQuery("camisolas de malha vermelho muito quente inverno"),
    "camisolas de malha vermelho",
  );
});

test("returns no link for an unknown store or empty recommendation", () => {
  assert.equal(storeSearchUrl("Unknown", "coat"), "");
  assert.equal(storeSearchUrl("Zara", "  "), "");
});
