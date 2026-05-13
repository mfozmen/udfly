# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.1] - 2026-05-13

Bringing the rendered output closer to the official UYAP/e-devlet viewer, after a side-by-side comparison turned up three layout bugs on a real `bilirkişi görevlendirme` document.

### Fixed

- **Tabbed columns no longer mash together.** `<tab>` elements were being dropped by the parser, so columns like `Perihan AK YURDAKUL` and `İBRAHİM KURŞUN` rendered with no space between them. The renderer now honours each paragraph's `TabSet` and lays the tab as the right horizontal gap (a sized inline-block sized to the point offset the document specifies), matching the official viewer's column alignment.
- **Page-scoped headers no longer paint on pages they don't apply to.** A header with `startPage="2"` on a one-page document was being drawn inline at the top of the body as a mashed "…MAHKEMESİESAS NO" line. The renderer now skips any header/footer whose `startPage` is past the document's page count.
- **`border="borderNone"` tables render seamless.** UYAP uses tables only for column layout (signature blocks, two-column forms) and marks them borderless; the renderer was always drawing 1px cell borders. Borderless tables now render with no cell borders.

## [1.1.0] - 2026-05-12

Adds the ways to open a `.udf` that 1.0.0 left out — a file picker and OS double-click — plus TXT/HTML export, and fixes line-spacing rendering.

### Added

- **File open dialog**: an **Open** button in the topbar and `Ctrl/Cmd+O` open the OS file picker; the chosen file is read through a narrow `read_file_bytes` Tauri command (no global filesystem scope — authority is bounded by the picker flow).
- **OS file-association handoff**: double-clicking a `.udf` registered to Udfly opens it — via `argv` on Windows/Linux and the `kAEOpenDocuments` Apple Event (`RunEvent::Opened`) on macOS. A FIFO queue handles a multi-file "Open With" selection; a late macOS event is picked up by a `path-available` listener.
- **Export to TXT and HTML**: an **Export** dropdown next to **Print**. TXT writes the document's plain text (CRLF line endings on Windows). HTML writes a self-contained document — `renderToHTML` output wrapped with the renderer's CSS inlined, no external resources — suitable for opening in any browser or forwarding. Both save through a narrow `write_file_text` command.
- **Branded application icons** replacing the Tauri scaffold placeholders.
- **Portable Windows `.exe`** shipped alongside the NSIS installer by the release CI.

### Fixed

- **Line spacing**: UDF's `LineSpacing` is additive (UYAP body text ships `0.5` meaning "single plus half"), so it's now rendered as `line-height: 1 + value` (`0.5` → `1.5`) instead of a raw CSS multiplier that collapsed adjacent lines on top of each other.

## [1.0.0] - 2026-05-09

Initial public release. Udfly is a cross-platform Tauri 2 desktop app for opening Turkey's UYAP `.udf` document format without UYAP's Java editor.

### Added

- **UDF parser** (`src/parser.js`): unpacks the `.udf` ZIP, extracts CDATA text, walks `<elements>` into paragraph / table / header / footer nodes with offset-sliced run text, flattens the resolver chain, normalizes style attributes (bold, underline, fontFamily, fontSize, alignment, color via Java-signed-int-to-rgb conversion, indents, spacing, line spacing, tab set), reads `pageFormat` properties, and surfaces the optional UYAP verification code from `documentproperties.xml`.
- **HTML renderer** (`src/render.js`): maps the parser's output to `<p>` / `<span>` / `<table class="udf-table">` / `<div class="udf-header|udf-footer">` with inline styles. HTML-escapes all run text; sanitizes `font-family` against CSS / HTML-attribute injection (single-quoted CSS strings, strip set covers `\r`, `\n`, `\t`, `\`, `'`, `"`, `<`, `>`, `U+0085`, `U+2028`, `U+2029`); validates `color` against the canonical `rgb(r, g, b)` shape.
- **UI shell** (`src/index.html`, `src/styles.css`, `src/main.js`): 44 px topbar with title, filename, and Print button; A4-ish page surface; 28 px status bar with pages / size / verification; light + dark theme via `prefers-color-scheme`; `@media print` strips chrome so only the page itself prints.
- **Drag-drop file handling**: drop a `.udf` on the window to parse and render it; non-`.udf` drops route to a clear error state. `Ctrl/Cmd+P` triggers print when a document is loaded.
- **File association** for `.udf` registered via `tauri.conf.json` (so OS-level "Open with" lists Udfly once installed).
- **Cross-platform release CI**: `.github/workflows/release.yml` builds NSIS / DMG / AppImage / DEB / portable artifacts on tag push and uploads them to a draft GitHub Release.

[unreleased]: https://github.com/mfozmen/udfly/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/mfozmen/udfly/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/mfozmen/udfly/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/mfozmen/udfly/releases/tag/v1.0.0
