import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MediaIndex } from "./media-index.mjs";
import { createObjectStorage, objectBodyBytes, sha256 } from "./object-storage.mjs";
import { readMediaCatalogState } from "./media-catalog-state.mjs";
import { mediaObjectKey } from "./media-layout.mjs";
import { randomUUID } from "node:crypto";

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".pdf": "application/pdf" };

export async function migrateMedia({ root, storage, command = "migrate", progress = () => {}, concurrency = 6, force = false }) {
  if (!["migrate", "verify"].includes(command)) throw new Error("Expected migrate or verify");
  // A failed/new run must never leave an older successful cutover marker valid.
  await writeFile(path.join(root, "media-migration.json"), JSON.stringify({ ok: false, command, startedAt: new Date().toISOString() }), { mode: 0o600 });
  const index = new MediaIndex(path.join(root, "media-index.json"));
  await index.all();
  const { contexts, ownerIds } = await readMediaCatalogState(root);
  const files = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true }).catch((error) => { if (error.code === "ENOENT") return []; throw error; })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile() && MIME[path.extname(entry.name).toLowerCase()]) files.push(file);
    }
  };
  for (const directory of ["imported", "profiles", "jobs"]) await visit(path.join(root, directory));
  const present = new Set(files.map((file) => path.relative(root, file).split(path.sep).join("/")));
  const missing = [...contexts.keys()].filter((file) => !present.has(file));
  if (missing.length) throw new Error(`Referenced media missing from source: ${missing.join(", ")}`);
  await storage.ready();
  let bytesTotal = 0;
  let uploaded = 0;
  let verified = 0;
  let completed = 0;
  const processFile = async (file) => {
    const relative = path.relative(root, file).split(path.sep).join("/");
    const bytes = await readFile(file);
    const digest = sha256(bytes);
    const details = await stat(file);
    const prior = await index.byPath(relative);
    const context = contexts.get(relative) || {
      ownerUserId: ownerIds.has(prior?.owner_user_id) ? prior.owner_user_id : null,
      entityType: "unassigned", entityId: null, role: "source", lookId: null,
      mediaKind: "recovery", cachePolicy: "private-no-store", links: [],
    };
    const owner = context.ownerUserId;
    if (prior?.owner_user_id && ownerIds.has(prior.owner_user_id) && prior.owner_user_id !== owner) throw new Error("Conflicting media ownership");
    const assetId = prior?.id || randomUUID();
    const layout = mediaObjectKey({ ...context, assetId, sha256: digest, fileName: path.basename(file) });
    const objectKey = layout.key;
    const contentType = MIME[path.extname(file).toLowerCase()];
    if (command === "migrate") {
      // Content-addressed writes are idempotent. Reuse the completed catalog
      // checkpoint and verify every object's actual bytes in the next phase.
      const present = !force && prior?.object_key === objectKey && prior?.sha256 === digest && prior?.byte_size === bytes.length;
      if (!present) {
        await storage.put(objectKey, bytes, { contentType, sha256: digest, cacheControl: context.cachePolicy === "private-immutable" ? "private, max-age=31536000, immutable" : "private, no-store" });
        uploaded++;
      }
      await index.put({
        id: assetId, layout_version: layout.layoutVersion, category: layout.category,
        entity_type: context.entityType, entity_id: context.entityId, role: context.role, look_id: context.lookId || null, links: context.links || [],
        created_at: prior?.created_at || context.createdAt || details.birthtime.toISOString(),
        previous_object_keys: [...new Set([...(prior?.previous_object_keys || []), ...(prior?.object_key && prior.object_key !== objectKey ? [prior.object_key] : [])])],
        source_path: relative, object_key: objectKey, owner_user_id: owner,
        original_name: path.basename(file), content_type: contentType,
        media_kind: context.mediaKind,
        byte_size: bytes.length, sha256: digest, cache_policy: context.cachePolicy, local_mtime_ms: details.mtimeMs,
      });
    } else if (command === "verify") {
      if (!prior || prior.sha256 !== digest || prior.object_key !== objectKey || prior.owner_user_id !== owner) throw new Error(`Media catalog mismatch: ${relative}`);
      const stored = await storage.get(objectKey);
      const downloaded = await objectBodyBytes(stored.Body);
      if (downloaded.length !== bytes.length || sha256(downloaded) !== digest) throw new Error(`Media checksum mismatch: ${relative}`);
      verified++;
    } else throw new Error("Expected migrate or verify");
    bytesTotal += bytes.length;
    completed++;
    if (completed % 25 === 0) progress({ scanned: completed, total: files.length, uploaded, verified });
  };
  let cursor = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && cursor < files.length) {
      const file = files[cursor++];
      try { await processFile(file); }
      catch (error) { failed = true; throw error; }
    }
  };
  const workers = await Promise.allSettled(Array.from({ length: Math.max(1, Math.min(6, Number(concurrency) || 4)) }, worker));
  const failure = workers.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
  const result = { ok: true, command, files: files.length, byteSize: bytesTotal, uploaded, verified, originalFilesPreserved: true };
  if (command === "verify") await writeFile(path.join(root, "media-migration.json"), JSON.stringify({ ...result, verifiedAt: new Date().toISOString() }), { mode: 0o600 });
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.resolve(process.env.WARDROBE_DATA_DIR || "data");
  const storage = createObjectStorage({ env: { ...process.env, WARDROBE_OBJECT_STORAGE_DRIVER: "s3" } });
  const result = await migrateMedia({ root, storage, command: process.argv[2], force: process.argv.includes("--force"), progress: (value) => process.stdout.write(`${JSON.stringify(value)}\n`) });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
