import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  buildGarmentPrompt,
  cropDetailDiagnostics,
  cropDetectedItem,
  garmentCutoutTransparencyFailure,
  imageVariantFileName,
  prepareGarmentReference,
  prepareProviderImage,
  processChromaBackground,
  writeImageVariant,
} from "../scripts/import-job-api.mjs";

test("respects a user-defined crop without adding hidden padding", async () => {
  const source = await sharp({
    create: {
      width: 100,
      height: 200,
      channels: 3,
      background: { r: 40, g: 60, b: 100 },
    },
  }).png().toBuffer();
  const cropped = await cropDetectedItem(source, {
    x: 200,
    y: 100,
    width: 600,
    height: 500,
  }, {
    paddingRatio: 0,
    minimumPadding: 0,
  });
  const metadata = await sharp(cropped).metadata();

  assert.equal(metadata.width, 60);
  assert.equal(metadata.height, 100);
});

test("magnifies tiny garment crops onto a stable square generation canvas", async () => {
  const source = await sharp({
    create: {
      width: 148,
      height: 94,
      channels: 3,
      background: { r: 99, g: 71, b: 57 },
    },
  }).png().toBuffer();
  const reference = await prepareGarmentReference(source);
  const metadata = await sharp(reference).metadata();

  assert.equal(metadata.width, 1024);
  assert.equal(metadata.height, 1024);
});

test("can remove contextual color influence while preserving a square garment reference", async () => {
  const source = await sharp({
    create: {
      width: 148,
      height: 94,
      channels: 3,
      background: { r: 20, g: 170, b: 70 },
    },
  }).png().toBuffer();
  const reference = await prepareGarmentReference(source, 1024, { grayscale: true });
  const { data, info } = await sharp(reference)
    .extract({ left: 512, top: 512, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  assert.ok(info.channels >= 3);
  assert.equal(data[0], data[1]);
  assert.equal(data[1], data[2]);
});

test("marks tiny source crops as low-detail", async () => {
  const source = await sharp({
    create: {
      width: 3024,
      height: 4032,
      channels: 3,
      background: { r: 220, g: 220, b: 220 },
    },
  }).png().toBuffer();
  const crop = await sharp({
    create: {
      width: 148,
      height: 94,
      channels: 3,
      background: { r: 99, g: 71, b: 57 },
    },
  }).png().toBuffer();
  const diagnostics = await cropDetailDiagnostics(source, crop);

  assert.equal(diagnostics.cropWidth, 148);
  assert.equal(diagnostics.cropHeight, 94);
  assert.equal(diagnostics.lowDetail, true);
});

test("uses accessory-specific reconstruction language instead of clothing anatomy", () => {
  const prompt = buildGarmentPrompt({
    name: "Wristwatch",
    part: "accessories_up",
    color: "#634739",
    tags: ["brown strap", "casual"],
  }, "#00ffff", { hasContextReference: true });

  assert.match(prompt, /fashion accessory/i);
  assert.match(prompt, /case, crown, strap, buckle/i);
  assert.match(prompt, /not reinterpret it as another kind/i);
  assert.match(prompt, /shirt, T-shirt, polo/i);
  assert.match(prompt, /Image 2 is a grayscale wider contextual crop/i);
  assert.match(prompt, /never take product colors from Image 2/i);
  assert.match(prompt, /Color control — mandatory/i);
  assert.match(prompt, /saved primary color is #634739/i);
  assert.match(prompt, /There is no saved secondary color/i);
  assert.doesNotMatch(prompt, /neckline, sleeves, fastenings/i);
});

test("uses both saved colors as mandatory controls during garment regeneration", () => {
  const prompt = buildGarmentPrompt({
    name: "Wristwatch",
    part: "accessories_up",
    color: "#634739",
    secondaryColor: "#D1C3A8",
    tags: ["brown strap", "casual"],
  }, "#00ffff", { hasContextReference: true });

  assert.match(prompt, /saved primary color is #634739/i);
  assert.match(prompt, /saved secondary color is #D1C3A8/i);
  assert.match(prompt, /primary color controls the strap/i);
  assert.match(prompt, /secondary color controls a distinct dial, case, trim, or hardware region/i);
});

test("removes a neutral studio background when the image model ignores the chroma key", async () => {
  const watch = await sharp({
    create: {
      width: 70,
      height: 130,
      channels: 4,
      background: { r: 212, g: 125, b: 58, alpha: 1 },
    },
  }).png().toBuffer();
  const source = await sharp({
    create: {
      width: 220,
      height: 220,
      channels: 4,
      background: { r: 232, g: 230, b: 225, alpha: 1 },
    },
  })
    .composite([{ input: watch, left: 75, top: 45 }])
    .png()
    .toBuffer();

  const result = await processChromaBackground(source, "#00ff00", {
    protectedColors: ["#d47d3a"],
  });
  const { data, info } = await sharp(result.bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => data[(((y * info.width) + x) * 4) + 3];

  assert.equal(result.edgeFallbackApplied, true);
  assert.equal(alphaAt(0, 0), 0);
  assert.ok(alphaAt(Math.floor(info.width / 2), Math.floor(info.height / 2)) > 240);
});

test("asks the generator for transparency and explicitly rejects neutral substitute backgrounds", () => {
  const prompt = buildGarmentPrompt({
    name: "Wristwatch",
    part: "accessories_up",
    color: "#d47d3a",
    tags: ["leather strap"],
  }, "#00ffff");

  assert.match(prompt, /PNG with real transparency/i);
  assert.match(prompt, /Every pixel outside the product silhouette.*must have alpha 0/i);
  assert.match(prompt, /White, off-white, beige, cream, gray.*is still an opaque background and is forbidden/i);
  assert.match(prompt, /four corners/i);
  assert.match(prompt, /enclosed gaps between handles, arms, legs, or accessories/i);
  assert.match(prompt, /checked programmatically and will be rejected if its canvas remains opaque/i);
});

test("forbids painting the checkerboard that editors use to display transparency", () => {
  const prompt = buildGarmentPrompt({
    name: "Red beret",
    part: "accessories_up",
    color: "#be282d",
    tags: ["wool"],
  }, "#00ffff");

  assert.match(prompt, /Never draw a checkerboard/i);
  assert.match(prompt, /how software visualizes alpha; they are not how alpha is stored/i);
  assert.match(prompt, /produces a fully opaque image, is not transparency, and is rejected/i);
  assert.match(prompt, /checkerboard or checkered squares/i);
  assert.match(prompt, /no squares, tiles, or pattern of any kind/i);
});

// The reported failure: three garments were saved with a checkerboard painted
// into the image. Framing centres the cutout on a larger canvas, so measuring
// transparency after it reported ~23% for a fully opaque image and the quality
// gate accepted it.
test("a painted transparency checkerboard counts as no transparency at all", async () => {
  const size = 256;
  const cell = 16;
  const raw = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = ((y * size) + x) * 3;
      if (Math.hypot(x - (size / 2), y - (size / 2)) < 60) {
        raw[index] = 190; raw[index + 1] = 40; raw[index + 2] = 45;
        continue;
      }
      const light = ((Math.floor(x / cell) + Math.floor(y / cell)) % 2) === 0;
      const tone = light ? 255 : 204;
      raw[index] = tone; raw[index + 1] = tone; raw[index + 2] = tone;
    }
  }
  const painted = await sharp(raw, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();

  const result = await processChromaBackground(painted, "#00ff00", { protectedColors: ["#be282d"] });

  assert.equal(result.transparency.transparentRatio, 0);
  assert.ok(
    result.transparency.transparentRatio < 0.08,
    "an opaque painted background must fail the garment transparency gate",
  );
  assert.ok(
    result.transparency.framedTransparentRatio > 0.2,
    "framing padding alone still looks transparent, which is why it cannot be the measure",
  );
});

test("rejects a garment left standing on its source photo even when gaps clear the ratio gate", async () => {
  const size = 320;
  const raw = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = ((y * size) + x) * 3;
      const inGarment = Math.abs(x - (size / 2)) < 90 && Math.abs(y - (size / 2)) < 120;
      if (inGarment) {
        raw[index] = 142; raw[index + 1] = 150; raw[index + 2] = 160;
      } else {
        const noise = 120 + (((x * 7) + (y * 13)) % 60);
        raw[index] = noise; raw[index + 1] = noise - 6; raw[index + 2] = noise - 14;
      }
      if (inGarment && Math.abs(y - (size / 2)) < 110 && Math.abs(x - (size / 2)) > 55) {
        raw[index] = 0; raw[index + 1] = 255; raw[index + 2] = 0;
      }
    }
  }
  const onPhoto = await sharp(raw, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();

  const result = await processChromaBackground(onPhoto, "#00ff00", { protectedColors: ["#8e9196"] });

  assert.ok(
    result.transparency.transparentRatio >= 0.08,
    "the keyed gaps alone are enough to clear the overall ratio gate",
  );
  assert.equal(result.transparency.borderTransparentRatio, 0);
  assert.equal(garmentCutoutTransparencyFailure(result.transparency), "opaque-border");
});

test("the transparency contract is judged the same way wherever a cutout is accepted", () => {
  assert.equal(garmentCutoutTransparencyFailure({ transparentRatio: 0, borderTransparentRatio: 0 }), "opaque-canvas");
  assert.equal(garmentCutoutTransparencyFailure({ transparentRatio: 0.2, borderTransparentRatio: 0.1 }), "opaque-border");
  assert.equal(garmentCutoutTransparencyFailure({ transparentRatio: 0.5, borderTransparentRatio: 1 }), null);
  assert.equal(garmentCutoutTransparencyFailure({}), "opaque-canvas");
});

test("a real chroma-key cutout still reports the transparency it has", async () => {
  const size = 256;
  const raw = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = ((y * size) + x) * 3;
      if (Math.hypot(x - (size / 2), y - (size / 2)) < 60) {
        raw[index] = 190; raw[index + 1] = 40; raw[index + 2] = 45;
      } else {
        raw[index] = 0; raw[index + 1] = 255; raw[index + 2] = 0;
      }
    }
  }
  const keyed = await sharp(raw, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();

  const result = await processChromaBackground(keyed, "#00ff00", { protectedColors: ["#be282d"] });

  assert.ok(result.transparency.transparentRatio > 0.5);
  assert.equal(result.transparency.borderTransparentRatio, 1);
  assert.equal(garmentCutoutTransparencyFailure(result.transparency), null);
});

test("keeps a separately detected scarf out of an outerwear reconstruction", () => {
  const prompt = buildGarmentPrompt({
    name: "red wool coat",
    part: "wholebody_up",
    color: "#d51f35",
    tags: ["wool", "buttoned"],
  }, "#00ffff", {
    otherDetectedItems: [
      {
        name: "red black and white plaid scarf",
        part: "accessories_up",
        tags: ["scarf", "plaid", "fringed"],
      },
      {
        name: "red beret",
        part: "accessories_up",
        tags: ["hat"],
      },
    ],
  });

  assert.match(prompt, /SEPARATELY DETECTED PRODUCTS — ABSOLUTE EXCLUSION LIST/i);
  assert.match(prompt, /red black and white plaid scarf/i);
  assert.match(prompt, /red beret/i);
  assert.match(prompt, /a scarf crossing a coat's collar, lapels, neckline, or chest remains a separate scarf/i);
  assert.match(prompt, /do not reproduce its fabric, checks, fringes, knot, folds, colors, or silhouette/i);
  assert.match(prompt, /reconstruct only the target product's natural surface hidden underneath it/i);
  assert.match(prompt, /Return exactly the requested target and none of the separately detected products/i);
});

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
