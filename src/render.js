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
  if (typeof style.fontSize === "number") {
    parts.push(`font-size: ${style.fontSize}pt`);
  }
  if (style.color) parts.push(`color: ${style.color}`);
  if (style.fontFamily) {
    parts.push(`font-family: '${sanitizeFontFamily(style.fontFamily)}'`);
  }
  return parts.join("; ");
}

function sanitizeFontFamily(value) {
  // Defense-in-depth against CSS / HTML-attribute injection from a hostile
  // UDF. Strip ASCII control chars and CSS/HTML-special chars that could
  // break out of the single-quoted CSS string or the surrounding double-
  // quoted style attribute. Real font names don't need any of these.
  return value.replace(/[\r\n\t\\'"<>]/g, "");
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
