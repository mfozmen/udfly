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

test("renderToHTML strips Unicode line terminators from fontFamily values", () => {
  // Beyond ASCII \r and \n, three Unicode chars are sometimes treated as
  // line terminators by browser-quirk parsers: U+0085 (NEL), U+2028 (LS),
  // U+2029 (PS). The CSS3 spec doesn't list them, but stripping them is
  // cheap defense-in-depth against parser implementation quirks.
  const attacks = [
    "Times" + String.fromCharCode(0x0085) + "rest",
    "Arial" + String.fromCharCode(0x2028) + "rest",
    "Times" + String.fromCharCode(0x2029) + "rest",
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
    const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
    const span = dom.window.document.querySelector("span");
    const styleAttr = span.getAttribute("style") || "";
    const familyMatch = styleAttr.match(/font-family:\s*'([^']*)'/);
    assert.ok(
      familyMatch,
      `font-family should be present for input ${JSON.stringify(attack)}`
    );
    const stripped = familyMatch[1];
    const hasLineTerminator =
      stripped.includes(String.fromCharCode(0x0085)) ||
      stripped.includes(String.fromCharCode(0x2028)) ||
      stripped.includes(String.fromCharCode(0x2029));
    assert.ok(
      !hasLineTerminator,
      `family value for input ${JSON.stringify(attack)} should have Unicode line terminators stripped; got ${JSON.stringify(stripped)}`
    );
  }
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
