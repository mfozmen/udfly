export function renderToHTML(parsed) {
  const parts = [];
  for (const element of parsed.elements) {
    if (element.type === "paragraph") {
      parts.push(renderParagraph(element));
    }
  }
  return parts.join("");
}

function renderParagraph(p) {
  const inner = p.runs.map(renderRun).join("");
  return `<p>${inner}</p>`;
}

function renderRun(run) {
  const css = runStyle(run.style);
  const attr = css ? ` style="${css}"` : "";
  return `<span${attr}>${escapeHtml(run.text)}</span>`;
}

function runStyle(style) {
  const parts = [];
  if (style.bold) parts.push("font-weight: bold");
  if (style.underline) parts.push("text-decoration: underline");
  return parts.join("; ");
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
