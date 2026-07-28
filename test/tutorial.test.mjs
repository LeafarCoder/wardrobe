import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTutorialState, TUTORIAL_STEPS, updateTutorialState } from "../src/tutorial.js";

test("keeps old wardrobes completed while new walkthroughs can start pending", () => {
  assert.equal(normalizeTutorialState(undefined).status, "completed");
  assert.equal(normalizeTutorialState(undefined, { defaultStatus: "pending" }).status, "pending");
  assert.deepEqual(TUTORIAL_STEPS, ["profile", "upload", "garment", "panel", "explore", "finish"]);
});

test("normalizes resumable progress and records terminal timestamps", () => {
  const now = "2026-07-29T09:30:00.000Z";
  const active = updateTutorialState({ status: "pending", step: "profile" }, { status: "active", step: "upload" }, now);
  assert.equal(active.status, "active");
  assert.equal(active.step, "upload");
  assert.equal(active.updatedAt, now);
  assert.equal(active.completedAt, null);

  const completed = updateTutorialState(active, { status: "completed", step: "finish" }, now);
  assert.equal(completed.completedAt, now);
  assert.equal(completed.dismissedAt, null);

  const invalid = updateTutorialState(active, { status: "unknown", step: "not-a-step" }, now);
  assert.equal(invalid.status, "active");
  assert.equal(invalid.step, "upload");
});
