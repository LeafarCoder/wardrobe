# Railway PostgreSQL and private-bucket migration

This runbook moves an existing `/data` Railway volume to PostgreSQL 18.4 and
private Railway buckets without deleting the rollback source. Amsterdam, a
controlled maintenance window, 30 daily and 12 monthly logical dumps, 90-day
deleted-media recovery, and a 30-day legacy-volume hold are the selected
defaults.

## What is automated

- `npm run db:migrate` applies ordered SQL migrations under an advisory lock.
  Applied filenames and SHA-256 checksums are immutable.
- `npm run db:verify` checks PostgreSQL major version 18, every migration
  checksum, schema completeness, and connectivity.
- Railway runs `npm run db:predeploy` before each application deployment when
  `WARDROBE_PERSISTENCE_DRIVER=postgres`.
- `npm run migrate:railway` validates JSON, uploads and hashes referenced media,
  quarantines unreferenced legacy files, imports rows, and writes a resumable
  checkpoint at `/data/.wardrobe-railway-migration.json`.
- `npm run migrate:verify` compares source/destination counts, ownership, object
  sizes and hashes, and AI usage attribution. A non-zero exit blocks cutover.
- `npm run migrate:export-files -- /path` reconstructs the portable legacy tree.
- `storage:inventory`, `storage:verify`, `storage:url -- <asset-id>`, and
  `storage:gc` inspect private objects without exposing credentials.
- `Dockerfile.backup` produces a nightly one-shot backup service. A failed dump,
  verification, upload, restore drill, or mirror exits non-zero and is visible
  as a failed Railway cron run.

## 1. Provision in Amsterdam

1. Create an official Railway PostgreSQL service pinned to
   `ghcr.io/railwayapp-templates/postgres-ssl:18.4`, with its persistent volume
   in Amsterdam.
2. Create private buckets named `wardrobe-media` and `wardrobe-backups` in the
   same region.
3. Reference `DATABASE_URL` and the media bucket variables into the Wardrobe app.
   Map Railway's generated bucket names to the `WARDROBE_MEDIA_S3_*` variables
   documented in `.env.example`.
4. Reference backup-bucket credentials only into PostgreSQL and the backup cron.
   The application must never receive backup-bucket credentials.
5. Generate `WARDROBE_DATA_ENCRYPTION_KEY` with `openssl rand -base64 32`. Store
   it as a sealed app variable and place a recovery copy in a password manager
   outside Railway.
6. Leave both Wardrobe drivers set to `filesystem` and leave the old `/data`
   volume attached. Deploying this code is safe before cutover.

## 2. Configure the three backup layers

In the PostgreSQL service, enable Railway native daily, weekly, and monthly
volume backups. These snapshots stay in Railway-managed snapshot storage. They
do not appear in either bucket and restore only inside the same project and
environment. See [Railway volume backups](https://docs.railway.com/volumes/backups).

Reference the backup bucket into PostgreSQL using the official image contract:

```dotenv
WAL_ARCHIVE_BUCKET=wardrobe-backups
WAL_ARCHIVE_ENDPOINT=<bucket endpoint without a URL path>
WAL_ARCHIVE_REGION=<bucket region>
WAL_ARCHIVE_KEY=<bucket access key>
WAL_ARCHIVE_SECRET=<bucket secret>
WAL_ARCHIVE_PATH=/pgbackrest
WAL_BACKUP_FULL_INTERVAL_HOURS=168
WAL_BACKUP_DIFF_INTERVAL_HOURS=24
WAL_BACKUP_RETENTION_FULL=4
WAL_BACKUP_RETENTION_DIFF=30
```

The official image creates the stanza and writes each independent cluster below
`pgbackrest/cluster-<system-identifier>/`. Check the PostgreSQL logs for stanza
creation, then use `pgbackrest --stanza=main info --output=json` through
`railway ssh` to confirm a full backup and continuous WAL archiving.
The variable contract is maintained by Railway's
[official PostgreSQL image](https://github.com/railwayapp-templates/postgres-ssl#point-in-time-recovery-opt-in).

Create another Railway service from `Dockerfile.backup`, reference the database,
both media-bucket and backup-bucket variable sets, and schedule it nightly in
UTC. It uploads a verified custom-format dump, checksum, and manifest under
`logical/daily/`; keeps 30 daily and 12 monthly sets; restores each new monthly
dump into an isolated temporary database; and mirrors media into
`media-recovery/`. Deleted media remains there for 90 days.

## 3. Rehearse before the maintenance window

Run these against a staging database and staging buckets:

```bash
npm run db:migrate
npm run db:verify
WARDROBE_MIGRATION_SOURCE=/data npm run migrate:railway
WARDROBE_MIGRATION_SOURCE=/data npm run migrate:verify
npm run storage:inventory
npm run storage:verify
```

Create a logical dump, restore it, open an asset through
`npm run storage:url -- <asset-id>`, and test a personal-data export. Repair any
missing source file or ownership mismatch before scheduling production.

## 4. Production maintenance-window cutover

1. Snapshot the application volume and PostgreSQL volume.
2. Set `WARDROBE_MAINTENANCE_MODE=true` and redeploy. Reads, sign-in, health
   checks, and personal exports continue; mutations return a friendly 503.
3. From the Wardrobe service, run:

   ```bash
   railway ssh -- npm run migrate:railway
   railway ssh -- npm run migrate:verify
   railway ssh -- npm run storage:verify
   ```

4. Confirm a fresh logical dump passes `pg_restore --list`, pgBackRest reports a
   healthy archive, and `/readyz` succeeds in a staging/canary app configured
   with the production database and media bucket.
5. Only when every check is green, set:

   ```dotenv
   WARDROBE_PERSISTENCE_DRIVER=postgres
   WARDROBE_OBJECT_STORAGE_DRIVER=s3
   WARDROBE_MAINTENANCE_MODE=false
   ```

6. Redeploy, keeping the existing public domain. Verify Google sign-in, gallery
   media, originals, imports, editing, AI usage, connection sharing, deletion,
   operator signed URLs, and a complete personal-data export.
7. Move the application service to Amsterdam. Snapshot and detach the old
   application volume, but do not delete it.

Any failed verification prevents step 5. Before writes resume, rollback is only
the two driver variables. After writes resume, first run
`migrate:export-files` into a new recovery volume so post-cutover changes are not
lost, then switch drivers.

## 5. Operations and inspection

Railway does not provide a bucket file explorer (see the
[bucket FAQ](https://docs.railway.com/storage-buckets#faq)). Use the safe commands:

```bash
npm run storage:inventory
npm run storage:verify
npm run storage:url -- 00000000-0000-0000-0000-000000000000
npm run storage:gc
```

The URL command prints a browser URL valid for at most five minutes. For visual
browsing, connect Cyberduck, Transmit, or another S3 client with a narrowly
scoped operator credential; do not place that credential in the browser or app
bundle.

Monitor `/healthz`, `/readyz`, failed backup cron runs, `backup_runs`,
`pg_stat_archiver`, pgBackRest status, database/bucket usage, and the storage
outbox. Backup staleness is an alert but intentionally does not make `/readyz`
fail.

## 6. Cleanup after 30 stable days

Perform a point-in-time recovery rehearsal and restore the newest monthly
logical dump. Verify row counts, hashes, authorization isolation, and a personal
export. Then—and only with explicit owner approval—delete the detached legacy
volume. PostgreSQL major upgrades remain manual; the weekly workflow opens an
issue when a newer supported PostgreSQL 18 minor release appears.
