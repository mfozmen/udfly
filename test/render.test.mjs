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
