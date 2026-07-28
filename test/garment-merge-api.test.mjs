import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import {
  createSessionToken,
  sourcePhotosForRecord,
  wardrobeImportApi,
} from "../scripts/import-job-api.mjs";

const SESSION_SECRET = "garment-merge-test-session-secret";

function mockRequest(url, input) {
  const request = Readable.from([Buffer.from(JSON.stringify(input))]);
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
  const headers = new Map();
  let body = "";
  return {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    getHeader(name) { return headers.get(name.toLowerCase()); },
    end(chunk = "") {
      body += chunk ? String(chunk) : "";
      this.headersSent = true;
      this.writableEnded = true;
      return this;
    },
    destroy(error) { throw error; },
    json() { return body ? JSON.parse(body) : null; },
  };
}

test("the authenticated wardrobe merge endpoint keeps both source-photo histories", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wardrobe-merge-api-"));
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
    await writeFile(path.join(dataDir, "library.json"), JSON.stringify([
      {
        id: "import-first",
        userId: "default",
        name: "First shirt",
        part: "upperbody",
        color: "#e7e1d7",
        image: "/api/import/library/first-garment.png",
        sourcePhotos: [{
          id: "first-source",
          image: "/api/import/library/first-source.png",
          importJobId: "first-job",
        }],
      },
      {
        id: "import-second",
        userId: "default",
        name: "Second shirt",
        part: "upperbody",
        color: "#ded8cf",
        image: "/api/import/library/second-garment.png",
        sourcePhotos: [{
          id: "second-source",
          image: "/api/import/library/second-source.png",
          importJobId: "second-job",
        }],
      },
      {
        id: "import-someone-elses",
        userId: "someone-else",
        name: "Private coat",
        part: "wholebody_up",
        color: "#202020",
        image: "/api/import/library/private-coat.png",
      },
    ], null, 2));

    const request = mockRequest("/api/import/wardrobe/merge", {
      keepId: "import-second",
      discardId: "import-first",
    });
    const response = mockResponse();
    await api.handler(request, response, () => {});

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().item.id, "import-second");
    assert.equal(response.json().removedId, "import-first");
    assert.equal(response.json().item.sourcePhotos.length, 2);

    const stored = JSON.parse(await readFile(path.join(dataDir, "library.json"), "utf8"));
    assert.deepEqual(stored.map((item) => item.id), ["import-second", "import-someone-elses"]);
    assert.deepEqual(
      sourcePhotosForRecord(stored[0]).map((photo) => photo.importJobId),
      ["second-job", "first-job"],
    );

    const forbiddenRequest = mockRequest("/api/import/wardrobe/merge", {
      keepId: "import-second",
      discardId: "import-someone-elses",
    });
    const forbiddenResponse = mockResponse();
    await api.handler(forbiddenRequest, forbiddenResponse, () => {});

    assert.equal(forbiddenResponse.statusCode, 404);
    assert.equal(forbiddenResponse.json().code, "wardrobe_item_not_found");
    const afterForbidden = JSON.parse(await readFile(path.join(dataDir, "library.json"), "utf8"));
    assert.deepEqual(afterForbidden.map((item) => item.id), ["import-second", "import-someone-elses"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
