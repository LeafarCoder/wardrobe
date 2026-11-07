import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { libraryStorageContexts } from "./import-job-api.mjs";
import { profileMediaContexts, jobMediaContexts, mergeMediaContexts } from "./media-contexts.mjs";

const json = async (file, fallback) => {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
};

export async function readMediaCatalogState(root) {
  const records = await json(path.join(root, "library.json"), []);
  const users = (await json(path.join(root, "users.json"), { users: [] })).users;
  const jobs = [];
  for (const entry of await readdir(path.join(root, "jobs"), { withFileTypes: true }).catch((error) => { if (error.code === "ENOENT") return []; throw error; })) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    const job = await json(path.join(root, "jobs", id, "job.json"), null);
    if (job) jobs.push(job);
  }
  const contexts = mergeMediaContexts(libraryStorageContexts(records), ...users.map(profileMediaContexts), ...jobs.map(jobMediaContexts));
  const ownerIds = new Set(users.map((profile) => profile.id));
  for (const [source, context] of contexts) {
    if (!ownerIds.has(context.ownerUserId)) contexts.set(source, { ...context, ownerUserId: null, entityType: "unassigned", entityId: null, lookId: null });
  }
  return { records, users, jobs, contexts, ownerIds };
}
