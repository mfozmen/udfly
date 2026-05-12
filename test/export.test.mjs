import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// setupExportMenu touches `document` (event wiring) and `window` (MouseEvent
// in the tests, window.alert in error paths) — provide both from jsdom.
// `navigator` is left as Node's built-in: its userAgent doesn't contain
// "windows", which is exactly the off-Windows path the exportAs tests want.
const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.document = dom.window.document;
globalThis.window = dom.window;

const { defaultExportName, withPlatformLineEndings, setupExportMenu } =
  await import("../src/export.js");

const WIN_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/120.0";
const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";

test("withPlatformLineEndings converts LF to CRLF on Windows", () => {
  assert.equal(withPlatformLineEndings("a\nb\nc", WIN_UA), "a\r\nb\r\nc");
});

test("withPlatformLineEndings leaves LF alone off Windows", () => {
  assert.equal(withPlatformLineEndings("a\nb\nc", MAC_UA), "a\nb\nc");
});

test("withPlatformLineEndings is idempotent on already-CRLF text under Windows", () => {
  // The parser normalizes to "\n", but if a "\r\n" ever slipped through it
  // must not become "\r\r\n".
  assert.equal(withPlatformLineEndings("a\r\nb", WIN_UA), "a\r\nb");
});

test("withPlatformLineEndings returns text with no newlines unchanged", () => {
  assert.equal(withPlatformLineEndings("no newlines here", WIN_UA), "no newlines here");
});

// --- setupExportMenu / exportAs --------------------------------------------

// Build the topbar Export markup the way index.html does (menu wraps the
// item buttons), wire setupExportMenu with stub deps, and return the pieces
// a test needs: the element map, the item buttons, and recorders for the
// injected saveDialog / invoke calls.
function mountExportMenu({ doc, savePath }) {
  const exportBtn = document.createElement("button");
  const exportMenu = document.createElement("ul");
  exportMenu.hidden = true;
  const exportTxt = document.createElement("button");
  const exportHtml = document.createElement("button");
  exportMenu.append(exportTxt, exportHtml);
  document.body.append(exportBtn, exportMenu);

  const els = { exportBtn, exportMenu, exportTxt, exportHtml };
  const saveCalls = [];
  const invokeCalls = [];
  setupExportMenu({
    els,
    getDocument: () => doc,
    saveDialog: async (opts) => {
      saveCalls.push(opts);
      return savePath; // null models the user canceling the picker
    },
    invoke: async (cmd, args) => {
      invokeCalls.push([cmd, args]);
    },
  });
  return { els, exportTxt, exportHtml, saveCalls, invokeCalls };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("exportAs TXT writes parsed.text to the path the save dialog returns", async () => {
  const parsed = { text: "line one\nline two", pages: 1, properties: {}, elements: [] };
  const { exportTxt, saveCalls, invokeCalls } = mountExportMenu({
    doc: { parsed, filename: "dilekce.udf" },
    savePath: "/out/dilekce.txt",
  });
  exportTxt.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();
  assert.equal(saveCalls.length, 1);
  assert.equal(saveCalls[0].defaultPath, "dilekce.txt");
  assert.deepEqual(invokeCalls, [
    ["write_file_text", { path: "/out/dilekce.txt", contents: "line one\nline two" }],
  ]);
});

test("exportAs HTML writes the standalone document", async () => {
  const parsed = {
    text: "",
    pages: 1,
    properties: {},
    elements: [
      { type: "paragraph", style: {}, runs: [{ text: "hi", kind: "content", style: {} }] },
    ],
  };
  const { exportHtml, invokeCalls } = mountExportMenu({
    doc: { parsed, filename: "dilekce.udf" },
    savePath: "/out/dilekce.html",
  });
  exportHtml.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();
  assert.equal(invokeCalls.length, 1);
  const [cmd, args] = invokeCalls[0];
  assert.equal(cmd, "write_file_text");
  assert.equal(args.path, "/out/dilekce.html");
  assert.match(args.contents, /^<!doctype html>/i);
  assert.ok(args.contents.includes("<span>hi</span>"), "should embed the rendered run");
});

test("exportAs writes nothing when the user cancels the save dialog", async () => {
  const parsed = { text: "x", pages: 1, properties: {}, elements: [] };
  const { exportTxt, saveCalls, invokeCalls } = mountExportMenu({
    doc: { parsed, filename: "x.udf" },
    savePath: null,
  });
  exportTxt.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();
  assert.equal(saveCalls.length, 1, "save dialog still shown");
  assert.equal(invokeCalls.length, 0, "no write after cancel");
});

test("exportAs does nothing when no document is loaded", async () => {
  const { exportTxt, saveCalls, invokeCalls } = mountExportMenu({
    doc: null,
    savePath: "/out/whatever.txt",
  });
  exportTxt.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();
  assert.equal(saveCalls.length, 0);
  assert.equal(invokeCalls.length, 0);
});

test("defaultExportName swaps a .udf suffix for the target extension", () => {
  assert.equal(defaultExportName("dilekce.udf", "txt"), "dilekce.txt");
  assert.equal(defaultExportName("dilekce.udf", "html"), "dilekce.html");
});

test("defaultExportName strips the .udf suffix case-insensitively", () => {
  assert.equal(defaultExportName("REPORT.UDF", "txt"), "REPORT.txt");
});

test("defaultExportName appends the extension when there is no .udf suffix", () => {
  // A basename without the .udf extension shouldn't have its name dropped —
  // just gain the export extension.
  assert.equal(defaultExportName("notes", "txt"), "notes.txt");
});

test("defaultExportName falls back to document.<ext> for an empty name", () => {
  assert.equal(defaultExportName("", "html"), "document.html");
  assert.equal(defaultExportName(undefined, "txt"), "document.txt");
});
