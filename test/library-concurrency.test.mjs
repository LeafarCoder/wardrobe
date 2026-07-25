import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Mirrors the serialization used for library.json and users.json in
// scripts/import-job-api.mjs. Two concurrent read-modify-write cycles must not
// let the later write discard the earlier one.
function criticalSection() {
  let tail = Promise.resolve();
  return (task) => {
    const result = tail.then(task, task);
    tail = result.then(() => {}, () => {});
    return result;
  };
}

test("a critical section keeps concurrent library writes from overwriting each other", async () => {
  const file = path.join(await mkdtemp(path.join(tmpdir(), "wardrobe-")), "library.json");
  await writeFile(file, JSON.stringify([]));
  const withLibrary = criticalSection();

  const append = (record) => withLibrary(async () => {
    const records = JSON.parse(await readFile(file, "utf8"));
    await new Promise((resolve) => setTimeout(resolve, 5));
    await writeFile(file, JSON.stringify([...records, record]));
  });
  await Promise.all([
    append({ id: "first" }),
    append({ id: "second" }),
    append({ id: "third" }),
  ]);

  const records = JSON.parse(await readFile(file, "utf8"));
  assert.deepEqual(records.map((record) => record.id), ["first", "second", "third"]);
});

test("a rejected section does not stall the ones queued behind it", async () => {
  const withLibrary = criticalSection();
  const completed = [];

  const failing = withLibrary(async () => {
    throw new Error("write failed");
  });
  await assert.rejects(failing, /write failed/);

  await Promise.all([
    withLibrary(async () => { completed.push("after-failure"); }),
    withLibrary(async () => { completed.push("second"); }),
  ]);
  assert.deepEqual(completed, ["after-failure", "second"]);
});

test("sections run one at a time even when their work interleaves", async () => {
  const withLibrary = criticalSection();
  let active = 0;
  let peak = 0;

  await Promise.all(Array.from({ length: 6 }, () => withLibrary(async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
  })));

  assert.equal(peak, 1);
});
