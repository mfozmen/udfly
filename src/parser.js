import JSZip from "jszip";

export async function parseUDF(arrayBuffer) {
  const zip = await loadZip(arrayBuffer);

  const contentXml = await readContentXml(zip);
  const doc = parseXml(contentXml);

  const root = doc.documentElement;
  const text = readTopLevelCData(root);
  const elements = parseElements(root, text);

  return {
    text,
    pages: 1,
    properties: {},
    elements,
  };
}

function parseElements(root, cdata) {
  const container = firstChild(root, "elements");
  if (!container) return [];

  const out = [];
  for (const node of container.children) {
    if (node.tagName === "paragraph") {
      out.push(parseParagraph(node, cdata));
    }
  }
  return out;
}

function parseParagraph(node, cdata) {
  const style = readStyleAttrs(node);
  const runs = [];
  for (const child of node.children) {
    const tag = child.tagName;
    if (tag === "content" || tag === "space" || tag === "field") {
      runs.push(parseRun(child, tag, cdata));
    }
  }
  return { type: "paragraph", style, runs };
}

function parseRun(node, kind, cdata) {
  const start = parseIntAttr(node, "startOffset", 0);
  const length = parseIntAttr(node, "length", 0);
  const run = {
    text: cdata.substring(start, start + length),
    kind,
    style: readStyleAttrs(node),
  };
  if (kind === "field") {
    const name = node.getAttribute("fieldName");
    if (name) run.fieldName = name;
  }
  return run;
}

function readStyleAttrs(node) {
  const style = {};
  if (node.getAttribute("bold") === "true") style.bold = true;
  return style;
}

function parseIntAttr(node, name, fallback) {
  const raw = node.getAttribute(name);
  if (raw == null || raw === "") return fallback;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? fallback : n;
}

function firstChild(parent, tagName) {
  for (const c of parent.children) {
    if (c.tagName === tagName) return c;
  }
  return null;
}

async function loadZip(arrayBuffer) {
  try {
    return await JSZip.loadAsync(arrayBuffer);
  } catch (cause) {
    throw new Error(`parseUDF: failed to open .udf archive: ${cause.message}`, {
      cause,
    });
  }
}

async function readContentXml(zip) {
  const file = zip.file("content.xml");
  if (!file) {
    throw new Error("parseUDF: content.xml not found in .udf archive");
  }
  let xml = await file.async("string");
  if (xml.charCodeAt(0) === 0xfeff) xml = xml.slice(1);
  return xml;
}

function parseXml(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const error = doc.querySelector("parsererror");
  if (error) {
    throw new Error(
      `parseUDF: malformed content.xml: ${error.textContent.trim()}`
    );
  }
  return doc;
}

function readTopLevelCData(root) {
  for (const child of root.children) {
    if (child.tagName === "content") return child.textContent;
  }
  return "";
}
