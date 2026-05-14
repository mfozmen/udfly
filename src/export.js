import { renderToStandaloneHTML } from "./render.js";

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
  URL.revokeObjectURL(url);
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
// dismiss the menu programmatically.
export function setupExportMenu({
  els,
  getDocument,
  saveDialog,
  invoke,
  isTauriAvailable = defaultIsTauriAvailable,
  onBrowserSave = defaultBrowserSave,
}) {
  function open() {
    els.exportMenu.hidden = false;
    els.exportBtn.setAttribute("aria-expanded", "true");
  }
  function close() {
    els.exportMenu.hidden = true;
    els.exportBtn.setAttribute("aria-expanded", "false");
  }
  function toggle() {
    if (els.exportMenu.hidden) open();
    else close();
  }

  els.exportBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (els.exportBtn.disabled) return;
    toggle();
  });

  // Click anywhere outside the menu (and not on the trigger, which has its
  // own toggle handler) closes it.
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
      window.alert(`Export failed: ${cause.message || cause}`);
      return;
    }
    if (!path) return; // user canceled the save picker
    try {
      await invoke("write_file_text", { path, contents });
    } catch (cause) {
      window.alert(`Failed to save: ${cause}`);
    }
  }

  els.exportTxt.addEventListener("click", () => {
    close();
    exportAs("txt");
  });
  els.exportHtml.addEventListener("click", () => {
    close();
    exportAs("html");
  });

  return { close };
}
