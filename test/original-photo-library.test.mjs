import test from "node:test";
import assert from "node:assert/strict";
import { collectOriginalPhotoLibrary } from "../src/original-photo-library.js";

test("groups a shared original photo and lists every connected garment once", () => {
  const photos = collectOriginalPhotoLibrary([
    {
      id: "shirt",
      name: "Linen shirt",
      image: "/api/assets/shirt.png?user=owner",
      sourcePhotos: [
        { id: "one", image: "/api/assets/source.jpg?user=owner", preview: "/api/assets/source-preview.webp?user=owner", addedAt: "2026-06-01T10:00:00Z" },
        { id: "duplicate-occurrence", image: "/api/assets/source.jpg?user=owner" },
      ],
    },
    {
      id: "trousers",
      name: "Blue trousers",
      image: "/api/assets/trousers.png?user=owner",
      sourcePhotos: [{ id: "two", image: "/api/assets/source.jpg?user=another-cache-key", sourceFileName: "outfit.jpg" }],
    },
  ]);

  assert.equal(photos.length, 1);
  assert.equal(photos[0].id, "/api/assets/source.jpg");
  assert.equal(photos[0].preview, "/api/assets/source-preview.webp?user=owner");
  assert.equal(photos[0].sourceFileName, "outfit.jpg");
  assert.deepEqual(photos[0].garments.map((garment) => garment.id), ["shirt", "trousers"]);
});
test("includes legacy original images and orders dated photos newest first", () => {
  const photos = collectOriginalPhotoLibrary([
    {
      id: "legacy",
      name: "Legacy coat",
      image: "/api/assets/coat.png",
      originalImage: "/api/assets/old-source.jpg?user=one",
      originalPreview: "/api/assets/old-source-preview.webp?user=one",
      createdAt: "2025-01-01T00:00:00Z",
    },
    {
      id: "new",
      name: "New dress",
      image: "/api/assets/dress.png",
      sourcePhotos: [{ image: "/api/assets/new-source.jpg?user=one", addedAt: "2026-01-01T00:00:00Z" }],
    },
  ]);

  assert.deepEqual(photos.map((photo) => photo.id), [
    "/api/assets/new-source.jpg",
    "/api/assets/old-source.jpg",
  ]);
  assert.equal(photos[1].preview, "/api/assets/old-source-preview.webp?user=one");
  assert.equal(photos[1].garments[0].name, "Legacy coat");
});
