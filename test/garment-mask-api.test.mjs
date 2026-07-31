import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
