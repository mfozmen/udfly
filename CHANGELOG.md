# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2026-07-18

The window grows real desktop chrome: a native File menu with Open Recent, a manual update check, and an About box replace the custom topbar entirely — and both PDF paths (export and print) now produce clean, artifact-free output.

### Added

- **Native File menu** (Dosya): Aç, Son Açılanlar, Dışa Aktar (TXT/HTML/PDF), Yazdır, Güncellemeleri Denetle, Hakkında, Çıkış — built with the Tauri menu API, localized TR/EN, rebuilt live on locale, recent-list, and document-state changes. Export and Print items enable only while a document is loaded.
- **Open Recent** (Son Açılanlar): the last ten successfully opened host paths, newest first, deduped, persisted in `localStorage`, with a Listeyi Temizle action. Only path-driven loads (dialog, OS file association, recent clicks) enter the list — drag-dropped browser files carry no host path.
- **Manual update check** (Güncellemeleri Denetle): runs the same signed-update flow as the silent boot check, but always answers — install banner when an update exists, a dismissable "Udfly güncel" notice when current, and a visible error when the check itself fails.
- **About dialog** (Hakkında): native message box with the app name, the running version read from the Tauri runtime, the repo URL, and the license.

### Changed

- **Topbar removed.** With the native titlebar carrying the brand and the new menu carrying every action, the custom topbar was a third stacked bar duplicating both. The filename now lives in the OS window title (`dosya.udf — Udfly`), the TR|EN toggle moved to the statusbar's right edge, and the update banner anchors to the window's top edge. Ctrl+O / Ctrl+P keep working.

### Fixed

- **Export as PDF did nothing in the installed app.** `html2pdf`'s `.save()` triggers an `<a download>` blob click that Tauri's WebView layer silently ignores (no download handler is installed); the same code worked in browser dev, which is how it slipped through. The PDF is now produced as bytes and delivered through the native save dialog plus a new `write_file_bytes` command — mirroring the TXT/HTML flow, with a proper save-as dialog as a bonus.
- **Printed PDFs no longer carry browser header/footer chrome** (date + window title on top, `localhost` + page count on the bottom). Zero `@page` margins remove the band Chromium draws them in; page margins moved into the document's own print padding.
- **Exported PDFs no longer show a thin box outline or spill a blank trailing page.** html2canvas was photographing the on-screen `.page` chrome — border, shadow, radius, and padding — into the output; a `.page--exporting` class now strips that styling for exactly the rasterization window.

## [1.2.0] - 2026-05-19

Major feature batch since 1.1.1: the chrome is redesigned around a Turkish-first identity, the app speaks Turkish by default (with an English toggle), exports as PDF, and silently checks for signed updates on every launch.

### Added

- **Auto-update via Tauri updater plugin**. Every launch silently checks GitHub Releases for a newer signed bundle. If one exists, a small banner appears below the topbar — *"Udfly X.Y.Z mevcut — Şimdi Güncelle [×]"* — and clicking the install button downloads, installs, and relaunches. Updates are minisign-signed; the running app refuses any bundle whose signature doesn't match the pubkey baked into `tauri.conf.json`. The check is best-effort: offline / GitHub-unreachable failures are silently swallowed.
- **Export as PDF**. Third item in the existing Export dropdown alongside TXT and HTML. Clicking it rasterizes the document via `html2pdf.js` (jsPDF + html2canvas) into an A4 portrait PDF and triggers a direct download — no print dialog, no further user prompt. Image-based output captures exactly what the browser painted, so Turkish characters and the Times serif render without font embedding work. `pagebreak.mode: ['avoid-all', 'css', 'legacy']` keeps elements off page boundaries instead of slicing through text.
- **UI internationalization with Turkish as the default**. Every chrome string lives in `src/i18n.js`'s `translations` table (TR + EN); `data-i18n` / `data-i18n-aria-label` attributes on the markup drive the swap. A compact `TR | EN` toggle sits at the right edge of the topbar; choice persists in `localStorage` under `udfly.locale`. First launch with no preference defaults to Turkish.
- **Bilingual README**. `README.md` is now the Turkish version (GitHub's default preview); English moves to `README.en.md`. Both files carry a language switcher line under the logo. Translation register is formal/professional for the judicial audience; technical terms (NSIS, WebView2, AppImage, Tauri, parser) and UI labels stay verbatim.
- **Branded application icons** (red `U` + paper plane) replacing the Tauri scaffold placeholders, regenerated into every platform size in `src-tauri/icons/` plus an in-app favicon and transparent-bg topbar mark.

### Changed

- **Chrome redesign**, document-first and restrained for the judicial audience. Warm paper-tint chrome (`#faf8f3` / `#f3f0e8`) instead of pure white so the white `.page` reads as the focal element. Public Sans (US federal government typeface) for chrome; JetBrains Mono only for the UYAP verification code. Single Turkish-flag-red accent (`#E30A17`) used in the brand mark, the drop overlay's "loud moment", the error rule, and focus rings — nowhere else. Dark mode reworked to warm near-black instead of slate-blue. Empty state, error state, drop overlay, statusbar, and buttons all retreated to deliberate compositions. Print stylesheet and the `.page` document surface left untouched.

### Fixed

- **Topbar buttons in `npm run dev` (browser mode)**. Open and Export → TXT/HTML threw `Cannot read properties of undefined (reading 'invoke')` through the Tauri plugins when no `__TAURI_INTERNALS__` was present. Open now falls back to a hidden `<input type="file" accept=".udf">`; Export to a Blob-backed `<a download>` click. Tauri-shell production paths are unchanged. Frontend iteration on `npm run dev` now works end-to-end without spinning up the Rust shell.
- **`<input type="file">` cancel-event hang risk**. Pre-2023 browsers don't fire the `cancel` event, so the file picker promise would never settle if the user dismissed the OS dialog. A window `focus`-based backstop now resolves the promise as cancel after a short grace window.

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

[unreleased]: https://github.com/mfozmen/udfly/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/mfozmen/udfly/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/mfozmen/udfly/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/mfozmen/udfly/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/mfozmen/udfly/releases/tag/v1.0.0
