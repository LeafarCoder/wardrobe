import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import sharp from "sharp";
import { wardrobeImportApi, createSessionToken } from "../scripts/import-job-api.mjs";
import { migrateMedia } from "../scripts/media-migration.mjs";
import { MediaIndex } from "../scripts/media-index.mjs";
import { FilesystemObjectStorage } from "../scripts/object-storage.mjs";

const secret = "bucket-only-runtime-session-secret";
const itemId = "import-00000000-0000-4000-8000-000000000081";
class Response extends Writable {
  constructor() { super(); this.statusCode = 200; this.headers = new Map(); this.chunks = []; this.headersSent = false; }
  setHeader(name, value) { this.headers.set(name.toLowerCase(), value); }
  getHeader(name) { return this.headers.get(name.toLowerCase()); }
  _write(chunk, _encoding, done) { this.headersSent = true; this.chunks.push(Buffer.from(chunk)); done(); }
  body() { return Buffer.concat(this.chunks); }
  json() { return JSON.parse(this.body()); }
}
function zipEntries(bytes) {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert(end >= 0);
  const result = new Map();
  let offset = bytes.readUInt32LE(end + 16);
  for (let index = 0; index < bytes.readUInt16LE(end + 10); index++) {
    const size = bytes.readUInt32LE(offset + 24);
    const length = bytes.readUInt16LE(offset + 28);
    const local = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + length).toString();
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    result.set(name, bytes.subarray(start, start + size));
    offset += 46 + length + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
  }
  return result;
}
async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "wardrobe-bucket-runtime-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, "data");
  const env = { WARDROBE_DATA_DIR: root, GOOGLE_CLIENT_ID: "test", GOOGLE_CLIENT_SECRET: "test", WARDROBE_SESSION_SECRET: secret, REMBG_PYTHON: process.execPath };
  await wardrobeImportApi({ env }).initialize(directory);
  const image = await sharp({ create: { width: 32, height: 32, channels: 4, background: "#eeeeee" } }).png().toBuffer();
  const pixels = Buffer.alloc(32 * 32);
  for (let y = 7; y < 25; y++) for (let x = 7; x < 25; x++) pixels[y * 32 + x] = 255;
  const mask = await sharp(pixels, { raw: { width: 32, height: 32, channels: 1 } }).png().toBuffer();
  const files = new Map([["imported/shirt.png", image], ["profiles/default/references/person.png", image], ["profiles/default/references/avatar.webp", await sharp(image).webp().toBuffer()]]);
  for (const [relative, bytes] of files) { await mkdir(path.dirname(path.join(root, relative)), { recursive: true }); await writeFile(path.join(root, relative), bytes); }
  const users = JSON.parse(await readFile(path.join(root, "users.json")));
  users.users[0].referenceImages = [{ id: "reference-one", fileName: "person.png", avatarFileName: "avatar.webp", name: "Person" }];
  await writeFile(path.join(root, "users.json"), JSON.stringify(users));
  const records = [{ id: itemId, userId: "default", name: "Top", part: "upperbody", color: "#eeeeee", image: "/api/import/library/shirt.png", thumbnail: "/api/import/library/shirt.png", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", customOrder: 0 }];
  if (options.shared) records.push({ ...records[0], id: "import-00000000-0000-4000-8000-000000000082", customOrder: 1 });
  if (options.video) {
    const video = path.join(directory, "sample.mp4");
    await promisify(execFile)(ffmpegPath, ["-y", "-f", "lavfi", "-i", "color=c=blue:s=32x32:d=0.2", "-c:v", "libx264", "-pix_fmt", "yuv420p", video]);
    const bytes = await readFile(video);
    files.set("imported/clip.mp4", bytes);
    await writeFile(path.join(root, "imported/clip.mp4"), bytes);
    records[0].modeledLooks = [{ id: "look-one", image: "/api/import/library/shirt.png", videoClips: [{ id: "clip-one", status: "completed", video: "/api/import/library/clip.mp4" }] }];
  }
  await writeFile(path.join(root, "library.json"), JSON.stringify(records));
  const storage = new FilesystemObjectStorage(path.join(directory, "bucket"));
  storage.signedUrl = async (key) => `https://media.example/${key}`;
  await migrateMedia({ root, storage });
  await migrateMedia({ root, storage, command: "verify" });
  for (const relative of files.keys()) await rm(path.join(root, relative));
  const api = wardrobeImportApi({ env: { ...env, WARDROBE_OBJECT_STORAGE_DRIVER: "s3" }, objectStorage: storage, fetch: async () => assert.fail("No provider calls are permitted") });
  await api.initialize(directory);
  const run = async (url, value, method = value === undefined ? "GET" : "POST") => {
    const request = Readable.from(value === undefined ? [] : [Buffer.from(JSON.stringify(value))]);
    request.url = url; request.method = method;
    request.headers = { host: "localhost", "content-type": "application/json", cookie: `wardrobe_session=${createSessionToken(secret, "default")}`, "user-agent": "Macintosh" };
    request.socket = { remoteAddress: "127.0.0.1" };
    const response = new Response();
    await api.handler(request, response, () => assert.fail("Unexpected next"));
    return response;
  };
  const assertNoLocalMedia = async () => {
    const entries = await new MediaIndex(path.join(root, "media-index.json")).all();
    for (const entry of entries) await assert.rejects(stat(path.join(root, entry.source_path)), { code: "ENOENT" });
    assert.deepEqual(await readdir(path.join(root, "imported")), [], "no uncatalogued generated media retained");
  };
  return { directory, root, files, image, mask, run, assertNoLocalMedia, storage };
}

test("bucket-only setup, profile reads and full export preserve metadata and keep media off the volume", async (t) => {
  const f = await fixture(t);
  const metadata = await Promise.all(["users.json", "library.json", "media-index.json"].map((name) => readFile(path.join(f.root, name))));
  assert.equal((await f.run("/api/import/config")).statusCode, 200);
  assert.equal((await f.run("/api/import/wardrobe")).statusCode, 200);
  assert.deepEqual((await f.run("/api/users/default/references/person.png?inline=1")).body(), f.image);
  assert.deepEqual((await f.run("/api/import/library/shirt.png?inline=1")).body(), f.image);
  const response = await f.run("/api/export?format=zip");
  assert.equal(response.statusCode, 200);
  const entries = zipEntries(response.body());
  for (const [relative, bytes] of f.files) assert.deepEqual(entries.get(`wardrobe-data/data/${relative}`), bytes, relative);
  assert.deepEqual(await Promise.all(["users.json", "library.json", "media-index.json"].map((name) => readFile(path.join(f.root, name)))), metadata);
  await f.assertNoLocalMedia();
});

test("rekeying a shared bucket-only source preserves its stable asset without hydrating the volume", async (t) => {
  const f = await fixture(t, { shared: true });
  const before = await new MediaIndex(path.join(f.root, "media-index.json")).byPath("imported/shirt.png");
  assert.equal((await f.run(`/api/import/wardrobe/${itemId}`, undefined, "DELETE")).statusCode, 200);
  const after = await new MediaIndex(path.join(f.root, "media-index.json")).byPath("imported/shirt.png");
  assert.equal(after.id, before.id);
  assert.notEqual(after.object_key, before.object_key);
  assert.deepEqual((await f.run("/api/import/library/shirt.png?inline=1")).body(), f.image);
  await f.assertNoLocalMedia();
});

test("path-only segmentation gets an isolated copy and successful saves release all published media", async (t) => {
  const f = await fixture(t);
  const source = path.join(f.root, "imported/shirt.png");
  const marker = path.join(f.directory, "segmentation.json");
  await mkdir(path.join(f.directory, "scripts"));
  // Simulate post-commit cleanup after the operation starts but before the tool
  // opens its input. It must see its own private copy, not the mutable source.
  await writeFile(path.join(f.directory, "scripts/rembg-mask.py"), `const fs=require('node:fs'); fs.rmSync(${JSON.stringify(source)},{force:true}); const bytes=fs.readFileSync(process.argv[2]); fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({source:process.argv[2],base64:bytes.toString('base64')})); fs.writeFileSync(process.argv[3],Buffer.from(${JSON.stringify(f.mask.toString("base64"))},'base64'));`);
  await writeFile(source, f.image);
  const segmented = await f.run(`/api/import/wardrobe/${itemId}/mask/start`, {});
  assert.equal(segmented.statusCode, 200, segmented.body().toString());
  const observed = JSON.parse(await readFile(marker));
  assert.notEqual(observed.source, source);
  assert.deepEqual(Buffer.from(observed.base64, "base64"), f.image);
  await assert.rejects(stat(observed.source), { code: "ENOENT" });
  const saved = await f.run(`/api/import/wardrobe/${itemId}/mask/apply`, { maskDataUrl: segmented.json().maskDataUrl, sourceImage: "/api/import/library/shirt.png", versionId: "original", threshold: 128, edge: -1, feather: 1 });
  assert.equal(saved.statusCode, 200, saved.body().toString());
  assert.match(saved.json().image, /\/api\/assets\//);
  const response = await f.run(`${saved.json().image}&inline=1`);
  assert.equal(response.statusCode, 200);
  assert((await sharp(response.body()).metadata()).hasAlpha);
  const stored = JSON.parse(await readFile(path.join(f.root, "library.json")));
  assert.match(stored[0].image, /masked-/);
  await f.assertNoLocalMedia();
});


test("FFmpeg creates a missing hover preview from bucket bytes without retaining source or output media", async (t) => {
  const f = await fixture(t, { video: true });
  const records = JSON.parse(await readFile(path.join(f.root, "library.json")));
  const clip = records[0].modeledLooks[0].videoClips[0];
  assert.match(clip.hoverVideo, /clip-hover\.mp4/);
  const response = await f.run(`${clip.hoverVideo}?inline=1`);
  assert.equal(response.statusCode, 200);
  assert(response.body().length > 100);
  await f.assertNoLocalMedia();
});
