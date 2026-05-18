import { parseUDF } from "./parser.js";
import { renderToHTML } from "./render.js";
import { formatBytes } from "./format.js";
import { invoke } from "@tauri-apps/api/core";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { setupExportMenu } from "./export.js";
import { createFileLoader } from "./handoff.js";
import { t, getLocale, setLocale, applyTranslations } from "./i18n.js";
import { checkAndPromptForUpdate } from "./updater.js";
import { createUpdaterUi } from "./updater-ui.js";

const els = {
  filename: document.getElementById("filename"),
  openBtn: document.getElementById("open-btn"),
  printBtn: document.getElementById("print-btn"),
  exportBtn: document.getElementById("export-btn"),
  exportMenu: document.getElementById("export-menu"),
  exportTxt: document.getElementById("export-txt"),
  exportHtml: document.getElementById("export-html"),
  exportPdf: document.getElementById("export-pdf"),
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
  langToggle: document.getElementById("lang-toggle"),
  updateBanner: document.getElementById("update-banner"),
  updateBannerMessage: document.getElementById("update-banner-message"),
  updateInstall: document.getElementById("update-install"),
  updateDismiss: document.getElementById("update-dismiss"),
};

// Updater UI adapter — owns the banner DOM wiring and the runtime-
// interpolated headline (which the static data-i18n sweep can't render).
// Created once at boot; refreshLocale() calls into its refreshLocale()
// hook so the version message follows the active language.
const updaterUi = createUpdaterUi(els);

// Apply the persisted (or default 'tr') locale to every [data-i18n] and
// [data-i18n-aria-label] node on load. The HTML ships with Turkish text
// inline so there's no pre-paint flash if JS is slow to wire up — this
// only re-runs the swap when the user has chosen English in a prior
// session (or after they click the lang toggle).
function refreshLocale() {
  const locale = getLocale();
  applyTranslations(document.body, locale);
  document.documentElement.setAttribute("lang", locale);
  // Reflect the active locale on the toggle so CSS can highlight the
  // current selection.
  els.langToggle.setAttribute("data-locale", locale);
  // Banner's runtime-interpolated headline lives outside the data-i18n
  // sweep; the adapter knows how to re-render it.
  updaterUi.refreshLocale();
}
refreshLocale();

// The currently-loaded document ({ parsed, filename }) or null when nothing
// is loaded / an error overlay is showing. The export menu reads this via
// getDocument so an export always serializes the document on screen — never
// a stale one from a load that's been superseded.
let currentDoc = null;

const exportMenu = setupExportMenu({
  els,
  getDocument: () => currentDoc,
  saveDialog,
  invoke,
});

// Drop the loaded document and disable the actions that depend on it. Called
// at the start of every load (before the async parse) and on error, so a
// click on Export/Print can never act on content that isn't on screen.
function clearDocument() {
  currentDoc = null;
  els.printBtn.disabled = true;
  els.exportBtn.disabled = true;
  exportMenu.close();
}

function showState(name) {
  els.emptyState.hidden = name !== "empty";
  els.pageView.hidden = name !== "page";
  els.errorState.hidden = name !== "error";
}

function setFilename(name) {
  els.filename.textContent = name || "";
}

function setStatus({ pages, sizeBytes, verificationCode }) {
  // Values are atomic (just the number/string). The statusbar markup
  // pairs each value with its own label ("Pages", "Size", "Verification"),
  // so embedding the unit or label prefix here would render twice.
  els.pagesInfo.textContent = typeof pages === "number" ? String(pages) : "—";
  els.sizeInfo.textContent =
    typeof sizeBytes === "number" ? formatBytes(sizeBytes) : "—";
  els.verificationInfo.textContent = verificationCode || "—";
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
  clearDocument();
}

async function loadBytes(filename, sizeBytes, buffer) {
  setFilename(filename);
  // Drop the previous document before the async parse: otherwise a click on
  // Export/Print between this call and the parse completing would act on the
  // document being replaced — and worse, if the new parse finishes while a
  // save dialog for the old one is still open, the save would write the old
  // content under a name matching the new document on screen.
  clearDocument();
  let parsed;
  try {
    parsed = await parseUDF(buffer);
  } catch (cause) {
    showError(cause.message || String(cause));
    return;
  }
  currentDoc = { parsed, filename };
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
    showError(t("load.readFailed", { name: file.name, message: cause.message }));
    return;
  }
  // buffer.byteLength matches what the Tauri loadFromPath path passes for
  // sizeBytes; using it here too keeps every loadBytes call site reporting
  // the size of the bytes actually loaded.
  await loadBytes(file.name, buffer.byteLength, buffer);
}

// Path-driven loads (Open dialog + OS file-association handoff) live in their
// own module; it owns the in-flight guard that serializes them.
const { pickAndOpen } = createFileLoader({ loadBytes, showError });

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
    showError(t("drop.notUdf"));
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

els.errorRetry.addEventListener("click", () => {
  setFilename("");
  showState("empty");
});

// Language toggle: flip TR ↔ EN, persist, re-render every translatable
// node. Keyboard activation comes for free from <button>.
els.langToggle.addEventListener("click", () => {
  setLocale(getLocale() === "tr" ? "en" : "tr");
  refreshLocale();
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

// Auto-update: fire once at boot. updater.js short-circuits when the
// Tauri runtime isn't available, so this is a no-op in plain Vite dev.
// In production it asks GitHub Releases via tauri-plugin-updater and,
// if a newer signed bundle exists, surfaces the banner. The Tauri
// plugins are dynamic-imported so the bundle stays lean when the check
// path never runs.
checkAndPromptForUpdate({
  deps: {
    isTauriAvailable: () =>
      typeof window !== "undefined" &&
      typeof window.__TAURI_INTERNALS__ !== "undefined",
    check: async () => {
      const { check } = await import("@tauri-apps/plugin-updater");
      return check();
    },
    relaunch: async () => {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    },
  },
  ui: updaterUi,
}).catch(() => {
  // The internal try/catch wraps deps.check(), but synchronous throws
  // from the ui callbacks (DOM not present, etc.) would otherwise escape
  // as an unhandled rejection. The update path is best-effort; a failure
  // here must not break the document workflow.
});
