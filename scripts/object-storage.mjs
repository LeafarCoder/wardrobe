import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const FIVE_MINUTES = 300;

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function objectBodyBytes(body) {
  if (typeof body?.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export function normalizeObjectKey(value) {
  const key = String(value || "").replaceAll("\\", "/").replace(/^\/+/, "");
  if (!key || key.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Invalid object key");
  }
  return key;
}

function s3Config(env = process.env, prefix = "WARDROBE_MEDIA") {
  const endpoint = String(env[`${prefix}_S3_ENDPOINT`] || env.AWS_ENDPOINT_URL_S3 || env.AWS_ENDPOINT_URL || "").trim();
  const bucket = String(env[`${prefix}_S3_BUCKET`] || env.S3_BUCKET || env.BUCKET_NAME || "").trim();
  const accessKeyId = String(env[`${prefix}_S3_ACCESS_KEY_ID`] || env.AWS_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(env[`${prefix}_S3_SECRET_ACCESS_KEY`] || env.AWS_SECRET_ACCESS_KEY || "").trim();
  const region = String(env[`${prefix}_S3_REGION`] || env.AWS_REGION || "auto").trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(`${prefix}_S3_ENDPOINT, ${prefix}_S3_BUCKET, and S3 credentials are required`);
  }
  return { endpoint, bucket, accessKeyId, secretAccessKey, region };
}

export class S3ObjectStorage {
  constructor(env = process.env, prefix = "WARDROBE_MEDIA") {
    const config = s3Config(env, prefix);
    this.bucket = config.bucket;
    this.endpoint = config.endpoint;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: String(env[`${prefix}_S3_FORCE_PATH_STYLE`] || "true").toLowerCase() !== "false",
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async ready() {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    return true;
  }

  async put(key, body, metadata = {}) {
    const objectKey = normalizeObjectKey(key);
    const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const digest = metadata.sha256 || sha256(bytes);
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      Body: bytes,
      ContentType: metadata.contentType || "application/octet-stream",
      CacheControl: metadata.cacheControl || "private, no-store",
      Metadata: { sha256: digest, ...(metadata.metadata || {}) },
    }));
    return { key: objectKey, byteSize: bytes.length, sha256: digest };
  }

  async get(key) {
    return this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: normalizeObjectKey(key) }));
  }

  async head(key) {
    const result = await this.client.send(new HeadObjectCommand({
      Bucket: this.bucket,
      Key: normalizeObjectKey(key),
    }));
    return {
      byteSize: Number(result.ContentLength || 0),
      contentType: result.ContentType || "application/octet-stream",
      cacheControl: result.CacheControl || null,
      sha256: result.Metadata?.sha256 || null,
      updatedAt: result.LastModified || null,
    };
  }

  async delete(key) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: normalizeObjectKey(key) }));
  }

  async list(prefix = "") {
    const entries = [];
    let continuationToken;
    do {
      const result = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix ? normalizeObjectKey(prefix) : undefined,
        ContinuationToken: continuationToken,
      }));
      for (const item of result.Contents || []) {
        entries.push({ key: item.Key, byteSize: Number(item.Size || 0), updatedAt: item.LastModified || null });
      }
      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken);
    return entries;
  }

  async signedUrl(key, expiresIn = FIVE_MINUTES) {
    const ttl = Math.max(1, Math.min(FIVE_MINUTES, Number(expiresIn) || FIVE_MINUTES));
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: normalizeObjectKey(key) }),
      { expiresIn: ttl },
    );
  }
}

export class FilesystemObjectStorage {
  constructor(root) {
    this.root = path.resolve(root);
  }

  resolve(key) {
    const objectKey = normalizeObjectKey(key);
    const file = path.resolve(this.root, objectKey);
    if (!file.startsWith(`${this.root}${path.sep}`)) throw new Error("Object key escapes storage root");
    return file;
  }

  async ready() {
    await mkdir(this.root, { recursive: true });
    return true;
  }

  async put(key, body, metadata = {}) {
    const objectKey = normalizeObjectKey(key);
    const file = this.resolve(objectKey);
    const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
    return { key: objectKey, byteSize: bytes.length, sha256: metadata.sha256 || sha256(bytes) };
  }

  async get(key) {
    const file = this.resolve(key);
    return { Body: createReadStream(file), ...(await this.head(key)) };
  }

  async head(key) {
    const file = this.resolve(key);
    const details = await stat(file);
    return {
      byteSize: details.size,
      contentType: "application/octet-stream",
      cacheControl: null,
      sha256: sha256(await readFile(file)),
      updatedAt: details.mtime,
    };
  }

  async delete(key) {
    await rm(this.resolve(key), { force: true });
  }

  async list(prefix = "") {
    const base = prefix ? this.resolve(prefix) : this.root;
    const entries = [];
    const visit = async (directory) => {
      for (const entry of await readdir(directory, { withFileTypes: true }).catch((error) => {
        if (error.code === "ENOENT") return [];
        throw error;
      })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) await visit(file);
        else if (entry.isFile()) {
          const details = await stat(file);
          entries.push({
            key: path.relative(this.root, file).split(path.sep).join("/"),
            byteSize: details.size,
            updatedAt: details.mtime,
          });
        }
      }
    };
    await visit(base);
    return entries;
  }

  async signedUrl() {
    throw new Error("Signed URLs are only available with the s3 object-storage driver");
  }
}

export function createObjectStorage({
  env = process.env,
  root = path.resolve("data", "objects"),
  prefix = "WARDROBE_MEDIA",
} = {}) {
  const driver = String(env.WARDROBE_OBJECT_STORAGE_DRIVER || "filesystem").trim().toLowerCase();
  if (driver === "s3") return new S3ObjectStorage(env, prefix);
  if (driver === "filesystem") return new FilesystemObjectStorage(root);
  throw new Error(`Unsupported WARDROBE_OBJECT_STORAGE_DRIVER: ${driver}`);
}
