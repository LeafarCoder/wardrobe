import { createDatabasePool } from "./db.mjs";
import { createObjectStorage, objectBodyBytes, sha256 } from "./object-storage.mjs";

function totalSize(entries) {
  return entries.reduce((sum, entry) => sum + Number(entry.byteSize || 0), 0);
}

async function inventory(pool, storage) {
  const [database, objects] = await Promise.all([
    pool.query("SELECT id, object_key, byte_size, sha256 FROM assets WHERE deleted_at IS NULL ORDER BY object_key"),
    storage.list(),
  ]);
  const byKey = new Map(objects.map((entry) => [entry.key, entry]));
  const referenced = new Set(database.rows.map((entry) => entry.object_key));
  const missing = database.rows.filter((entry) => !byKey.has(entry.object_key));
  const orphans = objects.filter((entry) => !referenced.has(entry.key));
  return {
    database: { count: database.rows.length, byteSize: totalSize(database.rows) },
    bucket: { count: objects.length, byteSize: totalSize(objects) },
    missing: missing.map((entry) => ({ assetId: entry.id, key: entry.object_key })),
    orphans,
  };
}

async function verify(pool, storage) {
  const result = await inventory(pool, storage);
  const rows = await pool.query("SELECT id, object_key, byte_size, sha256 FROM assets WHERE deleted_at IS NULL");
  const corrupt = [];
  for (const asset of rows.rows) {
    try {
      const object = await storage.head(asset.object_key);
      const stored = await storage.get(asset.object_key);
      const bytes = await objectBodyBytes(stored.Body);
      const actualSha256 = sha256(bytes);
      if (Number(asset.byte_size) !== object.byteSize || bytes.length !== object.byteSize || actualSha256 !== asset.sha256) {
        corrupt.push({
          assetId: asset.id,
          key: asset.object_key,
          expectedSize: Number(asset.byte_size),
          actualSize: object.byteSize,
          expectedSha256: asset.sha256,
          actualSha256,
        });
      }
    } catch (error) {
      if (!result.missing.some((entry) => entry.assetId === asset.id)) {
        result.missing.push({ assetId: asset.id, key: asset.object_key, error: error.message });
      }
    }
  }
  return { ...result, corrupt, ok: !result.missing.length && !corrupt.length };
}

async function url(pool, storage, assetId) {
  if (!assetId) throw new Error("Usage: npm run storage:url -- <asset-id>");
  const result = await pool.query(
    "SELECT id, object_key FROM assets WHERE id = $1::uuid AND deleted_at IS NULL",
    [assetId],
  );
  if (!result.rows[0]) throw new Error("Asset not found");
  return { assetId, expiresIn: 300, url: await storage.signedUrl(result.rows[0].object_key, 300) };
}

async function gc(pool, storage) {
  const due = await pool.query(
    `SELECT id, operation, object_key, destination_key FROM pending_storage_operations
     WHERE completed_at IS NULL AND next_attempt_at <= now() ORDER BY id LIMIT 100`,
  );
  let completed = 0;
  for (const operation of due.rows) {
    try {
      if (operation.operation === "delete") await storage.delete(operation.object_key);
      else throw new Error("Copy operations are handled by the recovery mirror service");
      await pool.query(
        "UPDATE pending_storage_operations SET completed_at = now(), last_error = NULL WHERE id = $1",
        [operation.id],
      );
      completed += 1;
    } catch (error) {
      await pool.query(
        `UPDATE pending_storage_operations
         SET attempts = attempts + 1, last_error = $2,
             next_attempt_at = now() + make_interval(secs => LEAST(86400, 30 * power(2, LEAST(attempts, 11)))::integer)
         WHERE id = $1`,
        [operation.id, String(error.message).slice(0, 1000)],
      );
    }
  }
  return { attempted: due.rows.length, completed, failed: due.rows.length - completed };
}

const command = process.argv[2];
const pool = createDatabasePool(process.env);
const storage = createObjectStorage({ env: process.env });
try {
  const result = command === "inventory"
    ? await inventory(pool, storage)
    : command === "verify"
      ? await verify(pool, storage)
      : command === "url"
        ? await url(pool, storage, process.argv[3])
        : command === "gc"
          ? await gc(pool, storage)
          : (() => { throw new Error("Usage: node scripts/storage-cli.mjs <inventory|verify|url|gc>"); })();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (command === "verify" && !result.ok) process.exitCode = 1;
} finally {
  await pool.end();
}
