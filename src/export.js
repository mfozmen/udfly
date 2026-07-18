import { renderToStandaloneHTML } from "./render.js";
import { t } from "./i18n.js";

// Options passed to html2pdf(). Extracted as a pure function so the
// pagebreak config — which is the substantive policy choice here — can
// be unit-tested without spinning up html2pdf itself.
//
// pagebreak.mode: 'avoid-all' tells html2pdf to push any element that
// would straddle a page boundary entirely onto the next page rather
// than splitting through it. Without this, the default ['css', 'legacy']
// cheerfully slices text rows in half at page boundaries — verification
// codes, signature blocks, table cells all end up cut. 'css' stays for
// per-element page-break-* honoring; 'legacy' for explicit
// .html2pdf__page-break markers (we don't emit them, but the option is
// cheap and consistent with the library's docs).
//
// A4 portrait with a 10mm margin and JPEG image quality 0.95 are the
// sensible defaults for legal-style documents. html2canvas runs at
// scale 2 for retina-readable rasterization.
export function buildPdfOptions(filename) {
  return {
    filename,
    margin: 10,
    image: { type: "jpeg", quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["avoid-all", "css", "legacy"] },
  };
}

// Default PDF generator: rasterize the page element (via html2canvas
// internally) into a PDF and trigger a save-as. Output is image-based,
// which trades searchability for perfect visual fidelity and zero font
// embedding work — html2pdf renders via the browser's own engine, so
// Turkish characters work natively.
//
// html2pdf.js references the browser-only `self` global at module-eval
// time, so loading it in Node (where the tests live) crashes. Dynamic-
// importing it inside the function defers evaluation until first PDF
// export — and tests that inject their own generatePdf never trigger
// the import path.
async function defaultGeneratePdf(element, filename) {
  const { default: html2pdf } = await import("html2pdf.js");
  return html2pdf().from(element).set(buildPdfOptions(filename)).save();
}

// Tauri-shell PDF generator: same html2pdf pipeline, but the result is
// returned as bytes instead of handed to the browser's download machinery.
// wry installs no download handler, so the <a download> click .save()
// performs is silently ignored inside the Tauri WebView — the bytes must
// go through the native save dialog + Rust write instead.
async function defaultGeneratePdfBytes(element, filename) {
  const { default: html2pdf } = await import("html2pdf.js");
  const buffer = await html2pdf()
    .from(element)
    .set(buildPdfOptions(filename))
    .outputPdf("arraybuffer");
  return new Uint8Array(buffer);
}

// Detect whether we're running inside the Tauri shell. Tauri injects
// __TAURI_INTERNALS__ on window before the frontend mounts; its absence
// means the page is being served by plain Vite (npm run dev) or another
// non-Tauri host. Checked per-export so a late injection scenario still
// picks up the bridge.
function defaultIsTauriAvailable() {
  return (
    typeof window !== "undefined" &&
    typeof window.__TAURI_INTERNALS__ !== "undefined"
  );
}

// Plain-browser save: build a Blob, point an off-screen <a download> at it,
// click it, then revoke. The browser's own download UI (file picker or
// silent save) takes over from there.
//
// revokeObjectURL is deferred to the next tick. All current browsers
// capture the URL contents synchronously during click(), so revoking
// inline works in practice — but the spec wording allows the URL to need
// to remain valid until the download begins, and queueing the revoke is
// the standard defensive idiom.
function defaultBrowserSave({ contents, mimeType, filename }) {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Suggest "foo.txt" / "foo.html" from "foo.udf" rather than the more awkward
// "foo.udf.txt" the OS save dialog would otherwise default to. Falls back to
// "document.<ext>" when there's no source filename (shouldn't happen via the
// normal load paths, but the save picker still needs a sensible default).
export function defaultExportName(filename, extension) {
  const base = (filename || "").replace(/\.udf$/i, "");
  return base ? `${base}.${extension}` : `document.${extension}`;
}

// UDF text comes out of the XML parser with line endings normalized to "\n".
// On Windows — UYAP's dominant platform — pre-2018 Notepad and various
// legacy tools render "\n"-only files as one long line, so the TXT export
// needs CRLF there. The frontend bundle is platform-agnostic, so the OS is
// read from the userAgent at runtime rather than a build-time cfg; it's
// passed in (not read from `navigator` here) to keep this a pure function.
export function withPlatformLineEndings(text, userAgent) {
  return /windows/i.test(userAgent || "")
    ? text.replace(/\r?\n/g, "\r\n")
    : text;
}

// Wire the Export dropdown: toggle on the trigger, close on Escape /
// outside-click / item selection, and on each item save the result.
//
// Two save paths are wired:
//   - Tauri shell (production): OS save dialog + Rust write_file_text invoke.
//     saveDialog and invoke are injected so this module never imports the
//     Tauri bindings directly — keeps it loadable (and defaultExportName
//     testable) in plain Node.
//   - Plain browser (npm run dev, no __TAURI_INTERNALS__): Blob-backed
//     anchor download. Lets the export menu work end-to-end during frontend
//     iteration without spinning up the Rust shell. onBrowserSave is the
//     seam that delivers the bytes; defaults to a real <a download> click,
//     overridable so tests can record the payload.
//
// isTauriAvailable is called per-export, not at setup, because the Tauri
// runtime injection happens after page mount in some scenarios.
//
// getDocument() returns the currently-loaded { parsed, filename } or a
// falsy value when nothing is loaded; reading it lazily at export time —
// rather than capturing it when the menu opened — means the export always
// serializes the document that's actually on screen.
//
// Returns { close } so callers (e.g. the error-state reset in main.js) can
// dismiss the menu programmatically, plus { exportAs, exportPdf } so the
// native File menu can trigger the same exports as the dropdown items.
export function setupExportMenu({
  els,
  getDocument,
  saveDialog,
  invoke,
  isTauriAvailable = defaultIsTauriAvailable,
  onBrowserSave = defaultBrowserSave,
  generatePdf = defaultGeneratePdf,
  generatePdfBytes = defaultGeneratePdfBytes,
}) {
  // The dropdown chrome is optional: with the native File menu carrying
  // the export items, main.js mounts this module with just the page
  // element. All DOM wiring below is gated on the trigger/menu pair being
  // present; the export functions themselves never touch them.
  const hasDropdown = !!(els.exportBtn && els.exportMenu);

  function close() {
    if (!hasDropdown) return;
    els.exportMenu.hidden = true;
    els.exportBtn.setAttribute("aria-expanded", "false");
  }

  if (hasDropdown) {
    const open = () => {
      els.exportMenu.hidden = false;
      els.exportBtn.setAttribute("aria-expanded", "true");
    };

    els.exportBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (els.exportBtn.disabled) return;
      if (els.exportMenu.hidden) open();
      else close();
    });

    // Click anywhere outside the menu (and not on the trigger, which has
    // its own toggle handler) closes it.
    document.addEventListener("click", (e) => {
      if (els.exportMenu.hidden) return;
      if (!els.exportMenu.contains(e.target) && e.target !== els.exportBtn) {
        close();
      }
    });

    // Escape closes the menu and returns focus to the trigger so keyboard
    // users don't get stranded.
    els.exportMenu.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        close();
        els.exportBtn.focus();
      }
    });
  }

  async function exportAs(format) {
    const doc = getDocument();
    if (!doc || !doc.parsed) return;
    let filters;
    let contents;
    let mimeType;
    if (format === "txt") {
      filters = [{ name: "Plain Text", extensions: ["txt"] }];
      mimeType = "text/plain;charset=utf-8";
      const ua =
        (typeof navigator !== "undefined" && navigator.userAgent) || "";
      contents = withPlatformLineEndings(doc.parsed.text, ua);
    } else {
      filters = [{ name: "HTML Document", extensions: ["html"] }];
      mimeType = "text/html;charset=utf-8";
      contents = renderToStandaloneHTML(doc.parsed);
    }
    const filename = defaultExportName(doc.filename, format);

    if (!isTauriAvailable()) {
      // Plain-browser fallback: hand the payload to onBrowserSave (default
      // implementation is an <a download> click). No native save dialog is
      // possible without the Tauri bridge; the browser's own download
      // location prompt (if enabled) is what the user sees.
      onBrowserSave({ contents, mimeType, filename });
      return;
    }

    let path;
    try {
      path = await saveDialog({
        defaultPath: filename,
        filters,
      });
    } catch (cause) {
      // Save failures shouldn't wipe the loaded document — the user's view
      // wasn't broken, only the export. Surface via alert() so the page
      // stays intact and they can retry.
      window.alert(t("alert.exportFailed", { cause: cause.message || cause }));
      return;
    }
    if (!path) return; // user canceled the save picker
    try {
      await invoke("write_file_text", { path, contents });
    } catch (cause) {
      window.alert(t("alert.saveFailed", { cause }));
    }
  }

  // Export-as-PDF renders the .page subtree through html2pdf/html2canvas —
  // an image-based PDF, visually identical to what's on screen but not
  // text-searchable. That trade was the user's call; searchability would
  // need either a jsPDF vector-text pipeline (with font embedding) or a
  // Rust-side webview print-to-pdf, both significantly more work.
  //
  // The delivery differs per host. In a plain browser html2pdf's own
  // .save() (an <a download> blob click) works. Inside the Tauri shell wry
  // ignores that click — no download handler is installed — so the PDF is
  // produced as bytes and routed through the same native save-dialog +
  // Rust write flow TXT/HTML use. Dialog first, rasterize second: the
  // dialog is instant while html2canvas can take seconds, and a cancel
  // should cost nothing.
  // html2canvas photographs the element as-is, so .page's screen chrome
  // (border, shadow, radius, padding) would be inked into the PDF — a
  // visible thin box outline — and the padding height can spill a mostly
  // blank extra page. The .page--exporting class applies print-clean CSS
  // for exactly the rasterization window; the finally guarantees the
  // screen styling comes back even when html2pdf throws.
  async function withExportStyling(fn) {
    els.page.classList.add("page--exporting");
    try {
      return await fn();
    } finally {
      els.page.classList.remove("page--exporting");
    }
  }

  async function exportPdf() {
    const doc = getDocument();
    if (!doc || !doc.parsed) return;
    const filename = defaultExportName(doc.filename, "pdf");

    if (!isTauriAvailable()) {
      try {
        await withExportStyling(() => generatePdf(els.page, filename));
      } catch (cause) {
        window.alert(t("alert.pdfExportFailed", { cause: cause.message || cause }));
      }
      return;
    }

    let path;
    try {
      path = await saveDialog({
        defaultPath: filename,
        filters: [{ name: "PDF Document", extensions: ["pdf"] }],
      });
    } catch (cause) {
      window.alert(t("alert.exportFailed", { cause: cause.message || cause }));
      return;
    }
    if (!path) return; // user canceled the save picker
    let bytes;
    try {
      bytes = await withExportStyling(() => generatePdfBytes(els.page, filename));
    } catch (cause) {
      window.alert(t("alert.pdfExportFailed", { cause: cause.message || cause }));
      return;
    }
    try {
      // Plain number array: Uint8Array JSON-stringifies to an object,
      // which serde's Vec<u8> rejects.
      await invoke("write_file_bytes", { path, contents: Array.from(bytes) });
    } catch (cause) {
      window.alert(t("alert.saveFailed", { cause }));
    }
  }

  if (hasDropdown) {
    els.exportTxt.addEventListener("click", () => {
      close();
      exportAs("txt");
    });
    els.exportHtml.addEventListener("click", () => {
      close();
      exportAs("html");
    });
    els.exportPdf.addEventListener("click", () => {
      close();
      exportPdf();
    });
  }

  return { close, exportAs, exportPdf };
}
