import JSZip from "jszip";

export async function parseUDF(arrayBuffer) {
  const zip = await loadZip(arrayBuffer);

  const contentXml = await readContentXml(zip);
  const doc = parseXml(contentXml);

  const root = doc.documentElement;
  const text = readTopLevelCData(root);
  const styleMap = buildStyleMap(root);
  const elements = parseElements(root, text, styleMap);

  return {
    text,
    pages: 1,
    properties: {},
    elements,
  };
}

function parseElements(root, cdata, styleMap) {
  const container = firstChild(root, "elements");
  if (!container) return [];

  const out = [];
  for (const node of container.children) {
    const parsed = parseElementNode(node, cdata, styleMap);
    if (parsed) out.push(parsed);
  }
  return out;
}

function parseElementNode(node, cdata, styleMap) {
  switch (node.tagName) {
    case "paragraph":
      return parseParagraph(node, cdata, styleMap);
    case "table":
      return parseTable(node, cdata, styleMap);
    default:
      return null;
  }
}

function parseTable(node, cdata, styleMap) {
  const rows = [];
  for (const rowNode of node.children) {
    if (rowNode.tagName !== "row") continue;
    const cells = [];
    for (const cellNode of rowNode.children) {
      if (cellNode.tagName !== "cell") continue;
      const paragraphs = [];
      for (const cellChild of cellNode.children) {
        if (cellChild.tagName === "paragraph") {
          paragraphs.push(parseParagraph(cellChild, cdata, styleMap));
        }
      }
      cells.push(paragraphs);
    }
    rows.push(cells);
  }
  return { type: "table", rows };
}

function parseParagraph(node, cdata, styleMap) {
  const resolved = resolveAttrs(attrsOf(node), styleMap);
  const style = normalizeStyle(resolved);
  const runs = [];
  for (const child of node.children) {
    const tag = child.tagName;
    if (tag === "content" || tag === "space" || tag === "field") {
      runs.push(parseRun(child, tag, cdata, styleMap, resolved));
    }
  }
  return { type: "paragraph", style, runs };
}

function parseRun(node, kind, cdata, styleMap, parentResolved) {
  const start = parseIntAttr(node, "startOffset", 0);
  const length = parseIntAttr(node, "length", 0);
  const ownResolved = resolveAttrs(attrsOf(node), styleMap);
  const merged = { ...parentResolved, ...ownResolved };
  const run = {
    text: cdata.substring(start, start + length),
    kind,
    style: normalizeStyle(merged),
  };
  if (kind === "field") {
    const name = node.getAttribute("fieldName");
    if (name) run.fieldName = name;
  }
  return run;
}

function buildStyleMap(root) {
  const map = new Map();
  const stylesNode = firstChild(root, "styles");
  if (!stylesNode) return map;
  for (const styleNode of stylesNode.children) {
    if (styleNode.tagName !== "style") continue;
    const name = styleNode.getAttribute("name");
    if (!name) continue;
    map.set(name, attrsOf(styleNode));
  }
  return map;
}

function attrsOf(node) {
  const out = {};
  for (const attr of node.attributes) {
    out[attr.name] = attr.value;
  }
  return out;
}

function resolveAttrs(ownAttrs, styleMap, seen = new Set()) {
  const resolverName = ownAttrs.resolver;
  let base = {};
  if (resolverName && !seen.has(resolverName)) {
    const styleAttrs = styleMap.get(resolverName);
    if (styleAttrs) {
      const next = new Set(seen);
      next.add(resolverName);
      base = resolveAttrs(styleAttrs, styleMap, next);
    }
  }
  return { ...base, ...ownAttrs };
}

function normalizeStyle(attrs) {
  const style = {};
  if (attrs.bold === "true") style.bold = true;
  if (attrs.underline === "true") style.underline = true;
  if (attrs.family) style.fontFamily = attrs.family;
  const fontSize = parseNumeric(attrs.size);
  if (fontSize != null) style.fontSize = fontSize;
  const alignment = parseNumeric(attrs.Alignment);
  if (alignment != null) style.alignment = alignment;
  return style;
}

function parseNumeric(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
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
