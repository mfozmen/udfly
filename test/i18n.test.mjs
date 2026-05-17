import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// i18n module touches document (applyTranslations walks the DOM) and
// localStorage (getLocale/setLocale persistence). Provide both from a
// fresh jsdom in each test via beforeEach so per-test localStorage state
// doesn't leak between tests.
let dom;
beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  globalThis.localStorage = dom.window.localStorage;
});

const { t, getLocale, setLocale, applyTranslations, translations } =
  await import("../src/i18n.js");

function makeEl(tag, attrs = {}, text = "") {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text) el.textContent = text;
  document.body.appendChild(el);
  return el;
}

// --- translations exports ---

test("translations exports both tr and en namespaces", () => {
  assert.ok(translations.tr, "tr namespace exists");
  assert.ok(translations.en, "en namespace exists");
});

test("every key present in tr is also present in en (and vice versa)", () => {
  const trKeys = Object.keys(translations.tr).sort();
  const enKeys = Object.keys(translations.en).sort();
  assert.deepEqual(
    trKeys,
    enKeys,
    "tr and en must define exactly the same keys",
  );
});

// --- t(key, locale) ---

test("t returns the Turkish string for a known key by default", () => {
  // Turkish is the canonical default; t() with no locale arg reads
  // getLocale(), which returns 'tr' when localStorage is empty.
  assert.equal(t("topbar.open"), translations.tr["topbar.open"]);
});

test("t returns the English string when locale is 'en'", () => {
  assert.equal(t("topbar.open", "en"), translations.en["topbar.open"]);
});

test("t interpolates {name}-style placeholders from a vars object", () => {
  // Vars come in the second arg as an object; the function disambiguates
  // from the explicit-locale form (where the second arg is a string).
  const result = t("load.readFailed", { name: "x.txt", message: "EACCES" });
  // Both Turkish and English templates contain {name} and {message};
  // the exact wrapping prose differs, but neither placeholder should
  // survive interpolation.
  assert.ok(!result.includes("{name}"), "name placeholder substituted");
  assert.ok(!result.includes("{message}"), "message placeholder substituted");
  assert.ok(result.includes("x.txt"));
  assert.ok(result.includes("EACCES"));
});

test("t replaces every occurrence of the same placeholder", () => {
  // Defensive: a hand-edited translation with the same placeholder
  // twice (e.g. '{name}: {name}') should substitute both occurrences,
  // not just the first.
  translations.tr["__test.repeat"] = "{x} and {x}";
  try {
    assert.equal(t("__test.repeat", { x: "go" }), "go and go");
  } finally {
    delete translations.tr["__test.repeat"];
  }
});

test("t returns the key itself when the key is missing in both locales", () => {
  // Falling back to the key (rather than throwing or returning undefined)
  // keeps a misspelled translation visible during development without
  // breaking the UI.
  const missing = "missing.key.never.defined";
  assert.equal(t(missing), missing);
  assert.equal(t(missing, "en"), missing);
});

// --- getLocale / setLocale ---

test("getLocale defaults to 'tr' when localStorage has no preference", () => {
  assert.equal(getLocale(), "tr");
});

test("getLocale returns the previously stored locale", () => {
  localStorage.setItem("udfly.locale", "en");
  assert.equal(getLocale(), "en");
});

test("getLocale falls back to 'tr' when localStorage has an unsupported locale", () => {
  // Guards against a leftover preference for a locale that no longer
  // ships (e.g. a future deprecation). 'tr' is the canonical default.
  localStorage.setItem("udfly.locale", "fr");
  assert.equal(getLocale(), "tr");
});

test("setLocale writes the locale to localStorage", () => {
  setLocale("en");
  assert.equal(localStorage.getItem("udfly.locale"), "en");
});

test("setLocale ignores unsupported locales", () => {
  setLocale("fr");
  assert.equal(localStorage.getItem("udfly.locale"), null);
});

// --- applyTranslations(root) ---

test("applyTranslations sets textContent on elements with data-i18n", () => {
  const btn = makeEl("button", { "data-i18n": "topbar.open" }, "placeholder");
  applyTranslations(document.body, "tr");
  assert.equal(btn.textContent, translations.tr["topbar.open"]);
});

test("applyTranslations switches to English when locale='en' is passed", () => {
  const btn = makeEl("button", { "data-i18n": "topbar.open" }, "x");
  applyTranslations(document.body, "en");
  assert.equal(btn.textContent, translations.en["topbar.open"]);
});

test("applyTranslations sets aria-label on elements with data-i18n-aria-label", () => {
  const section = makeEl(
    "section",
    { "data-i18n-aria-label": "state.empty.aria" },
    "x",
  );
  applyTranslations(document.body, "tr");
  assert.equal(
    section.getAttribute("aria-label"),
    translations.tr["state.empty.aria"],
  );
});

test("applyTranslations leaves elements without data-i18n attributes alone", () => {
  const p = makeEl("p", {}, "untouched");
  applyTranslations(document.body, "tr");
  assert.equal(p.textContent, "untouched");
});

test("applyTranslations falls back to the key when a data-i18n key is missing", () => {
  const span = makeEl("span", { "data-i18n": "totally.fake.key" }, "old");
  applyTranslations(document.body, "tr");
  assert.equal(span.textContent, "totally.fake.key");
});
