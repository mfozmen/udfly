import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultExportName } from "../src/export.js";

test("defaultExportName swaps a .udf suffix for the target extension", () => {
  assert.equal(defaultExportName("dilekce.udf", "txt"), "dilekce.txt");
  assert.equal(defaultExportName("dilekce.udf", "html"), "dilekce.html");
});

test("defaultExportName strips the .udf suffix case-insensitively", () => {
  assert.equal(defaultExportName("REPORT.UDF", "txt"), "REPORT.txt");
});

test("defaultExportName appends the extension when there is no .udf suffix", () => {
  // A basename without the .udf extension shouldn't have its name dropped —
  // just gain the export extension.
  assert.equal(defaultExportName("notes", "txt"), "notes.txt");
});

test("defaultExportName falls back to document.<ext> for an empty name", () => {
  assert.equal(defaultExportName("", "html"), "document.html");
  assert.equal(defaultExportName(undefined, "txt"), "document.txt");
});
