import { test } from "node:test";
import assert from "node:assert/strict";

const { formatBytes } = await import("../src/format.js");

// The separator between the number and its unit is U+00A0 (non-breaking
// space). The pair must never wrap — a stray "3.4" without its unit is
// unreadable in a narrow status bar column.
const NBSP = " ";

test("formatBytes renders bytes under 1024 with the B suffix", () => {
  assert.equal(formatBytes(0), `0${NBSP}B`);
  assert.equal(formatBytes(512), `512${NBSP}B`);
  assert.equal(formatBytes(1023), `1023${NBSP}B`);
});

test("formatBytes renders kilobyte values with one decimal and KB suffix", () => {
  assert.equal(formatBytes(1024), `1.0${NBSP}KB`);
  assert.equal(formatBytes(2253), `2.2${NBSP}KB`);
  assert.equal(formatBytes(1024 * 1024 - 1), `1024.0${NBSP}KB`);
});

test("formatBytes renders megabyte values with one decimal and MB suffix", () => {
  assert.equal(formatBytes(1024 * 1024), `1.0${NBSP}MB`);
  assert.equal(formatBytes(3.5 * 1024 * 1024), `3.5${NBSP}MB`);
});

test("formatBytes uses a non-breaking space between number and unit", () => {
  assert.match(formatBytes(2048), /^2\.0 KB$/);
});
