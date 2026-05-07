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

test("renderToHTML emits each paragraph as a <p>", async () => {
  const buffer = await loadFixture("fixture-mediation-application.udf");
  const parsed = await parseUDF(buffer);
  const html = renderToHTML(parsed);
  assert.equal(typeof html, "string", "renderToHTML should return a string");
  assert.ok(/<p[\s>]/.test(html), "expected at least one <p> tag");
});
