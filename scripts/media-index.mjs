import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeObjectKey } from "./object-storage.mjs";

// Small, serialized JSON catalog for private S3 media without a PostgreSQL server.
// Source paths are relative to data/, never user-supplied absolute paths.
export class MediaIndex {
  constructor(file) {
    this.file = file;
    this.tail = Promise.resolve();
    this.entries = null;
  }

  async load() {
    if (!this.entries) {
      try {
        const stored = JSON.parse(await readFile(this.file, "utf8"));
        if (stored.version !== 1 || !Array.isArray(stored.entries)) throw new Error("Invalid media index");
        this.entries = stored.entries;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        this.entries = [];
      }
    }
    return this.entries;
  }

  async all() { return [...await this.load()]; }
  async byPath(sourcePath) { return (await this.load()).find((entry) => entry.source_path === sourcePath); }
  async byId(id) { return (await this.load()).find((entry) => entry.id === id); }
  async byName(owner, name) {
    return (await this.load()).find((entry) => entry.owner_user_id === owner && entry.original_name === name);
  }

  mutate(task) {
    const result = this.tail.then(async () => {
      const entries = [...await this.load()];
      const value = await task(entries);
      await mkdir(path.dirname(this.file), { recursive: true });
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify({ version: 1, entries }), { mode: 0o600 });
      await rename(temporary, this.file);
      this.entries = entries;
      return value;
    });
    this.tail = result.catch(() => {});
    return result;
  }

  async put(value) {
    const sourcePath = normalizeObjectKey(value.source_path);
    return this.mutate((entries) => {
      const index = entries.findIndex((entry) => entry.source_path === sourcePath);
      const record = { ...value, source_path: sourcePath, id: entries[index]?.id || value.id || randomUUID() };
      if (index < 0) entries.push(record);
      else entries[index] = record;
      return record;
    });
  }

  async remove(sourcePath, storage) {
    return this.mutate(async (entries) => {
      const removed = entries.filter((entry) => entry.source_path === sourcePath || entry.source_path.startsWith(`${sourcePath}/`));
      for (const entry of removed) await storage.delete(entry.object_key);
      for (let i = entries.length - 1; i >= 0; i--) {
        if (removed.includes(entries[i])) entries.splice(i, 1);
      }
    });
  }

  async replaceAll(values) {
    return this.mutate((entries) => {
      const paths = new Set();
      const ids = new Set();
      for (const entry of values) {
        normalizeObjectKey(entry.source_path);
        if (paths.has(entry.source_path) || ids.has(entry.id)) throw new Error("Duplicate media catalog entry");
        paths.add(entry.source_path); ids.add(entry.id);
      }
      entries.splice(0, entries.length, ...values);
    });
  }
}
