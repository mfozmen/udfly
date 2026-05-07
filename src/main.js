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

// renderToHTML's output is already HTML-escaped (text), single-quote-CSS-
// safe (font-family), and rgb-shape-validated (color); the renderer is the
// sanitizer. Use createContextualFragment to materialize the trusted string
// as DOM nodes and replace the page's children, avoiding direct innerHTML.
function paintPage(html) {
  const range = document.createRange();
  range.selectNodeContents(els.page);
  const fragment = range.createContextualFragment(html);
  els.page.replaceChildren(fragment);
}

function showError(message) {
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

// Drag-and-drop. The browser fires dragover continuously while a file is
// over the window; we use it to keep the overlay shown. drop reads the
// first .udf file from the dataTransfer.
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
  dragDepth -= 1;
  if (dragDepth <= 0) {
    dragDepth = 0;
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
  // Ctrl/Cmd+P → print (only when a document is loaded)
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
    if (!els.printBtn.disabled) {
      e.preventDefault();
      window.print();
    }
  }
});

// Initial state.
showState("empty");
