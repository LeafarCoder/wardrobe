import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MediaIndex } from "../scripts/media-index.mjs";
import { FilesystemObjectStorage } from "../scripts/object-storage.mjs";
import { migrateMedia } from "../scripts/media-migration.mjs";
import { createSessionToken, wardrobeImportApi } from "../scripts/import-job-api.mjs";
import { Readable } from "node:stream";

test("media migration is resumable, verifies downloaded bytes, and preserves source metadata", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "wardrobe-media-test-"));
  const root = path.join(directory, "data");
  try {
    await mkdir(path.join(root, "profiles", "person", "references"), { recursive: true });
    await mkdir(path.join(root, "imported"), { recursive: true });
    const source = Buffer.from("test photo bytes");
    const profile = path.join(root, "profiles", "person", "references", "photo.png");
    await writeFile(profile, source);
    await writeFile(path.join(root, "users.json"), JSON.stringify({ users: [{ id: "person", referenceImages: [{ fileName: "photo.png" }] }] }));
    const metadata = await readFile(path.join(root, "users.json"), "utf8");
    const storage = new FilesystemObjectStorage(path.join(directory, "bucket"));
    assert.equal((await migrateMedia({ root, storage })).uploaded, 1);
    assert.equal((await migrateMedia({ root, storage })).uploaded, 0);
    assert.equal((await migrateMedia({ root, storage, command: "verify" })).verified, 1);
    assert.deepEqual(await readFile(profile), source);
    assert.equal(await readFile(path.join(root, "users.json"), "utf8"), metadata);
    const [entry] = await new MediaIndex(path.join(root, "media-index.json")).all();
    assert.equal(entry.owner_user_id, "person");
    await storage.put(entry.object_key, Buffer.from("corrupt"));
    await assert.rejects(migrateMedia({ root, storage, command: "verify" }), /checksum mismatch/);
    assert.equal(JSON.parse(await readFile(path.join(root, "media-migration.json"), "utf8")).ok, false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("concurrent catalog writes retain every owner and deleting a subtree leaves other tenants intact", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "wardrobe-index-test-"));
  try {
    const index = new MediaIndex(path.join(root, "index.json"));
    await index.all();
    await Promise.all(["one", "two"].map((owner) => index.put({ source_path: `profiles/${owner}/photo.png`, owner_user_id: owner, original_name: "photo.png", object_key: owner })));
    assert.equal((await index.all()).length, 2);
    assert.equal((await index.byName("two", "photo.png")).object_key, "two");
    const deleted = [];
    await index.remove("profiles/one", { delete: async (key) => deleted.push(key) });
    assert.deepEqual(deleted, ["one"]);
    assert.equal((await index.all()).length, 1);
    assert.equal((await index.byName("two", "photo.png")).owner_user_id, "two");
    await assert.rejects(index.put({ source_path: "../escape", object_key: "escape" }), /Invalid object key/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("hybrid storage serves authorized media from the bucket and denies another tenant", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "wardrobe-hybrid-test-"));
  const root = path.join(directory, "data");
  const image = Buffer.from("stored image");
  try {
    await mkdir(path.join(root, "imported"), { recursive: true });
    await writeFile(path.join(root, "imported", "shirt.png"), image);
    await writeFile(path.join(root, "imported", "private-other-person.png"), image);
    await writeFile(path.join(root, "library.json"), JSON.stringify([
      { id: "import-00000000-0000-4000-8000-000000000021", userId: "default", name: "Shirt", image: "/api/import/library/shirt.png" },
      { id: "import-00000000-0000-4000-8000-000000000022", userId: "other", name: "Private shirt", image: "/api/import/library/private-other-person.png" },
      { id: "import-00000000-0000-4000-8000-000000000023", userId: "default", name: "Shared photo", image: "/api/import/library/shirt.png" },
    ]));
    await writeFile(path.join(root, "users.json"), JSON.stringify({ version: 2, currentUserId: "default", users: [{ id: "default", name: "Default" }, { id: "other", name: "Other" }] }));
    const storage = new FilesystemObjectStorage(path.join(directory, "bucket"));
    await migrateMedia({ root, storage });
    await migrateMedia({ root, storage, command: "verify" });
    await rm(path.join(root, "imported", "shirt.png"));
    const secret = "hybrid-storage-test-session-secret";
    const api = wardrobeImportApi({ env: { WARDROBE_DATA_DIR: root, WARDROBE_OBJECT_STORAGE_DRIVER: "s3", GOOGLE_CLIENT_ID: "test", GOOGLE_CLIENT_SECRET: "test", WARDROBE_SESSION_SECRET: secret, NODE_ENV: "production", WARDROBE_MEDIA_S3_ENDPOINT: "https://storage.example", WARDROBE_MEDIA_S3_BUCKET: "private-media", WARDROBE_MEDIA_S3_FORCE_PATH_STYLE: "false" }, objectStorage: storage });
    await api.initialize(directory);
    const run = async (url, method = "GET") => {
      const request = Readable.from([]);
      request.method = method; request.url = url;
      request.headers = { cookie: `wardrobe_session=${createSessionToken(secret, "default")}`, origin: "https://unrelated.example" };
      request.socket = { remoteAddress: "127.0.0.1" };
      const chunks = [];
      const headers = new Map();
      const response = { statusCode: 200, setHeader(name, value) { headers.set(name.toLowerCase(), value); }, end(chunk) { if (chunk) chunks.push(Buffer.from(chunk)); }, destroy(error) { throw error; } };
      await api.handler(request, response, () => assert.fail("unexpected next"));
      return { status: response.statusCode, bytes: Buffer.concat(chunks), headers };
    };
    const served = await run("/api/import/library/shirt.png?inline=1");
    assert.equal(served.status, 200);
    assert.deepEqual(served.bytes, image);
    assert.match(served.headers.get("content-security-policy"), /img-src[^;]*https:\/\/private-media\.storage\.example/);
    assert.match(served.headers.get("content-security-policy"), /media-src[^;]*https:\/\/private-media\.storage\.example/);
    assert.doesNotMatch(served.headers.get("content-security-policy"), /\*|unrelated\.example/);
    const denied = await run("/api/import/library/private-other-person.png?inline=1");
    assert.equal(denied.status, 404);
    const catalog = await new MediaIndex(path.join(root, "media-index.json")).all();
    const entry = catalog.find((asset) => asset.owner_user_id === "default");
    const direct = await run(`/api/assets/${entry.id}?inline=1`);
    assert.equal(direct.status, 200);
    assert.deepEqual(direct.bytes, image);
    const other = catalog.find((asset) => asset.owner_user_id === "other");
    assert.equal((await run(`/api/assets/${other.id}?inline=1`)).status, 404);
    const removed = await run("/api/import/wardrobe/import-00000000-0000-4000-8000-000000000021", "DELETE");
    assert.equal(removed.status, 200);
    const remaining = await new MediaIndex(path.join(root, "media-index.json")).byId(entry.id);
    assert(remaining, "a surviving garment still owns the shared image");
    assert.match(remaining.object_key, /00000000-0000-4000-8000-000000000023\/cutouts\//);
    assert.equal((await run("/api/import/library/shirt.png?inline=1")).status, 200);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("maintenance startup preserves queued jobs and never calls a provider", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "wardrobe-maintenance-test-"));
  const root = path.join(directory, "data");
  const id = "00000000-0000-4000-8000-000000000031";
  const file = path.join(root, "jobs", id, "job.json");
  const queued = { id, userId: "default", status: "active", stages: { crop: { status: "approved" }, garment: { status: "queued" }, modeled: { status: "pending" } }, internal: {} };
  const providerFetch = t.mock.fn(async () => assert.fail("maintenance must not call a provider"));
  t.mock.method(globalThis, "fetch", providerFetch);
  try {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(queued));
    const api = wardrobeImportApi({ env: { WARDROBE_DATA_DIR: root, WARDROBE_MAINTENANCE_MODE: "true", OPENROUTER_API_KEY: "synthetic-test-key" }, fetch: providerFetch });
    await api.initialize(directory);
    await new Promise(setImmediate);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), queued);
    assert.equal(providerFetch.mock.callCount(), 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
