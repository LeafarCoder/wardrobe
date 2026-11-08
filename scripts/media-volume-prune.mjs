import { randomUUID } from "node:crypto";
import { lstat, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MediaIndex } from "./media-index.mjs";
import { createObjectStorage, objectBodyBytes, sha256 } from "./object-storage.mjs";

const MEDIA_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".mp4", ".pdf", ".gif", ".avif"]);
const missing = (error) => error.code === "ENOENT";
const jsonFile = async (file, value) => {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await rename(temporary, file);
};

async function localTarget(root, entry) {
  const relative = String(entry.source_path || "");
  const parts = relative.split("/");
  if (!/^(imported|profiles|jobs)$/.test(parts[0]) || parts.length < 2
    || parts.some((part) => !part || part === "." || part === ".." || part.includes("\\"))
    || !MEDIA_EXTENSIONS.has(path.extname(relative).toLowerCase())) return null;
  const file = path.join(root, ...parts);
  let details;
  try { details = await lstat(file); }
  catch (error) { if (missing(error)) return { file, absent: true }; throw error; }
  if (!details.isFile() || details.isSymbolicLink()) throw new Error("Refusing non-regular local media");
  const actual = await realpath(file);
  if (actual !== file || !actual.startsWith(`${root}${path.sep}`)) throw new Error("Refusing symlinked media path");
  return { file, details };
}

async function parallel(values, task, concurrency) {
  let cursor = 0; let failed = false;
  const worker = async () => {
    while (!failed && cursor < values.length) {
      const value = values[cursor++];
      try { await task(value); }
      catch (error) { failed = true; throw error; }
    }
  };
  const results = await Promise.allSettled(Array.from({ length: Math.max(1, Math.min(6, concurrency || 6)) }, worker));
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}

/** Unlinks only local, byte-verified media copies. Never removes S3 objects,
 * catalog rows, metadata files, directories, or files absent from the catalog. */
export async function pruneVolumeMedia({ root, storage, apply = false, concurrency = 6, progress = () => {} }) {
  root = await realpath(path.resolve(root));
  const catalogFile = path.join(root, "media-index.json");
  const catalogBytes = await readFile(catalogFile);
  const entries = await new MediaIndex(catalogFile).all();
  const state = { version: 1, startedAt: new Date().toISOString(), phase: "checking", apply,
    catalogHash: sha256(catalogBytes), candidates: [], absent: 0, retained: [], verified: 0, removed: 0, freedBytes: 0 };
  const journalFile = path.join(root, `media-volume-prune-${randomUUID()}.json`);
  const targets = new Set();
  for (const entry of entries) {
    const target = await localTarget(root, entry);
    if (!target) { state.retained.push({ id: entry.id, sourcePath: entry.source_path, reason: "Outside allowed local media paths" }); continue; }
    if (target.absent) { state.absent++; continue; }
    if (targets.has(target.file)) throw new Error("Duplicate local source path in catalog");
    targets.add(target.file);
    if (entry.layout_version !== 2 || !entry.object_key || !/^[a-f0-9]{64}$/i.test(entry.sha256 || "")) throw new Error("Unverified or invalid media catalog entry");
    const bytes = await readFile(target.file);
    if (bytes.length !== entry.byte_size || sha256(bytes) !== entry.sha256) throw new Error("Local media differs from catalog; preserve and investigate before pruning");
    state.candidates.push({ id: entry.id, sourcePath: entry.source_path, objectKey: entry.object_key,
      sha256: entry.sha256, byteSize: bytes.length });
  }
  await storage.ready();
  await jsonFile(journalFile, state);
  let saves = Promise.resolve();
  const save = () => {
    const operation = saves.then(() => jsonFile(journalFile, state));
    saves = operation.catch(() => {}); return operation;
  };
  try {
    // Verify the entire set before deleting anything. A corrupt/missing bucket
    // object leaves every local source untouched.
    await parallel(state.candidates, async (candidate) => {
      if (apply) {
        const object = await storage.get(candidate.objectKey);
        const bytes = await objectBodyBytes(object.Body);
        if (bytes.length !== candidate.byteSize || sha256(bytes) !== candidate.sha256) throw new Error("Bucket media checksum mismatch; no local copies removed");
      } else {
        const object = await storage.head(candidate.objectKey);
        if (object.byteSize !== candidate.byteSize || object.sha256 !== candidate.sha256) throw new Error("Bucket media metadata mismatch");
      }
      candidate.verifiedAt = new Date().toISOString(); state.verified++;
      if (state.verified % 25 === 0) { await save(); progress({ phase: "verifying", verified: state.verified, total: state.candidates.length }); }
    }, concurrency);
    if (sha256(await readFile(catalogFile)) !== state.catalogHash) throw new Error("Catalog changed during verification; no local copies removed");
    state.phase = "verified"; await save();
    if (apply) {
      for (const candidate of state.candidates) {
        const current = await localTarget(root, { source_path: candidate.sourcePath });
        if (!current || current.absent) continue;
        const bytes = await readFile(current.file);
        if (bytes.length !== candidate.byteSize || sha256(bytes) !== candidate.sha256) throw new Error("Local media changed before deletion; remaining files preserved");
        // Raw filesystem unlink is intentional: the application's rm() also
        // deletes the bucket object and must never be used for cache pruning.
        await unlink(current.file);
        candidate.removedAt = new Date().toISOString(); state.removed++; state.freedBytes += candidate.byteSize;
        if (state.removed % 100 === 0) { await save(); progress({ phase: "pruning-local-copies", removed: state.removed, total: state.candidates.length }); }
      }
      state.phase = "complete";
    } else state.phase = "planned";
    state.completedAt = new Date().toISOString(); await save();
    return { ok: true, phase: state.phase, candidates: state.candidates.length, verified: state.verified,
      removed: state.removed, freedBytes: state.freedBytes, alreadyAbsent: state.absent, retained: state.retained.length,
      journal: journalFile, bucketObjectsDeleted: 0, catalogPreserved: true };
  } catch (error) {
    state.phase = "failed"; state.error = error.message; await save(); throw error;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const apply = process.argv.includes("--apply");
  if (process.env.WARDROBE_OBJECT_STORAGE_DRIVER !== "s3") throw new Error("S3 media must be active before pruning local copies");
  if (apply && process.env.WARDROBE_MAINTENANCE_MODE !== "true") throw new Error("Enable maintenance mode before applying local media pruning");
  const storage = createObjectStorage({ env: process.env });
  console.log(JSON.stringify(await pruneVolumeMedia({ root: process.env.WARDROBE_DATA_DIR || "data", storage, apply,
    progress: (value) => console.log(JSON.stringify(value)) })));
}
