import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import sharp from "sharp";
import { createSessionToken, wardrobeImportApi } from "../scripts/import-job-api.mjs";

const SESSION_SECRET = "profile-backgrounds-test-session-secret";

function request(url, method, input = null) {
  const req = Readable.from(input === null ? [] : [Buffer.from(JSON.stringify(input))]);
  req.url = url;
  req.method = method;
  req.headers = {
    host: "localhost",
    ...(input === null ? {} : { "content-type": "application/json" }),
    cookie: `wardrobe_session=${createSessionToken(SESSION_SECRET, "default")}`,
  };
  req.socket = { remoteAddress: "127.0.0.1" };
  return req;
}

function response() {
  const headers = new Map();
  let body = Buffer.alloc(0);
  return {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    getHeader(name) { return headers.get(name.toLowerCase()); },
    end(chunk = "") {
      const addition = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      body = Buffer.concat([body, addition]);
      this.headersSent = true;
      this.writableEnded = true;
      return this;
    },
    destroy(error) { throw error; },
    json() { return body.length ? JSON.parse(body.toString("utf8")) : null; },
    bytes() { return body; },
  };
}

test("stores, serves, lists, and removes private modeled-look background references", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wardrobe-profile-backgrounds-"));
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
    const image = await sharp({
      create: { width: 320, height: 180, channels: 3, background: "#927c61" },
    }).png().toBuffer();

    const addResponse = response();
    await api.handler(request("/api/users/default", "PATCH", {
      backgroundReferenceImageIds: [],
      backgroundReferenceImages: [{
        name: "Back garden",
        dataUrl: `data:image/png;base64,${image.toString("base64")}`,
      }],
    }), addResponse, () => {});

    assert.equal(addResponse.statusCode, 200);
    const [background] = addResponse.json().user.backgroundReferences;
    assert.equal(background.name, "Back garden");
    assert.match(background.url, /\/api\/users\/default\/backgrounds\//);
    assert.match(background.previewUrl, /\/api\/users\/default\/backgrounds\//);

    const getResponse = response();
    await api.handler(request(new URL(background.url, "http://localhost").pathname, "GET"), getResponse, () => {});
    assert.equal(getResponse.statusCode, 200);
    assert.equal(getResponse.getHeader("content-type"), "image/jpeg");
    assert.ok(getResponse.bytes().length > 0);

    const removeResponse = response();
    await api.handler(request("/api/users/default", "PATCH", {
      backgroundReferenceImageIds: [],
      backgroundReferenceImages: [],
    }), removeResponse, () => {});
    assert.deepEqual(removeResponse.json().user.backgroundReferences, []);

    const stored = JSON.parse(await readFile(path.join(dataDir, "users.json"), "utf8"));
    assert.deepEqual(stored.users[0].backgroundReferences, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
