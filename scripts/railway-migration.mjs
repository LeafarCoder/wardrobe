import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { aiUsageEntriesForWardrobe } from "../src/ai-preferences.js";
import { wardrobeOutfitAssets } from "../src/outfit-studio.js";
import { createDatabasePool, migrateDatabase, verifyDatabase } from "./db.mjs";
import { importedRecordAssets, wardrobePlanAssets } from "./import-job-api.mjs";
import { createObjectStorage, objectBodyBytes, sha256 } from "./object-storage.mjs";
import { PostgresRepository } from "./postgres-repository.mjs";

const CHECKPOINT_NAME = ".wardrobe-railway-migration.json";

async function jsonFile(file, fallback = null) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== null) return fallback;
    throw new Error(`Could not read valid JSON from ${file}: ${error.message}`);
  }
}

async function filesBelow(directory) {
  const files = [];
  const visit = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true }).catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) files.push(file);
    }
  };
  await visit(directory);
  return files;
}

function assetFileName(value) {
  return path.basename(new URL(value, "http://localhost").pathname);
}

function contentType(file) {
  if (file.endsWith(".webp")) return "image/webp";
  if (file.endsWith(".jpg") || file.endsWith(".jpeg")) return "image/jpeg";
  if (file.endsWith(".svg")) return "image/svg+xml";
  return "image/png";
}

async function loadLegacy(source) {
  const users = await jsonFile(path.join(source, "users.json"));
  const library = await jsonFile(path.join(source, "library.json"), []);
  const usage = await jsonFile(path.join(source, "ai-usage.json"), { version: 1, entries: [] });
  const history = await jsonFile(path.join(source, "import-history.json"), { version: 1, uploads: [] });
  if (!Array.isArray(users?.users) || !users.users.length) throw new Error("users.json contains no profiles");
  if (!Array.isArray(library)) throw new Error("library.json must contain an array");
  if (!Array.isArray(usage.entries)) throw new Error("ai-usage.json entries must be an array");
  if (!Array.isArray(history.uploads)) throw new Error("import-history.json uploads must be an array");
  const jobs = [];
  for (const file of await filesBelow(path.join(source, "jobs"))) {
    if (path.basename(file) === "job.json") jobs.push(await jsonFile(file));
  }
  return { users, library, usage, history, jobs };
}

function referencedFiles(source, legacy) {
  const entries = [];
  for (const profile of legacy.users.users) {
    for (const reference of profile.referenceImages || []) {
      for (const fileName of [reference.fileName, reference.avatarFileName].filter(Boolean)) {
        entries.push({
          file: path.join(source, "profiles", profile.id, "references", fileName),
          owner: profile.id,
          entityType: "profile",
          entityId: profile.id,
          role: fileName === reference.avatarFileName ? "avatar" : "reference",
          mediaKind: fileName === reference.avatarFileName ? "profile-avatar" : "profile-reference",
        });
      }
    }
    for (const value of [...wardrobePlanAssets(profile.wardrobePlans), ...wardrobeOutfitAssets(profile.wardrobeOutfits)]) {
      const fileName = assetFileName(value);
      entries.push({
        file: path.join(source, "imported", fileName),
        owner: profile.id,
        entityType: "profile",
        entityId: profile.id,
        role: "generated-look",
        mediaKind: "modeled-look",
      });
    }
  }
  for (const record of legacy.library) {
    for (const value of importedRecordAssets(record)) {
      const fileName = assetFileName(value);
      entries.push({
        file: path.join(source, "imported", fileName),
        owner: record.userId,
        entityType: "garment",
        entityId: record.id,
        role: fileName.endsWith(".webp") ? "derivative" : "media",
        mediaKind: fileName.endsWith(".webp") ? "garment-derivative" : "garment-media",
      });
    }
  }
  for (const job of legacy.jobs) {
    const jobDirectory = path.join(source, "jobs", job.id);
    for (const fileName of new Set([
      ...Object.values(job.internal || {}).filter((value) => typeof value === "string" && /\.[a-z0-9]+$/i.test(value)),
      ...Object.values(job.stages || {}).flatMap((stage) => [
        stage?.assetUrl,
        stage?.failedAssetUrl,
        stage?.cleanupPreviewUrl,
        ...(stage?.candidates || []).map((candidate) => candidate?.assetUrl),
      ].filter(Boolean).map(assetFileName)),
    ])) {
      entries.push({
        file: path.join(jobDirectory, fileName),
        owner: job.userId,
        entityType: "job",
        entityId: job.id,
        role: fileName,
        mediaKind: "import-job",
      });
    }
  }
  const unique = new Map();
  for (const entry of entries) {
    unique.set(`${entry.owner}:${entry.file}:${entry.entityType}:${entry.entityId}:${entry.role}`, entry);
  }
  return [...unique.values()];
}

async function checkpoint(source) {
  return jsonFile(path.join(source, CHECKPOINT_NAME), { version: 1, uploads: {} });
}

async function saveCheckpoint(source, value) {
  await writeFile(path.join(source, CHECKPOINT_NAME), `${JSON.stringify(value, null, 2)}\n`);
}

async function uploadEntry(pool, storage, entry, progress, source) {
  const details = await stat(entry.file).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!details?.isFile()) throw new Error(`Referenced asset is missing: ${entry.file}`);
  const bytes = await readFile(entry.file);
  const digest = sha256(bytes);
  const progressKey = `${entry.owner}:${path.relative(source, entry.file)}`;
  if (progress.uploads[progressKey]?.sha256 === digest) {
    const cached = progress.uploads[progressKey];
    await pool.query(
      `INSERT INTO asset_links(asset_id, entity_type, entity_id, role)
       VALUES($1::uuid, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [cached.assetId, entry.entityType, String(entry.entityId), entry.role],
    );
    return cached;
  }
  const fileName = path.basename(entry.file);
  const objectKey = [
    "users",
    encodeURIComponent(entry.owner),
    entry.entityType,
    encodeURIComponent(String(entry.entityId)),
    `${digest.slice(0, 16)}-${fileName}`,
  ].join("/");
  const existing = await pool.query(
    "SELECT id FROM assets WHERE object_key = $1 AND deleted_at IS NULL",
    [objectKey],
  );
  const assetId = existing.rows[0]?.id || randomUUID();
  if (!existing.rows[0]) {
    await storage.put(objectKey, bytes, {
      contentType: contentType(fileName),
      cacheControl: fileName.endsWith(".webp") ? "private, max-age=31536000, immutable" : "private, no-store",
      sha256: digest,
    });
    await pool.query(
      `INSERT INTO assets(
         id, owner_user_id, object_key, media_kind, content_type, byte_size,
         sha256, cache_policy, original_name
       ) VALUES($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        assetId,
        entry.owner,
        objectKey,
        entry.mediaKind,
        contentType(fileName),
        bytes.length,
        digest,
        fileName.endsWith(".webp") ? "private-immutable" : "private-no-store",
        fileName,
      ],
    );
  }
  await pool.query(
    `INSERT INTO asset_links(asset_id, entity_type, entity_id, role)
     VALUES($1::uuid, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [assetId, entry.entityType, String(entry.entityId), entry.role],
  );
  progress.uploads[progressKey] = { assetId, objectKey, sha256: digest, byteSize: bytes.length };
  return progress.uploads[progressKey];
}

async function migrate(source, pool, storage) {
  await migrateDatabase(pool);
  const legacy = await loadLegacy(source);
  const progress = await checkpoint(source);
  const repository = new PostgresRepository(pool, process.env);
  await repository.saveUsersStore(legacy.users);
  const referenced = referencedFiles(source, legacy);
  for (const entry of referenced) {
    const uploaded = await uploadEntry(pool, storage, entry, progress, source);
    const owner = entry.entityType === "profile"
      ? legacy.users.users.find((profile) => profile.id === entry.entityId)
      : entry.entityType === "garment"
        ? legacy.library.find((record) => record.id === entry.entityId)
        : legacy.jobs.find((job) => job.id === entry.entityId);
    if (owner) {
      owner.assetIds = { ...(owner.assetIds || {}), [path.basename(entry.file)]: uploaded.assetId };
    }
    await saveCheckpoint(source, progress);
  }
  const referencedAbsolute = new Set(referenced.map((entry) => path.resolve(entry.file)));
  for (const root of ["imported", "profiles", "jobs"]) {
    for (const file of await filesBelow(path.join(source, root))) {
      if (path.basename(file) === "job.json" || referencedAbsolute.has(path.resolve(file))) continue;
      const bytes = await readFile(file);
      const digest = sha256(bytes);
      const objectKey = `quarantine/${root}/${digest.slice(0, 16)}-${path.basename(file)}`;
      if (!progress.uploads[`quarantine:${path.relative(source, file)}`]) {
        await storage.put(objectKey, bytes, { contentType: contentType(file), sha256: digest });
        progress.uploads[`quarantine:${path.relative(source, file)}`] = {
          objectKey,
          sha256: digest,
          byteSize: bytes.length,
        };
        await saveCheckpoint(source, progress);
      }
    }
  }
  await repository.saveUsersStore(legacy.users);
  await repository.saveLibraryRecords(legacy.library);
  for (const job of legacy.jobs) await repository.saveJob(job);
  for (const entry of legacy.usage.entries) {
    await repository.appendAiUsage({
      ...entry,
      id: entry.id || entry.requestId || randomUUID(),
      wardrobeUserId: entry.wardrobeUserId || entry.userId,
      billingUserId: entry.billingUserId || entry.userId,
      createdAt: entry.createdAt || new Date().toISOString(),
    });
  }
  await repository.saveImportHistory(legacy.history);
  return {
    profiles: legacy.users.users.length,
    garments: legacy.library.length,
    jobs: legacy.jobs.length,
    usage: legacy.usage.entries.length,
    history: legacy.history.uploads.length,
    referencedAssets: referenced.length,
    checkpoint: path.join(source, CHECKPOINT_NAME),
  };
}

async function verify(source, pool, storage) {
  await verifyDatabase(pool);
  const legacy = await loadLegacy(source);
  const [profiles, garments, jobs, usage, history, assets] = await Promise.all([
    pool.query("SELECT id, payload FROM profiles"),
    pool.query("SELECT id, payload FROM garments"),
    pool.query("SELECT id::text, payload FROM import_jobs"),
    pool.query("SELECT count(*)::integer AS count FROM ai_usage"),
    pool.query("SELECT count(*)::integer AS count FROM import_upload_history"),
    pool.query("SELECT id, owner_user_id, object_key, byte_size, sha256 FROM assets WHERE deleted_at IS NULL"),
  ]);
  const expected = {
    profiles: legacy.users.users.length,
    garments: legacy.library.length,
    jobs: legacy.jobs.length,
    usage: legacy.usage.entries.length,
    history: legacy.history.uploads.length,
  };
  const actual = {
    profiles: profiles.rows.length,
    garments: garments.rows.length,
    jobs: jobs.rows.length,
    usage: usage.rows[0].count,
    history: history.rows[0].count,
  };
  const mismatches = Object.keys(expected).filter((key) => expected[key] !== actual[key]);
  const corrupt = [];
  const assetById = new Map(assets.rows.map((asset) => [asset.id, asset]));
  for (const asset of assets.rows) {
    try {
      const object = await storage.head(asset.object_key);
      const stored = await storage.get(asset.object_key);
      const bytes = await objectBodyBytes(stored.Body);
      if (object.byteSize !== Number(asset.byte_size) || bytes.length !== object.byteSize || sha256(bytes) !== asset.sha256) {
        corrupt.push({ assetId: asset.id, key: asset.object_key });
      }
    } catch (error) {
      corrupt.push({ assetId: asset.id, key: asset.object_key, error: error.message });
    }
  }
  const entityPayload = {
    profile: new Map(profiles.rows.map((row) => [row.id, row.payload])),
    garment: new Map(garments.rows.map((row) => [row.id, row.payload])),
    job: new Map(jobs.rows.map((row) => [row.id, row.payload])),
  };
  const missingReferences = [];
  const sourceMismatches = [];
  for (const entry of referencedFiles(source, legacy)) {
    const fileName = path.basename(entry.file);
    const payload = entityPayload[entry.entityType]?.get(String(entry.entityId));
    const assetId = payload?.assetIds?.[fileName];
    const asset = assetById.get(assetId);
    if (!asset || asset.owner_user_id !== entry.owner) {
      missingReferences.push({
        owner: entry.owner,
        entityType: entry.entityType,
        entityId: entry.entityId,
        fileName,
      });
      continue;
    }
    const sourceBytes = await readFile(entry.file);
    if (sourceBytes.length !== Number(asset.byte_size) || sha256(sourceBytes) !== asset.sha256) {
      sourceMismatches.push({ assetId, fileName });
    }
  }
  const ownership = await pool.query(
    `SELECT count(*)::integer AS count FROM garments g
     LEFT JOIN profiles p ON p.id = g.user_id WHERE p.id IS NULL`,
  );
  const usageByWardrobe = new Map();
  for (const profile of legacy.users.users) {
    usageByWardrobe.set(profile.id, aiUsageEntriesForWardrobe(legacy.usage.entries, profile.id).length);
  }
  const ok = !mismatches.length
    && !corrupt.length
    && !missingReferences.length
    && !sourceMismatches.length
    && ownership.rows[0].count === 0;
  return {
    ok,
    expected,
    actual,
    mismatches,
    corrupt,
    missingReferences,
    sourceMismatches,
    ownershipErrors: ownership.rows[0].count,
    usageByWardrobe: Object.fromEntries(usageByWardrobe),
  };
}

async function exportFiles(destination, pool, storage) {
  await mkdir(destination, { recursive: true });
  const repository = new PostgresRepository(pool, process.env);
  const [users, library, usage, history, jobs, assets] = await Promise.all([
    repository.loadUsersStore(),
    repository.readLibraryRecords(),
    repository.readAiUsageLedger(),
    repository.readImportHistory(),
    repository.listJobs(),
    pool.query("SELECT object_key, original_name, media_kind, owner_user_id FROM assets WHERE deleted_at IS NULL"),
  ]);
  await Promise.all([
    writeFile(path.join(destination, "users.json"), `${JSON.stringify(users, null, 2)}\n`),
    writeFile(path.join(destination, "library.json"), `${JSON.stringify(library, null, 2)}\n`),
    writeFile(path.join(destination, "ai-usage.json"), `${JSON.stringify(usage, null, 2)}\n`),
    writeFile(path.join(destination, "import-history.json"), `${JSON.stringify(history, null, 2)}\n`),
  ]);
  for (const job of jobs) {
    const directory = path.join(destination, "jobs", job.id);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "job.json"), `${JSON.stringify(job, null, 2)}\n`);
  }
  for (const asset of assets.rows) {
    const directory = asset.media_kind.startsWith("profile-")
      ? path.join(destination, "profiles", asset.owner_user_id, "references")
      : asset.media_kind === "import-job"
        ? path.join(destination, "jobs", asset.object_key.split("/")[4])
        : path.join(destination, "imported");
    await mkdir(directory, { recursive: true });
    const object = await storage.get(asset.object_key);
    await writeFile(path.join(directory, asset.original_name), await objectBodyBytes(object.Body));
  }
  return { destination, profiles: users.users.length, garments: library.length, assets: assets.rows.length };
}

const command = process.argv[2];
const source = path.resolve(process.env.WARDROBE_MIGRATION_SOURCE || process.env.WARDROBE_DATA_DIR || "/data");
const pool = createDatabasePool(process.env);
const storage = createObjectStorage({ env: { ...process.env, WARDROBE_OBJECT_STORAGE_DRIVER: "s3" } });
try {
  const result = command === "migrate"
    ? await migrate(source, pool, storage)
    : command === "verify"
      ? await verify(source, pool, storage)
      : command === "export-files"
        ? await exportFiles(path.resolve(process.argv[3] || "./wardrobe-restored"), pool, storage)
        : (() => { throw new Error("Usage: node scripts/railway-migration.mjs <migrate|verify|export-files> [destination]"); })();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (command === "verify" && !result.ok) process.exitCode = 1;
} finally {
  await pool.end();
}
