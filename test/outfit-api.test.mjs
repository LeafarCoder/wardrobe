import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { createSessionToken, wardrobeImportApi } from "../scripts/import-job-api.mjs";

const SESSION_SECRET = "outfit-api-test-session-secret";

function mockRequest(url, method, input = null) {
  const request = Readable.from(input == null ? [] : [Buffer.from(JSON.stringify(input))]);
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
  let output = "";
  return {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    getHeader(name) { return headers.get(name.toLowerCase()); },
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

async function request(api, url, method, input) {
  const response = mockResponse();
  await api.handler(mockRequest(url, method, input), response, () => {});
  return response;
}

test("saved outfit CRUD validates garments and persists context, variants, and presentation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wardrobe-outfit-api-"));
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
        id: "import-11111111-1111-4111-8111-111111111111",
        userId: "default",
        name: "White shirt",
        part: "upperbody",
        color: "#f5f2ea",
        image: "/api/import/library/shirt.png",
        colorVariants: [{
          id: "blue-version",
          image: "/api/import/library/shirt-blue.png",
          primaryColor: "#293b6a",
        }],
      },
      {
        id: "import-22222222-2222-4222-8222-222222222222",
        userId: "default",
        name: "Black trousers",
        part: "lowerbody",
        color: "#202020",
        image: "/api/import/library/trousers.png",
      },
      {
        id: "import-33333333-3333-4333-8333-333333333333",
        userId: "someone-else",
        name: "Private coat",
        part: "wholebody_up",
        color: "#202020",
        image: "/api/import/library/private.png",
      },
    ], null, 2));

    const care = await request(api, "/api/import/wardrobe/import-11111111-1111-4111-8111-111111111111", "PATCH", {
      careInstructions: { washing: "machine-30", ironing: "low", bleaching: "invalid" },
    });
    assert.equal(care.statusCode, 200);
    assert.equal(care.json().careInstructions.washing, "machine-30");
    assert.equal(care.json().careInstructions.ironing, "low");
    assert.equal(care.json().careInstructions.bleaching, null);

    const created = await request(api, "/api/import/outfits", "POST", {
      name: "Dinner layers",
      garments: [
        { itemId: "import-11111111-1111-4111-8111-111111111111", variantId: "blue-version" },
        { itemId: "import-22222222-2222-4222-8222-222222222222" },
      ],
      context: { occasion: "dinner", weather: ["mild"], season: "summer" },
      presentation: {
        background: "restaurant",
        style: "candid",
        pose: "sitting",
        direction: "Warm evening light",
        people: [{ personId: "default", pose: "sitting", hairstyle: "ponytail", direction: "Look left." }],
      },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().outfit.name, "Dinner layers");
    assert.equal(created.json().outfit.garments[0].variantId, "blue-version");
    assert.deepEqual(created.json().outfit.context.weather, ["mild"]);
    assert.deepEqual(created.json().outfit.presentation.people, [{
      personId: "default",
      pose: "sitting",
      hairstyle: "ponytail",
      direction: "Look left.",
    }]);
    const outfitId = created.json().outfit.id;

    const second = await request(api, "/api/import/outfits", "POST", {
      name: "Simple shirt",
      garments: [{ itemId: "import-11111111-1111-4111-8111-111111111111" }],
    });
    assert.equal(second.statusCode, 201);
    const secondId = second.json().outfit.id;

    const reordered = await request(api, "/api/import/outfits/order", "PATCH", { ids: [outfitId, secondId] });
    assert.equal(reordered.statusCode, 200);
    assert.deepEqual(reordered.json().user.wardrobeOutfits.map((outfit) => outfit.id), [outfitId, secondId]);

    const updated = await request(api, `/api/import/outfits/${outfitId}`, "PATCH", {
      name: "Summer dinner",
      garments: [{ itemId: "import-11111111-1111-4111-8111-111111111111" }],
      presentation: {
        background: "city-street",
        style: "editorial",
        people: [{ personId: "default", pose: "walking", hairstyle: "short", direction: "Mid-step." }],
      },
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().outfit.name, "Summer dinner");
    assert.equal(updated.json().outfit.garments.length, 1);
    assert.equal(updated.json().outfit.presentation.people[0].hairstyle, "short");

    const forbidden = await request(api, "/api/import/outfits", "POST", {
      name: "Not mine",
      garments: [{ itemId: "import-33333333-3333-4333-8333-333333333333" }],
    });
    assert.equal(forbidden.statusCode, 409);
    assert.equal(forbidden.json().code, "outfit_garment_missing");

    const deleted = await request(api, `/api/import/outfits/${outfitId}`, "DELETE");
    assert.equal(deleted.statusCode, 200);
    assert.equal(deleted.json().deleted, true);
    const deletedSecond = await request(api, `/api/import/outfits/${secondId}`, "DELETE");
    assert.equal(deletedSecond.statusCode, 200);
    const users = JSON.parse(await readFile(path.join(dataDir, "users.json"), "utf8"));
    assert.deepEqual(users.users.find((user) => user.id === "default").wardrobeOutfits, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
