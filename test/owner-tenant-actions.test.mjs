import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import {
  createSessionToken,
  preparedAccountForEmail,
  validAccountEmail,
  wardrobeImportApi,
} from "../scripts/import-job-api.mjs";
import { withWardrobeUser } from "../src/user-scope.js";

const SESSION_SECRET = "owner-tenant-actions-test-secret";
const TARGET_ID = "11111111-1111-4111-8111-111111111111";

function mockRequest(url, input, sessionUserId = "default", method = "PATCH") {
  const request = Readable.from([Buffer.from(JSON.stringify(input))]);
  request.url = url;
  request.method = method;
  request.headers = {
    "content-type": "application/json",
    cookie: `wardrobe_session=${createSessionToken(SESSION_SECRET, sessionUserId)}`,
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

function mockGetRequest(url, cookie = "") {
  const request = Readable.from([]);
  request.url = url;
  request.method = "GET";
  request.headers = { host: "localhost", cookie };
  request.socket = { remoteAddress: "127.0.0.1" };
  return request;
}

test("adds the selected wardrobe context without disturbing existing query parameters", () => {
  assert.equal(
    withWardrobeUser(`/api/users/${TARGET_ID}`, TARGET_ID),
    `/api/users/${TARGET_ID}?user=${TARGET_ID}`,
  );
  assert.equal(
    withWardrobeUser(`/api/users/${TARGET_ID}/ai-usage?offset=20`, TARGET_ID),
    `/api/users/${TARGET_ID}/ai-usage?offset=20&user=${TARGET_ID}`,
  );
  assert.equal(withWardrobeUser("/api/export", ""), "/api/export");
});

test("prepared Google account matching is exact, normalized, and email-shaped", () => {
  const users = [{
    id: TARGET_ID,
    email: "Partner@Example.com",
    accountPreparedAt: "2026-07-28T18:00:00.000Z",
  }];
  assert.equal(validAccountEmail(" partner@example.com "), true);
  assert.equal(validAccountEmail("not-an-email"), false);
  assert.equal(preparedAccountForEmail(users, "partner@example.com")?.id, TARGET_ID);
  assert.equal(preparedAccountForEmail(users, "somebody@example.com"), null);
  assert.equal(preparedAccountForEmail([{ ...users[0], accountPreparedAt: null }], "partner@example.com"), null);
});

test("an owner can prepare a wardrobe for an exact Google email before first sign-in", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wardrobe-prepared-account-"));
  const dataDir = path.join(root, "data");
  const usersFile = path.join(dataDir, "users.json");
  const api = wardrobeImportApi({
    env: {
      WARDROBE_DATA_DIR: dataDir,
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
      WARDROBE_SESSION_SECRET: SESSION_SECRET,
      WARDROBE_OWNER_EMAILS: "owner@example.com",
    },
    fetch: async (url) => {
      if (String(url).includes("/token")) {
        return new Response(JSON.stringify({ access_token: "test-access-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        sub: "partner-google-subject",
        email: "PARTNER@example.com",
        email_verified: true,
        name: "Partner",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  try {
    await api.initialize(root);
    const initial = JSON.parse(await readFile(usersFile, "utf8"));
    initial.users[0].email = "owner@example.com";
    await writeFile(usersFile, JSON.stringify(initial, null, 2));

    const response = mockResponse();
    await api.handler(mockRequest("/api/users", {
      name: "Partner",
      accountEmail: " Partner@Example.com ",
      language: "pt-PT",
    }, "default", "POST"), response, () => {});

    assert.equal(response.statusCode, 201);
    const payload = response.json();
    assert.equal(payload.user.email, "partner@example.com");
    assert.equal(payload.user.accountStatus, "prepared");
    assert.equal(payload.user.googleSubject, undefined);
    assert.equal(payload.user.preparedByUserId, undefined);
    assert.equal(payload.currentUserId, payload.user.id);

    const saved = JSON.parse(await readFile(usersFile, "utf8"));
    const prepared = saved.users.find((user) => user.id === payload.user.id);
    assert.equal(prepared.email, "partner@example.com");
    assert.equal(prepared.googleSubject, null);
    assert.equal(prepared.preparedByUserId, "default");
    assert.ok(prepared.accountPreparedAt);

    const duplicateResponse = mockResponse();
    await api.handler(mockRequest("/api/users", {
      name: "Duplicate",
      accountEmail: "PARTNER@example.com",
    }, "default", "POST"), duplicateResponse, () => {});
    assert.equal(duplicateResponse.statusCode, 409);
    assert.equal(duplicateResponse.json().code, "account_email_in_use");

    const startResponse = mockResponse();
    await api.handler(mockGetRequest("/api/auth/google/start"), startResponse, () => {});
    assert.equal(startResponse.statusCode, 302);
    const authorizationUrl = new URL(startResponse.getHeader("location"));
    const oauthCookie = String(startResponse.getHeader("set-cookie")).split(";")[0];
    const callbackResponse = mockResponse();
    await api.handler(mockGetRequest(
      `/api/auth/google/callback?code=test-code&state=${encodeURIComponent(authorizationUrl.searchParams.get("state"))}`,
      oauthCookie,
    ), callbackResponse, () => {});
    assert.equal(callbackResponse.statusCode, 302);
    assert.equal(callbackResponse.getHeader("location"), "/?signin=ok");

    const ordinaryStore = JSON.parse(await readFile(usersFile, "utf8"));
    const claimed = ordinaryStore.users.find((user) => user.id === payload.user.id);
    assert.equal(claimed.googleSubject, "partner-google-subject");
    assert.ok(claimed.accountClaimedAt);
    const forbiddenResponse = mockResponse();
    await api.handler(mockRequest("/api/users", {
      name: "Not allowed",
      accountEmail: "other@example.com",
    }, payload.user.id, "POST"), forbiddenResponse, () => {});
    assert.equal(forbiddenResponse.statusCode, 403);
    assert.equal(forbiddenResponse.json().code, "profile_creation_disabled");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an owner can edit the selected tenant while non-owners remain isolated", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wardrobe-owner-actions-"));
  const dataDir = path.join(root, "data");
  const usersFile = path.join(dataDir, "users.json");
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
    const owner = { ...store.users[0], email: "owner@example.com" };
    store.users = [owner, {
      ...owner,
      id: TARGET_ID,
      name: "Tenant wardrobe",
      email: "tenant@example.com",
      wardrobeSortMode: "custom",
      wardrobeGroupMode: "none",
      referenceImages: [{
        id: "tenant-reference",
        name: "Tenant reference",
        fileName: "tenant-reference.jpg",
        avatarFileName: "tenant-reference-avatar.webp",
      }],
    }];
    await writeFile(usersFile, JSON.stringify(store, null, 2));

    const scopedPath = withWardrobeUser(`/api/users/${TARGET_ID}`, TARGET_ID);
    const ownerResponse = mockResponse();
    await api.handler(mockRequest(scopedPath, {
      wardrobeSortMode: "custom",
      wardrobeGroupMode: "color",
    }), ownerResponse, () => {});

    assert.equal(ownerResponse.statusCode, 200);
    assert.equal(ownerResponse.json().user.id, TARGET_ID);
    assert.equal(ownerResponse.json().user.wardrobeGroupMode, "color");
    assert.equal(ownerResponse.json().user.referenceImages[0].url.endsWith(`?user=${TARGET_ID}`), true);
    assert.equal(ownerResponse.json().user.referenceImages[0].avatarUrl.endsWith(`?user=${TARGET_ID}`), true);
    const saved = JSON.parse(await readFile(usersFile, "utf8"));
    assert.equal(saved.users.find((user) => user.id === TARGET_ID).wardrobeGroupMode, "color");
    assert.equal(saved.users.find((user) => user.id === "default").wardrobeGroupMode, "none");

    const missingScopeResponse = mockResponse();
    await api.handler(mockRequest(`/api/users/${TARGET_ID}`, {
      wardrobeGroupMode: "brand",
    }), missingScopeResponse, () => {});
    assert.equal(missingScopeResponse.statusCode, 403);
    assert.equal(missingScopeResponse.json().code, "forbidden_profile");

    const tenantResponse = mockResponse();
    await api.handler(mockRequest(
      withWardrobeUser("/api/users/default", "default"),
      { wardrobeGroupMode: "brand" },
      TARGET_ID,
    ), tenantResponse, () => {});
    assert.equal(tenantResponse.statusCode, 403);
    assert.equal(tenantResponse.json().code, "forbidden_profile");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
