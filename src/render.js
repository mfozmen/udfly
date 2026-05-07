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
  const inner = p.runs.map((r) => r.text).join("");
  return `<p>${inner}</p>`;
}
