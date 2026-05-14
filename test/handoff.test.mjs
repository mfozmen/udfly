import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// handoff.js does not touch the DOM at module-evaluation time (only inside
// the file-input fallback used by pickAndOpenViaBrowser), but the
// browser-fallback tests do exercise that DOM path, so wire jsdom globally.
const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.File = dom.window.File;
globalThis.Blob = dom.window.Blob;

const { createFileLoader } = await import("../src/handoff.js");

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// --- Browser fallback (no Tauri runtime) -----------------------------------

test("pickAndOpen uses the browser file picker when Tauri is unavailable", async () => {
  const loadBytesCalls = [];
  const showErrorCalls = [];
  const file = new dom.window.File(["udf-bytes"], "dilekce.udf", {
    type: "application/x-udf",
  });

  const { pickAndOpen } = createFileLoader({
    loadBytes: async (filename, sizeBytes, buffer) =>
      loadBytesCalls.push({ filename, sizeBytes, byteLength: buffer.byteLength }),
    showError: (msg) => showErrorCalls.push(msg),
    isTauriAvailable: () => false,
    pickFileViaBrowser: async () => file,
  });

  await pickAndOpen();
  await flush();

  assert.equal(loadBytesCalls.length, 1);
  assert.equal(loadBytesCalls[0].filename, "dilekce.udf");
  assert.equal(loadBytesCalls[0].sizeBytes, file.size);
  assert.equal(loadBytesCalls[0].byteLength, file.size);
  assert.equal(showErrorCalls.length, 0);
});

test("pickAndOpen is a no-op when the browser picker resolves with null (user canceled)", async () => {
  const loadBytesCalls = [];
  const { pickAndOpen } = createFileLoader({
    loadBytes: async (...args) => loadBytesCalls.push(args),
    showError: () => {},
    isTauriAvailable: () => false,
    pickFileViaBrowser: async () => null,
  });
  await pickAndOpen();
  await flush();
  assert.equal(loadBytesCalls.length, 0);
});

test("pickAndOpen surfaces a picker error through showError", async () => {
  const showErrorCalls = [];
  const { pickAndOpen } = createFileLoader({
    loadBytes: async () => {},
    showError: (msg) => showErrorCalls.push(msg),
    isTauriAvailable: () => false,
    pickFileViaBrowser: async () => {
      throw new Error("picker exploded");
    },
  });
  await pickAndOpen();
  await flush();
  assert.equal(showErrorCalls.length, 1);
  assert.match(showErrorCalls[0], /picker exploded/);
});

test("pickAndOpen serializes concurrent calls in browser mode too", async () => {
  // The in-flight guard prevents a second pickAndOpen() from running until
  // the first finishes — the same invariant that protects the Tauri path
  // also protects the browser path.
  let pickerCalls = 0;
  let resolvePicker;
  const pickerPromise = new Promise((r) => {
    resolvePicker = r;
  });
  const { pickAndOpen } = createFileLoader({
    loadBytes: async () => {},
    showError: () => {},
    isTauriAvailable: () => false,
    pickFileViaBrowser: () => {
      pickerCalls += 1;
      return pickerPromise;
    },
  });
  pickAndOpen(); // first call, picker pending
  await flush();
  pickAndOpen(); // second call, should be dropped
  await flush();
  assert.equal(pickerCalls, 1, "second call ignored while first in flight");
  resolvePicker(null);
});
