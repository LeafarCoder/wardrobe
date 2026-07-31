import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { createSessionToken, wardrobeImportApi } from "../scripts/import-job-api.mjs";

const SESSION_SECRET = "planner-variant-test-session-secret";
const ITEM_ID = "import-11111111-1111-4111-8111-111111111111";

function mockRequest(url, input) {
  const request = Readable.from([Buffer.from(JSON.stringify(input))]);
  request.url = url;
  request.method = "PATCH";
  request.headers = {
    "content-type": "application/json",
    cookie: `wardrobe_session=${createSessionToken(SESSION_SECRET, "default")}`,
  };
  request.socket = { remoteAddress: "127.0.0.1" };
  return request;
}

function mockResponse() {
  let output = "";
  return {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    setHeader() {},
    end(chunk = "") {
      output += chunk ? String(chunk) : "";
      this.headersSent = true;
      this.writableEnded = true;
      return this;
    },
    destroy(error) { throw error; },
    json() { return output ? JSON.parse(output) : null; },
  };
}

test("saves a trip-specific garment version for later modeled looks", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wardrobe-planner-variant-"));
  const dataDir = path.join(root, "data");
  const api = wardrobeImportApi({
    env: {
      WARDROBE_DATA_DIR: dataDir,
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "test-secret",
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
      color: "#e7ddca",
      image: "/api/import/library/shirt.png",
      colorVariants: [{
        id: "navy-version",
        image: "/api/import/library/shirt-navy.png",
        primaryColor: "#24364f",
      }],
    }], null, 2));
    const usersPath = path.join(dataDir, "users.json");
    const users = JSON.parse(await readFile(usersPath, "utf8"));
    users.users[0].wardrobePlans = [{
      id: "trip-test",
      input: { kind: "trip", location: "Rome" },
      result: {
        recommendedItems: [{ itemId: ITEM_ID, reason: "Breathable" }],
        outfitIdeas: [{ name: "Museum", itemIds: [ITEM_ID], note: "Walkable" }],
      },
    }];
    await writeFile(usersPath, JSON.stringify(users, null, 2));

    const response = mockResponse();
    await api.handler(mockRequest("/api/import/planner/trip-test/variants", {
      itemId: ITEM_ID,
      variantId: "navy-version",
    }), response, () => {});

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().plan.result.garmentVariants[ITEM_ID], "navy-version");
    const savedUsers = JSON.parse(await readFile(usersPath, "utf8"));
    assert.equal(savedUsers.users[0].wardrobePlans[0].result.garmentVariants[ITEM_ID], "navy-version");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
