import assert from "node:assert/strict";
import test from "node:test";
import {
  careInstructionCount,
  normalizeCareInstructions,
  selectedCareInstructions,
} from "../src/garment-care.js";

test("normalizes one recognized instruction per care group", () => {
  assert.deepEqual(normalizeCareInstructions({
    washing: "gentle-30",
    bleaching: "unknown",
    tumbleDrying: "do-not-tumble",
    naturalDrying: "flat-shade",
    ironing: "low",
    professionalCare: "",
  }), {
    washing: "gentle-30",
    bleaching: null,
    tumbleDrying: "do-not-tumble",
    naturalDrying: "flat-shade",
    ironing: "low",
    professionalCare: null,
  });
});

test("returns selected care guidance in label order", () => {
  const selected = selectedCareInstructions({
    professionalCare: "do-not-dry-clean",
    washing: "hand-wash",
    ironing: "do-not-iron",
  });
  assert.deepEqual(selected.map((item) => item.groupId), ["washing", "ironing", "professionalCare"]);
  assert.equal(selected[0].label, "Hand wash");
  assert.equal(careInstructionCount(selected), 0);
  assert.equal(careInstructionCount({ washing: "hand-wash", ironing: "do-not-iron" }), 2);
});
