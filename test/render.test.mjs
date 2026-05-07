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

test("renderToHTML HTML-escapes <, >, &, and \" in run text", () => {
  const parsed = {
    text: "",
    pages: 1,
    properties: {},
    elements: [
      {
        type: "paragraph",
        style: {},
        runs: [
          { text: "<script>alert('x')</script>", kind: "content", style: {} },
          { text: "a & b", kind: "content", style: {} },
          { text: 'attr="x"', kind: "content", style: {} },
        ],
      },
    ],
  };
  const html = renderToHTML(parsed);
  assert.ok(!/<script[\s>]/.test(html), "unescaped <script> must not appear");
  assert.ok(html.includes("&lt;script&gt;"), "expected escaped <script>");
  assert.ok(html.includes("a &amp; b"), "expected escaped &");
  assert.ok(html.includes("&quot;x&quot;"), 'expected escaped "');
});

test("renderToHTML strips CSS-injection vectors from fontFamily values", () => {
  // Hostile UDFs could ship family="..." with CSS-special chars that break
  // out of the single-quoted CSS string (newline ends declaration; backslash
  // starts CSS escape; embedded ' or " would break out of CSS or HTML).
  const attacks = [
    "Times\nColor: red",
    "Arial\\27 ",
    'Times"breakout',
    "Arial'+url(evil)+'",
  ];
  for (const attack of attacks) {
    const parsed = {
      text: "",
      pages: 1,
      properties: {},
      elements: [
        {
          type: "paragraph",
          style: {},
          runs: [
            { text: "x", kind: "content", style: { fontFamily: attack } },
          ],
        },
      ],
    };
    const html = renderToHTML(parsed);
    // Parse output via jsdom and inspect the style attribute the browser
    // actually sees. The font-family value must not contain any CSS/HTML
    // special character.
    const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
    const span = dom.window.document.querySelector("span");
    assert.ok(span, `output should parse to a span for input ${JSON.stringify(attack)}`);
    const styleAttr = span.getAttribute("style") || "";
    const familyMatch = styleAttr.match(/font-family:\s*'([^']*)'/);
    assert.ok(
      familyMatch,
      `font-family should be present and single-quoted for input ${JSON.stringify(attack)}`
    );
    assert.ok(
      !/[\r\n\t\\'"<>]/.test(familyMatch[1]),
      `family value should be sanitized for input ${JSON.stringify(attack)}; got ${JSON.stringify(familyMatch[1])}`
    );
  }
});

test("renderToHTML wraps fontFamily in single quotes so it doesn't break the HTML style attribute", async () => {
  const buffer = await loadFixture("fixture-mediation-application.udf");
  const parsed = await parseUDF(buffer);
  const html = renderToHTML(parsed);
  // Multi-word font names like "Times New Roman" must be quoted in CSS.
  // We use single quotes so the inner quote can't terminate the surrounding
  // double-quoted style attribute and break HTML parsing.
  assert.ok(
    html.includes("font-family: 'Times New Roman'"),
    "font-family should be wrapped in single quotes"
  );
});

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

test("renderToHTML drops malformed color values to prevent CSS injection", () => {
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
            style: { color: "red; font-weight: bold" },
          },
        ],
      },
    ],
  };
  const html = renderToHTML(parsed);
  assert.ok(
    !html.includes("font-weight: bold"),
    "injected font-weight via color value should be dropped"
  );
  assert.ok(
    !html.includes("color: red"),
    "non-rgb color values should be dropped entirely"
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

test("renderToHTML applies leftIndent as inline margin-left in pt", async () => {
  const buffer = await loadFixture("fixture-mediation-application.udf");
  const parsed = await parseUDF(buffer);
  const html = renderToHTML(parsed);
  assert.ok(
    /<p[^>]*margin-left:\s*3pt[^>]*>/.test(html),
    "expected paragraph with margin-left: 3pt"
  );
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
