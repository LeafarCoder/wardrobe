import assert from "node:assert/strict";
import test from "node:test";
import {
  hashVaultPassword,
  modeledLooksForRecord,
  normalizeVaultPassword,
  recordWithModeledLooks,
  verifyVaultPassword,
} from "../scripts/import-job-api.mjs";
import { normalizeWardrobeOutfits } from "../src/outfit-studio.js";

test("hashes and verifies Vault passwords without storing the password", () => {
  const password = "private wardrobe";
  const hash = hashVaultPassword(password, Buffer.alloc(16, 7));

  assert.match(hash, /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
  assert.equal(hash.includes(password), false);
  assert.equal(verifyVaultPassword(password, hash), true);
  assert.equal(verifyVaultPassword("wrong password", hash), false);
});

test("requires a meaningful Vault password", () => {
  assert.equal(normalizeVaultPassword("12345"), "");
  assert.equal(normalizeVaultPassword("123456"), "123456");
  assert.equal(normalizeVaultPassword(null), "");
});

test("preserves vaulted garment looks while choosing a visible legacy cover", () => {
  const record = recordWithModeledLooks({ id: "garment" }, [
    { id: "visible", image: "/visible.png", generatedAt: "2026-07-30T10:00:00.000Z" },
    { id: "hidden", image: "/hidden.png", vaultedAt: "2026-07-31T10:00:00.000Z" },
  ]);

  assert.equal(modeledLooksForRecord(record).length, 2);
  assert.equal(modeledLooksForRecord(record)[1].vaultedAt, "2026-07-31T10:00:00.000Z");
  assert.equal(record.modeledImage, "/visible.png");
});

test("preserves the Vault state of Outfit Studio photos", () => {
  const [outfit] = normalizeWardrobeOutfits([{
    id: "lookbook",
    modeledLooks: [{ id: "photo", image: "/photo.png", vaultedAt: "2026-07-31T12:00:00.000Z" }],
  }]);

  assert.equal(outfit.modeledLooks[0].vaultedAt, "2026-07-31T12:00:00.000Z");
});
