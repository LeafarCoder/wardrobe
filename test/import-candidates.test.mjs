import assert from "node:assert/strict";
import test from "node:test";
import {
  appendImportGenerationCandidate,
  importGenerationCandidates,
  selectImportGenerationCandidate,
  selectedImportGenerationCandidate,
} from "../src/import-candidates.js";

test("keeps every successful import generation and allows an earlier result to be selected", () => {
  const first = appendImportGenerationCandidate({ attempts: 1 }, {
    id: "garment-1",
    assetUrl: "/api/import/assets/job/garment-1.png",
    attempt: 1,
  });
  const second = appendImportGenerationCandidate({ ...first, attempts: 2 }, {
    id: "garment-2",
    assetUrl: "/api/import/assets/job/garment-2.png",
    attempt: 2,
  });

  assert.deepEqual(importGenerationCandidates(second).map((candidate) => candidate.id), [
    "garment-1",
    "garment-2",
  ]);
  assert.equal(selectedImportGenerationCandidate(second).id, "garment-2");

  const restored = selectImportGenerationCandidate(second, "garment-1");
  assert.equal(restored.selectedCandidateId, "garment-1");
  assert.equal(restored.assetUrl, "/api/import/assets/job/garment-1.png");
  assert.equal(importGenerationCandidates(restored).length, 2);
});

test("migrates a pre-history import stage as one selectable legacy candidate", () => {
  const stage = {
    attempts: 3,
    assetUrl: "/api/import/assets/job/garment-3.png?user=default",
    model: "image-model",
    updatedAt: "2026-07-29T10:00:00.000Z",
  };
  assert.deepEqual(importGenerationCandidates(stage), [{
    id: "legacy-current",
    assetUrl: stage.assetUrl,
    model: "image-model",
    fallbackUsed: false,
    attempt: 3,
    generatedAt: stage.updatedAt,
  }]);
});

test("preserves the opaque-background warning when selecting a retained result", () => {
  const stage = appendImportGenerationCandidate({}, {
    id: "garment-opaque",
    assetUrl: "/api/import/assets/job/garment-opaque.png",
    backgroundTransparent: false,
  });

  assert.equal(selectedImportGenerationCandidate(stage).backgroundTransparent, false);
  assert.equal(
    selectedImportGenerationCandidate(selectImportGenerationCandidate(stage, "garment-opaque")).backgroundTransparent,
    false,
  );
});
