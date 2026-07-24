import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PREFERRED_STORES,
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

test("returns no link for an unknown store or empty recommendation", () => {
  assert.equal(storeSearchUrl("Unknown", "coat"), "");
  assert.equal(storeSearchUrl("Zara", "  "), "");
});
