import assert from "node:assert/strict";
import test from "node:test";
import {
  garmentClarificationDetails,
  garmentClarificationGroups,
  garmentClarificationPrompt,
  normalizeGarmentClarifications,
} from "../src/garment-clarifications.js";

test("keeps clarification choices category-aware and progressively reveals subtype details", () => {
  assert.deepEqual(
    garmentClarificationGroups("accessories_up", {}).map((current) => current.id),
    ["accessoryType", "materials"],
  );
  assert.deepEqual(
    garmentClarificationGroups("accessories_up", { accessoryType: "watch" }).map((current) => current.id),
    ["accessoryType", "watchStyle", "watchTone", "watchStrap", "materials"],
  );
  assert.deepEqual(
    garmentClarificationGroups("lowerbody", { lowerType: "skirt" }).map((current) => current.id),
    ["lowerType", "skirtShape", "hemLength", "materials"],
  );

  assert.deepEqual(normalizeGarmentClarifications("accessories_up", {
    accessoryType: "belt",
    beltWidth: "wide",
    watchStyle: "sport",
    materials: ["leather", "gold", "silver", "canvas"],
    unknown: "private",
  }), {
    accessoryType: "belt",
    beltWidth: "wide",
    materials: ["leather", "gold", "silver"],
  });
});

test("turns human-selected hidden details into authoritative compact prompt context", () => {
  const selections = {
    accessoryType: "watch",
    watchStyle: "sport",
    watchTone: "silver",
    watchStrap: "rubber",
    materials: ["silver", "leather"],
  };
  assert.deepEqual(
    garmentClarificationDetails("accessories_up", selections).map((detail) => detail.label),
    ["Watch", "Sport", "Silver-tone", "Rubber strap", "Silver", "Leather"],
  );
  const prompt = garmentClarificationPrompt("accessories_up", selections);
  assert.match(prompt, /HUMAN-SELECTED PRODUCT DETAILS — AUTHORITATIVE/);
  assert.match(prompt, /Accessory type: Watch/);
  assert.match(prompt, /Watch style: Sport/);
  assert.match(prompt, /Case and hardware: Silver-tone/);
  assert.match(prompt, /Watch strap: Rubber strap/);
  assert.match(prompt, /Materials: silver or silver-tone metal, leather/);
  assert.match(prompt, /free-text USER CORRECTION may explicitly override/i);
});
