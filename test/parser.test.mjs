import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { JSDOM } from "jsdom";

const { window } = new JSDOM();
globalThis.DOMParser = window.DOMParser;

const { parseUDF } = await import("../src/parser.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "..", "samples", "fixtures");

async function loadFixture(name) {
  const file = await readFile(path.join(fixturesDir, name));
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
}

test("parseUDF extracts CDATA text containing Turkish keywords", async () => {
  const buffer = await loadFixture("fixture-mediation-application.udf");
  const result = await parseUDF(buffer);
  assert.ok(typeof result.text === "string", "text should be a string");
  assert.ok(result.text.length > 0, "text should be non-empty");
  assert.ok(
    result.text.includes("ARABULUCULUK"),
    "text should contain ARABULUCULUK"
  );
  assert.ok(
    result.text.includes("BAŞVURU"),
    "text should contain BAŞVURU"
  );
});

test("parseUDF returns elements with at least one paragraph", async () => {
  const buffer = await loadFixture("fixture-mediation-application.udf");
  const result = await parseUDF(buffer);
  assert.ok(Array.isArray(result.elements), "elements should be an array");
  assert.ok(result.elements.length > 0, "elements should be non-empty");
  const paragraphs = result.elements.filter((e) => e.type === "paragraph");
  assert.ok(
    paragraphs.length > 0,
    "should have at least one paragraph element"
  );
});

test("parseUDF populates runs with offset-sliced text and bold style", async () => {
  const buffer = await loadFixture("fixture-mediation-application.udf");
  const result = await parseUDF(buffer);
  const allRuns = result.elements
    .filter((e) => e.type === "paragraph")
    .flatMap((e) => e.runs);
  assert.ok(allRuns.length > 0, "expected runs across paragraphs");
  assert.ok(
    allRuns.every((r) => typeof r.text === "string"),
    "every run should have text"
  );
  assert.ok(
    allRuns.every((r) => r.kind === "content" || r.kind === "space" || r.kind === "field"),
    "every run should declare its kind"
  );
  const boldRuns = allRuns.filter((r) => r.style && r.style.bold === true);
  assert.ok(boldRuns.length > 0, "at least one run should be bold");
});
