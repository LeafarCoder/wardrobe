#!/usr/bin/env bash
set -Eeuo pipefail

required() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "$name is required" >&2
    exit 2
  fi
}

required DATABASE_URL
required WARDROBE_BACKUP_S3_ENDPOINT
required WARDROBE_BACKUP_S3_BUCKET
required WARDROBE_BACKUP_S3_ACCESS_KEY_ID
required WARDROBE_BACKUP_S3_SECRET_ACCESS_KEY
required WARDROBE_MEDIA_S3_ENDPOINT
required WARDROBE_MEDIA_S3_BUCKET
required WARDROBE_MEDIA_S3_ACCESS_KEY_ID
required WARDROBE_MEDIA_S3_SECRET_ACCESS_KEY

backup_aws() {
  AWS_ACCESS_KEY_ID="$WARDROBE_BACKUP_S3_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$WARDROBE_BACKUP_S3_SECRET_ACCESS_KEY" \
  AWS_DEFAULT_REGION="${WARDROBE_BACKUP_S3_REGION:-auto}" \
    aws --endpoint-url "$WARDROBE_BACKUP_S3_ENDPOINT" "$@"
}

media_aws() {
  AWS_ACCESS_KEY_ID="$WARDROBE_MEDIA_S3_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$WARDROBE_MEDIA_S3_SECRET_ACCESS_KEY" \
  AWS_DEFAULT_REGION="${WARDROBE_MEDIA_S3_REGION:-auto}" \
    aws --endpoint-url "$WARDROBE_MEDIA_S3_ENDPOINT" "$@"
}

work_dir="$(mktemp -d)"
run_id="$(cat /proc/sys/kernel/random/uuid)"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
stamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
dump_file="$work_dir/wardrobe-$stamp.dump"
checksum_file="$dump_file.sha256"
manifest_file="$dump_file.manifest.json"
daily_key="logical/daily/wardrobe-$stamp"

cleanup() {
  rm -rf "$work_dir"
}
record_failure() {
  local exit_code=$?
  local message="Nightly backup failed with exit code $exit_code"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v run_id="$run_id" -v message="$message" <<'SQL' || true
UPDATE backup_runs
SET status = 'failed', completed_at = now(), error = :'message'
WHERE id = :'run_id'::uuid;
SQL
  cleanup
  exit "$exit_code"
}
trap record_failure ERR
trap cleanup EXIT

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v run_id="$run_id" <<'SQL'
INSERT INTO backup_runs(id, kind, status)
VALUES(:'run_id'::uuid, 'logical-daily', 'running');
SQL

pg_dump --format=custom --no-owner --no-acl --dbname="$DATABASE_URL" --file="$dump_file"
pg_restore --list "$dump_file" > "$work_dir/restore-list.txt"
sha256sum "$dump_file" > "$checksum_file"
dump_sha="$(cut -d' ' -f1 "$checksum_file")"
dump_size="$(stat -c %s "$dump_file")"
postgres_version="$(psql "$DATABASE_URL" -Atqc "SHOW server_version")"
migration_version="$(psql "$DATABASE_URL" -Atqc "SELECT COALESCE(max(version), 0) FROM wardrobe_schema_migrations")"
table_counts="$(psql "$DATABASE_URL" -Atqc \
  "SELECT jsonb_object_agg(name, count) FROM (
     SELECT 'profiles' name, count(*) FROM profiles UNION ALL
     SELECT 'garments', count(*) FROM garments UNION ALL
     SELECT 'jobs', count(*) FROM import_jobs UNION ALL
     SELECT 'usage', count(*) FROM ai_usage UNION ALL
     SELECT 'history', count(*) FROM import_upload_history UNION ALL
     SELECT 'assets', count(*) FROM assets WHERE deleted_at IS NULL
   ) counts")"

jq -n \
  --arg runId "$run_id" \
  --arg createdAt "$started_at" \
  --arg postgresVersion "$postgres_version" \
  --arg migrationVersion "$migration_version" \
  --arg pgDumpVersion "$(pg_dump --version)" \
  --arg pgRestoreVersion "$(pg_restore --version)" \
  --arg awsVersion "$(aws --version 2>&1)" \
  --arg sha256 "$dump_sha" \
  --argjson byteSize "$dump_size" \
  --argjson tableCounts "$table_counts" \
  '{
    runId: $runId,
    createdAt: $createdAt,
    postgresVersion: $postgresVersion,
    migrationVersion: ($migrationVersion | tonumber),
    clients: {pgDump: $pgDumpVersion, pgRestore: $pgRestoreVersion, aws: $awsVersion},
    sha256: $sha256,
    byteSize: $byteSize,
    tableCounts: $tableCounts
  }' > "$manifest_file"

backup_aws s3 cp "$dump_file" "s3://$WARDROBE_BACKUP_S3_BUCKET/$daily_key.dump" --only-show-errors
backup_aws s3 cp "$checksum_file" "s3://$WARDROBE_BACKUP_S3_BUCKET/$daily_key.dump.sha256" --only-show-errors
backup_aws s3 cp "$manifest_file" "s3://$WARDROBE_BACKUP_S3_BUCKET/$daily_key.manifest.json" \
  --content-type application/json --only-show-errors

if [[ "$(date -u +%d)" == "01" ]]; then
  monthly_prefix="logical/monthly/wardrobe-$(date -u +%Y-%m)"
  backup_aws s3 cp "$dump_file" "s3://$WARDROBE_BACKUP_S3_BUCKET/$monthly_prefix.dump" --only-show-errors
  backup_aws s3 cp "$checksum_file" "s3://$WARDROBE_BACKUP_S3_BUCKET/$monthly_prefix.dump.sha256" --only-show-errors
  backup_aws s3 cp "$manifest_file" "s3://$WARDROBE_BACKUP_S3_BUCKET/$monthly_prefix.manifest.json" \
    --content-type application/json --only-show-errors

  restore_db="wardrobe_restore_${run_id//-/}"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v restore_db="$restore_db" \
    -c 'CREATE DATABASE :"restore_db"'
  restore_url="${DATABASE_URL%/*}/$restore_db"
  pg_restore --exit-on-error --no-owner --no-acl --dbname="$restore_url" "$dump_file"
  psql "$restore_url" -v ON_ERROR_STOP=1 -c \
    "SELECT count(*) AS profiles FROM profiles;
     SELECT count(*) AS garments FROM garments;
     SELECT count(*) AS invalid_assets FROM assets WHERE byte_size < 0 OR sha256 !~ '^[a-f0-9]{64}$';"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v restore_db="$restore_db" \
    -c 'DROP DATABASE :"restore_db" WITH (FORCE)'
fi

trim_prefix() {
  local prefix="$1"
  local keep="$2"
  backup_aws s3api list-objects-v2 \
    --bucket "$WARDROBE_BACKUP_S3_BUCKET" \
    --prefix "$prefix" \
    --query 'reverse(sort_by(Contents,&LastModified))[].Key' \
    --output text \
    | tr '\t' '\n' \
    | awk -v keep="$((keep * 3))" 'NR > keep' \
    | while IFS= read -r key; do
        [[ -n "$key" ]] && backup_aws s3 rm "s3://$WARDROBE_BACKUP_S3_BUCKET/$key" --only-show-errors
      done
}
trim_prefix "logical/daily/" 30
trim_prefix "logical/monthly/" 12

psql "$DATABASE_URL" -Atqc \
  "SELECT object_key FROM assets
   WHERE deleted_at IS NULL OR deleted_at > now() - interval '90 days'
   ORDER BY object_key" \
  | while IFS= read -r object_key; do
      [[ -z "$object_key" ]] && continue
      recovery_key="media-recovery/$object_key"
      if ! backup_aws s3api head-object --bucket "$WARDROBE_BACKUP_S3_BUCKET" --key "$recovery_key" >/dev/null 2>&1; then
        media_aws s3 cp "s3://$WARDROBE_MEDIA_S3_BUCKET/$object_key" - --only-show-errors \
          | backup_aws s3 cp - "s3://$WARDROBE_BACKUP_S3_BUCKET/$recovery_key" --only-show-errors
      fi
    done

psql "$DATABASE_URL" -Atqc \
  "SELECT object_key FROM assets WHERE deleted_at <= now() - interval '90 days' ORDER BY object_key" \
  | while IFS= read -r object_key; do
      [[ -n "$object_key" ]] \
        && backup_aws s3 rm "s3://$WARDROBE_BACKUP_S3_BUCKET/media-recovery/$object_key" --only-show-errors
    done

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v run_id="$run_id" \
  -v object_key="$daily_key.dump" \
  -v checksum="$dump_sha" \
  -v byte_size="$dump_size" \
  -v postgres_version="$postgres_version" \
  -v migration_version="$migration_version" \
  -v client_version="$(pg_dump --version)" \
  -v manifest="$(cat "$manifest_file")" <<'SQL'
UPDATE backup_runs
SET status = 'complete',
    object_key = :'object_key',
    sha256 = :'checksum',
    byte_size = :'byte_size'::bigint,
    postgres_version = :'postgres_version',
    migration_version = :'migration_version'::integer,
    client_version = :'client_version',
    manifest = :'manifest'::jsonb,
    completed_at = now()
WHERE id = :'run_id'::uuid;
SQL

trap - ERR
echo "Backup $run_id completed: $daily_key.dump"
