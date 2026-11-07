# Private media bucket with JSON metadata

The economical production configuration keeps the small JSON metadata stores on
the existing `/data` volume and stores media in a private Railway S3 bucket. It
does not require PostgreSQL. `media-index.json` on the volume records ownership,
source paths, object keys, sizes, and SHA-256 checksums. Keep it in volume backups
alongside `library.json`, `users.json`, jobs, and the AI usage ledger.

## Migrate an existing volume

1. Create a private Railway bucket in the chosen region. Its region cannot be
   changed later. Configure server-only `WARDROBE_MEDIA_S3_*` references from
   `.env.example`. Newly provisioned Railway buckets use virtual-hosted URLs;
   set `WARDROBE_MEDIA_S3_FORCE_PATH_STYLE=false` for those buckets.
2. Deploy the migration-capable code with both existing drivers still set to
   `filesystem`. The new bucket credentials alone do not change live storage.
3. Run `npm run media:migrate` in the deployed container. It recursively uploads
   images, videos, and PDFs under `imported/`, `profiles/`, and `jobs/`, including
   unreferenced media for preservation. Metadata JSON is not uploaded as media.
   Uploads are resumable and content-addressed; a completed, unchanged upload is
   skipped on subsequent runs. Six bounded workers share one serialized catalog.
   Source files are never deleted.
4. During cutover, use the existing maintenance mode to prevent source changes.
   Run `npm run media:migrate` again, then `npm run media:verify`. Verification
   downloads every source object's bytes and compares SHA-256 and size. Any
   mismatch exits unsuccessfully. The successful verification marker is stored
   in `/data/media-migration.json`.
   A new/failed run invalidates an older success marker. If verification finds
   corrupt bucket bytes, investigate first; `npm run media:migrate -- --force`
   can re-upload the preserved sources before repeating verification.
5. Keep `WARDROBE_PERSISTENCE_DRIVER=filesystem` and change only
   `WARDROBE_OBJECT_STORAGE_DRIVER=s3`. Redeploy, then verify `/readyz`, signed-in
   media, tenant isolation, editing, and personal-data exports before disabling
   maintenance mode. Never expose S3 credentials to browser code.

Existing asset URLs and access checks remain valid. The server authorizes each
request before redirecting to a private URL valid for five minutes. Inline reads
are proxied when needed. Image processing and exports hydrate missing local
files from the bucket, verifying their checksum before use. New media uploads
complete before the JSON record is saved.

## Rollback and cost

The migration intentionally preserves originals on the volume. It therefore
adds a bucket copy initially, rather than immediately reducing volume charges.
Filesystem rollback remains possible while those copies exist. After cutover,
new media is uploaded to the bucket and also retained as a local working copy.
Pruning verified local copies and bounding the hydrated working cache require a
separate, explicit cleanup pass after a suitable rollback window. Do not delete
the JSON catalog or detach the metadata volume.

If rolling back after local copies have been pruned, reconstruct all required
files from the catalog and bucket first. Do not simply switch drivers and assume
every local source still exists. A bucket is not an independent metadata backup.

PostgreSQL plus S3 remains available through the separate migration runbook;
that configuration continues to require S3, while filesystem metadata supports
either local or S3 media.

## User-first bucket layout

New objects use stable asset IDs and an immutable content-version suffix:

```text
<userId>/media/profile/references/<assetId>-<hash16>.jpg
<userId>/media/profile/avatars/<assetId>-<hash16>.webp
<userId>/media/profile/backgrounds/<assetId>-<hash16>.jpg
<userId>/media/garments/<garmentId>/originals/<assetId>-<hash16>.jpg
<userId>/media/garments/<garmentId>/cutouts/<assetId>-<hash16>.png
<userId>/media/garments/<garmentId>/previews/<assetId>-<hash16>.webp
<userId>/media/garments/<garmentId>/thumbnails/<assetId>-<hash16>.webp
<userId>/media/garments/<garmentId>/looks/<lookId>/images/<assetId>-<hash16>.png
<userId>/media/garments/<garmentId>/looks/<lookId>/videos/<assetId>-<hash16>.mp4
<userId>/media/outfits/<outfitId>/looks/<lookId>/images/<assetId>-<hash16>.png
<userId>/media/plans/<planId>/looks/<lookId>/images/<assetId>-<hash16>.png
<userId>/media/processing/<jobId>/crops/<assetId>-<hash16>.png
_unassigned/media/recovery/<assetId>-<hash16>.png
```

Creation dates, complete SHA-256 hashes, original filenames, ownership, and all
entity links belong in the catalog. No date folder is created. A garment's
legacy `import-` prefix is omitted from its bucket directory. Shared source
photos use one deterministic canonical location independent of record order,
with every association retained in the catalog. Unknown ownership is never
guessed, and unassigned recovery media cannot be served through account APIs.

To reorganize an older bucket, deploy this code in maintenance mode and run
`npm run media:reorganize`. It saves a durable rollback catalog and
`media-reorganization.json`, uses server-side S3 COPY, downloads each resulting
object to verify its size and hash, and only then atomically switches the
catalog. IDs, filesystem source paths, and application asset URLs stay stable.
Partial runs can be resumed. Unindexed bucket objects are preserved under
recovery rather than discarded. Originals on the volume remain untouched.

Restart/deploy the runtime to load the new catalog, verify authenticated media
and tenant isolation, then run `npm run media:activate-layout`. This records the
actual runtime cutover and starts the five-minute grace period for earlier
signed URLs. After that period, `npm run media:cleanup-legacy` verifies both old
and new bytes again and retires only exact journal-listed duplicate keys that
are no longer referenced by the current catalog. It never deletes a prefix or
an unknown bucket object wholesale. Source files and the rollback map remain.

After retiring old bucket duplicates, a rollback needs to copy the verified new
objects back to the old keys before restoring the old catalog. Keep the
reorganization journal even after cleanup.
