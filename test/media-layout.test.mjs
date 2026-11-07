import assert from "node:assert/strict";
import test from "node:test";
import { mediaObjectKey } from "../scripts/media-layout.mjs";

const base = { ownerUserId: "person-one", assetId: "asset-one", sha256: "a".repeat(64), fileName: "import-long-name-preview.webp" };

test("groups media by owner, entity, look, and purpose without legacy filename prefixes", () => {
  assert.equal(mediaObjectKey({ ...base, entityType: "garment", entityId: "import-shirt-one", role: "cutout" }).key,
    "person-one/media/garments/shirt-one/cutouts/asset-one-aaaaaaaaaaaaaaaa.webp");
  assert.equal(mediaObjectKey({ ...base, entityType: "garment", entityId: "import-shirt-one", lookId: "look-one", role: "hover-video", fileName: "legacy-hover.mp4" }).key,
    "person-one/media/garments/shirt-one/looks/look-one/hover-videos/asset-one-aaaaaaaaaaaaaaaa.mp4");
  assert.equal(mediaObjectKey({ ...base, entityType: "profile", role: "avatar" }).key,
    "person-one/media/profile/avatars/asset-one-aaaaaaaaaaaaaaaa.webp");
  assert.equal(mediaObjectKey({ ...base, entityType: "plan", entityId: "trip-one", lookId: "day-one", role: "modeled" }).key,
    "person-one/media/plans/trip-one/looks/day-one/images/asset-one-aaaaaaaaaaaaaaaa.webp");
});

test("versions changed content and isolates unowned recovery objects", () => {
  const first = mediaObjectKey({ ...base, entityType: "outfit", entityId: "outfit-one" });
  const changed = mediaObjectKey({ ...base, entityType: "outfit", entityId: "outfit-one", sha256: "b".repeat(64) });
  assert.notEqual(first.key, changed.key);
  assert.equal(mediaObjectKey({ ...base, ownerUserId: null }).key,
    "_unassigned/media/recovery/asset-one-aaaaaaaaaaaaaaaa.webp");
});

test("rejects path traversal and invalid identities before constructing bucket keys", () => {
  for (const value of ["../other", "/root", "a/b", "..", "user name"]) {
    assert.throws(() => mediaObjectKey({ ...base, ownerUserId: value }));
    assert.throws(() => mediaObjectKey({ ...base, entityType: "garment", entityId: value }));
  }
  assert.throws(() => mediaObjectKey({ ...base, sha256: "invalid" }));
  assert.throws(() => mediaObjectKey({ ...base, assetId: "../other" }));
});
