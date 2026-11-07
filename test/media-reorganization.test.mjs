import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MediaIndex } from "../scripts/media-index.mjs";
import { FilesystemObjectStorage, sha256 } from "../scripts/object-storage.mjs";
import { reorganizeMedia, markMediaLayoutActive, cleanupLegacyMedia } from "../scripts/media-reorganization.mjs";

async function fixture({ unknown = false } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "wardrobe-reorganize-test-"));
  const root = path.join(directory, "data");
  await mkdir(path.join(root, "imported"), { recursive: true });
  await writeFile(path.join(root, "users.json"), JSON.stringify({ users: [{ id: "person", name: "Person" }, { id: "second", name: "Second" }] }));
  await writeFile(path.join(root, "library.json"), JSON.stringify([{ id: "import-garment-1", userId: "person", image: "/api/import/library/cutout.png", originalImage: "/api/import/library/original.png" }]));
  const storage = new FilesystemObjectStorage(path.join(directory, "bucket"));
  const index = new MediaIndex(path.join(root, "media-index.json"));
  for (const name of ["original.png", "cutout.png"]) {
    const bytes = Buffer.from(`source bytes ${name}`);
    const digest = sha256(bytes);
    const key = `media/${digest}/imported/${name}`;
    await writeFile(path.join(root, "imported", name), bytes);
    await storage.put(key, bytes);
    await index.put({ id: name.replace(".png", ""), source_path: `imported/${name}`, original_name: name, owner_user_id: "person", object_key: key, byte_size: bytes.length, sha256: digest, content_type: "image/png", cache_policy: "private-no-store" });
  }
  if (unknown) await storage.put("media/unknown-legacy.png", Buffer.from("unindexed unique bytes"));
  return { directory, root, storage, index };
}

test("reorganization copies and verifies every byte, recovers unknowns, and cleans only verified duplicates after runtime grace", async () => {
  const f = await fixture({ unknown: true });
  const initial = await f.index.all();
  const started = Date.parse("2026-11-07T20:00:00Z");
  try {
    const result = await reorganizeMedia({ ...f, now: () => started });
    assert.equal(result.files, 3);
    assert.equal(result.recovered, 1);
    const catalog = await new MediaIndex(path.join(f.root, "media-index.json")).all();
    assert.equal(catalog.length, 3);
    for (const original of initial) {
      const current = catalog.find((entry) => entry.id === original.id);
      assert.equal(current.source_path, original.source_path);
      assert.match(current.object_key, /^person\/media\/garments\/garment-1\/(originals|cutouts)\//);
      assert.equal((await f.storage.head(original.object_key)).sha256, original.sha256);
      assert.equal((await f.storage.head(current.object_key)).sha256, original.sha256);
      assert.deepEqual(await readFile(path.join(f.root, original.source_path)), Buffer.from(`source bytes ${original.original_name}`));
    }
    assert.equal(catalog.find((entry) => entry.owner_user_id === null).category, "recovery");
    await assert.rejects(cleanupLegacyMedia({ ...f, now: () => started + 999_999 }), /mark the layout active/);
    const active = await markMediaLayoutActive({ root: f.root, now: () => started + 20_000 });
    assert.equal(Date.parse(active.cleanupAfter), started + 320_000);
    await assert.rejects(cleanupLegacyMedia({ ...f, now: () => started + 300_001 }), /signed URLs/);
    await f.storage.put("outside-journal.png", Buffer.from("keep this independent file"));
    const cleanup = await cleanupLegacyMedia({ ...f, now: () => started + 320_001 });
    assert.equal(cleanup.retired, 3);
    assert.equal(cleanup.skipped, 0);
    assert.equal(cleanup.phase, "cleaned");
    assert.equal((await f.storage.list()).length, 4);
    assert((await f.storage.list()).some((entry) => entry.key === "outside-journal.png"));
    assert.equal((await cleanupLegacyMedia({ ...f, now: () => started + 320_002 })).retired, 0);
    const journal = JSON.parse(await readFile(path.join(f.root, "media-reorganization.json"), "utf8"));
    assert.equal(JSON.parse(await readFile(journal.backupFile, "utf8")).entries.length, 2);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test("a corrupt copy never swaps the catalog and a resumed reorganization repairs it", async () => {
  const f = await fixture();
  const initial = await f.index.all();
  const normalCopy = f.storage.copy.bind(f.storage);
  f.storage.copy = async (source, destination) => f.storage.put(destination, Buffer.from("corrupt"));
  try {
    await assert.rejects(reorganizeMedia({ ...f, concurrency: 1 }), /checksum mismatch/);
    assert.deepEqual(await new MediaIndex(path.join(f.root, "media-index.json")).all(), initial);
    assert.equal(JSON.parse(await readFile(path.join(f.root, "media-reorganization.json"), "utf8")).phase, "copying");
    f.storage.copy = normalCopy;
    assert.equal((await reorganizeMedia({ ...f })).phase, "committed");
    assert.equal((await f.storage.list()).length, 4);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test("a known catalog owner cannot be reassigned by conflicting metadata", async () => {
  const f = await fixture();
  try {
    const [entry] = await f.index.all();
    await f.index.put({ ...entry, owner_user_id: "second" });
    await assert.rejects(reorganizeMedia(f), /Conflicting media ownership/);
    assert.equal((await new MediaIndex(path.join(f.root, "media-index.json")).byId(entry.id)).owner_user_id, "second");
    assert.equal((await f.storage.list()).length, 2);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});
