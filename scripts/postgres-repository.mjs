import { randomUUID } from "node:crypto";
import { decryptSecret, encryptSecret, withTransaction } from "./db.mjs";

const STORE_LOCK = 8_921_741_302;

function json(value) {
  return JSON.stringify(value ?? null);
}

function withoutOpenRouterKey(profile) {
  const payload = structuredClone(profile);
  delete payload.openRouterApiKey;
  return payload;
}

function connectionId(connection) {
  return String(connection.id || `${connection.grantorUserId}:${connection.recipientUserId}`);
}

function usageTrace(entry) {
  return {
    itemName: entry.itemName || null,
    planTitle: entry.planTitle || null,
    outfitTitle: entry.outfitTitle || null,
    draftId: entry.draftId || null,
    sourceFileName: entry.sourceFileName || null,
    companionCount: entry.companionCount || 0,
  };
}

export class PostgresRepository {
  constructor(pool, env = process.env) {
    this.pool = pool;
    this.env = env;
  }

  async upsertProfile(profile) {
    await withTransaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO profiles(id, email, payload)
         VALUES($1, $2, $3::jsonb)
         ON CONFLICT(id) DO UPDATE SET email = EXCLUDED.email, payload = EXCLUDED.payload, updated_at = now()`,
        [profile.id, profile.email || null, json(withoutOpenRouterKey(profile))],
      );
      if (profile.openRouterApiKey) {
        await client.query(
          `INSERT INTO profile_secrets(profile_id, openrouter_key_ciphertext)
           VALUES($1, $2)
           ON CONFLICT(profile_id) DO UPDATE
           SET openrouter_key_ciphertext = EXCLUDED.openrouter_key_ciphertext, updated_at = now()`,
          [profile.id, encryptSecret(profile.openRouterApiKey, this.env)],
        );
      } else {
        await client.query("DELETE FROM profile_secrets WHERE profile_id = $1", [profile.id]);
      }
    });
  }

  async upsertGarment(record) {
    await this.pool.query(
      `INSERT INTO garments(id, user_id, payload, created_at, updated_at)
       VALUES($1, $2, $3::jsonb, COALESCE($4::timestamptz, now()), now())
       ON CONFLICT(id) DO UPDATE
       SET user_id = EXCLUDED.user_id, payload = EXCLUDED.payload, updated_at = now()`,
      [record.id, record.userId, json(record), record.createdAt || null],
    );
  }

  async deleteGarment(id, userId) {
    const result = await this.pool.query(
      "DELETE FROM garments WHERE id = $1 AND user_id = $2",
      [id, userId],
    );
    return result.rowCount === 1;
  }

  async loadUsersStore() {
    const client = await this.pool.connect();
    try {
      const [profiles, secrets, invites, connections, current] = await Promise.all([
        client.query("SELECT id, payload FROM profiles ORDER BY created_at, id"),
        client.query("SELECT profile_id, openrouter_key_ciphertext FROM profile_secrets"),
        client.query("SELECT payload FROM connection_invitations ORDER BY created_at, id"),
        client.query("SELECT payload FROM connections ORDER BY created_at, id"),
        client.query("SELECT value FROM wardrobe_settings WHERE key = 'current_user_id'"),
      ]);
      if (!profiles.rows.length) return null;
      const secretByProfile = new Map(secrets.rows.map((row) => [row.profile_id, row.openrouter_key_ciphertext]));
      const users = profiles.rows.map((row) => {
        const profile = structuredClone(row.payload);
        const encrypted = secretByProfile.get(row.id);
        if (encrypted) profile.openRouterApiKey = decryptSecret(encrypted, this.env);
        return profile;
      });
      const selected = current.rows[0]?.value;
      const currentUserId = typeof selected === "string" && users.some((user) => user.id === selected)
        ? selected
        : users[0].id;
      return {
        version: 2,
        currentUserId,
        users,
        connectionInvites: invites.rows.map((row) => row.payload),
        connections: connections.rows.map((row) => row.payload),
      };
    } finally {
      client.release();
    }
  }

  async saveUsersStore(store) {
    return withTransaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock($1)", [STORE_LOCK]);
      const profileIds = [];
      for (const profile of store.users || []) {
        profileIds.push(profile.id);
        await client.query(
          `INSERT INTO profiles(id, email, payload)
           VALUES($1, $2, $3::jsonb)
           ON CONFLICT(id) DO UPDATE SET email = EXCLUDED.email, payload = EXCLUDED.payload, updated_at = now()`,
          [profile.id, profile.email || null, json(withoutOpenRouterKey(profile))],
        );
        if (profile.openRouterApiKey) {
          await client.query(
            `INSERT INTO profile_secrets(profile_id, openrouter_key_ciphertext)
             VALUES($1, $2)
             ON CONFLICT(profile_id) DO UPDATE
             SET openrouter_key_ciphertext = EXCLUDED.openrouter_key_ciphertext, updated_at = now()`,
            [profile.id, encryptSecret(profile.openRouterApiKey, this.env)],
          );
        } else {
          await client.query("DELETE FROM profile_secrets WHERE profile_id = $1", [profile.id]);
        }
      }
      if (profileIds.length) await client.query("DELETE FROM profiles WHERE NOT (id = ANY($1::text[]))", [profileIds]);
      else await client.query("DELETE FROM profiles");

      await client.query("DELETE FROM connection_invitations");
      for (const invite of store.connectionInvites || []) {
        await client.query(
          `INSERT INTO connection_invitations(
             id, requester_user_id, recipient_user_id, recipient_email, status, payload, created_at, updated_at
           ) VALUES($1, $2, $3, $4, $5, $6::jsonb, COALESCE($7::timestamptz, now()), now())`,
          [
            invite.id || randomUUID(),
            invite.requesterUserId,
            invite.recipientUserId || null,
            invite.recipientEmail || null,
            invite.status || "pending",
            json(invite),
            invite.createdAt || null,
          ],
        );
      }
      await client.query("DELETE FROM connections");
      for (const connection of store.connections || []) {
        await client.query(
          `INSERT INTO connections(id, grantor_user_id, recipient_user_id, payload, created_at, updated_at)
           VALUES($1, $2, $3, $4::jsonb, COALESCE($5::timestamptz, now()), now())`,
          [
            connectionId(connection),
            connection.grantorUserId,
            connection.recipientUserId,
            json(connection),
            connection.createdAt || null,
          ],
        );
      }
      await client.query(
        `INSERT INTO wardrobe_settings(key, value) VALUES('current_user_id', $1::jsonb)
         ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [json(store.currentUserId)],
      );
    });
  }

  async readLibraryRecords(userId = null) {
    const result = userId
      ? await this.pool.query("SELECT payload FROM garments WHERE user_id = $1 ORDER BY created_at, id", [userId])
      : await this.pool.query("SELECT payload FROM garments ORDER BY created_at, id");
    return result.rows.map((row) => row.payload);
  }

  async saveLibraryRecords(records) {
    return withTransaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock($1)", [STORE_LOCK]);
      const ids = [];
      for (const record of records) {
        ids.push(record.id);
        await client.query(
          `INSERT INTO garments(id, user_id, payload, created_at, updated_at)
           VALUES($1, $2, $3::jsonb, COALESCE($4::timestamptz, now()), now())
           ON CONFLICT(id) DO UPDATE
           SET user_id = EXCLUDED.user_id, payload = EXCLUDED.payload, updated_at = now()`,
          [record.id, record.userId, json(record), record.createdAt || null],
        );
      }
      if (ids.length) await client.query("DELETE FROM garments WHERE NOT (id = ANY($1::text[]))", [ids]);
      else await client.query("DELETE FROM garments");
    });
  }

  async loadJob(id) {
    const result = await this.pool.query("SELECT payload FROM import_jobs WHERE id = $1::uuid", [id]);
    return result.rows[0]?.payload || null;
  }

  async listJobs() {
    const result = await this.pool.query("SELECT payload FROM import_jobs ORDER BY created_at, id");
    return result.rows.map((row) => row.payload);
  }

  async saveJob(job) {
    job.updatedAt = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO import_jobs(id, user_id, upload_id, status, payload, created_at, updated_at)
       VALUES($1::uuid, $2, $3::uuid, $4, $5::jsonb, COALESCE($6::timestamptz, now()), now())
       ON CONFLICT(id) DO UPDATE
       SET user_id = EXCLUDED.user_id, upload_id = EXCLUDED.upload_id, status = EXCLUDED.status,
           payload = EXCLUDED.payload, updated_at = now()`,
      [job.id, job.userId, job.uploadId || null, job.status || null, json(job), job.createdAt || null],
    );
  }

  async deleteJob(id) {
    await this.pool.query("DELETE FROM import_jobs WHERE id = $1::uuid", [id]);
  }

  async readAiUsageLedger() {
    const result = await this.pool.query("SELECT payload FROM ai_usage ORDER BY created_at, id");
    return { version: 1, entries: result.rows.map((row) => row.payload) };
  }

  async appendAiUsage(entry) {
    await this.pool.query(
      `INSERT INTO ai_usage(
         id, wardrobe_user_id, billing_user_id, provider, model, upstream, fallback_from,
         operation, operation_group, completed, http_status, provider_request_id, cost,
         input_tokens, output_tokens, total_tokens, duration_ms, upload_id, job_id,
         garment_id, plan_id, outfit_id, trace, payload, created_at
       ) VALUES(
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         $14, $15, $16, $17, $18::uuid, $19::uuid, $20, $21, $22, $23::jsonb, $24::jsonb, $25::timestamptz
       ) ON CONFLICT(id) DO NOTHING`,
      [
        entry.id,
        entry.wardrobeUserId || entry.userId,
        entry.billingUserId || entry.userId,
        entry.provider,
        entry.model,
        entry.upstream || null,
        entry.fallbackFrom || null,
        entry.operation,
        entry.operationGroup,
        Boolean(entry.completed),
        entry.status,
        entry.requestId || null,
        entry.cost,
        entry.inputTokens,
        entry.outputTokens,
        entry.totalTokens,
        entry.durationMs,
        entry.uploadId,
        entry.jobId,
        entry.garmentId,
        entry.planId,
        entry.outfitId,
        json(usageTrace(entry)),
        json(entry),
        entry.createdAt,
      ],
    );
  }

  async readImportHistory() {
    const result = await this.pool.query("SELECT payload FROM import_upload_history ORDER BY created_at, id");
    return { version: 1, uploads: result.rows.map((row) => row.payload) };
  }

  async saveImportHistory(history) {
    return withTransaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock($1)", [STORE_LOCK]);
      const keys = [];
      for (const upload of history.uploads || []) {
        keys.push(`${upload.id}:${upload.userId}`);
        await client.query(
          `INSERT INTO import_upload_history(id, user_id, status, payload, created_at, updated_at)
           VALUES($1::uuid, $2, $3, $4::jsonb, COALESCE($5::timestamptz, now()), now())
           ON CONFLICT(id, user_id) DO UPDATE
           SET status = EXCLUDED.status, payload = EXCLUDED.payload, updated_at = now()`,
          [upload.id, upload.userId, upload.status || null, json(upload), upload.createdAt || null],
        );
      }
      if (!keys.length) {
        await client.query("DELETE FROM import_upload_history");
      } else {
        await client.query(
          "DELETE FROM import_upload_history WHERE (id::text || ':' || user_id) <> ALL($1::text[])",
          [keys],
        );
      }
    });
  }
}
