import assert from "node:assert/strict";
import test from "node:test";
import { garmentMediaContexts, profileMediaContexts, mergeMediaContexts, jobMediaContexts } from "../scripts/media-contexts.mjs";
import { mediaObjectKey } from "../scripts/media-layout.mjs";
import { libraryStorageContexts } from "../scripts/import-job-api.mjs";

const photo = "/api/import/library/shared-source.png";
const contextFor = (id, owner = "owner-one") => garmentMediaContexts({ id, userId: owner, originalImage: photo });

test("shared source photos keep one deterministic canonical location and every entity link", () => {
  const a = contextFor("import-a");
  const b = contextFor("import-b");
  const first = mergeMediaContexts(a, b).get("imported/shared-source.png");
  const reversed = mergeMediaContexts(b, a).get("imported/shared-source.png");
  assert.deepEqual(first, reversed);
  assert.equal(first.entityId, "import-a");
  assert.deepEqual(first.links.map(link => link.entityId), ["import-a", "import-b"]);
  const key = mediaObjectKey({ ...first, assetId: "stable-asset", sha256: "b".repeat(64) }).key;
  assert.equal(key, "owner-one/media/garments/a/originals/stable-asset-bbbbbbbbbbbbbbbb.png");
});

test("shared source declarations never silently merge two owners", () => {
  assert.throws(() => mergeMediaContexts(contextFor("import-a"), contextFor("import-b", "owner-two")), /Conflicting media ownership/);
});

test("runtime library normalization uses the same canonical source regardless of record order", () => {
  const records = [{ id: "import-z", userId: "owner-one", originalImage: photo },
    { id: "import-a", userId: "owner-one", sourcePhotos: [{ id: "photo-one", image: photo }] }];
  const first = libraryStorageContexts(records).get("imported/shared-source.png");
  const reversed = libraryStorageContexts([...records].reverse()).get("imported/shared-source.png");
  assert.deepEqual(first, reversed);
  assert.equal(first.entityId, "import-a");
  assert.equal(first.links.length, 2);
});

test("semantic garment fields separate original photos, cutouts, look previews, and videos", () => {
  const contexts = garmentMediaContexts({ id: "import-shirt", userId: "owner-one", originalImage: photo,
    image: "/api/import/library/cutout.png", thumbnail: "/api/import/library/thumb.webp" }, {
    looks: [{ id: "look-one", image: "/api/import/library/model.png", preview: "/api/import/library/model.webp",
      videoClips: [{ id: "clip-one", video: "/api/import/library/motion.mp4", hoverVideo: "/api/import/library/hover.mp4" }] }],
  });
  assert.equal(contexts.get("imported/shared-source.png").role, "original");
  assert.equal(contexts.get("imported/cutout.png").role, "cutout");
  assert.equal(contexts.get("imported/thumb.webp").role, "thumbnail");
  assert.equal(contexts.get("imported/model.webp").lookId, "look-one");
  assert.equal(contexts.get("imported/model.webp").role, "preview");
  assert.equal(contexts.get("imported/motion.mp4").role, "video");
  assert.equal(contexts.get("imported/hover.mp4").role, "hover-video");
});

test("profile references and processing inputs retain their owners and meaningful roles", () => {
  const profile = profileMediaContexts({ id: "owner-one", referenceImages: [{ fileName: "face.jpg", avatarFileName: "avatar.webp" }],
    backgroundReferences: [{ fileName: "scene.jpg", previewFileName: "scene.webp" }] });
  assert.equal(profile.get("profiles/owner-one/references/face.jpg").role, "reference");
  assert.equal(profile.get("profiles/owner-one/references/avatar.webp").role, "avatar");
  assert.equal(profile.get("profiles/owner-one/backgrounds/scene.webp").role, "background-preview");
  const jobs = jobMediaContexts({ id: "job-one", userId: "owner-one", internal: { originalFile: "source.png", cropFile: "crop.png" }, stages: {} });
  assert.equal(jobs.get("jobs/job-one/source.png").entityType, "job");
  assert.equal(jobs.get("jobs/job-one/crop.png").role, "crop");
  assert.equal(jobs.get("jobs/job-one/crop.png").ownerUserId, "owner-one");
});

test("profile-generated images are organized by their actual outfit and plan IDs", () => {
  const contexts = profileMediaContexts({ id: "owner-one", wardrobeOutfits: [{ id: "outfit-one", name: "Dinner",
    garments: [{ itemId: "shirt-one" }], modeledLooks: [{ id: "outfit-look", image: "/outfit.png", preview: "/outfit.webp" }] }],
    wardrobePlans: [{ id: "plan-one", input: { kind: "trip" }, result: { outfitIdeas: [{ name: "Day one",
      modeledLooks: [{ id: "plan-look", image: "/plan.png", preview: "/plan.webp" }] }] } }] });
  assert.equal(contexts.get("imported/outfit.png").entityType, "outfit");
  assert.equal(contexts.get("imported/outfit.png").entityId, "outfit-one");
  assert.equal(contexts.get("imported/plan.webp").entityType, "plan");
  assert.equal(contexts.get("imported/plan.webp").entityId, "plan-one");
  assert.equal(contexts.get("imported/plan.webp").lookId, "plan-look");
});
