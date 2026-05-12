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

test("renderToHTML applies fontFamily as inline font-family on run spans", async () => {
  const buffer = await loadFixture("fixture-mediation-application.udf");
  const parsed = await parseUDF(buffer);
  const html = renderToHTML(parsed);
  // Loose check: the family name appears in a font-family declaration.
  // Quoting style is exercised by the next cycle.
  assert.ok(
    /<span[^>]*font-family:[^>]*Times New Roman[^>]*>/.test(html),
    "expected span with font-family containing Times New Roman"
  );
});

test("renderToHTML applies color as inline color on the run span", () => {
  const parsed = {
    text: "",
    pages: 1,
    properties: {},
    elements: [
      {
        type: "paragraph",
        style: {},
        runs: [
          {
            text: "x",
            kind: "content",
            style: { color: "rgb(255, 0, 0)" },
          },
        ],
      },
    ],
  };
  const html = renderToHTML(parsed);
  assert.ok(
    /<span[^>]*color:\s*rgb\(255,\s*0,\s*0\)[^>]*>/.test(html),
    "expected span with color: rgb(255, 0, 0)"
  );
});

test("renderToHTML applies fontSize as inline font-size in pt units", async () => {
  const buffer = await loadFixture("fixture-mediation-application.udf");
  const parsed = await parseUDF(buffer);
  const html = renderToHTML(parsed);
  assert.ok(
    /<span[^>]*font-size:\s*1[12]pt[^>]*>/.test(html),
    "expected at least one span with font-size 11pt or 12pt"
  );
});

test("renderToHTML applies underline as text-decoration on run spans", async () => {
  const buffer = await loadFixture("fixture-mediation-application.udf");
  const parsed = await parseUDF(buffer);
  const html = renderToHTML(parsed);
  assert.ok(
    /<span[^>]*text-decoration:\s*underline[^>]*>/.test(html),
    "expected at least one span with text-decoration: underline"
  );
});

test("renderToHTML applies bold as inline font-weight on the run span", async () => {
  const buffer = await loadFixture("fixture-mediation-application.udf");
  const parsed = await parseUDF(buffer);
  const html = renderToHTML(parsed);
  assert.ok(
    /<span[^>]*font-weight:\s*bold[^>]*>/.test(html),
    "expected at least one span with font-weight: bold"
  );
});

test("renderToHTML emits each run as a <span>", async () => {
  const buffer = await loadFixture("fixture-mediation-application.udf");
  const parsed = await parseUDF(buffer);
  const html = renderToHTML(parsed);
  assert.ok(/<span[\s>]/.test(html), "expected at least one <span> tag");
});

test("renderToHTML sets white-space: pre-wrap on every paragraph", async () => {
  const buffer = await loadFixture("fixture-mediation-application.udf");
  const parsed = await parseUDF(buffer);
  const html = renderToHTML(parsed);
  const paragraphCount = (html.match(/<p[\s>]/g) || []).length;
  const preWrapCount = (html.match(/white-space:\s*pre-wrap/g) || []).length;
  assert.ok(paragraphCount > 0, "should have rendered paragraphs");
  assert.equal(
    preWrapCount,
    paragraphCount,
    `every paragraph should carry white-space: pre-wrap (have ${preWrapCount}/${paragraphCount})`
  );
});

test("renderToHTML renders the application fixture's contact block without line-height collapse", async () => {
  const buffer = await loadFixture("fixture-mediation-application.udf");
  const parsed = await parseUDF(buffer);
  const html = renderToHTML(parsed);
  // Regression for #7. Every contact-block paragraph in this fixture has
  // lineSpacing 0.5; the broken state shipped a literal CSS line-height of
  // 0.5 (or 0.<n> for other lineSpacing values), collapsing adjacent
  // lines on top of each other. The regex requires the decimal point
  // explicitly so it can't accidentally match a future, valid
  // line-height: 0 emitted as a sentinel — only the broken sub-1
  // fractional values are flagged.
  const subOneFractional = html.match(/line-height:\s*0\.\d+/g) || [];
  assert.equal(
    subOneFractional.length,
    0,
    `no paragraph should carry a fractional sub-1 line-height; found ${subOneFractional.length}: ${subOneFractional.slice(0, 3).join(", ")}`
  );
});

test("renderToHTML interprets lineSpacing as extra line-height on top of single spacing", () => {
  // UDF's LineSpacing is additive — UYAP's body-text paragraphs ship with
  // values like 0.5 meaning "half a line of extra space" (1.5x total),
  // matching the Java text framework UYAP is built on. Treating it as a
  // raw CSS line-height multiplier (0.5 → line-height: 0.5) would collapse
  // the lines on top of each other; the renderer must emit
  // line-height: (1 + lineSpacing). Two data points pin the formula —
  // a single data point would let `lineSpacing * 2` pass coincidentally.
  function renderWithLineSpacing(value) {
    return renderToHTML({
      text: "",
      pages: 1,
      properties: {},
      elements: [
        {
          type: "paragraph",
          style: { lineSpacing: value },
          runs: [{ text: "x", kind: "content", style: {} }],
        },
      ],
    });
  }
  // 0.5 → 1.5 ("single plus half"), the common UYAP body-text value.
  assert.ok(
    /<p[^>]*line-height:\s*1\.5[^>]*>/.test(renderWithLineSpacing(0.5)),
    "lineSpacing 0.5 should render as line-height 1.5"
  );
  // 1.0 → 2.0 (double spacing). Catches a hypothetical wrong formula
  // like `lineSpacing * 3` (0.5 → 1.5, but 1.0 → 3.0) or
  // `0.5 + lineSpacing * 2` (0.5 → 1.5, but 1.0 → 2.5) that would
  // coincidentally pass the first assertion while breaking the formula.
  assert.ok(
    /<p[^>]*line-height:\s*2(?!\.\d|\d)[^>]*>/.test(renderWithLineSpacing(1.0)),
    "lineSpacing 1.0 should render as line-height 2 (double spacing)"
  );
});

test("renderToHTML applies spaceBelow as inline margin-bottom in pt", () => {
  const parsed = {
    text: "",
    pages: 1,
    properties: {},
    elements: [
      {
        type: "paragraph",
        style: { spaceBelow: 6 },
        runs: [{ text: "x", kind: "content", style: {} }],
      },
    ],
  };
  const html = renderToHTML(parsed);
  assert.ok(/<p[^>]*margin-bottom:\s*6pt[^>]*>/.test(html), "expected margin-bottom: 6pt");
});

test("renderToHTML applies spaceAbove as inline margin-top in pt", () => {
  const parsed = {
    text: "",
    pages: 1,
    properties: {},
    elements: [
      {
        type: "paragraph",
        style: { spaceAbove: 4 },
        runs: [{ text: "x", kind: "content", style: {} }],
      },
    ],
  };
  const html = renderToHTML(parsed);
  assert.ok(/<p[^>]*margin-top:\s*4pt[^>]*>/.test(html), "expected margin-top: 4pt");
});

test("renderToHTML applies rightIndent as inline margin-right in pt", async () => {
  const buffer = await loadFixture("fixture-mediation-application.udf");
  const parsed = await parseUDF(buffer);
  const html = renderToHTML(parsed);
  assert.ok(
    /<p[^>]*margin-right:\s*1pt[^>]*>/.test(html),
    "expected paragraph with margin-right: 1pt"
  );
});

test("renderToHTML applies leftIndent as inline margin-left in pt", async () => {
  const buffer = await loadFixture("fixture-mediation-application.udf");
  const parsed = await parseUDF(buffer);
  const html = renderToHTML(parsed);
  assert.ok(
    /<p[^>]*margin-left:\s*3pt[^>]*>/.test(html),
    "expected paragraph with margin-left: 3pt"
  );
});

test("renderToHTML emits &nbsp; placeholder for whitespace-only paragraphs", () => {
  const parsed = {
    text: "",
    pages: 1,
    properties: {},
    elements: [
      {
        type: "paragraph",
        style: {},
        runs: [
          { text: "  \n\t", kind: "content", style: {} },
          { text: "   ", kind: "space", style: {} },
        ],
      },
    ],
  };
  const html = renderToHTML(parsed);
  assert.match(html, /<p[^>]*>&nbsp;<\/p>/);
});

test("renderToHTML emits &nbsp; placeholder for paragraphs with no runs", () => {
  const parsed = {
    text: "",
    pages: 1,
    properties: {},
    elements: [{ type: "paragraph", style: {}, runs: [] }],
  };
  const html = renderToHTML(parsed);
  assert.match(html, /<p[^>]*>&nbsp;<\/p>/);
});

test("renderToHTML wraps footers in <div class=\"udf-footer\">", async () => {
  const buffer = await loadFixture("fixture-mediation-application.udf");
  const parsed = await parseUDF(buffer);
  const html = renderToHTML(parsed);
  assert.ok(/<div[^>]*class="udf-footer"[^>]*>/.test(html), "expected div.udf-footer");
});

test("renderToHTML wraps headers in <div class=\"udf-header\">", async () => {
  const buffer = await loadFixture("fixture-mediation-application.udf");
  const parsed = await parseUDF(buffer);
  const html = renderToHTML(parsed);
  assert.ok(/<div[^>]*class="udf-header"[^>]*>/.test(html), "expected div.udf-header");
});

test("renderToHTML renders tables with .udf-table class and tr/td nesting", async () => {
  const buffer = await loadFixture("fixture-mediation-form-with-table.udf");
  const parsed = await parseUDF(buffer);
  const html = renderToHTML(parsed);
  assert.ok(/<table[^>]*class="udf-table"[^>]*>/.test(html), "expected <table class=\"udf-table\">");
  assert.ok(/<tr[\s>]/.test(html), "expected <tr>");
  assert.ok(/<td[\s>]/.test(html), "expected <td>");
});

test("renderToHTML applies alignment as inline text-align on the paragraph", async () => {
  const buffer = await loadFixture("fixture-mediation-application.udf");
  const parsed = await parseUDF(buffer);
  const html = renderToHTML(parsed);
  assert.ok(
    /<p[^>]*text-align:\s*(?:center|justify)[^>]*>/.test(html),
    "expected paragraph with text-align center or justify"
  );
});

test("renderToHTML emits each paragraph as a <p>", async () => {
  const buffer = await loadFixture("fixture-mediation-application.udf");
  const parsed = await parseUDF(buffer);
  const html = renderToHTML(parsed);
  assert.equal(typeof html, "string", "renderToHTML should return a string");
  assert.ok(/<p[\s>]/.test(html), "expected at least one <p> tag");
});
