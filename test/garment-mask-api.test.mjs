import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import sharp from "sharp";
import { createSessionToken, wardrobeImportApi } from "../scripts/import-job-api.mjs";

const SESSION_SECRET = "garment-mask-api-test-secret";

function mockRequest(url, value) {
  const request = Readable.from([Buffer.from(JSON.stringify(value))]);
  request.url = url;
  request.method = "POST";
  request.headers = {
    "content-type": "application/json",
    cookie: `wardrobe_session=${createSessionToken(SESSION_SECRET, "default")}`,
  };
  request.socket = { remoteAddress: "127.0.0.1" };
  return request;
}

function mockResponse() {
  let responseBody = "";
  return {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    setHeader() {},
    end(chunk = "") {
      responseBody += chunk ? String(chunk) : "";
      this.headersSent = true;
      this.writableEnded = true;
      return this;
    },
    destroy(error) { throw error; },
    json() { return responseBody ? JSON.parse(responseBody) : null; },
  };
}

test("the import API applies a hand-edited segmentation mask as a review candidate", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wardrobe-mask-api-"));
  const dataDir = path.join(root, "data");
  const jobId = "00000000-0000-4000-8000-000000000041";
  const jobDir = path.join(dataDir, "jobs", jobId);
  const api = wardrobeImportApi({
    env: {
      WARDROBE_DATA_DIR: dataDir,
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
      WARDROBE_SESSION_SECRET: SESSION_SECRET,
    },
  });

  try {
    await api.initialize(root);
    await mkdir(jobDir, { recursive: true });
    const sourceName = "garment-opaque.png";
    await sharp({
      create: { width: 32, height: 32, channels: 4, background: { r: 238, g: 238, b: 238, alpha: 1 } },
    }).png().toFile(path.join(jobDir, sourceName));
    await writeFile(path.join(jobDir, "job.json"), JSON.stringify({
      id: jobId,
      userId: "default",
      status: "active",
      metadata: { name: "Test top", part: "upperbody", color: "#eeeeee" },
      stages: {
        crop: { status: "approved" },
        garment: {
          status: "review",
          attempts: 1,
          assetUrl: `/api/import/assets/${jobId}/${sourceName}`,
          selectedCandidateId: "opaque",
          candidates: [{
            id: "opaque",
            assetUrl: `/api/import/assets/${jobId}/${sourceName}`,
            attempt: 1,
            backgroundTransparent: false,
          }],
        },
        modeled: { status: "pending" },
      },
    }, null, 2));
    const maskPixels = Buffer.alloc(32 * 32);
    for (let y = 8; y < 24; y += 1) {
      for (let x = 8; x < 24; x += 1) maskPixels[(y * 32) + x] = 255;
    }
    const mask = await sharp(maskPixels, { raw: { width: 32, height: 32, channels: 1 } }).png().toBuffer();
    const response = mockResponse();
    await api.handler(
      mockRequest(`/api/import/jobs/${jobId}/stages/garment/mask-apply`, {
        maskDataUrl: `data:image/png;base64,${mask.toString("base64")}`,
        threshold: 128,
        edge: -1,
        feather: 1,
      }),
      response,
      () => {},
    );

    assert.equal(response.statusCode, 200);
    const stage = response.json().stages.garment;
    assert.equal(stage.status, "review");
    assert.equal(stage.candidates.length, 2);
    assert.match(stage.assetUrl, /masked-.*\.png/);
    const stored = JSON.parse(await readFile(path.join(jobDir, "job.json"), "utf8"));
    assert.equal(stored.stages.garment.maskThreshold, 128);
    assert.equal(stored.stages.garment.maskEdge, -1);
    assert.equal(stored.stages.garment.maskFeather, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a saved garment can replace its opaque image in place without losing its photos or looks", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wardrobe-saved-mask-api-"));
  const dataDir = path.join(root, "data");
  const libraryDir = path.join(dataDir, "imported");
  const itemId = "import-00000000-0000-4000-8000-000000000042";
  const sourceName = `${itemId}-opaque.png`;
  const api = wardrobeImportApi({
    env: {
      WARDROBE_DATA_DIR: dataDir,
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
      WARDROBE_SESSION_SECRET: SESSION_SECRET,
    },
  });

  try {
    await api.initialize(root);
    await mkdir(libraryDir, { recursive: true });
    await sharp({
      create: { width: 32, height: 32, channels: 4, background: { r: 245, g: 245, b: 245, alpha: 1 } },
    }).png().toFile(path.join(libraryDir, sourceName));
    await writeFile(path.join(dataDir, "library.json"), JSON.stringify([{
      id: itemId,
      userId: "default",
      name: "Saved top",
      part: "upperbody",
      color: "#f5f5f5",
      image: `/api/import/library/${sourceName}`,
      thumbnail: `/api/import/library/${sourceName}`,
      sourcePhotos: [{ id: "source-one", image: "/api/import/library/original-photo.png" }],
      modeledLooks: [{ id: "look-one", image: "/api/import/library/modeled-look.png" }],
    }], null, 2));
    const maskPixels = Buffer.alloc(32 * 32);
    for (let y = 7; y < 25; y += 1) {
      for (let x = 7; x < 25; x += 1) maskPixels[(y * 32) + x] = 255;
    }
    const mask = await sharp(maskPixels, { raw: { width: 32, height: 32, channels: 1 } }).png().toBuffer();
    const response = mockResponse();
    await api.handler(
      mockRequest(`/api/import/wardrobe/${itemId}/mask/apply`, {
        maskDataUrl: `data:image/png;base64,${mask.toString("base64")}`,
        sourceImage: `/api/import/library/${sourceName}`,
        versionId: "original",
        threshold: 128,
        edge: -1,
        feather: 1,
      }),
      response,
      () => {},
    );

    assert.equal(response.statusCode, 200);
    assert.match(response.json().image, /masked-.*\.png/);
    assert.equal(response.json().sourcePhotos.length, 1);
    assert.equal(response.json().modeledLooks.length, 1);
    const stored = JSON.parse(await readFile(path.join(dataDir, "library.json"), "utf8"));
    assert.match(stored[0].image, /masked-.*\.png/);
    assert.equal(stored[0].sourcePhotos[0].id, "source-one");
    assert.equal(stored[0].modeledLooks[0].id, "look-one");
    await assert.rejects(stat(path.join(libraryDir, sourceName)), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
