import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { createSessionToken, wardrobeImportApi } from "../scripts/import-job-api.mjs";
import {
  isOpenRouterKeyMissing,
  isValidOpenRouterKey,
  notifyOpenRouterKeyRequired,
  OPENROUTER_KEY_REQUIRED_EVENT,
} from "../src/openrouter-key.js";

const SESSION_SECRET = "openrouter-key-recovery-test-secret";

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

test("recognizes a missing OpenRouter key and requests the recovery dialog", () => {
  assert.equal(isOpenRouterKeyMissing({ code: "openrouter_key_missing" }), true);
  assert.equal(isOpenRouterKeyMissing("No OpenRouter key is available. Add your own key."), true);
  assert.equal(isOpenRouterKeyMissing({ code: "openrouter_payment_required" }), false);
  assert.equal(isValidOpenRouterKey(" sk-or-v1-abcdefghij "), true);
  assert.equal(isValidOpenRouterKey("not-a-key"), false);

  const target = new EventTarget();
  let requests = 0;
  target.addEventListener(OPENROUTER_KEY_REQUIRED_EVENT, () => { requests += 1; });
  assert.equal(notifyOpenRouterKeyRequired({ code: "openrouter_key_missing" }, target), true);
  assert.equal(notifyOpenRouterKeyRequired({ code: "openrouter_payment_required" }, target), false);
  assert.equal(requests, 1);
});

test("the key shortcut saves only to the signed-in payer and never returns the secret", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wardrobe-openrouter-key-"));
  const dataDir = path.join(root, "data");
  const usersFile = path.join(dataDir, "users.json");
  const targetId = "11111111-1111-4111-8111-111111111111";
  const api = wardrobeImportApi({
    env: {
      WARDROBE_DATA_DIR: dataDir,
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
      WARDROBE_SESSION_SECRET: SESSION_SECRET,
      WARDROBE_OWNER_EMAILS: "owner@example.com",
    },
  });

  try {
    await api.initialize(root);
    const store = JSON.parse(await readFile(usersFile, "utf8"));
    const owner = {
      ...store.users[0],
      email: "owner@example.com",
      openRouterApiKey: "",
    };
    store.users = [owner, {
      ...owner,
      id: targetId,
      name: "Another wardrobe",
      email: "guest@example.com",
      openRouterApiKey: "",
    }];
    await writeFile(usersFile, JSON.stringify(store, null, 2));

    const secret = "sk-or-v1-recoveryKey123456789";
    const response = mockResponse();
    await api.handler(mockRequest(`/api/users/openrouter-key?user=${targetId}`, {
      openRouterApiKey: secret,
    }), response, () => {});

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().user.id, "default");
    assert.equal(response.json().user.hasOpenRouterKey, true);
    assert.match(response.json().user.openRouterKeyHint, /^sk-or-v1-/);
    assert.equal(JSON.stringify(response.json()).includes(secret), false);

    const saved = JSON.parse(await readFile(usersFile, "utf8"));
    assert.equal(saved.users.find((user) => user.id === "default").openRouterApiKey, secret);
    assert.equal(saved.users.find((user) => user.id === targetId).openRouterApiKey, "");

    const invalidResponse = mockResponse();
    await api.handler(mockRequest("/api/users/openrouter-key", {
      openRouterApiKey: "not-a-key",
    }), invalidResponse, () => {});
    assert.equal(invalidResponse.statusCode, 400);
    assert.equal(invalidResponse.json().code, "invalid_openrouter_key");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
