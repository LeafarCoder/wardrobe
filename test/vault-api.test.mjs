import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { createSessionToken, wardrobeImportApi } from "../scripts/import-job-api.mjs";

const SESSION_SECRET = "vault-api-test-session-secret";
const ITEM_ID = "import-00000000-0000-4000-8000-000000000071";

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

async function request(api, url, method, input) {
  const response = mockResponse();
  await api.handler(mockRequest(url, method, input), response, () => {});
  return response;
}

test("Vault API hides garments and generated photos until the password is verified", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wardrobe-vault-api-"));
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
      name: "Private dress",
      part: "wholebody",
      color: "#202020",
      image: "/api/import/library/private-dress.png",
      modeledLooks: [{ id: "private-look", image: "/api/import/library/private-look.png" }],
    }], null, 2));

    const password = await request(api, "/api/users/default", "PATCH", {
      name: "My wardrobe",
      vaultPassword: "private wardrobe",
    });
    assert.equal(password.statusCode, 200);
    assert.equal(password.json().user.hasVaultPassword, true);
    assert.equal(Object.hasOwn(password.json().user, "vaultPasswordHash"), false);

    const hiddenPhoto = await request(api, `/api/import/wardrobe/${ITEM_ID}/modeled/private-look`, "PATCH", { vaulted: true });
    assert.equal(hiddenPhoto.statusCode, 200);
    assert.deepEqual(hiddenPhoto.json().modeledLooks, []);

    const wrongPassword = await request(api, "/api/users/default/vault", "POST", { password: "not the password" });
    assert.equal(wrongPassword.statusCode, 403);
    assert.equal(wrongPassword.json().code, "invalid_vault_password");

    const unlockedPhoto = await request(api, "/api/users/default/vault", "POST", { password: "private wardrobe" });
    assert.deepEqual(unlockedPhoto.json().entries.map((entry) => entry.kind), ["garment-look"]);
    assert.equal(unlockedPhoto.json().items.length, 1);
    assert.equal(unlockedPhoto.json().items[0].id, ITEM_ID);
    assert.equal(unlockedPhoto.json().items[0].modeledLooks[0].id, "private-look");

    const hiddenGarment = await request(api, `/api/import/wardrobe/${ITEM_ID}/vault`, "PATCH", { vaulted: true });
    assert.equal(hiddenGarment.statusCode, 200);
    const wardrobe = await request(api, "/api/import/wardrobe", "GET");
    assert.deepEqual(wardrobe.json(), []);

    const unlockedGarment = await request(api, "/api/users/default/vault", "POST", { password: "private wardrobe" });
    assert.deepEqual(new Set(unlockedGarment.json().entries.map((entry) => entry.kind)), new Set(["garment", "garment-look"]));
    assert.equal(unlockedGarment.json().items.length, 1);
    assert.equal(unlockedGarment.json().items[0].vaultedAt, hiddenGarment.json().item.vaultedAt);

    const restored = await request(api, `/api/import/wardrobe/${ITEM_ID}/vault`, "PATCH", { vaulted: false });
    assert.equal(restored.statusCode, 200);
    const visibleAgain = await request(api, "/api/import/wardrobe", "GET");
    assert.equal(visibleAgain.json().length, 1);
    assert.deepEqual(visibleAgain.json()[0].modeledLooks, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
