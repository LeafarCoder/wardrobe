import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const MIGRATION_LOCK = 8_921_741_301;
export const REQUIRED_POSTGRES_MAJOR = 18;
export const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

function required(name, env = process.env) {
  const value = String(env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function postgresConnectionString(env = process.env) {
  return String(env.DATABASE_URL || env.POSTGRES_URL || "").trim();
}

export function createDatabasePool(env = process.env) {
  const connectionString = postgresConnectionString(env);
  if (!connectionString) throw new Error("DATABASE_URL or POSTGRES_URL is required for the postgres driver");
  return new Pool({
    connectionString,
    max: Number.parseInt(env.WARDROBE_DATABASE_POOL_SIZE || "10", 10),
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    ssl: env.WARDROBE_DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
  });
}

export async function postgresVersion(client) {
  const result = await client.query(
    "SELECT current_setting('server_version') AS version, current_setting('server_version_num')::integer AS version_num",
  );
  const row = result.rows[0];
  return { version: row.version, versionNum: row.version_num, major: Math.trunc(row.version_num / 10_000) };
}

export function assertSupportedPostgres(version, expectedMajor = REQUIRED_POSTGRES_MAJOR) {
  if (version.major !== expectedMajor) {
    throw new Error(`PostgreSQL ${expectedMajor}.x is required; connected server is ${version.version}`);
  }
}

export async function migrationFiles(directory = MIGRATIONS_DIR) {
  const names = (await readdir(directory))
    .filter((name) => /^\d{3}_[a-z0-9_-]+\.sql$/i.test(name))
    .sort();
  return Promise.all(names.map(async (name) => {
    const sql = await readFile(path.join(directory, name), "utf8");
    const version = Number.parseInt(name.slice(0, 3), 10);
    return {
      version,
      name,
      sql,
      checksum: createHash("sha256").update(sql).digest("hex"),
    };
  }));
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS wardrobe_schema_migrations (
      version integer PRIMARY KEY,
      name text NOT NULL,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function migrateDatabase(pool, { directory = MIGRATIONS_DIR } = {}) {
  const client = await pool.connect();
  try {
    const version = await postgresVersion(client);
    assertSupportedPostgres(version);
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK]);
    await ensureMigrationTable(client);
    const appliedResult = await client.query(
      "SELECT version, name, checksum FROM wardrobe_schema_migrations ORDER BY version",
    );
    const applied = new Map(appliedResult.rows.map((row) => [row.version, row]));
    const files = await migrationFiles(directory);
    for (const migration of files) {
      const prior = applied.get(migration.version);
      if (prior) {
        if (prior.name !== migration.name || prior.checksum !== migration.checksum) {
          throw new Error(`Schema drift detected in migration ${migration.name}`);
        }
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO wardrobe_schema_migrations(version, name, checksum) VALUES($1, $2, $3)",
          [migration.version, migration.name, migration.checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    return { postgres: version.version, applied: files.length, current: files.at(-1)?.version || 0 };
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK]).catch(() => {});
    client.release();
  }
}

export async function verifyDatabase(pool, { directory = MIGRATIONS_DIR } = {}) {
  const client = await pool.connect();
  try {
    const postgres = await postgresVersion(client);
    assertSupportedPostgres(postgres);
    await ensureMigrationTable(client);
    const files = await migrationFiles(directory);
    const applied = await client.query(
      "SELECT version, name, checksum FROM wardrobe_schema_migrations ORDER BY version",
    );
    if (applied.rows.length !== files.length) {
      throw new Error(`Schema is incomplete: expected ${files.length} migrations, found ${applied.rows.length}`);
    }
    for (const migration of files) {
      const row = applied.rows.find((entry) => entry.version === migration.version);
      if (!row || row.name !== migration.name || row.checksum !== migration.checksum) {
        throw new Error(`Schema drift detected in migration ${migration.name}`);
      }
    }
    await client.query("SELECT 1");
    return { ready: true, postgres: postgres.version, migration: files.at(-1)?.version || 0 };
  } finally {
    client.release();
  }
}

function encryptionKey(env = process.env) {
  const value = required("WARDROBE_DATA_ENCRYPTION_KEY", env);
  let key;
  if (/^[a-f0-9]{64}$/i.test(value)) key = Buffer.from(value, "hex");
  else {
    try { key = Buffer.from(value, "base64"); } catch { key = null; }
  }
  if (!key || key.length !== 32) {
    throw new Error("WARDROBE_DATA_ENCRYPTION_KEY must be 32 bytes encoded as base64 or 64 hex characters");
  }
  return key;
}

export function encryptSecret(plaintext, env = process.env) {
  if (!plaintext) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(env), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptSecret(value, env = process.env) {
  if (!value) return "";
  const [version, ivValue, tagValue, ciphertextValue] = String(value).split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Unsupported encrypted secret format");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(env), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export async function withTransaction(pool, task) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await task(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
