# Claude Code Brief — Udfly (Cross-platform Tauri App)

> **How to use this file**: This is a multi-stage brief. Give Stage 0 to Claude Code first, wait for it to finish, then give Stage 1, etc. Don't paste everything at once — keep each stage focused so Claude Code can iterate.

---

## Project Overview

Build a **fast, portable viewer** for Turkey's UYAP (judicial information system) `.udf` documents.

- **Target users**: Turkish lawyers and citizens who receive `.udf` files and need to view them without installing UYAP's broken Java-based editor.
- **Distribution**: GitHub releases with portable binaries for Windows, macOS, and Linux. Users should be able to download and run — no installer required (or at least an installer-free option).
- **Scope**: Read-only viewer. NO editing, NO saving as UDF. Export to TXT/HTML/PDF is fine.
- **Stack**: **Tauri 2.x** with vanilla HTML/CSS/JS frontend. No frameworks (no React/Vue/Svelte). Keep it simple and tiny.
- **Language**: Entire codebase, comments, UI text, and documentation in **English**. (Even though target users are Turkish, we keep code English for open-source contribution.)
- **License**: MIT.

### Why Tauri (not Electron)
- Final binary is 5–10 MB instead of 100+ MB
- Truly portable — single executable on Windows
- Cross-compiles to all platforms via GitHub Actions
- Frontend stays plain HTML/JS so we can iterate fast

### Key constraint
The UI must look professional and minimal — Turkish lawyers will judge it on first impression. No emoji, no playful copy. Think: macOS Preview, Adobe Reader, or VS Code's built-in viewers.

---

## UDF Format Specification

This is **measured from real files**, not guessed. Two sanitized sample files are provided in the `samples/fixtures/` directory of this brief.

### Container

A `.udf` file is a **ZIP archive** containing:

| File | Required? | Purpose |
|------|-----------|---------|
| `content.xml` | **Yes** | The actual document content + style metadata |
| `documentproperties.xml` | No | UYAP verification metadata (verification code, registry ID) |
| `sign.sgn` | No | Digital signature blob (binary; can be ignored by viewer) |

### content.xml structure

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<template format_id="1.8">

  <!-- 1. The plain text of the entire document, in order, in a CDATA block -->
  <content><![CDATA[T.C.
İstanbul Anadolu Arabuluculuk Bürosu
ARABULUCULUK BAŞVURU FORMU
... (entire document text, including \n line breaks) ...
]]></content>

  <!-- 2. Page format -->
  <properties>
    <pageFormat
        mediaSizeName="1"
        leftMargin="56.69"
        rightMargin="56.69"
        topMargin="28.34"
        bottomMargin="28.34"
        paperOrientation="1"
        headerFOffset="20.0"
        footerFOffset="20.01"/>
  </properties>

  <!-- 3. Style/layout overlay — references character ranges in the CDATA -->
  <elements>
    <header>
      <paragraph ...>
        <content startOffset="0" length="3" bold="true" .../>
      </paragraph>
    </header>

    <paragraph Alignment="1" LineSpacing="0.0" SpaceAbove="1.0" ...>
      <content startOffset="0" length="3" />
      <content startOffset="3" length="1" bold="true" />
      <space startOffset="4" length="1" />
      <field fieldName="merkezAdi" fieldType="1" startOffset="5" length="8" />
    </paragraph>

    <table border="borderNone">
      <row>
        <cell>
          <paragraph ...>
            <content startOffset="1127" length="2" bold="true" />
          </paragraph>
        </cell>
      </row>
    </table>

    <footer>...</footer>
  </elements>

  <!-- 4. Reusable named styles, referenced via the `resolver` attribute -->
  <styles>
    <style name="hvl-default" size="12" family="Times New Roman" />
    <style name="default" size="12" foreground="-16777216" family="Dialog" />
    <style name="edf_1456817714676" family="Times New Roman" size="12"
           Alignment="0" LineSpacing="0.0" SpaceAbove="2.0" SpaceBelow="2.0"
           LeftIndent="0.0" RightIndent="0.0" resolver="hvl-default"/>
  </styles>

  <webID id="..." />
</template>
```

### THE CRITICAL INSIGHT

**The text is NOT inside the `<elements>` tree.** It's all in the top-level `<content><![CDATA[...]]></content>` block. The `<elements>` section only contains *styling pointers* (startOffset + length) into that text.

The parser must:
1. Extract the CDATA text as a single string (preserve all `\n`, spaces, tabs).
2. Walk `<elements>` depth-first.
3. For each `<paragraph>`, render an HTML paragraph (`<p>`) with computed CSS.
4. For each child of a `<paragraph>` (i.e. `<content>`, `<space>`, `<field>`), slice the text using `[startOffset, startOffset + length]` and emit a styled `<span>`.
5. For each `<table>`, render `<table><tr><td>...`, recursing into cell paragraphs.

### Inline styling element types

These appear as children of `<paragraph>` or `<cell>`:

| Element | Meaning |
|---------|---------|
| `<content startOffset=N length=M ...>` | Styled run of text |
| `<space startOffset=N length=M ...>` | Whitespace run (treat same as content; preserve text exactly) |
| `<field fieldName="X" startOffset=N length=M ...>` | Dynamic field whose current value is already in the CDATA. Render as styled text. The fieldName is metadata only. |

### Style attributes (on `<paragraph>`, `<content>`, `<style>`, `<field>`, etc.)

**Text formatting**:
- `bold="true"` → CSS `font-weight: bold`
- `italic="true"` → `font-style: italic`
- `underline="true"` → `text-decoration: underline`
- `strikeOut="true"` → `text-decoration: line-through`
- `family="Times New Roman"` → `font-family`
- `size="12"` → `font-size: 12pt`
- `foreground="-16777216"` → integer-encoded ARGB color. `-16777216` is black (0xFF000000). Convert: `r = (n >> 16) & 0xFF; g = (n >> 8) & 0xFF; b = n & 0xFF`. Note: signed 32-bit Java int — handle negatives correctly.
- `header="true"` → some kind of section-header marker; render normally for now (can be styled later).

**Paragraph formatting**:
- `Alignment="0"` left, `"1"` center, `"2"` right, `"3"` justify
- `LeftIndent`, `RightIndent`, `FirstLineIndent`, `Hanging` → numbers in points (pt). Apply to padding/margin/text-indent.
- `SpaceAbove`, `SpaceBelow` → margin-top / margin-bottom in pt
- `LineSpacing` → if 0.0, default; otherwise multiplier
- `TabSet="69.0:2:0,136.0:0:0"` → comma-separated tab stops; can be ignored for v1 but tabs (`\t`) in text should still render visibly. CSS `white-space: pre-wrap` on paragraphs handles this.
- `RepeatingLabel`, `GroupName`, `Hanging` — UYAP-specific layout hints; can be ignored for v1.

### Style resolution

Each element may have `resolver="style-name"`. This refers to a `<style>` definition in `<styles>`. Treat it as inheritance: an element's effective attributes = its own attributes overlaid on the resolved style's attributes (which may itself have a `resolver`, so resolve recursively). For v1 we can flatten styles eagerly when parsing.

### Tables

```xml
<table border="borderNone">
  <row>
    <cell>
      <paragraph>...</paragraph>   <!-- one or more -->
    </cell>
  </row>
</table>
```

- `border="borderNone"` → no visible border
- Optional `columnSpan="N"` and `rowSpan="N"` on `<cell>` (UYAP uses camelCase). Map to `colspan`/`rowspan` HTML.
- A cell can contain multiple paragraphs.

### Header & footer

`<header>` and `<footer>` appear inside `<elements>`. They contain `<paragraph>` children. For v1, render them as separate divs at the top/bottom of the document (not as actual repeating page headers — too complex). Style them with smaller/muted text.

### Edge cases observed in real files

- `format_id="1.8"` — record this; future versions may differ.
- Some attributes are camelCase (`startOffset`), others PascalCase (`Alignment`, `LeftIndent`). Treat case-sensitively as written; don't lowercase keys.
- Style names contain underscores and digits: `edf_1456817714676`.
- Negative integers for colors (Java signed int).
- The CDATA contains real `\n`, `\t`, and Unicode characters (Turkish: ç, ğ, ı, İ, ö, ş, ü). UTF-8 decode handles this naturally.
- The CDATA may have leading whitespace and blank lines that are intentional (visual spacing).

---

## Stage 0 — Project bootstrap

```
Initialize a new Tauri 2 project named "udfly".

Requirements:
- Tauri 2.x (latest stable)
- Vanilla HTML/CSS/JS frontend (no framework, no bundler beyond what Tauri provides — use Vite if Tauri's create defaults to it, otherwise plain static files).
- Project structure:
  - src/                   ← frontend (index.html, main.js, styles.css, parser.js, render.js)
  - src-tauri/             ← Rust backend (minimal — only file dialogs and CLI argument handling)
  - samples/fixtures/      ← sanitized .udf fixtures, committed to repo
  - samples/private/       ← gitignored; real UDFs live here on maintainer's machine only
  - .github/workflows/     ← CI for cross-platform releases (later stage)
  - README.md, LICENSE (MIT)

Tauri config requirements:
- App name: "Udfly"
- Bundle identifier: "com.udfly.app"
- Window: 1100x800, resizable, min 600x400
- File association: register .udf so OS treats this app as a handler (configure tauri.conf.json's bundle.fileAssociations)
- The window should accept files via CLI arg AND drag-and-drop AND file-open dialog

Frontend dependencies (installed via npm):
- jszip (for unzipping .udf in the renderer process — yes, even though we have Rust available; keeps logic in one place and easier to debug)

Rust dependencies (Cargo):
- Just default Tauri deps. We will only use Rust for: opening file dialogs, reading CLI args, and (later) registering as default handler for .udf.

After scaffolding, the app should launch with a placeholder UI showing "Udfly — drop a .udf file here". Verify it builds and runs on the current platform.

Do NOT yet implement the parser — that's the next stage.
```

---

## Stage 1 — UDF Parser (the core)

Once Stage 0 builds and runs, give Claude Code this:

```
Implement the UDF parser in src/parser.js.

Real format spec (measured from actual files — do not guess):

[PASTE THE "UDF Format Specification" SECTION OF THIS BRIEF HERE]

Two sanitized sample files are in `samples/fixtures/`:
- `samples/fixtures/fixture-mediation-application.udf` — paragraphs, bold/underline runs, headers
- `samples/fixtures/fixture-mediation-form-with-table.udf` — paragraphs, runs, fields, one table

These are derived from real UDFs but with all personal information replaced by dummy data of identical character length, so all `startOffset`/`length` pointers in the `<elements>` section remain valid. They parse identically in structure to real-world files.

To inspect their internals:
- `unzip -p samples/fixtures/fixture-mediation-application.udf content.xml | less` — view the XML directly
- Or use jszip programmatically in a Node script
Do NOT manually pre-extract these into the repo — keep them as `.udf` (ZIP) files. The parser must work on the real ZIP container.

**Privacy note**: There is also a `samples/private/` directory that is gitignored and contains the original (non-sanitized) UDF files. This directory exists only on the maintainer's local machine for verifying the parser against real-world data. Never commit anything from `samples/private/`. The fixtures in `samples/fixtures/` are the only sample files in version control.

Implementation requirements:

1. Export an async function `parseUDF(arrayBuffer)` that returns:
   {
     text: string,                      // all the plain CDATA text, useful for export
     pages: number,                      // best-effort page count (for now: 1)
     properties: { ... },                // pageFormat attributes
     verificationCode?: string,          // from documentproperties.xml if present
     elements: ParsedElement[]           // tree of parsed elements ready for rendering
   }

2. ParsedElement is a tagged union:
   { type: "paragraph", style: ResolvedStyle, runs: Run[] }
   { type: "table", rows: ParsedElement[][] /* rows × cells, each cell is paragraph[] */ }
   { type: "header", paragraphs: ParsedElement[] }
   { type: "footer", paragraphs: ParsedElement[] }
   
   Run: { text: string, style: ResolvedStyle, kind: "content" | "space" | "field", fieldName?: string }
   
   ResolvedStyle: a flat object with all relevant style props after resolver chain is flattened:
     { bold, italic, underline, strikeOut, fontFamily, fontSize, color,
       alignment, leftIndent, rightIndent, firstLineIndent, hanging,
       spaceAbove, spaceBelow, lineSpacing, tabSet }

3. Style resolution:
   - Build a map of style name → attribute object from <styles>
   - For each element with resolver="X", merge: defaults < styles[X] (recursively resolved) < element's own attrs
   - Each <content> run inherits from its parent <paragraph>'s resolved style, then overlays its own attrs

4. Text slicing:
   - cdata.substring(startOffset, startOffset + length)
   - Preserve \n, \t, and all whitespace exactly. Do not normalize.

5. Color parsing:
   - foreground is a Java signed 32-bit int in attributes. Parse with parseInt (handles negatives).
   - Extract RGB: r=(n>>>16)&0xFF, g=(n>>>8)&0xFF, b=n&0xFF (unsigned shifts). Alpha is high byte; ignore for now (assume opaque).
   - Output as `rgb(r,g,b)`.

6. Robustness:
   - If <styles> is missing, just use empty defaults.
   - If documentproperties.xml is missing, that's fine.
   - If sign.sgn is present, ignore it.
   - If content.xml has BOM, strip it.
   - If parsing fails, throw an Error with a clear message including which step failed.

7. Write a Node.js test script test/parser.test.mjs that:
   - Reads both fixture .udf files via fs and parseUDF (samples/fixtures/fixture-*.udf)
   - Asserts: text is non-empty, contains expected Turkish words ("ARABULUCULUK", "BAŞVURU"), elements array is non-empty, at least one paragraph has bold runs, the second fixture (fixture-mediation-form-with-table.udf) has at least one table.
   - Uses jsdom to provide DOMParser in Node, since the parser uses DOMParser.
   - Run via `node --experimental-vm-modules test/parser.test.mjs` and exits 0 on success.

Add an npm script: "test:parser": "node test/parser.test.mjs"

Run the test and ensure all assertions pass before moving on.
```

---

## Stage 2 — Renderer & UI

After Stage 1 tests pass:

```
Build the rendering layer (src/render.js) and the UI (src/index.html, src/main.js, src/styles.css).

Rendering (src/render.js):
- Export `renderToHTML(parsed)` which takes a ParsedDocument from parseUDF and returns an HTML string.
- Each <paragraph> → <p> with inline style for alignment, indents, margins
- Each Run → <span> with inline style for bold/italic/etc. Use white-space: pre-wrap on paragraphs so \t and \n inside runs render correctly.
- Headers/footers → <div class="udf-header"> / <div class="udf-footer"> with muted styling (smaller font, gray)
- Tables → <table class="udf-table"> with no border if border="borderNone", else thin gray borders
- Empty paragraphs (no runs or all whitespace) → render as <p>&nbsp;</p> to preserve vertical rhythm
- Sanitize: parser output is data, not HTML — escape <, >, & in text. Never use innerHTML on raw text.

UI (src/index.html, src/main.js, src/styles.css):

Layout:
+----------------------------------------------------------+
| [≡] Udfly             evrak_xxx.udf    [Print] [Export▾] |  ← top bar, 44px tall, subtle bottom border
+----------------------------------------------------------+
|                                                          |
|   [empty state: dashed dropzone with "Drop .udf here"]   |
|                                                          |
|   OR when loaded:                                        |
|                                                          |
|   ┌────────────────────────────────────────────────┐    |
|   │   [page background, A4-ish proportions]         │    |
|   │   Document content rendered here                │    |
|   │                                                 │    |
|   └────────────────────────────────────────────────┘    |
|                                                          |
+----------------------------------------------------------+
| Pages: 1   Size: 12 KB   Verification: 80EJaOb3          |  ← status bar, 28px tall, muted
+----------------------------------------------------------+

Visual design:
- Light theme by default with system dark-mode support via prefers-color-scheme
- Use CSS variables for colors so theming is one place
- Background of the app: #f5f5f5 (light) / #1e1e1e (dark)
- Page surface: white (light) / #2a2a2a (dark) with 1px solid #e0e0e0 border, subtle shadow
- Page padding: matches UDF margins roughly — 60px horizontal, 50px vertical
- Page max-width: 800px, centered
- Font: system UI for chrome (header bar, status bar, buttons). Document content uses the fonts specified in the UDF (default Times New Roman).
- No emoji in UI. Use simple text labels for buttons, or small inline SVG icons (16px).
- Font sizes: 13px for chrome, 12pt-equivalent for document content (UDF specifies pt sizes).
- Buttons: minimal — text only or text+small SVG icon, 1px border on hover, no fill.

Interactions:
- Drag-drop a .udf file anywhere on window → parse and render
- Click "Open" or use Tauri file dialog → parse and render
- Tauri CLI arg handling: if app launched with a path arg (e.g. user double-clicked a .udf file), open that file
- "Print" → window.print() with @media print styles that hide chrome and show only the page
- "Export ▾" dropdown: TXT, HTML
  - TXT: just the parsed.text from parser
  - HTML: full standalone HTML doc using renderToHTML output, with embedded styles
- Keyboard: Ctrl/Cmd+O = open dialog, Ctrl/Cmd+P = print
- If parse fails: show error in the page area with the error message and a "Try another file" button. Do not crash the app.

Tauri integration in main.js:
- Import @tauri-apps/api/event for file-drop events
- Import @tauri-apps/api/dialog for open dialog (or whatever Tauri 2 API equivalent is)
- Use @tauri-apps/plugin-fs to read the file as bytes when given a path

Manual test plan:
1. Launch the app — verify empty state shows
2. Drop samples/fixtures/fixture-mediation-application.udf — verify document renders with proper paragraphs, bold, alignment
3. Drop samples/fixtures/fixture-mediation-form-with-table.udf — verify the table renders correctly
4. Click Print — verify print preview shows only the document, no chrome
5. Click Export → TXT — verify a .txt file with all readable text downloads
6. Resize window — verify layout reflows correctly
7. Toggle OS dark mode — verify dark theme applies (page surface stays white-ish for readability, or use a soft cream)
```

---

## Stage 3 — Distribution

After Stages 0-2 work:

```
Set up release distribution.

1. tauri.conf.json:
   - Configure bundle targets: nsis (Windows), dmg (macOS), appimage + deb (Linux)
   - For Windows, also configure a portable .exe (single executable, no installer). Tauri 2 supports this via bundle.windows.nsis.installerMode or similar — check current docs.
   - Icons: source PNGs live in assets/ (assets/icon.png light, assets/mark.png dark). Run `npx @tauri-apps/cli icon assets/icon.png` to regenerate every bundled size into src-tauri/icons/.
   - File association for .udf is already set in Stage 0; verify it's correct.

2. .github/workflows/release.yml:
   - Trigger: on push of a tag matching v*.*.*
   - Matrix: ubuntu-latest, macos-latest, windows-latest
   - Steps: checkout, install Node + Rust + platform deps, npm ci, run npm test, build with tauri-action
   - Use tauri-apps/tauri-action@v0 to build and create a GitHub Release with all platform artifacts attached

3. README.md:
   - Project intro (English): what it is, why it exists, who it's for
   - Screenshot placeholder (can be added later)
   - Installation: download from releases page, run executable
   - For each platform, brief note on first-run security warnings (macOS Gatekeeper, Windows SmartScreen) — these are unsigned binaries, so users will see warnings the first time
   - Building from source: prereqs (Rust, Node 20+), `npm install`, `npm run tauri dev` for dev, `npm run tauri build` for prod
   - UDF format brief overview with credit that this is reverse-engineered, not based on official spec
   - Disclaimer: not affiliated with UYAP / Ministry of Justice
   - Contributing: PRs welcome, especially test files for edge cases (with sensitive info redacted)
   - License: MIT

4. LICENSE: MIT.

5. .gitignore: already created in Stage 0. Verify it still excludes `samples/private/` and that no real UDFs have been accidentally committed (`git log --all --full-history -- samples/private/` should show only README changes).

6. CHANGELOG.md: start with v0.1.0 entry listing initial features.

Verify by tagging v0.1.0 locally and pushing — confirm CI builds pass on all 3 platforms.
```

---

## Notes for the human (Tugra) using Claude Code

**Pacing**: Don't paste this whole brief at once. Give Stage 0, wait, verify it builds, then Stage 1, etc. Each stage is designed to be testable on its own.

**Sample files**: Put both fixture files in `samples/fixtures/` before running Stage 1. Claude Code needs them to test against. The fixture files have all personal data replaced with dummy values of identical character length, so they're safe to commit publicly.

**When something fails**: 
- For parser issues, ask Claude Code to print the parsed tree of one of the samples and compare against your eyes-on view of `content.xml`
- For rendering issues, take a screenshot and tell Claude Code "the bold runs are not appearing" or whatever specifically

**Things this brief intentionally skips for v1** (you can add later):
- True paginated layout (real page breaks based on margins)
- Proper TabSet honoring (currently relies on `white-space: pre-wrap`)
- Rendering header/footer as repeating page elements
- Verifying digital signatures (sign.sgn)
- Font fallback when "Times New Roman" isn't installed
- High-DPI / accessibility audit
- i18n of UI (UI is English; document content is whatever language the UDF is)

**If Claude Code wants to use a framework**: gently push back. Plain HTML/JS keeps the bundle ~5MB. React would double it without adding value here.

**Tauri version**: Insist on Tauri 2 (released 2024), not 1.x. The APIs differ.
