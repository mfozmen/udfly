// Fidelity fixes that bring the renderer's output closer to the official
// UYAP/e-devlet viewer: borderless layout tables, page-scoped headers, and
// tab stops. Kept in its own file so render.test.mjs stays under the
// 300-line cap. Covers both the parser changes (against the real fixtures
// where they exercise the relevant constructs) and the render changes
// (against constructed input).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { JSDOM } from "jsdom";

const { window } = new JSDOM();
globalThis.DOMParser = window.DOMParser;

const { parseUDF } = await import("../src/parser.js");
const { renderToHTML } = await import("../src/render.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "..", "samples", "fixtures");

async function loadFixture(name) {
  const file = await readFile(path.join(fixturesDir, name));
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
}

// --- borderless layout tables ---------------------------------------------

test("parseUDF reads the table's border attribute", async () => {
  const buffer = await loadFixture("fixture-mediation-form-with-table.udf");
  const parsed = await parseUDF(buffer);
  const table = parsed.elements.find((e) => e.type === "table");
  assert.ok(table, "the fixture has a table element");
  assert.equal(table.border, "borderNone");
});

test("renderToHTML marks a borderNone table so its cells render without borders", () => {
  // UYAP uses borderless tables for column layout (signature blocks etc.).
  // The renderer must not paint cell borders on those — the official viewer
  // shows them seamless. The intent rides on a data attribute the CSS keys
  // off, so the table still has the udf-table class for everything else.
  const parsed = {
    text: "",
    pages: 1,
    properties: {},
    elements: [
      {
        type: "table",
        border: "borderNone",
        rows: [[[{ type: "paragraph", style: {}, runs: [{ text: "x", kind: "content", style: {} }] }]]],
      },
    ],
  };
  const html = renderToHTML(parsed);
  assert.match(html, /<table[^>]*class="udf-table"[^>]*data-border="none"[^>]*>/);
});

test("renderToHTML keeps painting borders on tables without a borderNone flag", () => {
  const parsed = {
    text: "",
    pages: 1,
    properties: {},
    elements: [
      {
        type: "table",
        rows: [[[{ type: "paragraph", style: {}, runs: [{ text: "x", kind: "content", style: {} }] }]]],
      },
    ],
  };
  const html = renderToHTML(parsed);
  assert.match(html, /<table[^>]*class="udf-table"[^>]*>/);
  assert.ok(!/data-border="none"/.test(html), "no data-border on a default table");
});

// --- page-scoped headers/footers ------------------------------------------

test("parseUDF defaults a header's startPage to 1 when the attribute is absent", async () => {
  const buffer = await loadFixture("fixture-mediation-application.udf");
  const parsed = await parseUDF(buffer);
  const header = parsed.elements.find((e) => e.type === "header");
  assert.ok(header, "the fixture has a header element");
  assert.equal(header.startPage, 1);
});

test("renderToHTML skips a header whose startPage is past the document's page count", () => {
  // A UYAP page header with startPage="2" is page-2-onward furniture; on a
  // one-page document the official viewer never shows it, so we mustn't
  // paint it inline at the top of the body.
  const parsed = {
    text: "",
    pages: 1,
    properties: {},
    elements: [
      {
        type: "header",
        startPage: 2,
        paragraphs: [{ type: "paragraph", style: {}, runs: [{ text: "court name", kind: "content", style: {} }] }],
      },
      { type: "paragraph", style: {}, runs: [{ text: "body", kind: "content", style: {} }] },
    ],
  };
  const html = renderToHTML(parsed);
  assert.ok(!/udf-header/.test(html), "header with startPage 2 should not render on a 1-page doc");
  assert.ok(html.includes("body"), "the body paragraph still renders");
});

test("renderToHTML renders a header whose startPage is within the page count", () => {
  const parsed = {
    text: "",
    pages: 1,
    properties: {},
    elements: [
      {
        type: "header",
        startPage: 1,
        paragraphs: [{ type: "paragraph", style: {}, runs: [{ text: "court name", kind: "content", style: {} }] }],
      },
    ],
  };
  const html = renderToHTML(parsed);
  assert.match(html, /<div[^>]*class="udf-header"[^>]*>/);
});

// --- TabSet tab alignment -------------------------------------------------

test("renderToHTML advances tabbed content to the paragraph's TabSet stop", () => {
  // A paragraph with TabSet "297.0:0:0" and a tab between two runs must put
  // the text after the tab at 297pt from the line start — the official
  // viewer aligns the second column there. Modeled as an inline-block of
  // min-width 297pt wrapping the pre-tab content.
  const parsed = {
    text: "",
    pages: 1,
    properties: {},
    elements: [
      {
        type: "paragraph",
        style: { tabSet: "297.0:0:0" },
        runs: [
          { text: "Perihan AK YURDAKUL", kind: "content", style: {} },
          { text: "\t", kind: "tab", style: {} },
          { text: "IBRAHIM KURSUN", kind: "content", style: {} },
        ],
      },
    ],
  };
  const html = renderToHTML(parsed);
  assert.match(
    html,
    /<span[^>]*display:\s*inline-block[^>]*min-width:\s*297pt[^>]*>(?:<[^>]*>)*Perihan AK YURDAKUL/,
    "expected the pre-tab content in a 297pt-min-width inline-block"
  );
  assert.ok(html.includes("IBRAHIM KURSUN"), "post-tab content still renders");
  assert.ok(
    !/min-width[^>]*>(?:<[^>]*>)*IBRAHIM KURSUN/.test(html),
    "post-tab content flows freely, not inside a tab box"
  );
});

test("renderToHTML uses successive TabSet stops for successive tabs", () => {
  const parsed = {
    text: "",
    pages: 1,
    properties: {},
    elements: [
      {
        type: "paragraph",
        style: { tabSet: "30.0:0:0,80.0:0:0" },
        runs: [
          { text: "a", kind: "content", style: {} },
          { text: "\t", kind: "tab", style: {} },
          { text: "b", kind: "content", style: {} },
          { text: "\t", kind: "tab", style: {} },
          { text: "c", kind: "content", style: {} },
        ],
      },
    ],
  };
  const html = renderToHTML(parsed);
  // First segment box reaches the first stop (30pt); the second box spans
  // from the first stop to the second (80-30 = 50pt); the last segment flows.
  assert.match(html, /min-width:\s*30pt[^>]*>(?:<[^>]*>)*a</);
  assert.match(html, /min-width:\s*50pt[^>]*>(?:<[^>]*>)*b</);
  assert.match(html, /<span>c<\/span><\/p>$/);
  assert.ok(!/min-width[^>]*>(?:<[^>]*>)*c</.test(html), "last segment is not in a tab box");
});

test("renderToHTML leaves tabs untouched when the paragraph has no TabSet", () => {
  const parsed = {
    text: "",
    pages: 1,
    properties: {},
    elements: [
      {
        type: "paragraph",
        style: {},
        runs: [
          { text: "a", kind: "content", style: {} },
          { text: "\t", kind: "tab", style: {} },
          { text: "b", kind: "content", style: {} },
        ],
      },
    ],
  };
  const html = renderToHTML(parsed);
  assert.ok(!/inline-block/.test(html), "no inline-block boxes without a TabSet");
  assert.ok(html.includes("\t"), "the literal tab character is still emitted");
});
