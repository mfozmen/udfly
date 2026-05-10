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
  if (isEmpty(p)) {
    return `<p${attr}>&nbsp;</p>`;
  }
  const inner = p.runs.map(renderRun).join("");
  return `<p${attr}>${inner}</p>`;
}

function isEmpty(p) {
  if (p.runs.length === 0) return true;
  for (const run of p.runs) {
    if (run.text && run.text.trim().length > 0) return false;
  }
  return true;
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
    // UDF's LineSpacing is additive: it's the *extra* space on top of
    // single line spacing, matching the Java text framework UYAP is built
    // on. UYAP body paragraphs commonly ship with 0.5 meaning "single plus
    // half" (line-height 1.5); treating the raw value as a CSS line-height
    // multiplier (0.5 literal) would collapse adjacent lines visually.
    parts.push(`line-height: ${1 + style.lineSpacing}`);
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

// Strip CSS/HTML-special characters and Unicode line terminators a hostile
// UDF could use to break out of the single-quoted CSS string or the
// surrounding double-quoted style attribute. Built via RegExp() with \u
// escapes because U+2028 / U+2029 in a regex literal would split the
// regex across source-file lines and trigger a parse error.
const FONT_FAMILY_STRIP =
  new RegExp("[\\r\\n\\t\\\\'\"<>\\u0085\\u2028\\u2029]", "g");

function sanitizeFontFamily(value) {
  return value.replace(FONT_FAMILY_STRIP, "");
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
