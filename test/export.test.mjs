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

const {
  defaultExportName,
  withPlatformLineEndings,
  setupExportMenu,
  buildPdfOptions,
} = await import("../src/export.js");
// Imported as `tr` to avoid shadowing node:test's `t` (test context) that
// the test callbacks below receive as their first argument.
const { t: tr } = await import("../src/i18n.js");

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
// a test needs: the item buttons and recorders for the injected saveDialog /
// invoke / window.alert calls. `saveDialog` and `invoke` can be overridden
// (e.g. to reject) for error-path tests; by default they record and resolve
// with `savePath`. Mounted nodes and the window.alert stub are torn down via
// the test's after() hook so the shared jsdom body and window stay clean.
function mountExportMenu(
  t,
  {
    doc,
    savePath,
    saveDialog,
    invoke,
    isTauriAvailable = () => true,
    onBrowserSave,
    generatePdf,
  } = {},
) {
  const exportBtn = document.createElement("button");
  const exportMenu = document.createElement("ul");
  exportMenu.hidden = true;
  const exportTxt = document.createElement("button");
  const exportHtml = document.createElement("button");
  const exportPdf = document.createElement("button");
  exportMenu.append(exportTxt, exportHtml, exportPdf);
  // Stand-in for the real .page element. setupExportMenu needs a reference
  // to it so the PDF generator knows what DOM subtree to render.
  const page = document.createElement("article");
  page.id = "page";
  document.body.append(exportBtn, exportMenu, page);

  const saveCalls = [];
  const invokeCalls = [];
  const browserSaveCalls = [];
  const generatePdfCalls = [];
  const alertCalls = [];
  const realAlert = window.alert;
  window.alert = (msg) => alertCalls.push(msg);
  t.after(() => {
    window.alert = realAlert;
    exportBtn.remove();
    exportMenu.remove();
    page.remove();
  });

  setupExportMenu({
    els: { exportBtn, exportMenu, exportTxt, exportHtml, exportPdf, page },
    getDocument: () => doc,
    saveDialog:
      saveDialog ||
      (async (opts) => {
        saveCalls.push(opts);
        return savePath; // null models the user canceling the picker
      }),
    invoke:
      invoke ||
      (async (cmd, args) => {
        invokeCalls.push([cmd, args]);
      }),
    isTauriAvailable,
    onBrowserSave: onBrowserSave || ((payload) => browserSaveCalls.push(payload)),
    generatePdf:
      generatePdf ||
      (async (element, filename) =>
        generatePdfCalls.push({ tagName: element.tagName, id: element.id, filename })),
  });
  return {
    exportTxt,
    exportHtml,
    exportPdf,
    page,
    saveCalls,
    invokeCalls,
    browserSaveCalls,
    generatePdfCalls,
    alertCalls,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("exportAs TXT writes parsed.text to the path the save dialog returns", async (t) => {
  const parsed = { text: "line one\nline two", pages: 1, properties: {}, elements: [] };
  const { exportTxt, saveCalls, invokeCalls } = mountExportMenu(t, {
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

test("exportAs HTML writes the standalone document", async (t) => {
  const parsed = {
    text: "",
    pages: 1,
    properties: {},
    elements: [
      { type: "paragraph", style: {}, runs: [{ text: "hi", kind: "content", style: {} }] },
    ],
  };
  const { exportHtml, invokeCalls } = mountExportMenu(t, {
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

test("exportAs writes nothing when the user cancels the save dialog", async (t) => {
  const parsed = { text: "x", pages: 1, properties: {}, elements: [] };
  const { exportTxt, saveCalls, invokeCalls } = mountExportMenu(t, {
    doc: { parsed, filename: "x.udf" },
    savePath: null,
  });
  exportTxt.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();
  assert.equal(saveCalls.length, 1, "save dialog still shown");
  assert.equal(invokeCalls.length, 0, "no write after cancel");
});

test("exportAs does nothing when no document is loaded", async (t) => {
  const { exportTxt, saveCalls, invokeCalls } = mountExportMenu(t, {
    doc: null,
    savePath: "/out/whatever.txt",
  });
  exportTxt.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();
  assert.equal(saveCalls.length, 0);
  assert.equal(invokeCalls.length, 0);
});

test("exportAs alerts and writes nothing when the save dialog rejects", async (t) => {
  const parsed = { text: "x", pages: 1, properties: {}, elements: [] };
  const invokeCalls = [];
  const { exportTxt, alertCalls } = mountExportMenu(t, {
    doc: { parsed, filename: "x.udf" },
    saveDialog: async () => {
      throw new Error("picker exploded");
    },
    invoke: async (cmd, args) => invokeCalls.push([cmd, args]),
  });
  exportTxt.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();
  assert.equal(invokeCalls.length, 0, "no write when the picker fails");
  assert.equal(alertCalls.length, 1);
  // Alert text is locale-aware via i18n; assemble the expected string
  // through t() so the assertion stays correct regardless of which
  // locale localStorage happens to hold at test time.
  assert.equal(
    alertCalls[0],
    tr("alert.exportFailed", { cause: "picker exploded" }),
  );
});

test("exportAs alerts when the write command rejects", async (t) => {
  const parsed = { text: "x", pages: 1, properties: {}, elements: [] };
  const { exportTxt, alertCalls } = mountExportMenu(t, {
    doc: { parsed, filename: "x.udf" },
    savePath: "/out/x.txt",
    invoke: async () => {
      throw "EACCES";
    },
  });
  exportTxt.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();
  assert.equal(alertCalls.length, 1);
  assert.equal(alertCalls[0], tr("alert.saveFailed", { cause: "EACCES" }));
});

// --- buildPdfOptions --------------------------------------------------------

test("buildPdfOptions sets pagebreak mode to avoid splitting elements", () => {
  // html2pdf's default pagebreak ['css', 'legacy'] slices through text
  // when an element straddles the page boundary — verification codes,
  // table cells, paragraph runs all end up cut in half. 'avoid-all'
  // forces would-be-split elements onto the next page intact. Keeping
  // 'css' and 'legacy' as fallbacks lets per-element page-break-* hints
  // and explicit .html2pdf__page-break markers still win.
  const options = buildPdfOptions("foo.pdf");
  assert.ok(options.pagebreak, "pagebreak config must be present");
  assert.deepEqual(options.pagebreak.mode, ["avoid-all", "css", "legacy"]);
});

test("buildPdfOptions threads the filename through", () => {
  const options = buildPdfOptions("dilekce.pdf");
  assert.equal(options.filename, "dilekce.pdf");
});

// --- Export as PDF ----------------------------------------------------------

test("exportPdf hands the page element and a .pdf filename to generatePdf", async (t) => {
  const parsed = { text: "x", pages: 1, properties: {}, elements: [] };
  const { exportPdf, page, generatePdfCalls } = mountExportMenu(t, {
    doc: { parsed, filename: "dilekce.udf" },
  });
  exportPdf.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();
  assert.equal(generatePdfCalls.length, 1);
  // The PDF is rasterized from the .page subtree, not from raw parsed
  // text — that's how html2pdf.js produces a visually faithful copy of
  // what the user is reading.
  assert.equal(generatePdfCalls[0].id, "page");
  assert.equal(generatePdfCalls[0].tagName, page.tagName);
  // Filename derived from the source .udf name with .pdf extension, the
  // same pattern TXT and HTML use.
  assert.equal(generatePdfCalls[0].filename, "dilekce.pdf");
});

test("exportPdf is a no-op when no document is loaded", async (t) => {
  const { exportPdf, generatePdfCalls } = mountExportMenu(t, { doc: null });
  exportPdf.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();
  assert.equal(generatePdfCalls.length, 0);
});

test("exportPdf alerts when generatePdf rejects", async (t) => {
  const parsed = { text: "x", pages: 1, properties: {}, elements: [] };
  const { exportPdf, alertCalls } = mountExportMenu(t, {
    doc: { parsed, filename: "x.udf" },
    generatePdf: async () => {
      throw new Error("html2pdf exploded");
    },
  });
  exportPdf.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();
  assert.equal(alertCalls.length, 1);
  assert.equal(
    alertCalls[0],
    tr("alert.pdfExportFailed", { cause: "html2pdf exploded" }),
  );
});

// --- Browser fallback (no Tauri runtime) -----------------------------------

test("exportAs TXT triggers browser-save when Tauri is unavailable", async (t) => {
  const parsed = { text: "line one\nline two", pages: 1, properties: {}, elements: [] };
  const { exportTxt, saveCalls, invokeCalls, browserSaveCalls } = mountExportMenu(t, {
    doc: { parsed, filename: "dilekce.udf" },
    isTauriAvailable: () => false,
  });
  exportTxt.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();
  assert.equal(saveCalls.length, 0, "no Tauri save dialog when bridge is missing");
  assert.equal(invokeCalls.length, 0, "no Tauri write_file_text when bridge is missing");
  assert.equal(browserSaveCalls.length, 1);
  assert.equal(browserSaveCalls[0].filename, "dilekce.txt");
  assert.equal(browserSaveCalls[0].mimeType, "text/plain;charset=utf-8");
  assert.equal(browserSaveCalls[0].contents, "line one\nline two");
});

test("exportAs HTML triggers browser-save with the standalone document", async (t) => {
  const parsed = {
    text: "",
    pages: 1,
    properties: {},
    elements: [
      { type: "paragraph", style: {}, runs: [{ text: "hi", kind: "content", style: {} }] },
    ],
  };
  const { exportHtml, browserSaveCalls } = mountExportMenu(t, {
    doc: { parsed, filename: "dilekce.udf" },
    isTauriAvailable: () => false,
  });
  exportHtml.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();
  assert.equal(browserSaveCalls.length, 1);
  assert.equal(browserSaveCalls[0].filename, "dilekce.html");
  assert.equal(browserSaveCalls[0].mimeType, "text/html;charset=utf-8");
  assert.match(browserSaveCalls[0].contents, /^<!doctype html>/i);
  assert.ok(browserSaveCalls[0].contents.includes("<span>hi</span>"));
});

test("exportAs browser-save is a no-op when no document is loaded", async (t) => {
  const { exportTxt, browserSaveCalls } = mountExportMenu(t, {
    doc: null,
    isTauriAvailable: () => false,
  });
  exportTxt.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();
  assert.equal(browserSaveCalls.length, 0);
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
