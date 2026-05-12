import { parseUDF } from "./parser.js";
import { renderToHTML, renderToStandaloneHTML } from "./render.js";
import { formatBytes } from "./format.js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { basename } from "./path.js";

const els = {
  filename: document.getElementById("filename"),
  openBtn: document.getElementById("open-btn"),
  printBtn: document.getElementById("print-btn"),
  exportBtn: document.getElementById("export-btn"),
  exportMenu: document.getElementById("export-menu"),
  exportTxt: document.getElementById("export-txt"),
  exportHtml: document.getElementById("export-html"),
  emptyState: document.getElementById("empty-state"),
  pageView: document.getElementById("page-view"),
  page: document.getElementById("page"),
  errorState: document.getElementById("error-state"),
  errorMessage: document.getElementById("error-message"),
  errorRetry: document.getElementById("error-retry"),
  dropoverlay: document.getElementById("dropoverlay"),
  pagesInfo: document.getElementById("pages-info"),
  sizeInfo: document.getElementById("size-info"),
  verificationInfo: document.getElementById("verification-info"),
};

// Cached parse result so the export handlers can re-serialize without
// re-reading the source UDF. Cleared on showError() so a stale doc can't
// be exported while the error overlay is showing.
let currentParsed = null;
let currentFilename = "";


function showState(name) {
  els.emptyState.hidden = name !== "empty";
  els.pageView.hidden = name !== "page";
  els.errorState.hidden = name !== "error";
}

function setFilename(name) {
  els.filename.textContent = name || "";
}

function setStatus({ pages, sizeBytes, verificationCode }) {
  els.pagesInfo.textContent =
    typeof pages === "number" ? `${pages} page${pages === 1 ? "" : "s"}` : "—";
  els.sizeInfo.textContent =
    typeof sizeBytes === "number" ? formatBytes(sizeBytes) : "—";
  els.verificationInfo.textContent = verificationCode
    ? `Verification: ${verificationCode}`
    : "—";
}

// Safety here comes from renderToHTML, not from the DOM API used to insert
// its output: the renderer HTML-escapes text, single-quotes / strips
// fontFamily, and validates color against the rgb shape, so the string
// arriving in `html` carries no live HTML constructs. The two APIs are NOT
// equivalent in general — innerHTML parses with the script "already
// started" flag so <script> tags arrive inert, while
// createContextualFragment produces script elements that DO execute on
// insertion. That difference is moot for renderToHTML's output today (no
// raw "<" can survive the escape) but it explains why we treat this seam
// as the single auditable boundary between trusted-HTML producer and the
// DOM: future changes can be vetted at exactly one place, and reverting
// to innerHTML elsewhere would re-introduce raw-HTML insertion sites
// without the safety analysis we did here.
function paintPage(html) {
  const range = document.createRange();
  range.selectNodeContents(els.page);
  const fragment = range.createContextualFragment(html);
  els.page.replaceChildren(fragment);
}

function showError(message) {
  // Reset chrome to "no document loaded" so the topbar filename and status
  // bar can't contradict the error overlay (e.g., previous document's name
  // sticking around after a non-.udf drop).
  setFilename("");
  setStatus({});
  els.errorMessage.textContent = message;
  showState("error");
  els.printBtn.disabled = true;
  els.exportBtn.disabled = true;
  closeExportMenu();
  currentParsed = null;
  currentFilename = "";
}

async function loadBytes(filename, sizeBytes, buffer) {
  setFilename(filename);
  let parsed;
  try {
    parsed = await parseUDF(buffer);
  } catch (cause) {
    showError(cause.message || String(cause));
    return;
  }
  currentParsed = parsed;
  currentFilename = filename;
  paintPage(renderToHTML(parsed));
  setStatus({
    pages: parsed.pages,
    sizeBytes,
    verificationCode: parsed.verificationCode,
  });
  els.printBtn.disabled = false;
  els.exportBtn.disabled = false;
  showState("page");
}

async function openFile(file) {
  let buffer;
  try {
    buffer = await file.arrayBuffer();
  } catch (cause) {
    showError(`Failed to read ${file.name}: ${cause.message}`);
    return;
  }
  await loadBytes(file.name, file.size, buffer);
}

// Path-driven load: invoke the Tauri read_file_bytes command on a host
// filesystem path and pipe the result through loadBytes. Both the dialog
// flow (pickAndOpen) and the launch-time OS-handoff flow share this — the
// dialog provides the path interactively, the OS-handoff provides it as
// argv or as a macOS RunEvent::Opened URL.
async function loadFromPath(path) {
  const filename = basename(path);
  let bytes;
  try {
    // Tauri serializes Vec<u8> as a JSON number array, so the result is
    // already iterable into Uint8Array on the JS side.
    bytes = await invoke("read_file_bytes", { path });
  } catch (cause) {
    showError(`Failed to read ${filename}: ${cause}`);
    return;
  }
  const buffer = new Uint8Array(bytes).buffer;
  await loadBytes(filename, buffer.byteLength, buffer);
}

// Single in-flight guard shared across every code path that ends in
// loadBytes — the Open button + Ctrl+O picker, and the OS-handoff queue
// drain. The original guard only covered the picker (rapid keypress
// mashing on Ctrl+O) but a near-simultaneous Apple Event drain racing the
// user's dialog open could still land two loadBytes calls on the same
// DOM. One module-scoped flag serializes both.
//
// drainPending records "drainPendingPath was called while loadInFlight
// was already true." Without it, a path-available emit that arrives
// while the picker is up would be consumed without ever triggering a
// drain — the path would sit in the Rust queue until the app restarts.
// Both finally blocks check drainPending and re-trigger the drain on
// the way out so the queued path is picked up as soon as the in-flight
// load releases the guard.
let loadInFlight = false;
let drainPending = false;

async function pickAndOpen() {
  if (loadInFlight) return;
  loadInFlight = true;
  try {
    let path;
    try {
      path = await openDialog({
        multiple: false,
        filters: [{ name: "UDF Document", extensions: ["udf"] }],
      });
    } catch (cause) {
      showError(cause.message || String(cause));
      return;
    }
    if (!path) return; // user canceled the OS picker
    await loadFromPath(path);
  } finally {
    loadInFlight = false;
    if (drainPending) {
      drainPending = false;
      drainPendingPath();
    }
  }
}

function isUdfFile(file) {
  return file && /\.udf$/i.test(file.name);
}

// Counting dragenter/dragleave (rather than tracking a single boolean
// from dragover) lets the overlay stay visible while the cursor crosses
// inner element boundaries — every entry into a child fires dragleave on
// the parent, so a flag-based approach would flicker.
let dragDepth = 0;
window.addEventListener("dragenter", (e) => {
  e.preventDefault();
  dragDepth += 1;
  els.dropoverlay.classList.add("dropoverlay--active");
});
window.addEventListener("dragover", (e) => {
  e.preventDefault();
});
window.addEventListener("dragleave", () => {
  // Drags originating inside the WebView (e.g., text selection drags) emit
  // dragleave on window without a matching dragenter, so guard the decrement
  // to keep the depth from going negative and desyncing future overlays.
  if (dragDepth > 0) dragDepth -= 1;
  if (dragDepth === 0) {
    els.dropoverlay.classList.remove("dropoverlay--active");
  }
});
window.addEventListener("drop", async (e) => {
  e.preventDefault();
  dragDepth = 0;
  els.dropoverlay.classList.remove("dropoverlay--active");
  const file = [...(e.dataTransfer?.files || [])].find(isUdfFile);
  if (!file) {
    showError("Only .udf files are supported.");
    return;
  }
  await openFile(file);
});

els.openBtn.addEventListener("click", () => {
  pickAndOpen();
});

els.printBtn.addEventListener("click", () => {
  if (!els.printBtn.disabled) window.print();
});

// Strip the .udf extension so the OS save dialog suggests "foo.txt" / "foo.html"
// from "foo.udf" rather than the more awkward "foo.udf.txt".
function defaultExportName(extension) {
  const base = currentFilename.replace(/\.udf$/i, "");
  return base ? `${base}.${extension}` : `document.${extension}`;
}

function openExportMenu() {
  els.exportMenu.hidden = false;
  els.exportBtn.setAttribute("aria-expanded", "true");
}

function closeExportMenu() {
  els.exportMenu.hidden = true;
  els.exportBtn.setAttribute("aria-expanded", "false");
}

function toggleExportMenu() {
  if (els.exportMenu.hidden) openExportMenu();
  else closeExportMenu();
}

els.exportBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (els.exportBtn.disabled) return;
  toggleExportMenu();
});

// Click outside the menu closes it. Stop propagation on the menu itself so a
// click on an item bubbles to the item's own handler (which closes the menu)
// rather than this catch-all that also closes — net effect is the same, but
// keeping the menu's click contained avoids re-entrancy if more handlers land.
document.addEventListener("click", (e) => {
  if (els.exportMenu.hidden) return;
  if (!els.exportMenu.contains(e.target) && e.target !== els.exportBtn) {
    closeExportMenu();
  }
});

// Escape closes the menu and returns focus to the trigger so keyboard users
// don't get stranded.
els.exportMenu.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeExportMenu();
    els.exportBtn.focus();
  }
});

async function exportAs(format) {
  if (!currentParsed) return;
  let filters;
  let contents;
  if (format === "txt") {
    filters = [{ name: "Plain Text", extensions: ["txt"] }];
    contents = currentParsed.text;
  } else {
    filters = [{ name: "HTML Document", extensions: ["html"] }];
    contents = renderToStandaloneHTML(currentParsed);
  }
  let path;
  try {
    path = await saveDialog({
      defaultPath: defaultExportName(format),
      filters,
    });
  } catch (cause) {
    // Save failures shouldn't wipe the loaded document — the user's view
    // wasn't broken, only the export. Surface via alert() so the page stays
    // intact and they can retry.
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
  closeExportMenu();
  exportAs("txt");
});

els.exportHtml.addEventListener("click", () => {
  closeExportMenu();
  exportAs("html");
});

els.errorRetry.addEventListener("click", () => {
  setFilename("");
  showState("empty");
});

window.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const key = e.key.toLowerCase();
  if (key === "o") {
    e.preventDefault();
    pickAndOpen();
  } else if (key === "p" && !els.printBtn.disabled) {
    e.preventDefault();
    window.print();
  }
});

showState("empty");

// Drain any OS-handoff paths the backend has queued. On Windows / Linux a
// double-click of a registered .udf gets the path queued from argv before
// the frontend mounts, so the initial drain on startup picks it up. On
// macOS the path arrives via RunEvent::Opened, which can happen before or
// after the frontend mounts — drain on startup AND listen for the
// udf-viewer://path-available event for any later arrivals.
//
// Looping until take_pending_path returns null handles the multi-file
// Apple Event: a "Open With → UDF Viewer" against several selected .udf
// files lands every path in the backend's FIFO queue but emits the event
// only once. Without the loop, only the head of the queue would open and
// the rest would sit unconsumed until the next event.
async function drainPendingPath() {
  if (loadInFlight) {
    // Picker or another drain is mid-load. Record the want-to-drain so
    // the in-flight finally block re-triggers us once the guard frees.
    drainPending = true;
    return;
  }
  loadInFlight = true;
  drainPending = false;
  try {
    while (true) {
      let path;
      try {
        path = await invoke("take_pending_path");
      } catch {
        return; // backend not available (e.g. running in plain browser) — silently skip
      }
      if (!path) return;
      await loadFromPath(path);
    }
  } finally {
    loadInFlight = false;
    if (drainPending) {
      drainPending = false;
      drainPendingPath();
    }
  }
}

// Subscribe to the path-available event BEFORE draining the queue.
// drainPendingPath awaits an invoke() round-trip; without the listener
// already mounted, a macOS RunEvent::Opened that fires during that
// round-trip would emit path-available with no JS handler and be lost
// silently. Awaiting listen() first means the subscription is in place
// before any window for the race opens.
try {
  await listen("udf-viewer://path-available", () => {
    drainPendingPath();
  });
} catch {
  // No-op: listen() rejects when there's no Tauri event bridge available,
  // which is the case when this module is loaded outside the WebView (the
  // standalone Vite dev server during tests). Drag-drop still works.
}

drainPendingPath();
