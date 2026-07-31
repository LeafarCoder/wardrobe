import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  createSessionToken,
  personalDataArchiveFormat,
  wardrobeImportApi,
} from "../scripts/import-job-api.mjs";

const SESSION_SECRET = "personal-data-export-test-session-secret";
const ZIP_END_SIGNATURE = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

class CapturedResponse extends Writable {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = new Map();
    this.chunks = [];
    this.headersSent = false;
  }

  setHeader(name, value) { this.headers.set(name.toLowerCase(), value); }
  getHeader(name) { return this.headers.get(name.toLowerCase()); }
  _write(chunk, _encoding, done) {
    this.headersSent = true;
    this.chunks.push(Buffer.from(chunk));
    done();
  }

  body() { return Buffer.concat(this.chunks); }
}

function exportRequest(url, userAgent) {
  const request = Readable.from([]);
  request.url = url;
  request.method = "GET";
  request.headers = {
    host: "localhost",
    cookie: `wardrobe_session=${createSessionToken(SESSION_SECRET, "default")}`,
    "user-agent": userAgent,
  };
  request.socket = { remoteAddress: "127.0.0.1" };
  return request;
}

function zipEntries(archive) {
  const endOffset = archive.lastIndexOf(ZIP_END_SIGNATURE);
  assert.notEqual(endOffset, -1, "ZIP end record is present");
  const count = archive.readUInt16LE(endOffset + 10);
  let offset = archive.readUInt32LE(endOffset + 16);
  const entries = new Map();
  for (let index = 0; index < count; index += 1) {
    assert.equal(archive.readUInt32LE(offset), 0x02014b50, "central directory entry is valid");
    assert.equal(archive.readUInt16LE(offset + 10), 0, "backup files are stored without redundant compression");
    const expectedCrc = archive.readUInt32LE(offset + 16);
    const size = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    assert.equal(archive.readUInt32LE(localOffset), 0x04034b50, "local ZIP entry is valid");
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const data = archive.subarray(dataOffset, dataOffset + size);
    assert.equal(crc32(data), expectedCrc, `${name} has a valid CRC`);
    entries.set(name, data);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(offset, endOffset, "central directory has the advertised size");
  return entries;
}

function tarEntries(archive) {
  const entries = new Map();
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const storedChecksum = Number.parseInt(header.subarray(148, 156).toString("ascii").replace(/\0.*$/, "").trim(), 8);
    const checksumHeader = Buffer.from(header);
    checksumHeader.fill(0x20, 148, 156);
    const actualChecksum = checksumHeader.reduce((total, byte) => total + byte, 0);
    assert.equal(actualChecksum, storedChecksum, "tar header checksum is valid");
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const prefix = header.subarray(345, 500).toString("utf8").replace(/\0.*$/, "");
    const archivePath = prefix ? `${prefix}/${name}` : name;
    const size = Number.parseInt(header.subarray(124, 136).toString("ascii").replace(/\0.*$/, "").trim(), 8);
    const dataOffset = offset + 512;
    entries.set(archivePath, archive.subarray(dataOffset, dataOffset + size));
    offset = dataOffset + Math.ceil(size / 512) * 512;
  }
  assert.equal(archive.subarray(-1024).every((byte) => byte === 0), true, "tar archive has its end marker");
  return entries;
}

test("personal data archive format follows the desktop platform and permits an explicit override", () => {
  assert.equal(personalDataArchiveFormat("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), "zip");
  assert.equal(personalDataArchiveFormat("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "zip");
  assert.equal(personalDataArchiveFormat("Mozilla/5.0 (X11; Linux x86_64)"), "tar.gz");
  assert.equal(personalDataArchiveFormat("unknown client"), "zip");
  assert.equal(personalDataArchiveFormat("Macintosh", "tar.gz"), "tar.gz");
});

test("personal data downloads are complete, length-delimited archives that open on macOS and Linux", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wardrobe-personal-data-test-"));
  const dataDir = path.join(root, "data");
  const api = wardrobeImportApi({
    env: {
      WARDROBE_DATA_DIR: dataDir,
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
      WARDROBE_SESSION_SECRET: SESSION_SECRET,
    },
  });

  try {
    await api.initialize(root);
    const usersFile = path.join(dataDir, "users.json");
    const users = JSON.parse(await readFile(usersFile, "utf8"));
    users.users[0].email = "owner@example.com";
    await writeFile(usersFile, JSON.stringify(users, null, 2));
    const asset = Buffer.alloc(64 * 1024);
    for (let index = 0; index < asset.length; index += 1) asset[index] = index % 251;
    await writeFile(path.join(dataDir, "imported", "export-test.png"), asset);
    await writeFile(path.join(dataDir, "library.json"), JSON.stringify([{
      id: "import-export-test",
      userId: "default",
      name: "Export test garment",
      image: "/api/import/library/export-test.png",
    }], null, 2));

    const macResponse = new CapturedResponse();
    await api.handler(
      exportRequest("/api/export", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"),
      macResponse,
      () => {},
    );
    const zip = macResponse.body();
    assert.equal(macResponse.statusCode, 200);
    assert.equal(macResponse.getHeader("content-type"), "application/zip");
    assert.match(macResponse.getHeader("content-disposition"), /\.zip"$/);
    assert.equal(Number(macResponse.getHeader("content-length")), zip.length);
    const macEntries = zipEntries(zip);
    assert.match(macEntries.get("wardrobe-data/RESTORE.txt").toString("utf8"), /WARDROBE PERSONAL DATA BACKUP/);
    assert.equal(JSON.parse(macEntries.get("wardrobe-data/data/users.json")).users[0].email, "owner@example.com");
    assert.deepEqual(macEntries.get("wardrobe-data/data/imported/export-test.png"), asset);

    const linuxResponse = new CapturedResponse();
    await api.handler(
      exportRequest("/api/export", "Mozilla/5.0 (X11; Linux x86_64)"),
      linuxResponse,
      () => {},
    );
    const gzip = linuxResponse.body();
    assert.equal(linuxResponse.statusCode, 200);
    assert.equal(linuxResponse.getHeader("content-type"), "application/gzip");
    assert.match(linuxResponse.getHeader("content-disposition"), /\.tar\.gz"$/);
    assert.equal(Number(linuxResponse.getHeader("content-length")), gzip.length);
    const linuxEntries = tarEntries(gunzipSync(gzip));
    assert.match(linuxEntries.get("wardrobe-data/RESTORE.txt").toString("utf8"), /WARDROBE PERSONAL DATA BACKUP/);
    assert.equal(JSON.parse(linuxEntries.get("wardrobe-data/data/users.json")).users[0].email, "owner@example.com");
    assert.deepEqual(linuxEntries.get("wardrobe-data/data/imported/export-test.png"), asset);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
