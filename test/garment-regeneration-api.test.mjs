import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import sharp from "sharp";
import { createSessionToken, wardrobeImportApi } from "../scripts/import-job-api.mjs";

const SESSION_SECRET = "garment-regeneration-test-session-secret";

function mockRequest(url, method = "POST", input = {}) {
  const request = Readable.from([Buffer.from(JSON.stringify(input))]);
  request.url = url;
  request.method = method;
  request.headers = {
    "content-type": "application/json",
    cookie: `wardrobe_session=${createSessionToken(SESSION_SECRET, "default")}`,
  };
  request.socket = { remoteAddress: "127.0.0.1" };
  return request;
}

function mockResponse() {
  const headers = new Map();
  let responseBody = "";
  return {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    getHeader(name) { return headers.get(name.toLowerCase()); },
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

test("accepting or discarding a regenerated candidate preserves the chosen garment", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wardrobe-regeneration-api-"));
  const dataDir = path.join(root, "data");
  const importedDir = path.join(dataDir, "imported");
  const acceptId = "import-00000000-0000-4000-8000-000000000001";
  const discardId = "import-00000000-0000-4000-8000-000000000002";
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
    const assets = [
      "accept-old.png",
      "accept-old-preview.webp",
      "accept-old-thumbnail.webp",
      "accept-candidate.png",
      "accept-candidate-preview.webp",
      "accept-candidate-thumbnail.webp",
      "accept-old-variant.png",
      "accept-old-variant-preview.webp",
      "accept-old-variant-thumbnail.webp",
      "discard-old.png",
      "discard-candidate.png",
      "source.png",
    ];
    await Promise.all(assets.map((name) => writeFile(path.join(importedDir, name), Buffer.from(name))));
    const candidatePixels = Buffer.alloc(4 * 4 * 4);
    for (let pixel = 0; pixel < 16; pixel += 1) {
      const color = pixel % 4 < 2 ? [20, 33, 61] : [192, 132, 87];
      candidatePixels.set([...color, 255], pixel * 4);
    }
    await sharp(candidatePixels, { raw: { width: 4, height: 4, channels: 4 } })
      .png()
      .toFile(path.join(importedDir, "accept-candidate.png"));
    await writeFile(path.join(dataDir, "library.json"), JSON.stringify([
      {
        id: acceptId,
        userId: "default",
        name: "Old blazer",
        part: "wholebody_up",
        color: "#111111",
        tags: ["old detail"],
        image: "/api/import/library/accept-old.png",
        imagePreview: "/api/import/library/accept-old-preview.webp",
        thumbnail: "/api/import/library/accept-old-thumbnail.webp",
        colorVariants: [{
          id: "burgundy",
          image: "/api/import/library/accept-old-variant.png",
          preview: "/api/import/library/accept-old-variant-preview.webp",
          thumbnail: "/api/import/library/accept-old-variant-thumbnail.webp",
          primaryColor: "#7a3d49",
          secondaryColor: "#304b65",
          primaryThreshold: 120,
          secondaryThreshold: 80,
          createdAt: "2026-07-30T10:00:00.000Z",
        }],
        colorVariantOrder: ["burgundy", "original"],
        selectedColorVariantId: "burgundy",
        sourcePhotos: [{ id: "source", image: "/api/import/library/source.png" }],
        garmentRegenerationCandidate: {
          id: "accept-candidate",
          image: "/api/import/library/accept-candidate.png",
          preview: "/api/import/library/accept-candidate-preview.webp",
          thumbnail: "/api/import/library/accept-candidate-thumbnail.webp",
          metadata: {
            name: "Navy peak-lapel blazer",
            part: "wholebody_up",
            color: "#14213d",
            secondaryColor: "#c08457",
            tags: ["peak lapels", "double-breasted"],
          },
          sourcePhotoIds: ["source"],
        },
      },
      {
        id: discardId,
        userId: "default",
        name: "Current shirt",
        part: "upperbody",
        color: "#eeeeee",
        image: "/api/import/library/discard-old.png",
        garmentRegenerationCandidate: {
          id: "discard-candidate",
          image: "/api/import/library/discard-candidate.png",
          metadata: { name: "Candidate shirt", part: "upperbody", color: "#ffffff" },
        },
      },
    ], null, 2));

    const acceptResponse = mockResponse();
    await api.handler(mockRequest(`/api/import/wardrobe/${acceptId}/regeneration/accept`), acceptResponse, () => {});
    assert.equal(acceptResponse.statusCode, 200);
    assert.equal(acceptResponse.json().name, "Navy peak-lapel blazer");
    assert.equal(acceptResponse.json().image.split("?")[0], "/api/import/library/accept-candidate.png");
    assert.equal(acceptResponse.json().garmentRegenerationCandidate, null);
    assert.equal(acceptResponse.json().colorVariants.length, 1);
    assert.equal(acceptResponse.json().colorVariants[0].id, "burgundy");
    assert.equal(acceptResponse.json().colorVariants[0].primaryColor, "#7a3d49");
    assert.equal(acceptResponse.json().colorVariants[0].secondaryColor, "#304b65");
    assert.notEqual(acceptResponse.json().colorVariants[0].image.split("?")[0], "/api/import/library/accept-old-variant.png");
    assert.deepEqual(acceptResponse.json().colorVariantOrder, ["burgundy", "original"]);
    assert.equal(acceptResponse.json().selectedColorVariantId, "burgundy");

    const discardResponse = mockResponse();
    await api.handler(mockRequest(`/api/import/wardrobe/${discardId}/regeneration`, "DELETE"), discardResponse, () => {});
    assert.equal(discardResponse.statusCode, 200);
    assert.equal(discardResponse.json().name, "Current shirt");
    assert.equal(discardResponse.json().image.split("?")[0], "/api/import/library/discard-old.png");
    assert.equal(discardResponse.json().garmentRegenerationCandidate, null);

    const stored = JSON.parse(await readFile(path.join(dataDir, "library.json"), "utf8"));
    assert.equal(stored[0].name, "Navy peak-lapel blazer");
    assert.equal(stored[0].image, "/api/import/library/accept-candidate.png");
    assert.equal(stored[0].colorVariants[0].primaryThreshold, 120);
    const rebuiltVariantName = path.basename(stored[0].colorVariants[0].image);
    const rebuiltPixel = await sharp(path.join(importedDir, rebuiltVariantName)).raw().toBuffer();
    assert.notDeepEqual([...rebuiltPixel.subarray(0, 3)], [20, 33, 61]);
    assert.notDeepEqual([...rebuiltPixel.subarray(12, 15)], [192, 132, 87]);
    assert.equal(stored[1].name, "Current shirt");
    await assert.rejects(stat(path.join(importedDir, "accept-old.png")), { code: "ENOENT" });
    await assert.rejects(stat(path.join(importedDir, "accept-old-variant.png")), { code: "ENOENT" });
    await stat(path.join(importedDir, rebuiltVariantName));
    await assert.rejects(stat(path.join(importedDir, "discard-candidate.png")), { code: "ENOENT" });
    await stat(path.join(importedDir, "accept-candidate.png"));
    await stat(path.join(importedDir, "discard-old.png"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
