import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultExportName, withPlatformLineEndings } from "../src/export.js";

const WIN_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/120.0";
const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";

test("withPlatformLineEndings converts LF to CRLF on Windows", () => {
  assert.equal(withPlatformLineEndings("a\nb\nc", WIN_UA), "a\r\nb\r\nc");
});

test("withPlatformLineEndings leaves LF alone off Windows", () => {
  assert.equal(withPlatformLineEndings("a\nb\nc", MAC_UA), "a\nb\nc");
});

test("withPlatformLineEndings is idempotent on already-CRLF text under Windows", () => {
  // The parser normalizes to "\n", but if a "\r\n" ever slipped through it
  // must not become "\r\r\n".
  assert.equal(withPlatformLineEndings("a\r\nb", WIN_UA), "a\r\nb");
});

test("withPlatformLineEndings returns text with no newlines unchanged", () => {
  assert.equal(withPlatformLineEndings("no newlines here", WIN_UA), "no newlines here");
});

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
