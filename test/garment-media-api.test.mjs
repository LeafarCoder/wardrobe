import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { createSessionToken, wardrobeImportApi } from "../scripts/import-job-api.mjs";

const SESSION_SECRET = "garment-media-order-test-session-secret";
const ITEM_ID = "import-00000000-0000-4000-8000-000000000021";

function mockRequest(ids) {
  return mockJsonRequest(`/api/import/wardrobe/${ITEM_ID}/media-order`, "PATCH", { ids });
}

function mockJsonRequest(url, method, input = {}) {
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

test("saves one complete mixed order for original and generated garment photos", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wardrobe-media-order-api-"));
  const dataDir = path.join(root, "data");
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
    await writeFile(path.join(dataDir, "library.json"), JSON.stringify([{
      id: ITEM_ID,
      userId: "default",
      name: "Linen shirt",
      part: "upperbody",
      color: "#eee8dc",
      image: "/api/import/library/shirt.png",
      sourcePhotos: [
        { id: "source-one", image: "/api/import/library/source-one.png" },
        { id: "source-two", image: "/api/import/library/source-two.png" },
      ],
      modeledLooks: [
        { id: "look-one", image: "/api/import/library/look-one.png" },
        { id: "look-two", image: "/api/import/library/look-two.png" },
      ],
    }], null, 2));

    const ids = ["source:source-two", "modeled:look-one", "source:source-one", "modeled:look-two"];
    const response = mockResponse();
    await api.handler(mockRequest(ids), response, () => {});
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().mediaOrder, ids);
    const stored = JSON.parse(await readFile(path.join(dataDir, "library.json"), "utf8"));
    assert.deepEqual(stored[0].mediaOrder, ids);

    const staleResponse = mockResponse();
    await api.handler(mockRequest(["source:source-one"]), staleResponse, () => {});
    assert.equal(staleResponse.statusCode, 409);
    assert.equal(staleResponse.json().code, "garment_media_order_stale");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("promotes a selected garment version and persists a complete thumbnail order", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wardrobe-selected-variant-api-"));
  const dataDir = path.join(root, "data");
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
    await writeFile(path.join(dataDir, "library.json"), JSON.stringify([{
      id: ITEM_ID,
      userId: "default",
      name: "Linen shirt",
      part: "upperbody",
      color: "#eee8dc",
      image: "/api/import/library/shirt.png",
      colorVariants: [
        { id: "navy", image: "/api/import/library/shirt-navy.png" },
        { id: "green", image: "/api/import/library/shirt-green.png" },
      ],
    }], null, 2));

    const selectResponse = mockResponse();
    await api.handler(mockJsonRequest(
      `/api/import/wardrobe/${ITEM_ID}/variants/selection`,
      "PATCH",
      { variantId: "navy" },
    ), selectResponse, () => {});
    assert.equal(selectResponse.statusCode, 200);
    assert.equal(selectResponse.json().selectedColorVariantId, "navy");
    assert.deepEqual(selectResponse.json().colorVariantOrder, ["navy", "original", "green"]);

    let stored = JSON.parse(await readFile(path.join(dataDir, "library.json"), "utf8"));
    assert.deepEqual(stored[0].colorVariantOrder, ["navy", "original", "green"]);

    const orderResponse = mockResponse();
    await api.handler(mockJsonRequest(
      `/api/import/wardrobe/${ITEM_ID}/variants/order`,
      "PATCH",
      { ids: ["green", "navy", "original"] },
    ), orderResponse, () => {});
    assert.equal(orderResponse.statusCode, 200);
    assert.equal(orderResponse.json().selectedColorVariantId, "green");
    assert.deepEqual(orderResponse.json().colorVariantOrder, ["green", "navy", "original"]);
    stored = JSON.parse(await readFile(path.join(dataDir, "library.json"), "utf8"));
    assert.deepEqual(stored[0].colorVariantOrder, ["green", "navy", "original"]);

    const staleOrderResponse = mockResponse();
    await api.handler(mockJsonRequest(
      `/api/import/wardrobe/${ITEM_ID}/variants/order`,
      "PATCH",
      { ids: ["green", "original"] },
    ), staleOrderResponse, () => {});
    assert.equal(staleOrderResponse.statusCode, 409);
    assert.equal(staleOrderResponse.json().code, "garment_variant_order_stale");

    const originalResponse = mockResponse();
    await api.handler(mockJsonRequest(
      `/api/import/wardrobe/${ITEM_ID}/variants/selection`,
      "PATCH",
      { variantId: null },
    ), originalResponse, () => {});
    assert.equal(originalResponse.statusCode, 200);
    assert.equal(originalResponse.json().selectedColorVariantId, null);
    assert.deepEqual(originalResponse.json().colorVariantOrder, ["original", "green", "navy"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("deletes an original photo, chooses a remaining primary source, and preserves modeled looks", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wardrobe-source-delete-api-"));
  const dataDir = path.join(root, "data");
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
    await writeFile(path.join(dataDir, "library.json"), JSON.stringify([{
      id: ITEM_ID,
      userId: "default",
      name: "Merged shirt",
      part: "upperbody",
      color: "#eee8dc",
      image: "/api/import/library/shirt.png",
      sourcePhotos: [
        { id: "source-one", image: "/api/import/library/source-one.png", boundingBox: { x: 1, y: 2, width: 300, height: 400 } },
        { id: "source-two", image: "/api/import/library/source-two.png", boundingBox: { x: 5, y: 6, width: 350, height: 450 } },
      ],
      modeledLooks: [{ id: "look-one", image: "/api/import/library/look-one.png" }],
      mediaOrder: ["source:source-one", "modeled:look-one", "source:source-two"],
    }], null, 2));

    const response = mockResponse();
    await api.handler(mockJsonRequest(
      `/api/import/wardrobe/${ITEM_ID}/sources/source-one`,
      "DELETE",
      { replacementSourcePhotoId: "source-two" },
    ), response, () => {});

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().sourcePhotos.map((photo) => photo.id), ["source-two"]);
    assert.equal(response.json().originalImage, "/api/import/library/source-two.png?user=default");
    assert.deepEqual(response.json().modeledLooks.map((look) => look.id), ["look-one"]);
    assert.deepEqual(response.json().mediaOrder, ["modeled:look-one", "source:source-two"]);

    const stored = JSON.parse(await readFile(path.join(dataDir, "library.json"), "utf8"));
    assert.deepEqual(stored[0].sourcePhotos.map((photo) => photo.id), ["source-two"]);
    assert.deepEqual(stored[0].modeledLooks.map((look) => look.id), ["look-one"]);
    assert.deepEqual(stored[0].boundingBox, { x: 5, y: 6, width: 350, height: 450 });

    const lastResponse = mockResponse();
    await api.handler(mockJsonRequest(
      `/api/import/wardrobe/${ITEM_ID}/sources/source-two`,
      "DELETE",
      { replacementSourcePhotoId: null },
    ), lastResponse, () => {});
    assert.equal(lastResponse.statusCode, 200);
    assert.deepEqual(lastResponse.json().sourcePhotos, []);
    assert.equal(lastResponse.json().originalImage, null);
    assert.deepEqual(lastResponse.json().modeledLooks.map((look) => look.id), ["look-one"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
