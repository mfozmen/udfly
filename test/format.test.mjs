import { test } from "node:test";
import assert from "node:assert/strict";

const { formatBytes } = await import("../src/format.js");

test("formatBytes renders bytes under 1024 with the B suffix", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1023), "1023 B");
});

test("formatBytes renders kilobyte values with one decimal and KB suffix", () => {
  assert.equal(formatBytes(1024), "1.0 KB");
  assert.equal(formatBytes(2253), "2.2 KB");
  assert.equal(formatBytes(1024 * 1024 - 1), "1024.0 KB");
});

test("formatBytes renders megabyte values with one decimal and MB suffix", () => {
  assert.equal(formatBytes(1024 * 1024), "1.0 MB");
  assert.equal(formatBytes(3.5 * 1024 * 1024), "3.5 MB");
});
