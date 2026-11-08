import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MediaIndex } from "../scripts/media-index.mjs";
import { FilesystemObjectStorage, objectBodyBytes, sha256 } from "../scripts/object-storage.mjs";
import { pruneVolumeMedia } from "../scripts/media-volume-prune.mjs";

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "wardrobe-local-prune-"));
  const root = path.join(directory, "data");
  await mkdir(path.join(root, "imported"), { recursive: true });
  const storage = new FilesystemObjectStorage(path.join(directory, "bucket"));
  const index = new MediaIndex(path.join(root, "media-index.json"));
  const files = [];
  for (const name of ["one.png", "two.webp"]) {
    const bytes = Buffer.from(`original bytes for ${name}`);
    const file = path.join(root, "imported", name);
    await writeFile(file, bytes);
    const entry = { id: name, source_path: `imported/${name}`, object_key: `person/media/garments/item/${name}`,
      sha256: sha256(bytes), byte_size: bytes.length, layout_version: 2 };
    await storage.put(entry.object_key, bytes);
    await index.put(entry); files.push({ file, bytes, entry });
  }
  await writeFile(path.join(root, "users.json"), '{"users":[{"id":"person"}]}');
  await writeFile(path.join(root, "imported", "unknown.png"), "not migrated");
  await writeFile(path.join(root, "imported", "notes.json"), '{"keep":true}');
  return { directory, root, storage, index, files };
}

test("prunes only verified local duplicates and preserves metadata, unknown files, catalog, and all bucket bytes", async () => {
  const f = await fixture();
  try {
    const metadata = await readFile(path.join(f.root, "users.json"));
    const catalog = await readFile(path.join(f.root, "media-index.json"));
    const plan = await pruneVolumeMedia(f);
    assert.equal(plan.candidates, 2); assert.equal(plan.removed, 0);
    assert.deepEqual(await readFile(f.files[0].file), f.files[0].bytes);
    const applied = await pruneVolumeMedia({ ...f, apply: true });
    assert.equal(applied.removed, 2);
    assert.equal(applied.freedBytes, f.files.reduce((sum, x) => sum + x.bytes.length, 0));
    for (const { file, bytes, entry } of f.files) {
      await assert.rejects(readFile(file), { code: "ENOENT" });
      assert.deepEqual(await objectBodyBytes((await f.storage.get(entry.object_key)).Body), bytes);
    }
    assert.deepEqual(await readFile(path.join(f.root, "users.json")), metadata);
    assert.deepEqual(await readFile(path.join(f.root, "media-index.json")), catalog);
    assert.equal(await readFile(path.join(f.root, "imported", "unknown.png"), "utf8"), "not migrated");
    assert.equal(await readFile(path.join(f.root, "imported", "notes.json"), "utf8"), '{"keep":true}');
    assert.equal((await f.storage.list()).length, 2);
    const again = await pruneVolumeMedia({ ...f, apply: true });
    assert.equal(again.removed, 0); assert.equal(again.alreadyAbsent, 2);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test("a corrupt bucket copy prevents all local deletions, even after another object verified", async () => {
  const f = await fixture();
  try {
    await f.storage.put(f.files[1].entry.object_key, Buffer.from("corrupt bucket bytes"));
    await assert.rejects(pruneVolumeMedia({ ...f, apply: true, concurrency: 1 }), /Bucket media checksum mismatch/);
    for (const { file, bytes } of f.files) assert.deepEqual(await readFile(file), bytes);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test("non-media catalog paths are retained and symbolic links never authorize deleting another file", async () => {
  const f = await fixture();
  try {
    await f.index.put({ id: "metadata", source_path: "users.json", object_key: "unused" });
    await f.index.put({ id: "nested-metadata", source_path: "imported/notes.json", object_key: "unused" });
    assert.equal((await pruneVolumeMedia(f)).retained, 2);
    const outside = path.join(f.directory, "outside.png");
    await writeFile(outside, "preserve outside");
    await symlink(outside, path.join(f.root, "imported", "linked.png"));
    await f.index.put({ id: "symlink", source_path: "imported/linked.png", object_key: "unused" });
    await assert.rejects(pruneVolumeMedia({ ...f, apply: true }), /non-regular local media/);
    assert.equal(await readFile(outside, "utf8"), "preserve outside");
    assert.deepEqual(await readFile(f.files[0].file), f.files[0].bytes);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test("catalog changes during bucket verification abort before any unlink", async () => {
  const f = await fixture();
  const originalGet = f.storage.get.bind(f.storage);
  let changed = false;
  f.storage.get = async (key) => {
    const result = await originalGet(key);
    if (!changed) {
      changed = true;
      await f.index.put({ ...f.files[0].entry, owner_user_id: "changed" });
    }
    return result;
  };
  try {
    await assert.rejects(pruneVolumeMedia({ ...f, apply: true }), /Catalog changed/);
    for (const { file, bytes } of f.files) assert.deepEqual(await readFile(file), bytes);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});
