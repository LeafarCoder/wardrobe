import test from "node:test";
import assert from "node:assert/strict";
import {
  modeledLooksForRecord,
  recordWithModeledLooks,
  recordWithoutModeledLook,
} from "../scripts/import-job-api.mjs";

test("migrates a legacy modeled image into a look collection", () => {
  const looks = modeledLooksForRecord({
    modeledImage: "/api/import/library/item-modeled.png",
    modeledModel: "google/example",
    modeledFallbackUsed: true,
    modeledGeneratedAt: "2026-07-24T10:00:00.000Z",
  });

  assert.deepEqual(looks, [{
    id: "legacy",
    image: "/api/import/library/item-modeled.png",
    model: "google/example",
    fallbackUsed: true,
    generatedAt: "2026-07-24T10:00:00.000Z",
  }]);
});

test("keeps the latest modeled look in legacy compatibility fields", () => {
  const looks = [
    { id: "first", image: "/first.png", model: "model-a", fallbackUsed: false, generatedAt: "2026-07-24T10:00:00.000Z" },
    { id: "second", image: "/second.png", model: "model-b", fallbackUsed: true, generatedAt: "2026-07-24T11:00:00.000Z" },
  ];
  const record = recordWithModeledLooks({ id: "item" }, looks);

  assert.equal(record.modeledLooks.length, 2);
  assert.equal(record.modeledImage, "/second.png");
  assert.equal(record.modeledModel, "model-b");
  assert.equal(record.modeledFallbackUsed, true);
  assert.equal(record.modeledGeneratedAt, "2026-07-24T11:00:00.000Z");
});

test("removes only the selected modeled look and updates the compatibility image", () => {
  const original = recordWithModeledLooks({ id: "item" }, [
    { id: "first", image: "/first.png", model: "model-a" },
    { id: "second", image: "/second.png", model: "model-b" },
  ]);
  const removal = recordWithoutModeledLook(original, "second");

  assert.equal(removal.removed.image, "/second.png");
  assert.deepEqual(removal.record.modeledLooks.map((look) => look.id), ["first"]);
  assert.equal(removal.record.modeledImage, "/first.png");
  assert.equal(removal.record.modeledModel, "model-a");
});

test("clears compatibility fields when the last modeled look is removed", () => {
  const original = recordWithModeledLooks({ id: "item" }, [
    { id: "only", image: "/only.png", model: "model-a" },
  ]);
  const removal = recordWithoutModeledLook(original, "only");

  assert.deepEqual(removal.record.modeledLooks, []);
  assert.equal(removal.record.modeledImage, null);
  assert.equal(removal.record.modeledModel, null);
  assert.equal(removal.record.modeledFallbackUsed, false);
  assert.equal(removal.record.modeledGeneratedAt, null);
});
