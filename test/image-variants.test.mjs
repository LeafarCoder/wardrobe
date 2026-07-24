import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  imageVariantFileName,
  writeImageVariant,
} from "../scripts/import-job-api.mjs";

test("uses versioned WebP filenames for cache-safe image variants", () => {
  assert.equal(
    imageVariantFileName("/api/import/library/example-garment.png?user=default", "thumbnail"),
    "example-garment-thumbnail-v1.webp",
  );
  assert.equal(
    imageVariantFileName("/api/import/library/example-modeled.png", "preview"),
    "example-modeled-preview-v1.webp",
  );
});

test("creates bounded WebP thumbnails and previews while preserving alpha", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "wardrobe-image-variants-"));
  const source = path.join(directory, "source.png");
  const thumbnail = path.join(directory, "thumbnail.webp");
  const preview = path.join(directory, "preview.webp");

  try {
    await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 4,
        background: { r: 48, g: 92, b: 72, alpha: 0.7 },
      },
    }).png().toFile(source);

    await writeImageVariant(source, thumbnail, "thumbnail");
    await writeImageVariant(source, preview, "preview");

    const thumbnailMetadata = await sharp(thumbnail).metadata();
    const previewMetadata = await sharp(preview).metadata();

    assert.equal(thumbnailMetadata.format, "webp");
    assert.equal(thumbnailMetadata.width, 320);
    assert.equal(thumbnailMetadata.height, 213);
    assert.equal(thumbnailMetadata.hasAlpha, true);
    assert.equal(previewMetadata.format, "webp");
    assert.equal(previewMetadata.width, 1040);
    assert.equal(previewMetadata.height, 693);
    assert.equal(previewMetadata.hasAlpha, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
