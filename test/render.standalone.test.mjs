import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { JSDOM } from "jsdom";

const { window } = new JSDOM();
globalThis.DOMParser = window.DOMParser;

const { parseUDF } = await import("../src/parser.js");
const { renderToHTML, renderToStandaloneHTML } = await import("../src/render.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "..", "samples", "fixtures");

async function loadFixture(name) {
  const file = await readFile(path.join(fixturesDir, name));
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
}

test("renderToStandaloneHTML returns a complete HTML5 document", () => {
  const parsed = {
    text: "",
    pages: 1,
    properties: {},
    elements: [
      { type: "paragraph", style: {}, runs: [{ text: "hi", kind: "content", style: {} }] },
    ],
  };
  const doc = renderToStandaloneHTML(parsed);
  assert.match(doc, /^<!doctype html>/i, "should start with the HTML5 doctype");
  assert.match(doc, /<\/html>\s*$/i, "should end with the closing html tag");
  assert.match(doc, /<meta charset="UTF-8">/, "should declare UTF-8 charset");
});

test("renderToStandaloneHTML embeds the rendered body inside <body>", () => {
  const parsed = {
    text: "",
    pages: 1,
    properties: {},
    elements: [
      { type: "paragraph", style: {}, runs: [{ text: "hello", kind: "content", style: {} }] },
    ],
  };
  const rendered = renderToHTML(parsed);
  const doc = renderToStandaloneHTML(parsed);
  // Body must contain renderToHTML output verbatim (no re-escaping, no
  // transformation) — otherwise exported HTML could drift visually from
  // the viewer and surprise users. Structural wrappers (a page container
  // that mirrors the viewer's own .page div) are allowed; transformation
  // of the rendered HTML itself is not.
  assert.ok(
    doc.includes(rendered),
    "expected <body> to contain renderToHTML output verbatim"
  );
  // And the rendered output must live inside <body>, not stray into <head>.
  const bodyMatch = doc.match(/<body>([\s\S]*)<\/body>/);
  assert.ok(bodyMatch, "expected a <body>...</body> region");
  assert.ok(
    bodyMatch[1].includes(rendered),
    "expected renderToHTML output inside <body>"
  );
});

test("renderToStandaloneHTML inlines renderer-class CSS so the file is self-contained", async () => {
  const buffer = await loadFixture("fixture-mediation-form-with-table.udf");
  const parsed = await parseUDF(buffer);
  const doc = renderToStandaloneHTML(parsed);
  // The renderer emits .udf-header / .udf-footer / .udf-table classes; if the
  // export omitted their CSS, opening the exported file in a browser would
  // show unstyled headers/footers and an unbordered table. The point of the
  // export is to be visually faithful, so the rules must travel with the doc.
  assert.match(doc, /<style>[\s\S]*\.udf-header[\s\S]*<\/style>/, "expected .udf-header rule in <style>");
  assert.match(doc, /<style>[\s\S]*\.udf-footer[\s\S]*<\/style>/, "expected .udf-footer rule in <style>");
  assert.match(doc, /<style>[\s\S]*\.udf-table[\s\S]*<\/style>/, "expected .udf-table rule in <style>");
});

test("renderToStandaloneHTML preserves HTML-escaping of run text end to end", () => {
  // The standalone wrapper embeds renderToHTML output verbatim, so HTML-
  // special characters in run text must arrive escaped — a future refactor
  // that re-processed the body (or built the wrapper from a non-escaped
  // source) would otherwise let "<script>" through into the exported file.
  const parsed = {
    text: "",
    pages: 1,
    properties: {},
    elements: [
      {
        type: "paragraph",
        style: {},
        runs: [
          { text: '<script>alert("x")</script> & <b>bold</b>', kind: "content", style: {} },
        ],
      },
    ],
  };
  const doc = renderToStandaloneHTML(parsed);
  assert.ok(!/<script>/i.test(doc), "raw <script> must not appear in the document body");
  assert.ok(!/<b>bold<\/b>/i.test(doc), "raw <b> markup must not appear");
  assert.match(doc, /&lt;script&gt;/, "script text should be present escaped");
  assert.match(doc, /&amp; /, "ampersand should be present escaped");
});

test("renderToStandaloneHTML contains no external resource references", () => {
  const parsed = {
    text: "",
    pages: 1,
    properties: {},
    elements: [
      { type: "paragraph", style: {}, runs: [{ text: "x", kind: "content", style: {} }] },
    ],
  };
  const doc = renderToStandaloneHTML(parsed);
  // A self-contained export shouldn't pull from the network — neither for
  // stylesheets, scripts, nor for fonts. Users may open the file offline or
  // forward it to a colleague who can't reach our origin.
  assert.ok(!/<link\b/i.test(doc), "should not contain <link> tags");
  assert.ok(!/<script\b/i.test(doc), "should not contain <script> tags");
  assert.ok(!/@import\b/i.test(doc), "should not contain @import directives");
  assert.ok(!/url\(/i.test(doc), "should not contain url() references");
});
