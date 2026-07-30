import { createDatabasePool, migrateDatabase, verifyDatabase } from "./db.mjs";

const command = process.argv[2];
if (command === "predeploy" && String(process.env.WARDROBE_PERSISTENCE_DRIVER || "filesystem") !== "postgres") {
  process.stdout.write('{"skipped":true,"reason":"filesystem persistence driver"}\n');
  process.exit(0);
}
const pool = createDatabasePool(process.env);
try {
  const result = command === "migrate"
    ? await migrateDatabase(pool)
    : command === "predeploy"
      ? { migration: await migrateDatabase(pool), verification: await verifyDatabase(pool) }
    : command === "verify"
      ? await verifyDatabase(pool)
      : (() => { throw new Error("Usage: node scripts/db-cli.mjs <migrate|verify|predeploy>"); })();
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await pool.end();
}
