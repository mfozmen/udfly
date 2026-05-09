# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-05-09

Initial public release. UDF Viewer is a cross-platform Tauri 2 desktop app for opening Turkey's UYAP `.udf` document format without UYAP's Java editor.

### Added

- **UDF parser** (`src/parser.js`): unpacks the `.udf` ZIP, extracts CDATA text, walks `<elements>` into paragraph / table / header / footer nodes with offset-sliced run text, flattens the resolver chain, normalizes style attributes (bold, underline, fontFamily, fontSize, alignment, color via Java-signed-int-to-rgb conversion, indents, spacing, line spacing, tab set), reads `pageFormat` properties, and surfaces the optional UYAP verification code from `documentproperties.xml`.
- **HTML renderer** (`src/render.js`): maps the parser's output to `<p>` / `<span>` / `<table class="udf-table">` / `<div class="udf-header|udf-footer">` with inline styles. HTML-escapes all run text; sanitizes `font-family` against CSS / HTML-attribute injection (single-quoted CSS strings, strip set covers `\r`, `\n`, `\t`, `\`, `'`, `"`, `<`, `>`, `U+0085`, `U+2028`, `U+2029`); validates `color` against the canonical `rgb(r, g, b)` shape.
- **UI shell** (`src/index.html`, `src/styles.css`, `src/main.js`): 44 px topbar with title, filename, and Print button; A4-ish page surface; 28 px status bar with pages / size / verification; light + dark theme via `prefers-color-scheme`; `@media print` strips chrome so only the page itself prints.
- **Drag-drop file handling**: drop a `.udf` on the window to parse and render it; non-`.udf` drops route to a clear error state. `Ctrl/Cmd+P` triggers print when a document is loaded.
- **File association** for `.udf` registered via `tauri.conf.json` (so OS-level "Open with" lists UDF Viewer once installed).
- **Cross-platform release CI**: `.github/workflows/release.yml` builds NSIS / DMG / AppImage / DEB / portable artifacts on tag push and uploads them to a draft GitHub Release.
