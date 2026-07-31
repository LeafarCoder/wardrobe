import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { createSessionToken, wardrobeImportApi } from "../scripts/import-job-api.mjs";

const SESSION_SECRET = "account-connections-test-secret";
const PARTNER_ID = "11111111-1111-4111-8111-111111111111";
const REQUESTER_ID = "22222222-2222-4222-8222-222222222222";

function mockRequest(url, method, input, userId = "default") {
  const request = Readable.from(input === undefined ? [] : [Buffer.from(JSON.stringify(input))]);
  request.url = url;
  request.method = method;
  request.headers = {
    host: "localhost",
    "content-type": "application/json",
    cookie: `wardrobe_session=${createSessionToken(SESSION_SECRET, userId)}`,
  };
  request.socket = { remoteAddress: "127.0.0.1" };
  return request;
}

function mockResponse() {
  const headers = new Map();
  let responseBody = Buffer.alloc(0);
  return {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    getHeader(name) { return headers.get(name.toLowerCase()); },
    end(chunk = "") {
      const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      responseBody = Buffer.concat([responseBody, next]);
      this.headersSent = true;
      this.writableEnded = true;
      return this;
    },
    destroy(error) { throw error; },
    json() { return responseBody.length ? JSON.parse(responseBody.toString("utf8")) : null; },
    bytes() { return responseBody; },
  };
}

async function request(api, url, method = "GET", input, userId = "default") {
  const response = mockResponse();
  await api.handler(mockRequest(url, method, input, userId), response, () => {});
  return response;
}

test("in-app invitations require consent and enforce each shared permission", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wardrobe-connections-"));
  const dataDir = path.join(root, "data");
  const usersFile = path.join(dataDir, "users.json");
  const libraryFile = path.join(dataDir, "library.json");
  const importedDir = path.join(dataDir, "imported");
  const api = wardrobeImportApi({ env: {
    WARDROBE_DATA_DIR: dataDir,
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-secret",
    WARDROBE_SESSION_SECRET: SESSION_SECRET,
  } });

  try {
    await api.initialize(root);
    const store = JSON.parse(await readFile(usersFile, "utf8"));
    const owner = { ...store.users[0], name: "Requester", email: "requester@example.com", googleSubject: "requester-subject" };
    store.users = [owner, {
      ...owner,
      id: PARTNER_ID,
      name: "Partner",
      email: "partner@example.com",
      googleSubject: "partner-subject",
      wardrobeOutfits: [],
      referenceImages: [],
    }];
    await writeFile(usersFile, JSON.stringify(store, null, 2));
    await mkdir(importedDir, { recursive: true });
    await writeFile(path.join(importedDir, "partner-shirt.png"), Buffer.from("shared-garment"));
    await writeFile(libraryFile, JSON.stringify([{
      id: "partner-shirt",
      userId: PARTNER_ID,
      name: "Partner shirt",
      part: "upperbody",
      color: "#ede8dd",
      image: "/api/import/library/partner-shirt.png",
      thumbnail: "/api/import/library/partner-shirt.png",
    }], null, 2));

    const invited = await request(api, "/api/users/connections/invitations", "POST", {
      email: "PARTNER@example.com",
      relationship: "Girlfriend",
      permissions: { referenceImages: true, garments: true },
    });
    assert.equal(invited.statusCode, 201);
    const inviteId = invited.json().invite.id;

    const inbox = await request(api, "/api/users/connections", "GET", undefined, PARTNER_ID);
    assert.equal(inbox.statusCode, 200);
    assert.equal(inbox.json().notificationCount, 1);
    assert.equal(inbox.json().incomingInvites[0].requester.name, "Requester");
    assert.equal(inbox.json().incomingInvites[0].recipientEmail, undefined);

    const accepted = await request(api, `/api/users/connections/invitations/${inviteId}/respond`, "POST", {
      decision: "accept",
      permissions: { referenceImages: true, garments: false },
    }, PARTNER_ID);
    assert.equal(accepted.statusCode, 200);
    const connectionId = accepted.json().connection.id;

    const referenceOnly = await request(api, "/api/users/connections?include=outfit");
    assert.equal(referenceOnly.json().companions.length, 1);
    assert.equal(referenceOnly.json().companions[0].garments.length, 0);
    const blockedAsset = await request(api, "/api/import/library/partner-shirt.png");
    assert.equal(blockedAsset.statusCode, 404);

    const expanded = await request(api, `/api/users/connections/${connectionId}`, "PATCH", {
      permissions: { referenceImages: true, garments: true },
    }, PARTNER_ID);
    assert.equal(expanded.statusCode, 200);
    const outfitData = await request(api, "/api/users/connections?include=outfit");
    assert.equal(outfitData.json().companions[0].garments[0].name, "Partner shirt");
    assert.equal(outfitData.json().companions[0].garments[0].originalImage, undefined);
    const allowedAsset = await request(api, "/api/import/library/partner-shirt.png");
    assert.equal(allowedAsset.statusCode, 200);
    assert.equal(allowedAsset.bytes().toString(), "shared-garment");

    const outfit = await request(api, "/api/import/outfits", "POST", {
      name: "A walk together",
      companions: [PARTNER_ID],
      garments: [{ itemId: "partner-shirt", ownerId: PARTNER_ID, wearerId: PARTNER_ID }],
      presentation: { background: "park", pose: "walking" },
    });
    assert.equal(outfit.statusCode, 201);
    assert.deepEqual(outfit.json().outfit.companions, [PARTNER_ID]);
    assert.equal(outfit.json().outfit.garments[0].wearerId, PARTNER_ID);

    const withLook = JSON.parse(await readFile(usersFile, "utf8"));
    const requester = withLook.users.find((profile) => profile.id === "default");
    requester.wardrobeOutfits[0].modeledLooks = [{
      id: "shared-look",
      image: "/api/import/library/shared-look.png",
      generatedAt: new Date().toISOString(),
    }];
    await writeFile(path.join(importedDir, "shared-look.png"), Buffer.from("derived-image"));
    await writeFile(usersFile, JSON.stringify(withLook, null, 2));

    const disconnected = await request(api, `/api/users/connections/${connectionId}`, "DELETE", undefined, PARTNER_ID);
    assert.equal(disconnected.statusCode, 200);
    const revoked = JSON.parse(await readFile(usersFile, "utf8"));
    assert.equal(revoked.connections.length, 0);
    assert.deepEqual(revoked.users.find((profile) => profile.id === "default").wardrobeOutfits[0].modeledLooks, []);
    await assert.rejects(stat(path.join(importedDir, "shared-look.png")), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an owner manages the selected tenant's connections without exposing them to other accounts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wardrobe-owner-connections-"));
  const dataDir = path.join(root, "data");
  const usersFile = path.join(dataDir, "users.json");
  const libraryFile = path.join(dataDir, "library.json");
  const importedDir = path.join(dataDir, "imported");
  const api = wardrobeImportApi({ env: {
    WARDROBE_DATA_DIR: dataDir,
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-secret",
    WARDROBE_SESSION_SECRET: SESSION_SECRET,
    WARDROBE_OWNER_EMAILS: "owner@example.com",
  } });

  try {
    await api.initialize(root);
    const store = JSON.parse(await readFile(usersFile, "utf8"));
    const owner = { ...store.users[0], name: "Owner", email: "owner@example.com", googleSubject: "owner-subject" };
    const tenant = {
      ...owner,
      id: PARTNER_ID,
      name: "Tenant",
      email: "tenant@example.com",
      googleSubject: "tenant-subject",
      wardrobeOutfits: [],
      referenceImages: [],
    };
    const requester = {
      ...owner,
      id: REQUESTER_ID,
      name: "Requester",
      email: "requester@example.com",
      googleSubject: "requester-subject",
      wardrobeOutfits: [],
      referenceImages: [{ id: "requester-reference", fileName: "requester.jpg" }],
    };
    const inviteId = "33333333-3333-4333-8333-333333333333";
    store.users = [owner, tenant, requester];
    store.connectionInvites = [{
      id: inviteId,
      requesterUserId: REQUESTER_ID,
      recipientUserId: PARTNER_ID,
      recipientEmail: tenant.email,
      relationship: "Friend",
      requestedPermissions: { referenceImages: true, garments: true },
      status: "pending",
      createdAt: new Date().toISOString(),
      respondedAt: null,
    }];
    store.connections = [];
    await writeFile(usersFile, JSON.stringify(store, null, 2));

    const selectedInbox = await request(api, `/api/users/connections?user=${PARTNER_ID}`);
    assert.equal(selectedInbox.statusCode, 200);
    assert.equal(selectedInbox.json().notificationCount, 1);
    assert.equal(selectedInbox.json().incomingInvites[0].requester.name, "Requester");
    assert.match(selectedInbox.json().incomingInvites[0].requester.referenceImages[0].avatarUrl, new RegExp(`user=${PARTNER_ID}`));

    const ownerInbox = await request(api, "/api/users/connections");
    assert.equal(ownerInbox.json().notificationCount, 0);

    const accepted = await request(api, `/api/users/connections/invitations/${inviteId}/respond?user=${PARTNER_ID}`, "POST", {
      decision: "accept",
      permissions: { referenceImages: true, garments: false },
    });
    assert.equal(accepted.statusCode, 200);
    assert.equal(accepted.json().connection.grantorUserId, PARTNER_ID);
    assert.equal(accepted.json().connection.recipientUserId, REQUESTER_ID);

    const tenantInvite = await request(api, `/api/users/connections/invitations?user=${PARTNER_ID}`, "POST", {
      email: "owner@example.com",
      relationship: "Partner",
      permissions: { referenceImages: true, garments: true },
    });
    assert.equal(tenantInvite.statusCode, 201);
    const saved = JSON.parse(await readFile(usersFile, "utf8"));
    const createdInvite = saved.connectionInvites.find((invite) => invite.id === tenantInvite.json().invite.id);
    assert.equal(createdInvite.requesterUserId, PARTNER_ID);
    assert.equal(createdInvite.recipientUserId, "default");

    const reciprocal = await request(api, `/api/users/connections/invitations/${createdInvite.id}/respond`, "POST", {
      decision: "accept",
      permissions: { referenceImages: true, garments: true },
    });
    assert.equal(reciprocal.statusCode, 200);
    assert.equal(reciprocal.json().connection.grantorUserId, "default");
    assert.equal(reciprocal.json().connection.recipientUserId, PARTNER_ID);

    await mkdir(importedDir, { recursive: true });
    await writeFile(path.join(importedDir, "owner-shirt.png"), Buffer.from("owner-shared-garment"));
    await writeFile(libraryFile, JSON.stringify([{
      id: "owner-shirt",
      userId: "default",
      name: "Owner shirt",
      part: "upperbody",
      color: "#ede8dd",
      image: "/api/import/library/owner-shirt.png",
      thumbnail: "/api/import/library/owner-shirt.png",
    }], null, 2));
    const selectedTenantAsset = await request(
      api,
      `/api/import/library/owner-shirt.png?user=${PARTNER_ID}`,
    );
    assert.equal(selectedTenantAsset.statusCode, 200);
    assert.equal(selectedTenantAsset.bytes().toString(), "owner-shared-garment");

    const forbidden = await request(api, `/api/users/connections?user=${PARTNER_ID}`, "GET", undefined, REQUESTER_ID);
    assert.equal(forbidden.statusCode, 403);
    assert.equal(forbidden.json().code, "forbidden_profile");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
