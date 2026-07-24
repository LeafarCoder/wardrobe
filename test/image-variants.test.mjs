import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  imageVariantFileName,
  prepareProviderImage,
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
  assert.equal(
    imageVariantFileName("profile-reference.jpg", "avatar"),
    "profile-reference-avatar-v1.webp",
  );
});

test("creates bounded WebP avatars, thumbnails, and previews while preserving alpha", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "wardrobe-image-variants-"));
  const source = path.join(directory, "source.png");
  const avatar = path.join(directory, "avatar.webp");
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

    await writeImageVariant(source, avatar, "avatar");
    await writeImageVariant(source, thumbnail, "thumbnail");
    await writeImageVariant(source, preview, "preview");

    const avatarMetadata = await sharp(avatar).metadata();
    const thumbnailMetadata = await sharp(thumbnail).metadata();
    const previewMetadata = await sharp(preview).metadata();

    assert.equal(avatarMetadata.format, "webp");
    assert.equal(avatarMetadata.width, 192);
    assert.equal(avatarMetadata.height, 128);
    assert.equal(avatarMetadata.hasAlpha, true);
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

test("reduces provider-bound photos using configurable conservative limits", async () => {
  const previousEdge = process.env.WARDROBE_AI_REFERENCE_MAX_EDGE;
  const previousQuality = process.env.WARDROBE_AI_REFERENCE_JPEG_QUALITY;
  process.env.WARDROBE_AI_REFERENCE_MAX_EDGE = "900";
  process.env.WARDROBE_AI_REFERENCE_JPEG_QUALITY = "78";
  try {
    const source = await sharp({
      create: {
        width: 1800,
        height: 1200,
        channels: 3,
        background: { r: 84, g: 118, b: 146 },
      },
    }).jpeg({ quality: 96 }).toBuffer();
    const prepared = await prepareProviderImage(source);
    const metadata = await sharp(prepared.data).metadata();

    assert.equal(prepared.mime, "image/jpeg");
    assert.equal(prepared.extension, ".jpg");
    assert.equal(metadata.width, 900);
    assert.equal(metadata.height, 600);
    assert.ok(prepared.data.length < source.length);
  } finally {
    if (previousEdge === undefined) delete process.env.WARDROBE_AI_REFERENCE_MAX_EDGE;
    else process.env.WARDROBE_AI_REFERENCE_MAX_EDGE = previousEdge;
    if (previousQuality === undefined) delete process.env.WARDROBE_AI_REFERENCE_JPEG_QUALITY;
    else process.env.WARDROBE_AI_REFERENCE_JPEG_QUALITY = previousQuality;
  }
});
