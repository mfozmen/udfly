import { parseUDF } from "./parser.js";
import { renderToHTML } from "./render.js";
import { formatBytes } from "./format.js";

const els = {
  filename: document.getElementById("filename"),
  printBtn: document.getElementById("print-btn"),
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
}

async function openFile(file) {
  setFilename(file.name);
  let buffer;
  try {
    buffer = await file.arrayBuffer();
  } catch (cause) {
    showError(`Failed to read ${file.name}: ${cause.message}`);
    return;
  }
  let parsed;
  try {
    parsed = await parseUDF(buffer);
  } catch (cause) {
    showError(cause.message || String(cause));
    return;
  }
  paintPage(renderToHTML(parsed));
  setStatus({
    pages: parsed.pages,
    sizeBytes: file.size,
    verificationCode: parsed.verificationCode,
  });
  els.printBtn.disabled = false;
  showState("page");
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

els.printBtn.addEventListener("click", () => {
  if (!els.printBtn.disabled) window.print();
});

els.errorRetry.addEventListener("click", () => {
  setFilename("");
  showState("empty");
});

window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
    if (!els.printBtn.disabled) {
      e.preventDefault();
      window.print();
    }
  }
});

showState("empty");
