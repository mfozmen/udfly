import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { JSDOM } from "jsdom";

const { window } = new JSDOM();
globalThis.DOMParser = window.DOMParser;

const { parseUDF, colorIntToRgb } = await import("../src/parser.js");

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

test("parseUDF exposes pageFormat attributes via properties", async () => {
  const buffer = await loadFixture("fixture-mediation-application.udf");
  const result = await parseUDF(buffer);
  assert.equal(typeof result.properties, "object");
  // Margins in fixture 1 (the application form):
  //   leftMargin="56.69291305541992", topMargin="28.34645652770996"
  // Numbers are kept as numbers, not strings.
  assert.equal(typeof result.properties.leftMargin, "number");
  assert.ok(
    result.properties.leftMargin > 56 && result.properties.leftMargin < 57,
    `leftMargin should be ~56.69, got ${result.properties.leftMargin}`
  );
  assert.ok(
    result.properties.topMargin > 28 && result.properties.topMargin < 29,
    `topMargin should be ~28.35, got ${result.properties.topMargin}`
  );
  assert.equal(result.properties.paperOrientation, 1);
});

test("parseUDF parses header and footer wrappers with paragraph children", async () => {
  const buffer = await loadFixture("fixture-mediation-application.udf");
  const result = await parseUDF(buffer);
  const headers = result.elements.filter((e) => e.type === "header");
  const footers = result.elements.filter((e) => e.type === "footer");
  assert.ok(headers.length > 0, "fixture should declare at least one header");
  assert.ok(footers.length > 0, "fixture should declare at least one footer");
  assert.ok(
    headers[0].paragraphs.every((p) => p.type === "paragraph"),
    "header.paragraphs entries should all be paragraphs"
  );
  assert.ok(
    footers[0].paragraphs.every((p) => p.type === "paragraph"),
    "footer.paragraphs entries should all be paragraphs"
  );
});

test("parseUDF parses table → row → cell → paragraph nesting", async () => {
  const buffer = await loadFixture("fixture-mediation-form-with-table.udf");
  const result = await parseUDF(buffer);
  const tables = result.elements.filter((e) => e.type === "table");
  assert.ok(tables.length > 0, "second fixture should contain at least one table");
  const firstTable = tables[0];
  assert.ok(Array.isArray(firstTable.rows), "table.rows should be an array");
  assert.ok(firstTable.rows.length > 0, "table should have at least one row");
  const firstRow = firstTable.rows[0];
  assert.ok(Array.isArray(firstRow), "row should be an array of cells");
  assert.ok(firstRow.length > 0, "row should have at least one cell");
  const firstCell = firstRow[0];
  assert.ok(Array.isArray(firstCell), "cell should be an array of paragraphs");
  assert.ok(
    firstCell.every((p) => p.type === "paragraph"),
    "cell entries should all be paragraph nodes"
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

test("colorIntToRgb converts Java signed 32-bit ARGB ints to rgb() strings", () => {
  // -16777216 == 0xFF000000 (opaque black)
  assert.equal(colorIntToRgb(-16777216), "rgb(0, 0, 0)");
  // -13421773 == 0xFF333333 (dark gray; the "default" style's foreground in fixture 1)
  assert.equal(colorIntToRgb(-13421773), "rgb(51, 51, 51)");
  // -1 == 0xFFFFFFFF (opaque white)
  assert.equal(colorIntToRgb(-1), "rgb(255, 255, 255)");
  // Positive value still parses correctly: 16711680 == 0x00FF0000 (alpha 0, red 255)
  assert.equal(colorIntToRgb(16711680), "rgb(255, 0, 0)");
});

test("parseUDF normalizes underline, fontSize, and alignment from fixture data", async () => {
  const buffer = await loadFixture("fixture-mediation-application.udf");
  const result = await parseUDF(buffer);
  const paragraphs = result.elements.filter((e) => e.type === "paragraph");
  const runs = paragraphs.flatMap((p) => p.runs);

  // The fixture contains underline="true" on at least one run.
  assert.ok(
    runs.some((r) => r.style.underline === true),
    "expected at least one underlined run"
  );

  // size="11" and size="12" both appear; both should normalize to fontSize numbers.
  const sizes = new Set(
    runs.map((r) => r.style.fontSize).filter((n) => typeof n === "number")
  );
  assert.ok(sizes.has(11) || sizes.has(12), "expected fontSize 11 or 12 on runs");

  // Alignment="0" (left), "1" (center), and "3" (justify) all occur on paragraphs.
  const alignments = new Set(
    paragraphs.map((p) => p.style.alignment).filter((n) => typeof n === "number")
  );
  assert.ok(
    alignments.has(0) && alignments.has(1) && alignments.has(3),
    `expected alignments 0, 1, and 3 to be present, got ${[...alignments].join(",")}`
  );
});

test("parseUDF resolves the resolver chain into paragraph and run styles", async () => {
  const buffer = await loadFixture("fixture-mediation-application.udf");
  const result = await parseUDF(buffer);
  const paragraphs = result.elements.filter((e) => e.type === "paragraph");
  // Many paragraphs in this fixture declare resolver="edf_1456817714676",
  // which itself resolves to "hvl-default" with family="Times New Roman".
  // After the chain is flattened, those paragraphs must inherit the family.
  const inherited = paragraphs.filter(
    (p) => p.style.fontFamily === "Times New Roman"
  );
  assert.ok(
    inherited.length > 0,
    "expected at least one paragraph to inherit fontFamily=Times New Roman via resolver chain"
  );
  // Element-own attributes still win over the resolved chain — no paragraph
  // in the fixture overrides family with anything other than Times New Roman
  // or Arial, so the inherited set should be the dominant one.
  assert.ok(
    inherited.length >= paragraphs.length / 2,
    "resolver chain should populate fontFamily on most paragraphs"
  );
});
