import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import sharp from "sharp";

const API_ROOT = "/api/import/jobs";
const ASSET_ROOT = "/api/import/assets";
const LIBRARY_ASSET_ROOT = "/api/import/library";
const USERS_ROOT = "/api/users";
const EXPORT_ROOT = "/api/export";
const AUTH_COOKIE = "wardrobe_session";
const AUTH_CONTEXT = "wardrobe-access-v1";
const STAGES = new Set(["crop", "garment", "modeled"]);
const DECISIONS = new Set(["approve", "reject"]);
const PARTS = new Set(["upperbody", "wholebody_up", "lowerbody", "accessories_up", "shoes"]);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const USER_ID = /^(?:default|[a-f0-9-]{36})$/i;
const TAR_BLOCK_SIZE = 512;
const ANALYSIS_PROMPT = "Identify every distinct wearable clothing item visible in this image. A photo may show one isolated garment or a person wearing several items. Return one record per actual item that should enter a wardrobe. Ignore the person's body and non-wearable background objects. For each item, include a tight bounding box around only that item using integer coordinates normalized to a 1000 by 1000 image: x and y are the top-left corner, followed by width and height. Boxes may overlap when garments overlap, but each box must focus on one distinct item. Use only these category ids: upperbody, wholebody_up, lowerbody, accessories_up, shoes. Suggest a concise specific name, primary hex color, optional genuinely distinct secondary hex color, and 1-4 useful lowercase detail tags.";
const WARDROBE_ITEMS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      minItems: 0,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          part: { type: "string", enum: [...PARTS] },
          color: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
          secondaryColor: { anyOf: [{ type: "string", pattern: "^#[0-9A-Fa-f]{6}$" }, { type: "null" }] },
          tags: { type: "array", items: { type: "string" }, maxItems: 4 },
          boundingBox: {
            type: "object",
            additionalProperties: false,
            properties: {
              x: { type: "integer", minimum: 0, maximum: 999 },
              y: { type: "integer", minimum: 0, maximum: 999 },
              width: { type: "integer", minimum: 1, maximum: 1000 },
              height: { type: "integer", minimum: 1, maximum: 1000 },
            },
            required: ["x", "y", "width", "height"],
          },
        },
        required: ["name", "part", "color", "secondaryColor", "tags", "boundingBox"],
      },
    },
  },
  required: ["items"],
};

function json(res, status, value) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(value));
}

function apiError(message, status, code, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { status, code });
}

function parseCookies(header = "") {
  return Object.fromEntries(String(header).split(";").map((part) => {
    const separator = part.indexOf("=");
    if (separator < 0) return [part.trim(), ""];
    return [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
  }).filter(([name]) => name));
}

function passwordToken(password) {
  return createHmac("sha256", password).update(AUTH_CONTEXT).digest("base64url");
}

function createSessionToken(password, issuedAt = Date.now()) {
  const timestamp = String(issuedAt);
  const signature = createHmac("sha256", password).update(`${AUTH_CONTEXT}:${timestamp}`).digest("base64url");
  return `${timestamp}.${signature}`;
}

function validSessionToken(token, password) {
  const [timestamp, signature, extra] = String(token || "").split(".");
  const issuedAt = Number(timestamp);
  if (extra || !Number.isFinite(issuedAt) || issuedAt > Date.now() + 60_000 || Date.now() - issuedAt > 30 * 24 * 60 * 60 * 1000) return false;
  const expected = createHmac("sha256", password).update(`${AUTH_CONTEXT}:${timestamp}`).digest("base64url");
  return safeEqual(signature, expected);
}

function safeEqual(first, second) {
  const left = Buffer.from(String(first));
  const right = Buffer.from(String(second));
  return left.length === right.length && timingSafeEqual(left, right);
}

function tarString(target, offset, length, value) {
  const encoded = Buffer.from(String(value));
  if (encoded.length > length) throw new Error(`Backup path is too long: ${value}`);
  encoded.copy(target, offset);
}

function tarOctal(target, offset, length, value) {
  tarString(target, offset, length, `${Math.max(0, value).toString(8).padStart(length - 1, "0")}\0`);
}

function tarPath(value) {
  const encoded = Buffer.byteLength(value);
  if (encoded <= 100) return { name: value, prefix: "" };
  for (let index = value.lastIndexOf("/"); index > 0; index = value.lastIndexOf("/", index - 1)) {
    const prefix = value.slice(0, index);
    const name = value.slice(index + 1);
    if (Buffer.byteLength(name) <= 100 && Buffer.byteLength(prefix) <= 155) return { name, prefix };
  }
  throw new Error(`Backup path is too long: ${value}`);
}

function tarHeader(name, size, modifiedAt = Date.now()) {
  const header = Buffer.alloc(TAR_BLOCK_SIZE);
  const archivePath = tarPath(name);
  tarString(header, 0, 100, archivePath.name);
  tarOctal(header, 100, 8, 0o600);
  tarOctal(header, 108, 8, 0);
  tarOctal(header, 116, 8, 0);
  tarOctal(header, 124, 12, size);
  tarOctal(header, 136, 12, Math.floor(modifiedAt / 1000));
  header.fill(0x20, 148, 156);
  tarString(header, 156, 1, "0");
  tarString(header, 257, 6, "ustar\0");
  tarString(header, 263, 2, "00");
  tarString(header, 265, 32, "wardrobe");
  tarString(header, 297, 32, "wardrobe");
  if (archivePath.prefix) tarString(header, 345, 155, archivePath.prefix);
  const checksum = header.reduce((total, byte) => total + byte, 0);
  tarString(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  return header;
}

function tarPadding(size) {
  const remainder = size % TAR_BLOCK_SIZE;
  return remainder ? Buffer.alloc(TAR_BLOCK_SIZE - remainder) : null;
}

async function* backupFiles(directory, relative = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((first, second) => first.name.localeCompare(second.name));
  for (const entry of entries) {
    if (entry.name.endsWith(".tmp") || entry.isSymbolicLink()) continue;
    const absolute = path.join(directory, entry.name);
    const childRelative = relative ? path.join(relative, entry.name) : entry.name;
    if (entry.isDirectory()) {
      yield* backupFiles(absolute, childRelative);
      continue;
    }
    if (!entry.isFile()) continue;
    const details = await lstat(absolute);
    if (!details.isFile()) continue;
    yield {
      absolute,
      archivePath: path.posix.join("wardrobe-data", "data", ...childRelative.split(path.sep)),
      modifiedAt: details.mtimeMs,
      size: details.size,
    };
  }
}

async function* personalDataArchive(dataDirectory) {
  const restoreInstructions = Buffer.from([
    "WARDROBE PERSONAL DATA BACKUP",
    "",
    "This archive contains every Wardrobe profile, reference photo, clothing image,",
    "original upload, modeled image, metadata record, and unfinished import stored",
    "by this Wardrobe instance. API keys and the access password are not included.",
    "",
    "RESTORE LOCALLY",
    "1. Install or clone the same Wardrobe application and stop it if it is running.",
    "2. Move its existing data directory somewhere safe as a backup.",
    "3. Copy the data directory beside this file into the Wardrobe project root.",
    "4. Create .env from .env.example and add your own OpenRouter or OpenAI key.",
    "5. Run npm install, then npm run dev.",
    "",
    "Wait for active imports to finish before creating a backup for the cleanest snapshot.",
    "",
  ].join("\n"));
  yield tarHeader("wardrobe-data/RESTORE.txt", restoreInstructions.length);
  yield restoreInstructions;
  const instructionsPadding = tarPadding(restoreInstructions.length);
  if (instructionsPadding) yield instructionsPadding;

  for await (const file of backupFiles(dataDirectory)) {
    yield tarHeader(file.archivePath, file.size, file.modifiedAt);
    for await (const chunk of createReadStream(file.absolute)) yield chunk;
    const padding = tarPadding(file.size);
    if (padding) yield padding;
  }
  yield Buffer.alloc(TAR_BLOCK_SIZE * 2);
}

function providerResponseError(response, result, { provider, model, operation }) {
  const code = result.error?.code || result.error?.type || result.code || `${provider.id}_request_failed`;
  const detail = result.error?.message || result.message || result.detail || "";
  const signal = `${code} ${detail}`;
  const label = provider.label;
  if (response.status === 401) {
    return apiError(`${label} rejected the API key. Check ${provider.keyEnv} in .env, make sure the key is active, then restart the app.`, 401, `${provider.id}_invalid_key`);
  }
  if (response.status === 402 || /insufficient[_ ]credits?|payment required|credit balance/i.test(signal)) {
    return apiError(`The ${label} account has no available credit. Check its credits and spending limits, then try again.`, 402, `${provider.id}_credits_exhausted`);
  }
  if (/zero.data.retention|\bZDR\b|data polic|no endpoints.*privacy/i.test(signal)) {
    return apiError(`${label} could not find a zero-data-retention route for ${model}. Choose a ZDR-capable model, adjust the account privacy settings, or set OPENROUTER_ZDR=false if you accept provider retention.`, 400, "openrouter_zdr_unavailable");
  }
  if (response.status === 403) {
    return apiError(`${label} denied access to ${model}. Check the API key's model permissions or choose another model in .env.`, 403, `${provider.id}_model_forbidden`);
  }
  if (response.status === 404 || /model.*(not found|does not exist)/i.test(detail)) {
    return apiError(`${label} could not find or access ${model}. Check the model name in .env, then restart the app.`, 400, `${provider.id}_model_not_found`);
  }
  if (response.status === 429 && /insufficient_quota|quota|billing|credits/i.test(signal)) {
    return apiError(`The ${label} account has no available credit. Check its credits and spending limits, then try again.`, 429, `${provider.id}_quota_exceeded`);
  }
  if (response.status === 429) {
    return apiError(`${label} is receiving too many requests right now. Wait a moment and try again.`, 429, `${provider.id}_rate_limited`);
  }
  if (response.status >= 500) {
    return apiError(`${label} or its upstream model provider is temporarily unavailable. Wait a moment and try again.`, 502, `${provider.id}_unavailable`);
  }
  const fallback = operation === "analysis"
    ? `${label} could not analyze this image.`
    : `${label} could not generate the requested image.`;
  return apiError(detail ? `${fallback} ${detail}` : fallback, 400, code);
}

function providerNetworkError(error, provider) {
  return apiError(`The app could not reach ${provider.label}. Check your internet connection and ${provider.baseUrlEnv}, then try again.`, 502, `${provider.id}_unreachable`, error);
}

function usageNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function cleanLogValue(value) {
  return String(value).replace(/[\r\n|]+/g, " ").trim();
}

function formatByteSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function logAiCall({ provider, model, operation, response, result = {}, startedAt, trace = {}, networkError = null }) {
  const usage = result.usage && typeof result.usage === "object" ? result.usage : {};
  const inputTokens = usageNumber(usage.input_tokens, usage.prompt_tokens);
  const outputTokens = usageNumber(usage.output_tokens, usage.completion_tokens);
  const totalTokens = usageNumber(
    usage.total_tokens,
    inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null,
  );
  const cost = usageNumber(usage.cost, usage.total_cost, result.cost);
  const durationMs = Math.max(0, Date.now() - startedAt);
  const upstream = [
    result.provider,
    result.provider_name,
    response?.headers?.get("x-openrouter-provider"),
  ].find((value) => typeof value === "string" && value.trim());
  const requestId = [
    result.id,
    response?.headers?.get("x-request-id"),
    response?.headers?.get("x-openrouter-generation-id"),
  ].find((value) => typeof value === "string" && value.trim());
  const completed = Boolean(response?.ok) && !networkError;
  const parts = [
    `${operation} ${completed ? "completed" : "failed"}`,
    `provider=${cleanLogValue(provider.label)}`,
    `model=${cleanLogValue(model)}`,
    upstream ? `upstream=${cleanLogValue(upstream)}` : null,
    trace.route ? `route=${cleanLogValue(trace.route)}` : null,
    trace.itemName ? `item=${JSON.stringify(cleanLogValue(trace.itemName))}` : null,
    trace.jobId ? `job=${cleanLogValue(trace.jobId)}` : null,
    trace.attempt ? `attempt=${trace.attempt}` : null,
    trace.personReferenceCount ? `person_refs=${trace.personReferenceCount}` : null,
    response ? `status=${response.status}` : "status=network_error",
    `duration=${(durationMs / 1000).toFixed(2)}s`,
    trace.payloadBytes ? `payload=${formatByteSize(trace.payloadBytes)}` : null,
    inputTokens !== null ? `input=${inputTokens.toLocaleString("en-US")} tok` : null,
    outputTokens !== null ? `output=${outputTokens.toLocaleString("en-US")} tok` : null,
    totalTokens !== null ? `total=${totalTokens.toLocaleString("en-US")} tok` : null,
    cost !== null ? `cost=$${cost.toFixed(6)}` : null,
    requestId ? `request=${cleanLogValue(requestId)}` : null,
    networkError ? `error=${JSON.stringify(cleanLogValue(networkError.message || "Network request failed"))}` : null,
    networkError?.cause?.code ? `cause=${cleanLogValue(networkError.cause.code)}` : null,
    networkError?.cause?.message ? `cause_detail=${JSON.stringify(cleanLogValue(networkError.cause.message))}` : null,
  ].filter(Boolean);
  (completed ? console.info : console.error)(`[wardrobe:ai] ${parts.join(" | ")}`);
}

function publicError(error, statusCode) {
  if (error.code === "ENOENT") return { error: "The requested file could not be found.", code: "file_not_found" };
  if (/unsupported image|input buffer|corrupt|invalid image|pngload_buffer|jpe?gload_buffer|webpload_buffer|libspng/i.test(error.message)) {
    return { error: "The app could not read that image. Try a JPEG, PNG, or WebP file.", code: "invalid_image" };
  }
  if (statusCode < 500 || error.status) return { error: error.message, ...(error.code ? { code: error.code } : {}) };
  return { error: "The import failed on the server. Check the terminal for details and try again.", code: "internal_error" };
}

async function body(req, limit = 25 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("Request body too large"), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("Expected a JSON request body"), { status: 400 }); }
}

function withUser(url, userId) {
  if (!url || !userId || !url.startsWith("/api/")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}user=${encodeURIComponent(userId)}`;
}

function publicJob(job) {
  const copy = structuredClone(job);
  delete copy.internal;
  copy.originalAssetUrl = withUser(copy.originalAssetUrl, copy.userId);
  for (const stage of Object.values(copy.stages || {})) {
    stage.assetUrl = withUser(stage.assetUrl, copy.userId);
    stage.failedAssetUrl = withUser(stage.failedAssetUrl, copy.userId);
    stage.cleanupPreviewUrl = withUser(stage.cleanupPreviewUrl, copy.userId);
  }
  return copy;
}

function extension(mime = "image/png") {
  return ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" })[mime] || "png";
}

function decodeImage(input) {
  const raw = input.imageDataUrl || input.imageBase64;
  if (!raw || typeof raw !== "string") throw Object.assign(new Error("imageDataUrl or imageBase64 is required"), { status: 400 });
  const match = raw.match(/^data:([^;]+);base64,(.+)$/s);
  const mime = match?.[1] || input.mimeType || "image/png";
  const data = Buffer.from(match?.[2] || raw, "base64");
  if (!data.length) throw Object.assign(new Error("Image payload is empty"), { status: 400 });
  return { data, mime };
}

function normalizeMetadata(value = {}) {
  const metadata = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const color = typeof metadata.color === "string" && HEX_COLOR.test(metadata.color) ? metadata.color.toLowerCase() : "#d8d0c2";
  const secondaryColor = typeof metadata.secondaryColor === "string" && HEX_COLOR.test(metadata.secondaryColor) ? metadata.secondaryColor.toLowerCase() : null;
  return {
    name: typeof metadata.name === "string" ? metadata.name.trim().slice(0, 120) || "New piece" : "New piece",
    part: PARTS.has(metadata.part) ? metadata.part : "upperbody",
    color,
    secondaryColor,
    tags: Array.isArray(metadata.tags) ? metadata.tags.filter((tag) => typeof tag === "string").map((tag) => tag.trim().toLowerCase().slice(0, 40)).filter(Boolean).slice(0, 12) : [],
    boundingBox: normalizeBoundingBox(metadata.boundingBox),
  };
}

function normalizeBoundingBox(value = {}) {
  const box = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const number = (key, fallback) => Number.isFinite(Number(box[key])) ? Math.round(Number(box[key])) : fallback;
  const x = Math.max(0, Math.min(999, number("x", 0)));
  const y = Math.max(0, Math.min(999, number("y", 0)));
  const width = Math.max(1, Math.min(1000 - x, number("width", 1000 - x)));
  const height = Math.max(1, Math.min(1000 - y, number("height", 1000 - y)));
  return { x, y, width, height };
}

async function normalizeImage(bytes) {
  return sharp(bytes).rotate().toColorspace("srgb").png().toBuffer();
}

async function prepareProviderImage(bytes, maxEdge = 2048) {
  const image = sharp(bytes).rotate().toColorspace("srgb");
  const metadata = await image.metadata();
  const resized = image.resize(maxEdge, maxEdge, {
    fit: "inside",
    withoutEnlargement: true,
  });
  if (metadata.hasAlpha) {
    return {
      data: await resized.png({ compressionLevel: 9 }).toBuffer(),
      mime: "image/png",
      extension: ".png",
    };
  }
  return {
    data: await resized.jpeg({ quality: 90, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer(),
    mime: "image/jpeg",
    extension: ".jpg",
  };
}

async function cropDetectedItem(bytes, boundingBox) {
  const normalized = await normalizeImage(bytes);
  const { width, height } = await sharp(normalized).metadata();
  const box = normalizeBoundingBox(boundingBox);
  const rawLeft = (box.x / 1000) * width;
  const rawTop = (box.y / 1000) * height;
  const rawWidth = (box.width / 1000) * width;
  const rawHeight = (box.height / 1000) * height;
  const padding = Math.max(12, Math.round(Math.max(rawWidth, rawHeight) * 0.08));
  const left = Math.max(0, Math.floor(rawLeft - padding));
  const top = Math.max(0, Math.floor(rawTop - padding));
  const right = Math.min(width, Math.ceil(rawLeft + rawWidth + padding));
  const bottom = Math.min(height, Math.ceil(rawTop + rawHeight + padding));
  return sharp(normalized).extract({ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }).png().toBuffer();
}

function chooseChromaKey(primary = "#808080") {
  const value = HEX_COLOR.test(primary) ? primary : "#808080";
  const source = [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  const candidates = [[0, 255, 0], [255, 0, 255], [0, 255, 255]];
  const selected = candidates.sort((a, b) => {
    const distance = (color) => color.reduce((total, channel, index) => total + ((channel - source[index]) ** 2), 0);
    return distance(b) - distance(a);
  })[0];
  return `#${selected.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

export function buildGarmentPrompt(metadata = {}, chromaKey = "#00ff00") {
  const name = metadata.name || "clothing item";
  const category = metadata.part || "wardrobe item";
  const primary = metadata.color || "the exact visible color";
  const secondary = metadata.secondaryColor ? ` with distinct secondary color ${metadata.secondaryColor}` : "";
  const details = Array.isArray(metadata.tags) && metadata.tags.length
    ? metadata.tags.join(", ")
    : "all visible construction and design details";

  return `Use case: background-extraction
Asset type: ecommerce catalog product cutout source

Input image: The reference photograph shows the exact garment, either by itself or worn by a person. Use it only to identify and reconstruct the garment.

Primary request: Reconstruct ONLY the complete empty ${name} (${category}) as a clean, front-facing ecommerce catalog product photograph. If a wearer is present, remove them. Remove every other garment, object, and background element. Show the complete item naturally arranged and symmetrical, with no person, body, mannequin, or hanger visible.

Garment fidelity: Preserve the reference garment's exact primary color ${primary}${secondary}, material and texture, silhouette, neckline, sleeves, fastenings, pattern, and distinctive details (${details}). Preserve any clearly legible existing graphic or logo exactly, but do not invent or reinterpret uncertain logos, text, pockets, seams, hardware, colors, or decoration.

Composition: Centered straight-on product view. Keep the entire garment inside the frame with generous, even padding on every side. No cropping or truncation.

Background: Perfectly flat, absolutely uniform solid ${chromaKey} chroma-key color, edge-to-edge. No shadows, gradient, texture, vignette, floor, horizon, reflection, or lighting variation.

Lighting: Neutral diffuse product lighting contained on the garment only.

Avoid: person, body, skin, hair, mannequin, hanger, props, other garments, retail tags, cast shadow, contact shadow, reflection, watermark, caption, border, background variation, or chroma spill.

Critical: Use no ${chromaKey} anywhere in the garment. Produce exactly one complete garment with a crisp, separable outer silhouette.`;
}

export function buildModeledPrompt(personReferenceCount = 1, profile = {}, metadata = {}) {
  const count = Math.max(1, Math.min(3, Math.round(personReferenceCount)));
  const personImages = count === 1
    ? "Image 1 is the identity reference for the person."
    : `Images 1 through ${count} are complementary identity references of the same person. Use them together to preserve one consistent person; do not blend identities, duplicate the person, or copy the reference poses and backgrounds.`;
  const garmentImage = count + 1;
  const categoryDirection = metadata.part === "shoes"
    ? "The featured item is footwear. Compose this as a conventional retail fashion editorial: show the complete person in ordinary daywear, standing naturally in a head-to-toe view, with both pieces of footwear fully visible and worn normally. Keep the footwear prominent through framing and pose rather than an isolated body-part close-up. Preserve the person's apparent age exactly from the identity references."
    : "";
  const profileDetails = [
    profile.name ? `The wardrobe owner is ${profile.name}.` : null,
    profile.age ? `They are ${profile.age} years old.` : null,
    profile.fashionStyle ? `Preferred fashion style: ${profile.fashionStyle}.` : null,
    profile.sizes ? `Sizing and fit context: ${profile.sizes}.` : null,
    profile.preferences ? `Personal styling preferences and constraints: ${profile.preferences}.` : null,
  ].filter(Boolean).join(" ");

  return `Create a professional horizontal 3:2 editorial fashion photograph. ${personImages} Image ${garmentImage} is the exact garment reference. Show that person wearing that garment. ${categoryDirection} ${profileDetails} Preserve the person's recognizable identity, face, hair, age, skin tone, and proportions across the references. Preserve every garment color, material, fit, construction, graphic, logo, and distinctive detail. Keep the complete featured item clearly visible and unobstructed. Respect the owner's stated style, sizing, and preferences when choosing understated supporting clothes and the setting. Use realistic anatomy, natural light, authentic fabric, a tasteful real-world setting, and leave environmental space around the model. Show exactly one person. No text, watermark, product mockup, collage, split screen, or synthetic appearance.`;
}

function cleanupTolerance(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(18, Math.min(110, Math.round(parsed))) : 46;
}

function removeKeyedSpill(data, index, keyedChannels, neutralLevel) {
  let remaining = Math.ceil(keyedChannels.reduce((total, channel) => total + data[index + channel], 0) - (neutralLevel * keyedChannels.length));
  let active = keyedChannels.filter((channel) => data[index + channel] > 0);
  while (remaining > 0 && active.length) {
    const share = Math.ceil(remaining / active.length);
    const next = [];
    for (const channel of active) {
      const reduction = Math.min(data[index + channel], share, remaining);
      data[index + channel] -= reduction;
      remaining -= reduction;
      if (data[index + channel] > 0) next.push(channel);
    }
    active = next;
  }
}

export async function processChromaBackground(bytes, key, options = {}) {
  const tolerance = cleanupTolerance(options.tolerance);
  const feather = 80;
  const target = [1, 3, 5].map((offset) => Number.parseInt(key.slice(offset, offset + 2), 16));
  const keyedChannels = target.map((channel, index) => channel > 200 ? index : null).filter((index) => index !== null);
  const neutralChannels = target.map((channel, index) => channel < 55 ? index : null).filter((index) => index !== null);
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let index = 0; index < data.length; index += 4) {
    const distance = Math.sqrt(
      ((data[index] - target[0]) ** 2)
      + ((data[index + 1] - target[1]) ** 2)
      + ((data[index + 2] - target[2]) ** 2),
    );
    if (distance <= tolerance) {
      data[index] = 0;
      data[index + 1] = 0;
      data[index + 2] = 0;
      data[index + 3] = 0;
    } else {
      if (distance < tolerance + feather) data[index + 3] = Math.round(data[index + 3] * ((distance - tolerance) / feather));
      const keyedLevel = keyedChannels.reduce((total, channel) => total + data[index + channel], 0) / keyedChannels.length;
      const neutralLevel = neutralChannels.reduce((total, channel) => total + data[index + channel], 0) / neutralChannels.length;
      const spill = Math.max(0, keyedLevel - neutralLevel);
      if (spill > 0) {
        const spillAlpha = Math.max(0, 1 - (Math.max(0, spill - 4) / 150));
        data[index + 3] = Math.round(data[index + 3] * spillAlpha);
        removeKeyedSpill(data, index, keyedChannels, neutralLevel);
      }
      if (data[index + 3] <= 8) {
        data[index] = 0;
        data[index + 1] = 0;
        data[index + 2] = 0;
        data[index + 3] = 0;
      }
    }
  }
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;
    const keyedLevel = keyedChannels.reduce((total, channel) => total + data[index + channel], 0) / keyedChannels.length;
    const neutralLevel = neutralChannels.reduce((total, channel) => total + data[index + channel], 0) / neutralChannels.length;
    const residualSpill = Math.max(0, keyedLevel - neutralLevel);
    if (residualSpill > 0) {
      removeKeyedSpill(data, index, keyedChannels, neutralLevel);
    }
  }
  const keyedOutput = await sharp(data, { raw: info }).png().toBuffer();
  const framedOutput = await frameTransparentGarment(keyedOutput);
  const { data: framedData, info: framedInfo } = await sharp(framedOutput).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let index = 0; index < framedData.length; index += 4) {
    if (framedData[index + 3] === 0) continue;
    const keyedLevel = keyedChannels.reduce((total, channel) => total + framedData[index + channel], 0) / keyedChannels.length;
    const neutralLevel = neutralChannels.reduce((total, channel) => total + framedData[index + channel], 0) / neutralChannels.length;
    const residualSpill = Math.max(0, keyedLevel - neutralLevel);
    if (residualSpill <= 0) continue;
    removeKeyedSpill(framedData, index, keyedChannels, neutralLevel);
  }
  const output = await sharp(framedData, { raw: framedInfo }).png().toBuffer();
  const verification = await verifyNoChromaSpill(output, key);
  return { bytes: output, verification, tolerance };
}

export async function removeChromaBackground(bytes, key, options = {}) {
  const result = await processChromaBackground(bytes, key, options);
  if (options.strict !== false && result.verification.contaminatedPixels > 1) {
    throw new Error(`Background cleanup left ${result.verification.contaminatedPixels} chroma-contaminated pixels`);
  }
  return result.bytes;
}

export async function frameTransparentGarment(bytes, canvasSize = 1024, occupancy = 0.88) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
    if (data[index + 3] <= 8) continue;
    const x = pixel % info.width;
    const y = Math.floor(pixel / info.width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (maxX < minX || maxY < minY) throw new Error("Background removal did not leave a visible garment");

  const trimmed = await sharp(data, { raw: info })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .png()
    .toBuffer();
  const targetSize = Math.max(1, Math.round(canvasSize * Math.max(0.5, Math.min(0.96, occupancy))));
  const resized = await sharp(trimmed)
    .resize(targetSize, targetSize, { fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer({ resolveWithObject: true });
  const left = Math.floor((canvasSize - resized.info.width) / 2);
  const top = Math.floor((canvasSize - resized.info.height) / 2);
  return sharp({ create: { width: canvasSize, height: canvasSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized.data, left, top }])
    .png()
    .toBuffer();
}

async function verifyNoChromaSpill(bytes, key) {
  const target = [1, 3, 5].map((offset) => Number.parseInt(key.slice(offset, offset + 2), 16));
  const keyedChannels = target.map((channel, index) => channel > 200 ? index : null).filter((index) => index !== null);
  const neutralChannels = target.map((channel, index) => channel < 55 ? index : null).filter((index) => index !== null);
  const { data } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let contaminatedPixels = 0;
  let maxSpill = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;
    const keyedLevel = keyedChannels.reduce((total, channel) => total + data[index + channel], 0) / keyedChannels.length;
    const neutralLevel = neutralChannels.reduce((total, channel) => total + data[index + channel], 0) / neutralChannels.length;
    const spill = Math.max(0, keyedLevel - neutralLevel);
    maxSpill = Math.max(maxSpill, spill);
    if (spill > 1.5) contaminatedPixels += 1;
  }
  return { contaminatedPixels, maxSpill };
}

async function atomicJson(file, value) {
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  try {
    await rename(tmp, file);
  } catch (error) {
    if (!["EBUSY", "EXDEV", "EPERM"].includes(error.code)) {
      await rm(tmp, { force: true });
      throw error;
    }
    await copyFile(tmp, file);
    await rm(tmp, { force: true });
  }
}

function stageState() {
  return { status: "pending", decision: null, attempts: 0, assetUrl: null, failedAssetUrl: null, cleanupPreviewUrl: null, cleanupTolerance: 46, cleanupDiagnostics: null, error: null, prompt: null, updatedAt: null };
}

function parseWardrobeItems(outputText, provider) {
  if (!outputText) throw apiError(`${provider.label} analysis returned no structured result.`, 502, `${provider.id}_empty_analysis`);
  const cleaned = outputText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw apiError(`${provider.label} returned an unreadable clothing list. Try the import again or choose another vision model.`, 502, `${provider.id}_invalid_analysis`, error);
  }
  if (!Array.isArray(parsed.items)) {
    throw apiError(`${provider.label} returned an invalid clothing list. Try the import again or choose another vision model.`, 502, `${provider.id}_invalid_analysis`);
  }
  return parsed.items;
}

function openRouterHeaders(provider) {
  return {
    Authorization: `Bearer ${provider.key}`,
    "Content-Type": "application/json",
    "X-OpenRouter-Title": "Wardrobe",
  };
}

function openRouterImageRouting(provider, model) {
  const configured = provider.imageProvider
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const only = configured.length
    ? configured
    : provider.zdr && model.startsWith("google/")
      ? ["google-vertex/global"]
      : [];
  return only.length ? { only, allow_fallbacks: false } : undefined;
}

async function openAIEdit({ provider, model, prompt, images, size, background, quality, operation = "generation", trace }) {
  const form = new FormData();
  form.set("model", model);
  form.set("prompt", prompt);
  form.set("size", size);
  form.set("quality", quality || "high");
  form.set("output_format", "png");
  if (background) form.set("background", background);
  let payloadBytes = 0;
  for (const [index, image] of images.entries()) {
    const prepared = await prepareProviderImage(image.data);
    const stem = (image.name || `image-${index + 1}`).replace(/\.[^.]+$/, "");
    payloadBytes += prepared.data.length;
    form.append("image[]", new Blob([prepared.data], { type: prepared.mime }), `${stem}${prepared.extension}`);
  }
  const callTrace = { ...trace, payloadBytes };
  let response;
  const startedAt = Date.now();
  try {
    response = await fetch(`${provider.baseUrl}/images/edits`, {
      method: "POST", headers: { Authorization: `Bearer ${provider.key}` }, body: form,
    });
  } catch (error) {
    logAiCall({ provider, model, operation, startedAt, trace: callTrace, networkError: error });
    throw providerNetworkError(error, provider);
  }
  const result = await response.json().catch(() => ({}));
  logAiCall({ provider, model, operation, response, result, startedAt, trace: callTrace });
  if (!response.ok) throw providerResponseError(response, result, { provider, model, operation: "generation" });
  const encoded = result.data?.[0]?.b64_json;
  if (!encoded) throw apiError("OpenAI returned no image data. Try the generation again.", 502, "openai_empty_image");
  return Buffer.from(encoded, "base64");
}

async function openRouterEdit({ provider, model, prompt, images, size, background, quality, operation = "generation", trace }) {
  const inputReferences = await Promise.all(images.map(async (image) => {
    const prepared = await prepareProviderImage(image.data);
    return {
      type: "image_url",
      image_url: { url: `data:${prepared.mime};base64,${prepared.data.toString("base64")}` },
    };
  }));
  const request = {
    model,
    prompt,
    n: 1,
    resolution: "1K",
    aspect_ratio: size === "1536x1024" ? "3:2" : "1:1",
    input_references: inputReferences,
  };
  if (quality && quality !== "auto") request.quality = quality;
  if (background) request.background = background;
  const routing = openRouterImageRouting(provider, model);
  if (routing) request.provider = routing;
  const requestBody = JSON.stringify(request);
  const callTrace = routing?.only?.length
    ? { ...trace, route: routing.only.join(","), payloadBytes: Buffer.byteLength(requestBody) }
    : { ...trace, payloadBytes: Buffer.byteLength(requestBody) };

  let response;
  const startedAt = Date.now();
  try {
    response = await fetch(`${provider.baseUrl}/images`, {
      method: "POST",
      headers: openRouterHeaders(provider),
      body: requestBody,
    });
  } catch (error) {
    logAiCall({ provider, model, operation, startedAt, trace: callTrace, networkError: error });
    throw providerNetworkError(error, provider);
  }
  const result = await response.json().catch(() => ({}));
  logAiCall({ provider, model, operation, response, result, startedAt, trace: callTrace });
  if (!response.ok) throw providerResponseError(response, result, { provider, model, operation: "generation" });
  const encoded = result.data?.[0]?.b64_json;
  if (!encoded) throw apiError("OpenRouter returned no image data. Try the generation again.", 502, "openrouter_empty_image");
  return normalizeImage(Buffer.from(encoded, "base64"));
}

async function openAIAnalyze({ provider, model, image, mime }) {
  const requestBody = JSON.stringify({
    model,
    input: [{ role: "user", content: [
      { type: "input_text", text: ANALYSIS_PROMPT },
      { type: "input_image", image_url: `data:${mime};base64,${image.toString("base64")}` },
    ] }],
    text: { format: { type: "json_schema", name: "wardrobe_items", strict: true, schema: WARDROBE_ITEMS_SCHEMA } },
  });
  const trace = { payloadBytes: Buffer.byteLength(requestBody) };
  let response;
  const startedAt = Date.now();
  try {
    response = await fetch(`${provider.baseUrl}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${provider.key}`, "Content-Type": "application/json" },
      body: requestBody,
    });
  } catch (error) {
    logAiCall({ provider, model, operation: "analysis", startedAt, trace, networkError: error });
    throw providerNetworkError(error, provider);
  }
  const result = await response.json().catch(() => ({}));
  logAiCall({ provider, model, operation: "analysis", response, result, startedAt, trace });
  if (!response.ok) throw providerResponseError(response, result, { provider, model, operation: "analysis" });
  const outputText = result.output_text || result.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  return parseWardrobeItems(outputText, provider);
}

async function openRouterAnalyze({ provider, model, image, mime }) {
  const requestBody = JSON.stringify({
    model,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: ANALYSIS_PROMPT },
        { type: "image_url", image_url: { url: `data:${mime};base64,${image.toString("base64")}` } },
      ],
    }],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "wardrobe_items",
        strict: true,
        schema: WARDROBE_ITEMS_SCHEMA,
      },
    },
    provider: {
      require_parameters: true,
      data_collection: "deny",
      ...(provider.zdr ? { zdr: true } : {}),
    },
  });
  const trace = { payloadBytes: Buffer.byteLength(requestBody) };
  let response;
  const startedAt = Date.now();
  try {
    response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: openRouterHeaders(provider),
      body: requestBody,
    });
  } catch (error) {
    logAiCall({ provider, model, operation: "analysis", startedAt, trace, networkError: error });
    throw providerNetworkError(error, provider);
  }
  const result = await response.json().catch(() => ({}));
  logAiCall({ provider, model, operation: "analysis", response, result, startedAt, trace });
  if (!response.ok) throw providerResponseError(response, result, { provider, model, operation: "analysis" });
  const content = result.choices?.[0]?.message?.content;
  const outputText = typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((part) => part.text || part.content || "").join("")
      : "";
  return parseWardrobeItems(outputText, provider);
}

export function wardrobeImportApi(options = {}) {
  let root;
  let dataDir;
  let jobsDir;
  let importedFile;
  let libraryAssetDir;
  let profilesDir;
  let usersFile;
  let initialization;
  const running = new Map();
  const loginAttempts = new Map();
  const setting = (name, fallback = "") => options.env?.[name] || process.env[name] || fallback;
  const accessPassword = () => String(setting("WARDROBE_ACCESS_PASSWORD"));
  const authEnabled = () => Boolean(accessPassword());
  const isAuthenticated = (req) => {
    if (!authEnabled()) return true;
    const token = parseCookies(req.headers.cookie)[AUTH_COOKIE];
    return Boolean(token) && validSessionToken(token, accessPassword());
  };
  const requestIsSecure = (req) => (
    String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https"
    || setting("NODE_ENV") === "production"
    || Boolean(setting("RAILWAY_ENVIRONMENT_NAME"))
  );
  const authCookie = (req, value, maxAge) => [
    `${AUTH_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAge}`,
    requestIsSecure(req) ? "Secure" : null,
  ].filter(Boolean).join("; ");
  const clientAddress = (req) => String(
    req.headers["x-real-ip"]
    || req.socket?.remoteAddress
    || "unknown",
  ).slice(0, 120);
  const rateLimitLogin = (req, failed = false) => {
    const key = clientAddress(req);
    const now = Date.now();
    const current = loginAttempts.get(key);
    const state = !current || current.resetAt <= now
      ? { failures: 0, resetAt: now + (15 * 60 * 1000) }
      : current;
    if (failed) {
      state.failures += 1;
      loginAttempts.set(key, state);
    }
    return { blocked: state.failures >= 5, retryAfter: Math.max(1, Math.ceil((state.resetAt - now) / 1000)), key };
  };
  const setSecurityHeaders = (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    if (requestIsSecure(req)) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    if (setting("NODE_ENV") === "production" || setting("RAILWAY_ENVIRONMENT_NAME")) {
      res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    }
  };
  const modelReferenceSettings = () => {
    const multiple = setting("WARDROBE_MODEL_REFERENCES")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (multiple.length) return multiple.slice(0, 3);
    const single = setting("WARDROBE_MODEL_REFERENCE", "data/model-reference.png").trim();
    return single ? [single] : [];
  };
  const configuredConcurrency = Number.parseInt(setting("WARDROBE_AI_CONCURRENCY", "2"), 10);
  const generationConcurrency = Number.isFinite(configuredConcurrency)
    ? Math.max(1, Math.min(4, configuredConcurrency))
    : 2;
  const generationWaiters = [];
  let activeGenerationCalls = 0;
  const acquireGenerationSlot = async () => {
    if (activeGenerationCalls < generationConcurrency) {
      activeGenerationCalls += 1;
      return;
    }
    await new Promise((resolve) => generationWaiters.push(resolve));
  };
  const releaseGenerationSlot = () => {
    const next = generationWaiters.shift();
    if (next) next();
    else activeGenerationCalls -= 1;
  };
  const withGenerationSlot = async (task) => {
    await acquireGenerationSlot();
    try {
      return await task();
    } finally {
      releaseGenerationSlot();
    }
  };
  const booleanSetting = (name, fallback) => {
    const value = setting(name, fallback ? "true" : "false").trim().toLowerCase();
    return !["0", "false", "no", "off"].includes(value);
  };
  const aiProvider = () => {
    const requested = setting("WARDROBE_AI_PROVIDER", setting("AI_PROVIDER")).trim().toLowerCase();
    const id = requested || (setting("OPENROUTER_API_KEY").trim() ? "openrouter" : "openai");
    if (!["openai", "openrouter"].includes(id)) {
      return {
        id,
        label: id || "AI provider",
        key: "",
        keyEnv: "WARDROBE_AI_PROVIDER",
        configurationError: `WARDROBE_AI_PROVIDER must be "openrouter" or "openai", not "${id}".`,
      };
    }
    if (id === "openrouter") {
      const imageModel = setting("OPENROUTER_IMAGE_MODEL");
      return {
        id,
        label: "OpenRouter",
        key: setting("OPENROUTER_API_KEY").trim(),
        keyEnv: "OPENROUTER_API_KEY",
        baseUrl: setting("OPENROUTER_API_BASE_URL", "https://openrouter.ai/api/v1").replace(/\/$/, ""),
        baseUrlEnv: "OPENROUTER_API_BASE_URL",
        visionModel: setting("OPENROUTER_VISION_MODEL", "google/gemini-3.1-flash-lite"),
        garmentModel: setting("OPENROUTER_GARMENT_MODEL", imageModel || "google/gemini-3.1-flash-lite-image"),
        modeledModel: setting("OPENROUTER_MODELED_MODEL", imageModel || "google/gemini-3.1-flash-image"),
        imageQuality: setting("OPENROUTER_IMAGE_QUALITY", "auto"),
        imageProvider: setting("OPENROUTER_IMAGE_PROVIDER"),
        zdr: booleanSetting("OPENROUTER_ZDR", true),
      };
    }
    const imageModel = setting("OPENAI_IMAGE_MODEL", "gpt-image-2");
    return {
      id,
      label: "OpenAI",
      key: setting("OPENAI_API_KEY").trim(),
      keyEnv: "OPENAI_API_KEY",
      baseUrl: setting("OPENAI_API_BASE_URL", "https://api.openai.com/v1").replace(/\/$/, ""),
      baseUrlEnv: "OPENAI_API_BASE_URL",
      visionModel: setting("OPENAI_VISION_MODEL", "gpt-5.4-mini"),
      garmentModel: setting("OPENAI_GARMENT_MODEL", imageModel),
      modeledModel: setting("OPENAI_MODELED_MODEL", imageModel),
      imageQuality: setting("OPENAI_IMAGE_QUALITY", "high"),
      imageProvider: "",
      zdr: false,
    };
  };

  const profileReferenceDir = (userId) => path.join(profilesDir, userId, "references");
  const profileReferenceUrl = (userId, fileName) => `${USERS_ROOT}/${userId}/references/${encodeURIComponent(fileName)}`;
  const cleanProfileText = (value, maxLength) => typeof value === "string" ? value.trim().slice(0, maxLength) : "";

  const normalizeProfile = (input = {}, existing = {}) => {
    const name = cleanProfileText(input.name ?? existing.name, 80);
    if (!name) throw apiError("A profile name is required.", 400, "profile_name_required");
    const rawAge = input.age ?? existing.age ?? null;
    const age = rawAge === "" || rawAge === null || rawAge === undefined ? null : Number(rawAge);
    if (age !== null && (!Number.isInteger(age) || age < 1 || age > 120)) {
      throw apiError("Age must be a whole number between 1 and 120.", 400, "invalid_profile_age");
    }
    return {
      ...existing,
      name,
      age,
      fashionStyle: cleanProfileText(input.fashionStyle ?? existing.fashionStyle, 240),
      sizes: cleanProfileText(input.sizes ?? existing.sizes, 240),
      preferences: cleanProfileText(input.preferences ?? existing.preferences, 1200),
    };
  };

  const publicProfile = (profile) => ({
    ...profile,
    referenceImages: (profile.referenceImages || []).map((reference) => ({
      ...reference,
      url: profileReferenceUrl(profile.id, reference.fileName),
    })),
  });

  async function loadUsersStore() {
    try {
      const value = JSON.parse(await readFile(usersFile, "utf8"));
      if (!Array.isArray(value.users) || !value.users.length) throw new Error("users.json contains no profiles");
      if (!value.users.some((user) => user.id === value.currentUserId)) value.currentUserId = value.users[0].id;
      return value;
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async function saveUsersStore(store) {
    await atomicJson(usersFile, { version: 1, currentUserId: store.currentUserId, users: store.users });
  }

  async function selectedUser(req, url) {
    const store = await loadUsersStore();
    if (!store) throw apiError("User profiles are not initialized.", 503, "profiles_unavailable");
    const requested = url.searchParams.get("user") || req.headers["x-wardrobe-user"] || store.currentUserId;
    if (typeof requested !== "string" || !USER_ID.test(requested)) throw apiError("Invalid wardrobe user.", 400, "invalid_user");
    const user = store.users.find((candidate) => candidate.id === requested);
    if (!user) throw apiError("Wardrobe user not found.", 404, "user_not_found");
    return { store, user };
  }

  async function saveProfileReferences(userId, images) {
    if (!Array.isArray(images) || images.length < 1 || images.length > 3) {
      throw apiError("Choose between one and three reference photos.", 400, "invalid_reference_count");
    }
    const referenceDir = profileReferenceDir(userId);
    await mkdir(referenceDir, { recursive: true });
    const references = [];
    try {
      for (const [index, image] of images.entries()) {
        const source = Buffer.isBuffer(image?.data)
          ? { data: image.data }
          : decodeImage({ imageDataUrl: typeof image === "string" ? image : image?.dataUrl });
        const prepared = await prepareProviderImage(source.data);
        const id = randomUUID();
        const fileName = `${id}${prepared.extension}`;
        await writeFile(path.join(referenceDir, fileName), prepared.data);
        references.push({
          id,
          name: cleanProfileText(image?.name, 120) || `Reference ${index + 1}`,
          fileName,
          mime: prepared.mime,
        });
      }
    } catch (error) {
      await Promise.all(references.map((reference) => rm(path.join(referenceDir, reference.fileName), { force: true })));
      throw error;
    }
    return references;
  }

  async function initializeUsers() {
    await mkdir(profilesDir, { recursive: true });
    let store = await loadUsersStore();
    if (!store) {
      const now = new Date().toISOString();
      const defaultUser = normalizeProfile({
        name: setting("WARDROBE_DEFAULT_USER_NAME", "My wardrobe"),
      }, {
        id: "default",
        referenceImages: [],
        createdAt: now,
        updatedAt: now,
      });
      const legacyReferences = [];
      for (const reference of modelReferenceSettings()) {
        try {
          legacyReferences.push({ name: path.basename(reference), data: await readFile(path.resolve(root, reference)) });
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
      if (legacyReferences.length) defaultUser.referenceImages = await saveProfileReferences(defaultUser.id, legacyReferences);
      store = { version: 1, currentUserId: defaultUser.id, users: [defaultUser] };
      await saveUsersStore(store);
    }

    const ownerId = store.users.some((user) => user.id === store.currentUserId)
      ? store.currentUserId
      : store.users[0].id;
    const records = await loadImported();
    if (records.some((record) => !record.userId)) {
      await atomicJson(importedFile, records.map((record) => ({ ...record, userId: record.userId || ownerId })));
    }
    const ids = await readdir(jobsDir).catch(() => []);
    for (const id of ids) {
      const job = await loadJob(id);
      if (job && !job.userId) {
        job.userId = ownerId;
        await saveJob(job);
      }
    }
  }

  async function setupStatus(userId) {
    const provider = aiProvider();
    const hasApiKey = Boolean(provider.key);
    const store = await loadUsersStore();
    const profile = store?.users.find((user) => user.id === userId);
    if (!profile) throw apiError("Wardrobe user not found.", 404, "user_not_found");
    const references = profile.referenceImages || [];
    const modelReferences = references.map((reference) => reference.name);
    const missingModelReferences = [];
    for (const reference of references) {
      try {
        if (!(await stat(path.join(profileReferenceDir(profile.id), reference.fileName))).isFile()) {
          missingModelReferences.push(reference.name);
        }
      } catch (error) {
        if (error.code === "ENOENT") missingModelReferences.push(reference.name);
        else throw error;
      }
    }
    const hasModelReference = modelReferences.length > 0 && missingModelReferences.length === 0;
    return {
      ready: !provider.configurationError && hasApiKey && hasModelReference,
      provider: provider.id,
      providerLabel: provider.label,
      apiKeyName: provider.keyEnv,
      configurationError: provider.configurationError || null,
      hasApiKey,
      hasModelReference,
      needsProfileReference: !hasModelReference,
      modelReference: modelReferences[0] || `${profile.name}'s profile`,
      modelReferences,
      missingModelReferences,
      user: publicProfile(profile),
      models: provider.configurationError ? null : {
        vision: provider.visionModel,
        garment: provider.garmentModel,
        modeled: provider.modeledModel,
      },
    };
  }

  async function loadJob(id) {
    if (!/^[a-f0-9-]{36}$/i.test(id)) return null;
    try { return JSON.parse(await readFile(path.join(jobsDir, id, "job.json"), "utf8")); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
  }

  async function saveJob(job) {
    job.updatedAt = new Date().toISOString();
    await atomicJson(path.join(jobsDir, job.id, "job.json"), job);
  }

  async function loadImported(userId = null) {
    try {
      const records = JSON.parse(await readFile(importedFile, "utf8"));
      if (!userId) return records;
      return records
        .filter((record) => record.userId === userId)
        .map((record) => ({
          ...record,
          image: withUser(record.image, userId),
          thumbnail: withUser(record.thumbnail, userId),
          modeledImage: withUser(record.modeledImage, userId),
          originalImage: withUser(record.originalImage, userId),
        }));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async function persistImported(job, includeModeled = false) {
    const id = `import-${job.id}`;
    await mkdir(libraryAssetDir, { recursive: true });
    const garmentName = `${id}-garment.png`;
    const garmentSource = job.stages.garment.assetUrl
      ? path.basename(new URL(job.stages.garment.assetUrl, "http://localhost").pathname)
      : `garment-${job.stages.garment.attempts}.png`;
    await copyFile(path.join(jobsDir, job.id, garmentSource), path.join(libraryAssetDir, garmentName));
    const originalName = `${id}-original.png`;
    let originalImage = null;
    if (job.internal?.originalFile) {
      await copyFile(path.join(jobsDir, job.id, job.internal.originalFile), path.join(libraryAssetDir, originalName));
      originalImage = `${LIBRARY_ASSET_ROOT}/${originalName}`;
    }
    let modeledImage = null;
    if (includeModeled) {
      const modeledName = `${id}-modeled.png`;
      const modeledSource = job.stages.modeled.assetUrl
        ? path.basename(new URL(job.stages.modeled.assetUrl, "http://localhost").pathname)
        : `modeled-${job.stages.modeled.attempts}.png`;
      await copyFile(path.join(jobsDir, job.id, modeledSource), path.join(libraryAssetDir, modeledName));
      modeledImage = `${LIBRARY_ASSET_ROOT}/${modeledName}`;
    }
    const metadata = job.metadata || {};
    const records = await loadImported();
    const existing = records.find((record) => record.id === id);
    const record = {
      id,
      userId: job.userId,
      name: metadata.name || "New piece",
      part: metadata.part || "upperbody",
      color: metadata.color || "#d8d0c2",
      secondaryColor: metadata.secondaryColor || null,
      palette: [metadata.color, metadata.secondaryColor].filter(Boolean),
      tags: Array.isArray(metadata.tags) ? metadata.tags : [],
      image: `${LIBRARY_ASSET_ROOT}/${garmentName}`,
      thumbnail: `${LIBRARY_ASSET_ROOT}/${garmentName}`,
      modeledImage: modeledImage || existing?.modeledImage || null,
      originalImage: originalImage || existing?.originalImage || null,
      importJobId: job.id,
    };
    const next = [...records.filter((item) => item.id !== id), record];
    await atomicJson(importedFile, next);
    return record;
  }

  async function generate(job, stageName) {
    const lock = `${job.id}:${stageName}`;
    if (running.has(lock)) return running.get(lock);
    const task = (async () => {
      const current = await loadJob(job.id);
      const stage = current.stages[stageName];
      stage.status = "processing"; stage.decision = null; stage.error = null; stage.attempts += 1; stage.updatedAt = new Date().toISOString();
      await saveJob(current);
      let failedAssetUrl = null;
      let chromaKeyUsed = null;
      try {
        const dir = path.join(jobsDir, current.id);
        const output = path.join(dir, `${stageName}-${stage.attempts}.png`);
        const provider = aiProvider();
        if (provider.configurationError) throw apiError(provider.configurationError, 400, "invalid_ai_provider");
        if (!provider.key) throw apiError(`${provider.keyEnv} is not configured. Add it to .env, then restart the app.`, 503, `${provider.id}_key_missing`);
        const editImage = provider.id === "openrouter" ? openRouterEdit : openAIEdit;
        const sourceFile = stageName === "garment" && current.internal.cropFile ? current.internal.cropFile : current.internal.originalFile;
        const original = { data: await readFile(path.join(dir, sourceFile)), mime: "image/png", name: sourceFile };
        let bytes;
        if (stageName === "garment") {
          chromaKeyUsed = chooseChromaKey(current.metadata.color);
          const basePrompt = options.garmentPrompt || buildGarmentPrompt(current.metadata, chromaKeyUsed);
          console.info(`[wardrobe] Generating garment with ${provider.label} / ${provider.garmentModel}...`);
          bytes = await withGenerationSlot(() => editImage({
            provider,
            model: provider.garmentModel,
            quality: provider.imageQuality,
            size: "1024x1024",
            images: [original],
            prompt: current.stages.garment.prompt ? `${basePrompt}\nUser regeneration direction: ${current.stages.garment.prompt}` : basePrompt,
            operation: "garment",
            trace: { jobId: current.id, itemName: current.metadata.name, attempt: stage.attempts },
          }));
          const rawName = `${stageName}-${stage.attempts}-source.png`;
          await writeFile(path.join(dir, rawName), bytes);
          failedAssetUrl = `${ASSET_ROOT}/${current.id}/${rawName}`;
          bytes = await removeChromaBackground(bytes, chromaKeyUsed);
        } else {
          const garmentName = current.stages.garment.assetUrl
            ? path.basename(new URL(current.stages.garment.assetUrl, "http://localhost").pathname)
            : `garment-${current.stages.garment.attempts}.png`;
          const garmentFile = path.join(dir, garmentName);
          const garment = { data: await readFile(garmentFile), mime: "image/png", name: "garment.png" };
          const users = await loadUsersStore();
          const profile = users?.users.find((user) => user.id === current.userId);
          if (!profile) throw new Error("The wardrobe profile for this import no longer exists.");
          const references = profile.referenceImages || [];
          const models = await Promise.all(references.map(async (reference, index) => {
            const modelPath = path.join(profileReferenceDir(profile.id), reference.fileName);
            try {
              return { data: await readFile(modelPath), name: reference.name || `person-${index + 1}` };
            } catch (error) {
              if (error.code === "ENOENT") {
                throw new Error(`Reference photo "${reference.name || index + 1}" is missing from ${profile.name}'s profile. Open the profile and add it again.`);
              }
              throw error;
            }
          }));
          if (!models.length) {
            throw new Error(`${profile.name}'s profile has no reference photo. Add one before generating a modeled image.`);
          }
          const basePrompt = options.modeledPrompt || buildModeledPrompt(models.length, profile, current.metadata);
          console.info(`[wardrobe] Generating modeled image with ${provider.label} / ${provider.modeledModel}...`);
          bytes = await withGenerationSlot(() => editImage({
            provider,
            model: provider.modeledModel,
            quality: provider.imageQuality,
            size: "1536x1024",
            images: [...models, garment],
            prompt: current.stages.modeled.prompt ? `${basePrompt}\nUser regeneration direction: ${current.stages.modeled.prompt}` : basePrompt,
            operation: "modeled",
            trace: {
              jobId: current.id,
              itemName: current.metadata.name,
              attempt: stage.attempts,
              personReferenceCount: models.length,
            },
          }));
        }
        await writeFile(output, bytes);
        const fresh = await loadJob(current.id);
        fresh.stages[stageName].status = "review";
        fresh.stages[stageName].assetUrl = `${ASSET_ROOT}/${fresh.id}/${path.basename(output)}`;
        fresh.stages[stageName].failedAssetUrl = null;
        fresh.stages[stageName].cleanupPreviewUrl = null;
        fresh.stages[stageName].cleanupDiagnostics = null;
        if (chromaKeyUsed) fresh.stages[stageName].chromaKey = chromaKeyUsed;
        fresh.stages[stageName].updatedAt = new Date().toISOString();
        await saveJob(fresh);
      } catch (error) {
        console.error(`[wardrobe] ${stageName} generation failed for job ${current.id}: ${error.message}`);
        const fresh = await loadJob(current.id);
        fresh.stages[stageName].status = "failed"; fresh.stages[stageName].error = error.message; fresh.stages[stageName].updatedAt = new Date().toISOString();
        if (typeof failedAssetUrl === "string") fresh.stages[stageName].failedAssetUrl = failedAssetUrl;
        if (chromaKeyUsed) fresh.stages[stageName].chromaKey = chromaKeyUsed;
        await saveJob(fresh);
      }
    })().finally(() => running.delete(lock));
    running.set(lock, task);
    return task;
  }

  async function handler(req, res, next) {
    const url = new URL(req.url, "http://localhost");
    setSecurityHeaders(req, res);
    try {
      if (url.pathname === "/healthz" && req.method === "GET") {
        return json(res, 200, { status: "healthy" });
      }
      if (url.pathname === "/api/auth/status" && req.method === "GET") {
        return json(res, 200, { enabled: authEnabled(), authenticated: isAuthenticated(req) });
      }
      if (url.pathname === "/api/auth/login" && req.method === "POST") {
        if (!authEnabled()) return json(res, 200, { enabled: false, authenticated: true });
        const limited = rateLimitLogin(req);
        if (limited.blocked) {
          res.setHeader("Retry-After", limited.retryAfter);
          return json(res, 429, { error: "Too many password attempts. Try again in 15 minutes.", code: "login_rate_limited" });
        }
        const input = await body(req, 16 * 1024);
        const submitted = typeof input.password === "string" ? input.password : "";
        if (!submitted || !safeEqual(passwordToken(submitted), passwordToken(accessPassword()))) {
          const failed = rateLimitLogin(req, true);
          if (failed.blocked) res.setHeader("Retry-After", failed.retryAfter);
          return json(res, failed.blocked ? 429 : 401, {
            error: failed.blocked ? "Too many password attempts. Try again in 15 minutes." : "Incorrect password.",
            code: failed.blocked ? "login_rate_limited" : "incorrect_password",
          });
        }
        loginAttempts.delete(limited.key);
        res.setHeader("Set-Cookie", authCookie(req, createSessionToken(accessPassword()), 30 * 24 * 60 * 60));
        return json(res, 200, { enabled: true, authenticated: true });
      }
      if (url.pathname === "/api/auth/logout" && req.method === "POST") {
        res.setHeader("Set-Cookie", authCookie(req, "", 0));
        return json(res, 200, { enabled: authEnabled(), authenticated: false });
      }
      const protectedPath = url.pathname.startsWith("/api/import/")
        || url.pathname.startsWith(USERS_ROOT)
        || url.pathname === EXPORT_ROOT;
      if (protectedPath && !isAuthenticated(req)) {
        return json(res, 401, { error: "Enter the wardrobe password to continue.", code: "authentication_required" });
      }
      if (!protectedPath) return next();
      if (url.pathname === EXPORT_ROOT && req.method === "GET") {
        const date = new Date().toISOString().slice(0, 10);
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/gzip");
        res.setHeader("Content-Disposition", `attachment; filename="wardrobe-personal-data-${date}.tar.gz"`);
        res.setHeader("Cache-Control", "private, no-store");
        console.info("[wardrobe] Creating a personal data backup.");
        await pipeline(
          Readable.from(personalDataArchive(dataDir)),
          createGzip({ level: 6 }),
          res,
        );
        return;
      }
      if (url.pathname === USERS_ROOT && req.method === "GET") {
        const store = await loadUsersStore();
        return json(res, 200, {
          currentUserId: store.currentUserId,
          users: store.users.map(publicProfile),
        });
      }
      if (url.pathname === USERS_ROOT && req.method === "POST") {
        const input = await body(req, 60 * 1024 * 1024);
        const store = await loadUsersStore();
        const now = new Date().toISOString();
        const id = randomUUID();
        const references = await saveProfileReferences(id, input.referenceImages);
        const profile = normalizeProfile(input, {
          id,
          referenceImages: references,
          createdAt: now,
          updatedAt: now,
        });
        store.users.push(profile);
        store.currentUserId = profile.id;
        await saveUsersStore(store);
        return json(res, 201, { currentUserId: profile.id, user: publicProfile(profile) });
      }
      if (url.pathname === `${USERS_ROOT}/current` && req.method === "PUT") {
        const input = await body(req);
        const store = await loadUsersStore();
        if (typeof input.userId !== "string" || !store.users.some((user) => user.id === input.userId)) {
          throw apiError("Wardrobe user not found.", 404, "user_not_found");
        }
        store.currentUserId = input.userId;
        await saveUsersStore(store);
        return json(res, 200, { currentUserId: input.userId });
      }
      const referenceMatch = url.pathname.match(/^\/api\/users\/(default|[a-f0-9-]{36})\/references\/([\w.-]+)$/i);
      if (referenceMatch && req.method === "GET") {
        const store = await loadUsersStore();
        const profile = store.users.find((user) => user.id === referenceMatch[1]);
        const reference = profile?.referenceImages?.find((candidate) => candidate.fileName === referenceMatch[2]);
        if (!profile || !reference) throw apiError("Reference photo not found.", 404, "reference_not_found");
        const file = path.join(profileReferenceDir(profile.id), reference.fileName);
        await stat(file);
        res.setHeader("Content-Type", reference.mime || (file.endsWith(".jpg") ? "image/jpeg" : "image/png"));
        res.setHeader("Cache-Control", "private, no-store");
        return res.end(await readFile(file));
      }
      const profileMatch = url.pathname.match(/^\/api\/users\/(default|[a-f0-9-]{36})$/i);
      if (profileMatch && req.method === "PATCH") {
        const input = await body(req, 60 * 1024 * 1024);
        const store = await loadUsersStore();
        const index = store.users.findIndex((user) => user.id === profileMatch[1]);
        if (index < 0) throw apiError("Wardrobe user not found.", 404, "user_not_found");
        const existing = store.users[index];
        const replacingReferences = Object.hasOwn(input, "referenceImages");
        const referenceImages = replacingReferences
          ? await saveProfileReferences(existing.id, input.referenceImages)
          : existing.referenceImages;
        const profile = normalizeProfile(input, {
          ...existing,
          referenceImages,
          updatedAt: new Date().toISOString(),
        });
        store.users[index] = profile;
        await saveUsersStore(store);
        if (replacingReferences) {
          await Promise.all((existing.referenceImages || []).map((reference) => rm(
            path.join(profileReferenceDir(existing.id), reference.fileName),
            { force: true },
          )));
        }
        return json(res, 200, { currentUserId: store.currentUserId, user: publicProfile(profile) });
      }
      if (!url.pathname.startsWith("/api/import/")) return next();
      const { user } = await selectedUser(req, url);
      if (url.pathname === "/api/import/wardrobe" && req.method === "GET") {
        return json(res, 200, await loadImported(user.id));
      }
      if (url.pathname === "/api/import/config" && req.method === "GET") {
        return json(res, 200, await setupStatus(user.id));
      }
      const wardrobeItemMatch = url.pathname.match(/^\/api\/import\/wardrobe\/(import-[a-f0-9-]{36})$/i);
      if (wardrobeItemMatch && req.method === "PATCH") {
        const id = wardrobeItemMatch[1];
        const input = await body(req, 32 * 1024);
        const records = await loadImported();
        const index = records.findIndex((record) => record.id === id && record.userId === user.id);
        if (index < 0) return json(res, 404, { error: "Imported wardrobe item not found" });
        const metadata = normalizeMetadata({ ...records[index], ...input });
        records[index] = {
          ...records[index],
          name: metadata.name,
          part: metadata.part,
          color: metadata.color,
          secondaryColor: metadata.secondaryColor,
          palette: [metadata.color, metadata.secondaryColor].filter(Boolean),
          tags: metadata.tags,
        };
        await atomicJson(importedFile, records);
        return json(res, 200, {
          ...records[index],
          image: withUser(records[index].image, user.id),
          thumbnail: withUser(records[index].thumbnail, user.id),
          modeledImage: withUser(records[index].modeledImage, user.id),
          originalImage: withUser(records[index].originalImage, user.id),
        });
      }
      if (wardrobeItemMatch && req.method === "DELETE") {
        const id = wardrobeItemMatch[1];
        const records = await loadImported();
        const next = records.filter((record) => record.id !== id || record.userId !== user.id);
        if (next.length === records.length) return json(res, 404, { error: "Imported wardrobe item not found" });
        await atomicJson(importedFile, next);
        await Promise.all([
          rm(path.join(libraryAssetDir, `${id}-garment.png`), { force: true }),
          rm(path.join(libraryAssetDir, `${id}-modeled.png`), { force: true }),
          rm(path.join(libraryAssetDir, `${id}-original.png`), { force: true }),
        ]);
        return json(res, 200, { deleted: true, id });
      }
      const libraryAssetMatch = url.pathname.match(/^\/api\/import\/library\/([\w.-]+)$/i);
      if (libraryAssetMatch && req.method === "GET") {
        const records = await loadImported();
        const allowed = records.some((record) => record.userId === user.id && [
          record.image,
          record.thumbnail,
          record.modeledImage,
          record.originalImage,
        ].filter(Boolean).some((asset) => path.basename(new URL(asset, "http://localhost").pathname) === libraryAssetMatch[1]));
        if (!allowed) throw apiError("Wardrobe image not found.", 404, "wardrobe_image_not_found");
        const file = path.join(libraryAssetDir, path.basename(libraryAssetMatch[1]));
        await stat(file);
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "private, no-store");
        return res.end(await readFile(file));
      }
      const assetMatch = url.pathname.match(/^\/api\/import\/assets\/([a-f0-9-]{36})\/([\w.-]+)$/i);
      if (assetMatch && req.method === "GET") {
        const assetJob = await loadJob(assetMatch[1]);
        if (!assetJob || assetJob.userId !== user.id) throw apiError("Import image not found.", 404, "import_image_not_found");
        const file = path.join(jobsDir, assetMatch[1], path.basename(assetMatch[2]));
        await stat(file);
        res.setHeader("Content-Type", file.endsWith(".svg") ? "image/svg+xml" : "image/png");
        res.setHeader("Cache-Control", "no-store");
        return res.end(await readFile(file));
      }
      if (url.pathname === API_ROOT && req.method === "POST") {
        const setup = await setupStatus(user.id);
        if (!setup.ready) {
          if (setup.configurationError) {
            return json(res, 503, { error: setup.configurationError, code: "invalid_ai_provider" });
          }
          const missing = [
            !setup.hasApiKey && `${setup.apiKeyName} in .env`,
            !setup.hasModelReference && `one to three reference photos in ${user.name}'s profile`,
          ].filter(Boolean).join(" and ");
          return json(res, 503, { error: `Setup required for ${setup.providerLabel}: add ${missing}.`, code: "setup_required" });
        }
        const input = await body(req);
        const image = decodeImage(input);
        const normalizedImage = await normalizeImage(image.data);
        const provider = aiProvider();
        const analyzeImage = provider.id === "openrouter" ? openRouterAnalyze : openAIAnalyze;
        const analysisImage = await prepareProviderImage(normalizedImage);
        console.info(`[wardrobe] Analyzing import with ${provider.label} / ${provider.visionModel}...`);
        const detected = (await analyzeImage({
          provider,
          model: provider.visionModel,
          image: analysisImage.data,
          mime: analysisImage.mime,
        })).map(normalizeMetadata);
        console.info(`[wardrobe] Detected ${detected.length} wardrobe ${detected.length === 1 ? "item" : "items"}.`);
        const jobs = [];
        for (const metadata of detected) {
          const id = randomUUID();
          const dir = path.join(jobsDir, id); await mkdir(dir, { recursive: true });
          const originalFile = "original.png";
          const cropFile = "crop.png";
          const croppedImage = await cropDetectedItem(normalizedImage, metadata.boundingBox);
          await writeFile(path.join(dir, originalFile), normalizedImage);
          await writeFile(path.join(dir, cropFile), croppedImage);
          const now = new Date().toISOString();
          const cropStage = { ...stageState(), status: "review", assetUrl: `${ASSET_ROOT}/${id}/${cropFile}`, updatedAt: now };
          const job = { id, userId: user.id, status: "active", metadata, stages: { crop: cropStage, garment: stageState(), modeled: stageState() }, createdAt: now, updatedAt: now, internal: { originalFile, cropFile, originalMime: "image/png" } };
          job.originalAssetUrl = `${ASSET_ROOT}/${id}/${originalFile}`;
          await saveJob(job); jobs.push(publicJob(job));
        }
        return json(res, 202, { jobs, noClothingDetected: jobs.length === 0 });
      }
      if (url.pathname === API_ROOT && req.method === "GET") {
        const ids = await readdir(jobsDir).catch(() => []);
        const loadedJobs = (await Promise.all(ids.map((id) => loadJob(id)))).filter((job) => job?.userId === user.id);
        const hiddenJobs = loadedJobs.filter((job) => job.status === "complete" || job.stages.crop?.status === "rejected" || job.stages.garment.status === "rejected" || job.stages.modeled.status === "rejected");
        await Promise.all(hiddenJobs.map((job) => rm(path.join(jobsDir, job.id), { recursive: true, force: true })));
        const jobs = loadedJobs.filter((job) => !hiddenJobs.includes(job)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return json(res, 200, jobs.map(publicJob));
      }
      const match = url.pathname.match(/^\/api\/import\/jobs\/([a-f0-9-]{36})(?:\/(.*))?$/i);
      if (!match) return json(res, 404, { error: "Not found" });
      const job = await loadJob(match[1]);
      if (!job || job.userId !== user.id) return json(res, 404, { error: "Job not found" });
      const action = match[2] || "";
      if (!action && req.method === "GET") return json(res, 200, publicJob(job));
      if (!action && req.method === "DELETE") {
        await rm(path.join(jobsDir, job.id), { recursive: true, force: true });
        return json(res, 200, { deleted: true, id: job.id });
      }
      if (action === "metadata" && (req.method === "PATCH" || req.method === "PUT")) {
        const input = await body(req);
        if (!input.metadata || typeof input.metadata !== "object" || Array.isArray(input.metadata)) throw Object.assign(new Error("metadata must be an object"), { status: 400 });
        job.metadata = normalizeMetadata({ ...job.metadata, ...input.metadata }); await saveJob(job);
        return json(res, 200, publicJob(job));
      }
      const cleanupAction = action.match(/^stages\/garment\/(cleanup-preview|cleanup-accept)$/);
      if (cleanupAction && req.method === "POST") {
        const stage = job.stages.garment;
        if (stage.status !== "failed" || !stage.failedAssetUrl) {
          throw Object.assign(new Error("No failed garment source is available for cleanup"), { status: 409 });
        }
        const input = await body(req);
        const tolerance = cleanupTolerance(input.tolerance);
        const sourceName = path.basename(new URL(stage.failedAssetUrl, "http://localhost").pathname);
        const source = await readFile(path.join(jobsDir, job.id, sourceName));
        const key = stage.chromaKey || chooseChromaKey(job.metadata?.color);
        const cleaned = await processChromaBackground(source, key, { tolerance });
        const previewName = `garment-${stage.attempts}-cleanup-${tolerance}.png`;
        const previewUrl = `${ASSET_ROOT}/${job.id}/${previewName}`;
        await writeFile(path.join(jobsDir, job.id, previewName), cleaned.bytes);
        stage.chromaKey = key;
        stage.cleanupTolerance = cleaned.tolerance;
        stage.cleanupDiagnostics = cleaned.verification;
        stage.cleanupPreviewUrl = previewUrl;
        stage.updatedAt = new Date().toISOString();
        if (cleanupAction[1] === "cleanup-accept") {
          stage.status = "review";
          stage.decision = null;
          stage.error = null;
          stage.assetUrl = previewUrl;
        }
        await saveJob(job);
        return json(res, 200, publicJob(job));
      }
      const stageMatch = action.match(/^stages\/(crop|garment|modeled)\/(approve|reject|regenerate)$/);
      if (stageMatch && req.method === "POST") {
        const [, stageName, decision] = stageMatch;
        if (!STAGES.has(stageName)) throw Object.assign(new Error("Invalid stage"), { status: 400 });
        if (decision === "regenerate") {
          if (stageName === "crop") throw Object.assign(new Error("Upload the image again to create new crops"), { status: 400 });
          const input = await body(req);
          job.stages[stageName].prompt = typeof input.prompt === "string" ? input.prompt.trim().slice(0, 1200) || null : null;
          job.stages[stageName].status = "queued";
          job.stages[stageName].decision = null;
          await saveJob(job);
          void generate(job, stageName);
          return json(res, 202, publicJob(job));
        }
        if (!DECISIONS.has(decision) || job.stages[stageName].status !== "review") throw Object.assign(new Error("Stage is not ready for review"), { status: 409 });
        const previousStatus = job.stages[stageName].status;
        const previousDecision = job.stages[stageName].decision;
        const previousJobStatus = job.status;
        job.stages[stageName].decision = decision === "approve" ? "approved" : "rejected";
        job.stages[stageName].status = job.stages[stageName].decision;
        job.stages[stageName].error = null;
        job.stages[stageName].updatedAt = new Date().toISOString();
        const startGarment = stageName === "crop" && decision === "approve" && job.stages.garment.status === "pending";
        const startModeled = stageName === "garment" && decision === "approve" && job.stages.modeled.status === "pending";
        if (stageName === "modeled" && decision === "approve") job.status = "complete";
        await saveJob(job);
        if (decision === "approve" && stageName !== "crop") {
          try {
            await persistImported(job, stageName === "modeled");
          } catch (error) {
            job.stages[stageName].status = previousStatus;
            job.stages[stageName].decision = previousDecision;
            job.status = previousJobStatus;
            await saveJob(job);
            throw error;
          }
        }
        if (decision === "reject") await rm(path.join(jobsDir, job.id), { recursive: true, force: true });
        if (startGarment) void generate(job, "garment");
        if (startModeled) void generate(job, "modeled");
        const response = publicJob(job);
        if (job.status === "complete") await rm(path.join(jobsDir, job.id), { recursive: true, force: true });
        return json(res, 200, response);
      }
      return json(res, 404, { error: "Not found" });
    } catch (error) {
      if (res.headersSent) {
        if (!res.writableEnded) res.destroy(error);
        return;
      }
      const statusCode = error.code === "ENOENT" ? 404 : error.status || 500;
      console.error(`[wardrobe] ${req.method} ${url.pathname} failed (${statusCode}): ${error.message}`);
      return json(res, statusCode, publicError(error, statusCode));
    }
  }

  async function initialize(resolvedRoot) {
    if (initialization) return initialization;
    initialization = (async () => {
      root = path.resolve(resolvedRoot);
      dataDir = path.resolve(root, setting("WARDROBE_DATA_DIR", "data"));
      jobsDir = path.join(dataDir, "jobs");
      importedFile = path.join(dataDir, "library.json");
      libraryAssetDir = path.join(dataDir, "imported");
      profilesDir = path.join(dataDir, "profiles");
      usersFile = path.join(dataDir, "users.json");
      await mkdir(jobsDir, { recursive: true });
      await mkdir(libraryAssetDir, { recursive: true });
      await initializeUsers();
      const ids = await readdir(jobsDir).catch(() => []);
      for (const id of ids) {
        const job = await loadJob(id);
        if (!job) continue;
        if (job.status === "complete") {
          try {
            await persistImported(job, true);
            await rm(path.join(jobsDir, job.id), { recursive: true, force: true });
          } catch (error) {
            job.status = "active";
            job.stages.modeled.status = "review";
            job.stages.modeled.decision = null;
            job.stages.modeled.error = null;
            await saveJob(job);
          }
          continue;
        }
        if (job.stages.crop?.status === "rejected" || job.stages.garment.status === "rejected" || job.stages.modeled.status === "rejected") {
          await rm(path.join(jobsDir, job.id), { recursive: true, force: true });
          continue;
        }
        if (job.stages.crop && job.stages.crop.status !== "approved") continue;
        if (["processing", "queued"].includes(job.stages.garment.status)) {
          job.stages.garment.status = "pending";
          await saveJob(job);
          void generate(job, "garment");
        } else if (job.stages.garment.status === "approved" && ["pending", "processing", "queued"].includes(job.stages.modeled.status)) {
          job.stages.modeled.status = "pending";
          await saveJob(job);
          void generate(job, "modeled");
        }
      }
    })().catch((error) => {
      initialization = null;
      throw error;
    });
    return initialization;
  }

  return {
    name: "wardrobe-import-job-api",
    apply: "serve",
    initialize,
    handler,
    async configResolved(config) { await initialize(config.root); },
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}
