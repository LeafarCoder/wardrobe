import test from "node:test";
import assert from "node:assert/strict";
import { CITY_SUGGESTIONS } from "../src/city-suggestions.js";

test("offers useful local city suggestions without restricting free-text profiles", () => {
  assert.ok(CITY_SUGGESTIONS.includes("Lisbon, Portugal"));
  assert.ok(CITY_SUGGESTIONS.includes("Porto, Portugal"));
  assert.equal(new Set(CITY_SUGGESTIONS).size, CITY_SUGGESTIONS.length);
});
