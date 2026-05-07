export function renderToHTML(parsed) {
  const parts = [];
  for (const element of parsed.elements) {
    const html = renderElement(element);
    if (html) parts.push(html);
  }
  return parts.join("");
}

function renderElement(element) {
  switch (element.type) {
    case "paragraph":
      return renderParagraph(element);
    case "table":
      return renderTable(element);
    case "header":
      return renderWrapper("udf-header", element.paragraphs);
    case "footer":
      return renderWrapper("udf-footer", element.paragraphs);
    default:
      return "";
  }
}

function renderWrapper(className, paragraphs) {
  const inner = paragraphs.map(renderParagraph).join("");
  return `<div class="${className}">${inner}</div>`;
}

function renderTable(table) {
  const rows = table.rows
    .map((cells) => {
      const cellsHtml = cells
        .map((paragraphs) => {
          const inner = paragraphs.map(renderParagraph).join("");
          return `<td>${inner}</td>`;
        })
        .join("");
      return `<tr>${cellsHtml}</tr>`;
    })
    .join("");
  return `<table class="udf-table">${rows}</table>`;
}

function renderParagraph(p) {
  const css = paragraphStyle(p.style);
  const attr = css ? ` style="${css}"` : "";
  if (p.runs.length === 0) {
    return `<p${attr}>&nbsp;</p>`;
  }
  const inner = p.runs.map(renderRun).join("");
  return `<p${attr}>${inner}</p>`;
}

function paragraphStyle(style) {
  // white-space: pre-wrap is always on so tabs/newlines inside runs render.
  const parts = ["white-space: pre-wrap"];
  if (typeof style.alignment === "number") {
    const map = { 0: "left", 1: "center", 2: "right", 3: "justify" };
    const value = map[style.alignment];
    if (value) parts.push(`text-align: ${value}`);
  }
  if (typeof style.leftIndent === "number") {
    parts.push(`margin-left: ${style.leftIndent}pt`);
  }
  if (typeof style.rightIndent === "number") {
    parts.push(`margin-right: ${style.rightIndent}pt`);
  }
  if (typeof style.spaceAbove === "number") {
    parts.push(`margin-top: ${style.spaceAbove}pt`);
  }
  if (typeof style.spaceBelow === "number") {
    parts.push(`margin-bottom: ${style.spaceBelow}pt`);
  }
  if (typeof style.lineSpacing === "number" && style.lineSpacing > 0) {
    parts.push(`line-height: ${style.lineSpacing}`);
  }
  return parts.join("; ");
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
  if (style.color && isRgbColor(style.color)) {
    parts.push(`color: ${style.color}`);
  }
  if (style.fontFamily) {
    parts.push(`font-family: '${sanitizeFontFamily(style.fontFamily)}'`);
  }
  return parts.join("; ");
}

function isRgbColor(value) {
  // Match the canonical shape colorIntToRgb produces: rgb(r, g, b) with a
  // single space after each comma. Anything looser is suspect — drop it.
  return /^rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/.test(value);
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
