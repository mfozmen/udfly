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
