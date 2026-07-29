import test from "node:test";
import assert from "node:assert/strict";
import { collectOriginalPhotoLibrary } from "../src/original-photo-library.js";

test("groups copied assets from one upload and lists every connected garment once", () => {
  const uploadId = "86b50b17-38b0-4b4d-a05d-a3856d8c6226";
  const photos = collectOriginalPhotoLibrary([
    {
      id: "shirt",
      name: "Linen shirt",
      image: "/api/assets/shirt.png?user=owner",
      importJobId: "shirt-job",
      importUploadId: uploadId,
      originalImage: "/api/assets/shirt-copy-of-upload.jpg?user=owner",
      sourcePhotos: [
        { id: "one", importJobId: "shirt-job", image: "/api/assets/shirt-copy-of-upload.jpg?user=owner", preview: "/api/assets/shirt-source-preview.webp?user=owner", addedAt: "2026-06-01T10:00:00Z" },
        { id: "duplicate-occurrence", importUploadId: uploadId, image: "/api/assets/another-copy.jpg?user=owner" },
      ],
    },
    {
      id: "trousers",
      name: "Blue trousers",
      image: "/api/assets/trousers.png?user=owner",
      importUploadId: uploadId,
      originalImage: "/api/assets/trousers-copy-of-upload.jpg?user=owner",
      sourcePhotos: [{ id: "two", importUploadId: uploadId, image: "/api/assets/trousers-copy-of-upload.jpg?user=owner", sourceFileName: "outfit.jpg" }],
    },
  ]);

  assert.equal(photos.length, 1);
  assert.equal(photos[0].id, `upload:${uploadId}`);
  assert.equal(photos[0].preview, "/api/assets/shirt-source-preview.webp?user=owner");
  assert.equal(photos[0].sourceFileName, "outfit.jpg");
  assert.deepEqual(photos[0].garments.map((garment) => garment.id), ["shirt", "trousers"]);
});

test("keeps separate uploads distinct even when their filenames match", () => {
  const photos = collectOriginalPhotoLibrary([
    {
      id: "first",
      originalImage: "/api/assets/first-copy.jpg",
      importUploadId: "first-upload",
      sourceFileName: "outfit.jpg",
    },
    {
      id: "second",
      originalImage: "/api/assets/second-copy.jpg",
      importUploadId: "second-upload",
      sourceFileName: "outfit.jpg",
    },
  ]);

  assert.deepEqual(photos.map((photo) => photo.id), ["upload:first-upload", "upload:second-upload"]);
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
