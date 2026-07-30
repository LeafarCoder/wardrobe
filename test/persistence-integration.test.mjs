import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import {
  createDatabasePool,
  decryptSecret,
  encryptSecret,
  migrateDatabase,
  migrationFiles,
  verifyDatabase,
  withTransaction,
} from "../scripts/db.mjs";
import { S3ObjectStorage } from "../scripts/object-storage.mjs";
import { PostgresRepository } from "../scripts/postgres-repository.mjs";

const databaseUrl = process.env.TEST_DATABASE_URL;
const s3Endpoint = process.env.TEST_S3_ENDPOINT;

test("AES-256-GCM profile secrets round trip and reject tampering", () => {
  const env = { WARDROBE_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") };
  const encrypted = encryptSecret("sk-or-v1-private", env);
  assert.notEqual(encrypted, "sk-or-v1-private");
  assert.equal(decryptSecret(encrypted, env), "sk-or-v1-private");
  const pieces = encrypted.split(".");
  pieces[3] = `${pieces[3][0] === "A" ? "B" : "A"}${pieces[3].slice(1)}`;
  const tampered = pieces.join(".");
  assert.throws(() => decryptSecret(tampered, env));
});

test("PostgreSQL migrations, concurrent writes, rollback, and usage idempotency", {
  skip: !databaseUrl && "TEST_DATABASE_URL is not configured",
}, async () => {
  const env = {
    DATABASE_URL: databaseUrl,
    WARDROBE_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
  };
  const pool = createDatabasePool(env);
  try {
    await pool.query(`
      DROP TABLE IF EXISTS
        pending_storage_operations, asset_links, assets, backup_runs, ai_usage,
        import_upload_history, import_jobs, garments, connections,
        connection_invitations, profile_secrets, profiles, wardrobe_settings,
        wardrobe_schema_migrations CASCADE
    `);
    await migrateDatabase(pool);
    assert.equal((await verifyDatabase(pool)).ready, true);
    await migrateDatabase(pool);
    await pool.query("UPDATE wardrobe_schema_migrations SET checksum = 'drift' WHERE version = 1");
    await assert.rejects(verifyDatabase(pool), /Schema drift/);
    const [migration] = await migrationFiles();
    await pool.query("UPDATE wardrobe_schema_migrations SET checksum = $1 WHERE version = 1", [migration.checksum]);
    const repository = new PostgresRepository(pool, env);
    const first = { id: randomUUID(), email: "one@example.test", name: "One", openRouterApiKey: "sk-or-one" };
    const second = { id: randomUUID(), email: "two@example.test", name: "Two", openRouterApiKey: "sk-or-two" };
    await Promise.all([repository.upsertProfile(first), repository.upsertProfile(second)]);
    const loaded = await repository.loadUsersStore();
    assert.equal(loaded.users.length, 2);
    assert.equal(loaded.users.find((profile) => profile.id === first.id).openRouterApiKey, "sk-or-one");

    const garmentA = { id: `import-${randomUUID()}`, userId: first.id, name: "A" };
    const garmentB = { id: `import-${randomUUID()}`, userId: second.id, name: "B" };
    await Promise.all([repository.upsertGarment(garmentA), repository.upsertGarment(garmentB)]);
    assert.equal((await repository.readLibraryRecords(first.id)).length, 1);

    await assert.rejects(withTransaction(pool, async (client) => {
      await client.query(
        "INSERT INTO garments(id, user_id, payload) VALUES($1, $2, $3::jsonb)",
        [`import-${randomUUID()}`, first.id, JSON.stringify({ temporary: true })],
      );
      throw new Error("force rollback");
    }));
    assert.equal((await repository.readLibraryRecords()).length, 2);

    const usage = {
      id: randomUUID(),
      userId: first.id,
      wardrobeUserId: first.id,
      billingUserId: first.id,
      provider: "test",
      model: "test-model",
      operation: "analysis",
      operationGroup: "import",
      completed: true,
      status: 200,
      createdAt: new Date().toISOString(),
    };
    await Promise.all([repository.appendAiUsage(usage), repository.appendAiUsage(usage)]);
    assert.equal((await repository.readAiUsageLedger()).entries.length, 1);
  } finally {
    await pool.end();
  }
});

test("S3 adapter uploads, hashes, lists, signs, and deletes private objects", {
  skip: !s3Endpoint && "TEST_S3_ENDPOINT is not configured",
}, async () => {
  const env = {
    WARDROBE_MEDIA_S3_ENDPOINT: s3Endpoint,
    WARDROBE_MEDIA_S3_BUCKET: process.env.TEST_S3_BUCKET || "wardrobe-test",
    WARDROBE_MEDIA_S3_ACCESS_KEY_ID: process.env.TEST_S3_ACCESS_KEY_ID || "minio",
    WARDROBE_MEDIA_S3_SECRET_ACCESS_KEY: process.env.TEST_S3_SECRET_ACCESS_KEY || "minio123",
    WARDROBE_MEDIA_S3_REGION: "us-east-1",
  };
  const storage = new S3ObjectStorage(env);
  await storage.client.send(new CreateBucketCommand({ Bucket: storage.bucket })).catch((error) => {
    if (!["BucketAlreadyOwnedByYou", "BucketAlreadyExists"].includes(error.name)) throw error;
  });
  const key = `users/test/integration/${randomUUID()}.txt`;
  const saved = await storage.put(key, Buffer.from("private wardrobe asset"), { contentType: "text/plain" });
  assert.equal(saved.byteSize, 22);
  assert.equal((await storage.head(key)).sha256, saved.sha256);
  assert.ok((await storage.list("users/test/integration")).some((entry) => entry.key === key));
  assert.match(await storage.signedUrl(key), /^http/);
  await storage.delete(key);
});
