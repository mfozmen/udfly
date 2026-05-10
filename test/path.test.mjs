import { test } from "node:test";
import assert from "node:assert/strict";

const { basename } = await import("../src/path.js");

test("basename strips POSIX directories from a forward-slash path", () => {
  assert.equal(basename("/home/user/docs/example.udf"), "example.udf");
  assert.equal(basename("docs/example.udf"), "example.udf");
});

test("basename strips Windows directories from a backslash path", () => {
  assert.equal(basename("C:\\Users\\fahri\\docs\\example.udf"), "example.udf");
  assert.equal(basename("docs\\example.udf"), "example.udf");
});

test("basename returns the input unchanged when there's no directory", () => {
  assert.equal(basename("example.udf"), "example.udf");
  assert.equal(basename(""), "");
});

test("basename handles mixed separators by stripping up to the last one", () => {
  assert.equal(basename("/home\\user/docs\\example.udf"), "example.udf");
});
