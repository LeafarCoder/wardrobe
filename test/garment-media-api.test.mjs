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
  const request = Readable.from([Buffer.from(JSON.stringify({ ids }))]);
  request.url = `/api/import/wardrobe/${ITEM_ID}/media-order`;
  request.method = "PATCH";
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
