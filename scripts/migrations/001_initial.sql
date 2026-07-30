CREATE TABLE IF NOT EXISTS wardrobe_schema_migrations (
  version integer PRIMARY KEY,
  name text NOT NULL,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wardrobe_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  id text PRIMARY KEY,
  email text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profiles_email_normalized_idx
  ON profiles (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE profile_secrets (
  profile_id text PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  openrouter_key_ciphertext text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE connection_invitations (
  id text PRIMARY KEY,
  requester_user_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_user_id text REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_email text,
  status text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX connection_invitations_recipient_idx
  ON connection_invitations (recipient_user_id, status);

CREATE TABLE connections (
  id text PRIMARY KEY,
  grantor_user_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_user_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX connections_recipient_idx ON connections (recipient_user_id);
CREATE INDEX connections_grantor_idx ON connections (grantor_user_id);

CREATE TABLE garments (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX garments_user_updated_idx ON garments (user_id, updated_at DESC);
CREATE INDEX garments_payload_gin_idx ON garments USING gin (payload);

CREATE TABLE import_jobs (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  upload_id uuid,
  status text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX import_jobs_user_status_idx ON import_jobs (user_id, status);

CREATE TABLE import_upload_history (
  id uuid NOT NULL,
  user_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, user_id)
);
CREATE INDEX import_upload_history_user_updated_idx
  ON import_upload_history (user_id, updated_at DESC);

CREATE TABLE ai_usage (
  id text PRIMARY KEY,
  wardrobe_user_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  billing_user_id text REFERENCES profiles(id) ON DELETE SET NULL,
  provider text NOT NULL,
  model text NOT NULL,
  upstream text,
  fallback_from text,
  operation text NOT NULL,
  operation_group text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  http_status integer,
  provider_request_id text,
  cost numeric(18, 8),
  input_tokens bigint,
  output_tokens bigint,
  total_tokens bigint,
  duration_ms integer,
  upload_id uuid,
  job_id uuid,
  garment_id text,
  plan_id text,
  outfit_id text,
  trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX ai_usage_wardrobe_created_idx
  ON ai_usage (wardrobe_user_id, created_at DESC);
CREATE INDEX ai_usage_billing_created_idx
  ON ai_usage (billing_user_id, created_at DESC);
CREATE INDEX ai_usage_operation_idx
  ON ai_usage (operation_group, operation, created_at DESC);

CREATE TABLE assets (
  id uuid PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  object_key text NOT NULL UNIQUE,
  media_kind text NOT NULL,
  content_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  cache_policy text NOT NULL DEFAULT 'private-no-store',
  original_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX assets_owner_kind_idx
  ON assets (owner_user_id, media_kind) WHERE deleted_at IS NULL;
CREATE INDEX assets_sha256_idx ON assets (sha256);

CREATE TABLE asset_links (
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_id, entity_type, entity_id, role)
);
CREATE INDEX asset_links_entity_idx ON asset_links (entity_type, entity_id);

CREATE TABLE pending_storage_operations (
  id bigserial PRIMARY KEY,
  operation text NOT NULL CHECK (operation IN ('delete', 'copy')),
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  object_key text NOT NULL,
  destination_key text,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pending_storage_operations_due_idx
  ON pending_storage_operations (next_attempt_at)
  WHERE completed_at IS NULL;

CREATE TABLE backup_runs (
  id uuid PRIMARY KEY,
  kind text NOT NULL,
  status text NOT NULL,
  object_key text,
  sha256 text,
  byte_size bigint,
  postgres_version text,
  migration_version integer,
  client_version text,
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error text
);
CREATE INDEX backup_runs_started_idx ON backup_runs (started_at DESC);
