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

const { createFileLoader, defaultPickFileViaBrowser } = await import(
  "../src/handoff.js"
);

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

test("defaultPickFileViaBrowser resolves null when window regains focus without a file selection", async () => {
  // Backstops the rare scenario where neither 'change' nor 'cancel' fires
  // (older browsers, browser bugs): when the window regains focus after the
  // OS picker closes and no file ended up in the input, treat it as cancel.
  // Without this, the Promise would never settle, the hidden <input> would
  // linger in the DOM, and any loadInFlight guard wrapping the picker would
  // stay 'true' forever.
  const promise = defaultPickFileViaBrowser();
  // Simulate the OS picker closing: fire focus on window with no file picked.
  await new Promise((r) => setTimeout(r, 10));
  window.dispatchEvent(new dom.window.Event("focus"));
  const result = await promise;
  assert.equal(result, null);
});

// --- Tauri path + onPathOpened ---------------------------------------------

// The Open Recent menu needs to know which host paths were actually opened.
// Only path-driven loads (Tauri dialog, OS handoff) carry a path — browser
// File objects don't — so the notification seam lives in loadFromPath.

test("pickAndOpen via Tauri reports the opened path through onPathOpened", async () => {
  const openedPaths = [];
  const loadBytesCalls = [];
  const { pickAndOpen } = createFileLoader({
    loadBytes: async (filename, sizeBytes, buffer) =>
      loadBytesCalls.push({ filename, sizeBytes, byteLength: buffer.byteLength }),
    showError: () => {},
    isTauriAvailable: () => true,
    onPathOpened: (path) => openedPaths.push(path),
    openDialog: async () => "C:\\docs\\dilekce.udf",
    invoke: async (cmd) => {
      if (cmd === "read_file_bytes") return [1, 2, 3];
      return null; // take_pending_path: queue empty
    },
  });
  await pickAndOpen();
  await flush();
  assert.equal(loadBytesCalls.length, 1);
  assert.equal(loadBytesCalls[0].filename, "dilekce.udf");
  assert.equal(loadBytesCalls[0].byteLength, 3);
  assert.deepEqual(openedPaths, ["C:\\docs\\dilekce.udf"]);
});

test("onPathOpened is not called when the path can't be read", async () => {
  const openedPaths = [];
  const showErrorCalls = [];
  const { pickAndOpen } = createFileLoader({
    loadBytes: async () => {},
    showError: (msg) => showErrorCalls.push(msg),
    isTauriAvailable: () => true,
    onPathOpened: (path) => openedPaths.push(path),
    openDialog: async () => "C:\\docs\\gone.udf",
    invoke: async (cmd) => {
      if (cmd === "read_file_bytes") throw "ENOENT";
      return null;
    },
  });
  await pickAndOpen();
  await flush();
  assert.equal(showErrorCalls.length, 1);
  assert.deepEqual(openedPaths, [], "unreadable paths don't enter the recent list");
});

test("openPath loads a caller-supplied path through the same pipeline", async () => {
  // Open Recent menu clicks hand a stored path straight to the loader; it
  // must flow through the same in-flight guard and onPathOpened reporting
  // as dialog picks.
  const openedPaths = [];
  const loadBytesCalls = [];
  const { openPath } = createFileLoader({
    loadBytes: async (filename, sizeBytes, buffer) =>
      loadBytesCalls.push({ filename, byteLength: buffer.byteLength }),
    showError: () => {},
    isTauriAvailable: () => true,
    onPathOpened: (path) => openedPaths.push(path),
    openDialog: async () => {
      throw new Error("dialog must not open for a recent-file click");
    },
    invoke: async (cmd) => {
      if (cmd === "read_file_bytes") return [9, 9];
      return null;
    },
  });
  await openPath("C:\\docs\\recent.udf");
  await flush();
  assert.equal(loadBytesCalls.length, 1);
  assert.equal(loadBytesCalls[0].filename, "recent.udf");
  assert.deepEqual(openedPaths, ["C:\\docs\\recent.udf"]);
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
