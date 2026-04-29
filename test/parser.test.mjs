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
