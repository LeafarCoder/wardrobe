import test from "node:test";
import assert from "node:assert/strict";
import {
  modeledLookContextDetails,
  modeledLookContextPrompt,
  normalizeModeledLookContext,
} from "../src/modeled-look-context.js";
import { buildModeledPrompt } from "../scripts/import-job-api.mjs";

test("normalizes modeled-look direction and keeps settings contextual", () => {
  assert.deepEqual(normalizeModeledLookContext({
    pose: "walking",
    bodyOrientation: "three-quarter",
    headOrientation: "camera",
    environmentType: "inside",
    setting: "living-room",
    weather: "sunny",
    expression: "smiling",
    additionalDirection: "  Carry a small bouquet.  ",
    ignored: "not persisted",
  }), {
    pose: "walking",
    bodyOrientation: "three-quarter",
    headOrientation: "camera",
    environmentType: "inside",
    setting: "living-room",
    weather: "sunny",
    expression: "smiling",
    additionalDirection: "Carry a small bouquet.",
  });

  assert.equal(normalizeModeledLookContext({ environmentType: "outside", setting: "bedroom" }).setting, "");
  assert.equal(normalizeModeledLookContext({ environmentType: "invalid", setting: "forest" }).environmentType, "");
  assert.deepEqual(normalizeModeledLookContext(null), normalizeModeledLookContext());
});

test("adds only selected creative direction to the modeled-look prompt", () => {
  const directed = buildModeledPrompt(1, { name: "Rafael" }, { name: "Navy jacket" }, {
    pose: "crouching",
    bodyOrientation: "side",
    headOrientation: "left",
    environmentType: "outside",
    setting: "forest",
    weather: "light-rain",
    expression: "smirking",
    additionalDirection: "Hold a closed umbrella.",
  });

  assert.match(directed, /Creative direction for this image/);
  assert.match(directed, /crouching in a balanced, natural pose/);
  assert.match(directed, /body shown from the side/);
  assert.match(directed, /head turned and looking to their left/);
  assert.match(directed, /a natural forest/);
  assert.match(directed, /a believable light rain/);
  assert.match(directed, /a subtle smirk/);
  assert.match(directed, /Additional user direction: Hold a closed umbrella\./);
});

test("leaves the base prompt unconstrained when no direction is selected", () => {
  assert.equal(modeledLookContextPrompt({}), "");
  assert.doesNotMatch(
    buildModeledPrompt(1, {}, { name: "White shirt" }, {}),
    /Creative direction for this image/,
  );
});

test("bounds free-form modeled-look direction", () => {
  const context = normalizeModeledLookContext({ additionalDirection: `  ${"x".repeat(900)}  ` });
  assert.equal(context.additionalDirection.length, 800);
});

test("describes every selected modeled-look setting without translating free text", () => {
  assert.deepEqual(modeledLookContextDetails({
    pose: "walking",
    bodyOrientation: "three-quarter",
    headOrientation: "camera",
    environmentType: "inside",
    setting: "living-room",
    weather: "sunny",
    expression: "smiling",
    additionalDirection: "Carry the red book.",
  }), [
    { id: "pose", label: "Pose", values: ["Walking"], translateValues: true },
    { id: "bodyOrientation", label: "Body orientation", values: ["Three-quarters"], translateValues: true },
    { id: "headOrientation", label: "Head orientation", values: ["Looking at camera"], translateValues: true },
    { id: "environment", label: "Environment", values: ["Inside", "Living room"], translateValues: true },
    { id: "weather", label: "Weather", values: ["Sunny"], translateValues: true },
    { id: "expression", label: "Expression", values: ["Smiling"], translateValues: true },
    { id: "additionalDirection", label: "More direction", values: ["Carry the red book."], translateValues: false },
  ]);
  assert.deepEqual(modeledLookContextDetails({}), []);
});
