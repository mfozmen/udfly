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
  return `<span>${run.text}</span>`;
}
