import { randomUUID } from "node:crypto";
import { readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MediaIndex } from "./media-index.mjs";
import { mediaObjectKey } from "./media-layout.mjs";
import { readMediaCatalogState } from "./media-catalog-state.mjs";
import { createObjectStorage, objectBodyBytes, sha256 } from "./object-storage.mjs";

const FIVE_MINUTES_MS = 300_000;
async function atomicJson(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await rename(temporary, file);
}
const missing = (error) => error.code === "ENOENT" || error.$metadata?.httpStatusCode === 404 || ["NotFound", "NoSuchKey"].includes(error.name);

async function workers(values, process, concurrency = 6) {
  let cursor = 0; let failed = false;
  const task = async () => {
    while (!failed && cursor < values.length) {
      const value = values[cursor++];
      try { await process(value); }
      catch (error) { failed = true; throw error; }
    }
  };
  const results = await Promise.allSettled(Array.from({ length: Math.max(1, Math.min(6, Number(concurrency) || 6)) }, task));
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}

async function verifyBytes(storage, key, entry) {
  const result = await storage.get(key);
  const bytes = await objectBodyBytes(result.Body);
  if (bytes.length !== entry.byte_size || sha256(bytes) !== entry.sha256) throw new Error("Media reorganization checksum mismatch");
}

export async function reorganizeMedia({ root, storage, progress = () => {}, concurrency = 6, now = () => Date.now() }) {
  const catalogFile = path.join(root, "media-index.json");
  const journalFile = path.join(root, "media-reorganization.json");
  const index = new MediaIndex(catalogFile);
  const entries = await index.all();
  let journal;
  try { journal = JSON.parse(await readFile(journalFile, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (journal?.phase === "committed" || journal?.phase === "cleaned") return { ok: true, phase: journal.phase, files: journal.objects.length, cleanupAfter: journal.cleanupAfter, originalFilesPreserved: true };
  await storage.ready();
  if (!journal) {
    const id = randomUUID();
    const backupFile = path.join(root, `media-index.before-layout2-${id}.json`);
    await writeFile(backupFile, await readFile(catalogFile), { mode: 0o600 });
    const { contexts, ownerIds } = await readMediaCatalogState(root);
    const objects = [];
    for (const prior of entries) {
      const context = contexts.get(prior.source_path) || {
        ownerUserId: ownerIds.has(prior.owner_user_id) ? prior.owner_user_id : null,
        entityType: "unassigned", entityId: null, role: "source", lookId: null,
        mediaKind: "recovery", cachePolicy: "private-no-store", links: [],
      };
      if (prior.owner_user_id && ownerIds.has(prior.owner_user_id) && prior.owner_user_id !== context.ownerUserId) throw new Error("Conflicting media ownership");
      const layout = mediaObjectKey({ ...context, assetId: prior.id, sha256: prior.sha256, fileName: prior.original_name });
      const details = await stat(path.join(root, prior.source_path)).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
      const next = {
        ...prior, object_key: layout.key, layout_version: layout.layoutVersion, category: layout.category,
        owner_user_id: context.ownerUserId, entity_type: context.entityType, entity_id: context.entityId,
        role: context.role, look_id: context.lookId || null, links: context.links || [],
        media_kind: context.mediaKind, cache_policy: context.cachePolicy,
        created_at: prior.created_at || context.createdAt || details?.birthtime.toISOString() || details?.mtime.toISOString() || null,
        previous_object_keys: [...new Set([...(prior.previous_object_keys || []), ...(prior.object_key !== layout.key ? [prior.object_key] : [])])],
      };
      objects.push({ oldKey: prior.object_key, newKey: next.object_key, entry: next, verified: false });
    }
    const known = new Set(objects.flatMap((object) => [object.oldKey, object.newKey]));
    let recovered = 0;
    for (const object of await storage.list()) {
      if (known.has(object.key)) continue;
      // Preserve every unknown object under recovery; no ownership is guessed.
      const stored = await storage.get(object.key);
      const bytes = await objectBodyBytes(stored.Body);
      const assetId = randomUUID();
      const fileName = path.basename(object.key);
      const digest = sha256(bytes);
      const layout = mediaObjectKey({ ownerUserId: null, assetId, sha256: digest, fileName, role: "source" });
      const entry = {
        id: assetId, source_path: `_recovery/${assetId}/${fileName}`, object_key: layout.key,
        original_name: fileName, byte_size: bytes.length, sha256: digest,
        owner_user_id: null, entity_type: "unassigned", entity_id: null, role: "source", look_id: null, links: [],
        layout_version: layout.layoutVersion, category: layout.category, media_kind: "recovery",
        content_type: stored.ContentType || "application/octet-stream", cache_policy: "private-no-store",
        created_at: object.updatedAt ? new Date(object.updatedAt).toISOString() : null, previous_object_keys: [object.key],
      };
      objects.push({ oldKey: object.key, newKey: entry.object_key, entry, verified: false, recovered: true });
      recovered++;
    }
    journal = { version: 1, layoutVersion: 2, id, phase: "copying", startedAt: new Date(now()).toISOString(), backupFile, objects, recovered };
    await atomicJson(journalFile, journal);
  }
  let writes = Promise.resolve();
  const save = () => {
    const operation = writes.then(() => atomicJson(journalFile, journal));
    writes = operation.catch(() => {});
    return operation;
  };
  let completed = 0;
  try { await workers(journal.objects, async (object) => {
    let reusable = false;
    try {
      const head = await storage.head(object.newKey);
      reusable = head.sha256 === object.entry.sha256 && head.byteSize === object.entry.byte_size;
    } catch (error) { if (!missing(error)) throw error; }
    if (!reusable && object.newKey !== object.oldKey) await storage.copy(object.oldKey, object.newKey, {
      sha256: object.entry.sha256, contentType: object.entry.content_type,
      cacheControl: object.entry.cache_policy === "private-immutable" ? "private, max-age=31536000, immutable" : "private, no-store",
    });
    await verifyBytes(storage, object.newKey, object.entry);
    object.verified = true;
    completed++;
    if (completed % 25 === 0) {
      const finished = completed; await save();
      progress({ phase: "copying-and-verifying", completed: finished, total: journal.objects.length });
    }
  }, concurrency); } catch (error) { await save(); throw error; }
  await save();
  await index.replaceAll(journal.objects.map((object) => object.entry));
  journal.phase = "committed";
  journal.committedAt = new Date(now()).toISOString();
  journal.cleanupAfter = null;
  await save();
  return { ok: true, phase: journal.phase, files: journal.objects.length, byteSize: journal.objects.reduce((sum, object) => sum + object.entry.byte_size, 0), recovered: journal.recovered, cleanupAfter: journal.cleanupAfter, originalFilesPreserved: true };
}

export async function markMediaLayoutActive({ root, now = () => Date.now() }) {
  const file = path.join(root, "media-reorganization.json");
  const journal = JSON.parse(await readFile(file, "utf8"));
  if (journal.phase !== "committed" || journal.objects.some((object) => !object.verified)) throw new Error("Media reorganization is not verified");
  const entries = await new MediaIndex(path.join(root, "media-index.json")).all();
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  if (journal.objects.some((object) => byId.get(object.entry.id)?.object_key !== object.newKey)) throw new Error("Media catalog changed before runtime cutover");
  journal.runtimeVerifiedAt = new Date(now()).toISOString();
  journal.cleanupAfter = new Date(now() + FIVE_MINUTES_MS).toISOString();
  await atomicJson(file, journal);
  return { ok: true, phase: "active", cleanupAfter: journal.cleanupAfter, legacyObjects: journal.objects.filter((object) => object.oldKey !== object.newKey).length };
}

export async function cleanupLegacyMedia({ root, storage, progress = () => {}, concurrency = 6, now = () => Date.now() }) {
  const file = path.join(root, "media-reorganization.json");
  const journal = JSON.parse(await readFile(file, "utf8"));
  if (!["committed", "cleaned"].includes(journal.phase) || journal.objects.some((object) => !object.verified)) throw new Error("Media reorganization has not been fully verified and committed");
  if (!journal.runtimeVerifiedAt || !journal.cleanupAfter) throw new Error("Verify the live runtime and mark the layout active before cleanup");
  if (now() < Date.parse(journal.cleanupAfter)) throw new Error(`Wait for signed URLs to expire before cleanup: ${journal.cleanupAfter}`);
  const entries = await new MediaIndex(path.join(root, "media-index.json")).all();
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const referencedKeys = new Set(entries.map((entry) => entry.object_key));
  let retired = 0; let skipped = 0; let writes = Promise.resolve();
  const save = () => {
    const operation = writes.then(() => atomicJson(file, journal));
    writes = operation.catch(() => {}); return operation;
  };
  try { await workers(journal.objects, async (object) => {
    if (object.oldKey === object.newKey || object.deletedAt) return;
    const current = byId.get(object.entry.id);
    if (!current || current.object_key !== object.newKey || referencedKeys.has(object.oldKey)) { skipped++; return; }
    await verifyBytes(storage, object.newKey, object.entry);
    try { await verifyBytes(storage, object.oldKey, object.entry); }
    catch (error) { if (!missing(error)) throw error; }
    await storage.delete(object.oldKey);
    object.deletedAt = new Date(now()).toISOString();
    retired++;
    if (retired % 25 === 0) {
      const completed = retired; await save();
      progress({ phase: "retiring-verified-duplicates", retired: completed, total: journal.objects.length });
    }
  }, concurrency); } catch (error) { await save(); throw error; }
  if (!skipped) journal.phase = "cleaned";
  journal.lastCleanupAt = new Date(now()).toISOString();
  await save();
  return { ok: !skipped, retired, skipped, phase: journal.phase, originalFilesPreserved: true };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const command = process.argv[2] || "reorganize";
  if (command === "reorganize" && process.env.WARDROBE_MAINTENANCE_MODE !== "true") throw new Error("Enable maintenance mode before reorganizing media");
  const root = path.resolve(process.env.WARDROBE_DATA_DIR || "data");
  const storage = createObjectStorage({ env: { ...process.env, WARDROBE_OBJECT_STORAGE_DRIVER: "s3" } });
  const operation = command === "reorganize" ? reorganizeMedia : command === "activate" ? markMediaLayoutActive : command === "cleanup" ? cleanupLegacyMedia : null;
  if (!operation) throw new Error("Expected reorganize, activate, or cleanup");
  console.log(JSON.stringify(await operation({ root, storage, progress: (value) => console.log(JSON.stringify(value)) })));
}
