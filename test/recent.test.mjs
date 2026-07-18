import { test } from "node:test";
import assert from "node:assert/strict";

const { getRecentFiles, addRecentFile, clearRecentFiles, MAX_RECENT } =
  await import("../src/recent.js");

// Minimal Storage stand-in — the store only needs getItem/setItem/removeItem.
// Injected instead of a global localStorage so each test starts empty and
// Node (no DOM) can run the suite.
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test("getRecentFiles returns an empty list when nothing is stored", () => {
  assert.deepEqual(getRecentFiles(fakeStorage()), []);
});

test("addRecentFile puts the newest path first", () => {
  const storage = fakeStorage();
  addRecentFile("C:\\docs\\a.udf", storage);
  addRecentFile("C:\\docs\\b.udf", storage);
  assert.deepEqual(getRecentFiles(storage), ["C:\\docs\\b.udf", "C:\\docs\\a.udf"]);
});

test("addRecentFile moves an already-listed path to the front instead of duplicating", () => {
  const storage = fakeStorage();
  addRecentFile("C:\\docs\\a.udf", storage);
  addRecentFile("C:\\docs\\b.udf", storage);
  addRecentFile("C:\\docs\\a.udf", storage);
  assert.deepEqual(getRecentFiles(storage), ["C:\\docs\\a.udf", "C:\\docs\\b.udf"]);
});

test("addRecentFile caps the list at MAX_RECENT, dropping the oldest", () => {
  const storage = fakeStorage();
  for (let i = 1; i <= MAX_RECENT + 2; i++) {
    addRecentFile(`C:\\docs\\${i}.udf`, storage);
  }
  const list = getRecentFiles(storage);
  assert.equal(list.length, MAX_RECENT);
  assert.equal(list[0], `C:\\docs\\${MAX_RECENT + 2}.udf`, "newest survives");
  assert.ok(!list.includes("C:\\docs\\1.udf"), "oldest dropped");
  assert.ok(!list.includes("C:\\docs\\2.udf"), "second-oldest dropped");
});

test("addRecentFile ignores empty and non-string paths", () => {
  const storage = fakeStorage();
  addRecentFile("", storage);
  addRecentFile(null, storage);
  addRecentFile(undefined, storage);
  assert.deepEqual(getRecentFiles(storage), []);
});

test("clearRecentFiles empties the list", () => {
  const storage = fakeStorage();
  addRecentFile("C:\\docs\\a.udf", storage);
  clearRecentFiles(storage);
  assert.deepEqual(getRecentFiles(storage), []);
});

test("getRecentFiles tolerates corrupted stored JSON", () => {
  const storage = fakeStorage({ "udfly.recentFiles": "not json {" });
  assert.deepEqual(getRecentFiles(storage), []);
});

test("getRecentFiles drops non-string entries from stored JSON", () => {
  // A stale or hand-edited store must not leak numbers/objects into the
  // menu-building code, which expects path strings.
  const storage = fakeStorage({
    "udfly.recentFiles": JSON.stringify(["C:\\docs\\a.udf", 42, null, { x: 1 }]),
  });
  assert.deepEqual(getRecentFiles(storage), ["C:\\docs\\a.udf"]);
});
