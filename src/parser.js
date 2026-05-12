import JSZip from "jszip";

export async function parseUDF(arrayBuffer) {
  const zip = await loadZip(arrayBuffer);

  const contentXml = await readContentXml(zip);
  const doc = parseXml(contentXml);

  const root = doc.documentElement;
  const text = readTopLevelCData(root);
  const properties = readPageFormat(root);
  const styleMap = buildStyleMap(root);
  const elements = parseElements(root, text, styleMap);
  const verificationCode = await readVerificationCode(zip);

  const result = { text, pages: 1, properties, elements };
  if (verificationCode) result.verificationCode = verificationCode;
  return result;
}

async function readVerificationCode(zip) {
  const file = zip.file("documentproperties.xml");
  if (!file) return undefined;
  let xml = await file.async("string");
  if (xml.charCodeAt(0) === 0xfeff) xml = xml.slice(1);
  // Java properties XML carries a DOCTYPE that DOMParser parses fine. Match
  // <entry key="uyapdogrulamakodu">VALUE</entry> case-sensitively per UYAP.
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) return undefined;
  for (const entry of doc.getElementsByTagName("entry")) {
    if (entry.getAttribute("key") === "uyapdogrulamakodu") {
      return entry.textContent.trim() || undefined;
    }
  }
  return undefined;
}

function readPageFormat(root) {
  const props = firstChild(root, "properties");
  if (!props) return {};
  const pageFormat = firstChild(props, "pageFormat");
  if (!pageFormat) return {};
  const out = {};
  for (const attr of pageFormat.attributes) {
    const numeric = Number(attr.value);
    out[attr.name] = Number.isFinite(numeric) ? numeric : attr.value;
  }
  return out;
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
    case "header":
      return { type: "header", paragraphs: collectParagraphs(node, cdata, styleMap) };
    case "footer":
      return { type: "footer", paragraphs: collectParagraphs(node, cdata, styleMap) };
    default:
      return null;
  }
}

function collectParagraphs(node, cdata, styleMap) {
  const paragraphs = [];
  for (const child of node.children) {
    if (child.tagName === "paragraph") {
      paragraphs.push(parseParagraph(child, cdata, styleMap));
    }
  }
  return paragraphs;
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
  const table = { type: "table", rows };
  // UYAP marks layout tables (signature blocks, two-column forms)
  // "borderNone"; the renderer keys off this to suppress cell borders. Keep
  // the raw value so a future "borderAll"/etc. stays distinguishable.
  const border = node.getAttribute("border");
  if (border) table.border = border;
  return table;
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
  const ownLiteral = attrsOf(node);
  // Cascade per the brief: run inherits parent paragraph's resolved style,
  // then overlays its own attrs. The run's own resolver chain (if any) sits
  // BELOW the parent's resolved as a weaker base — it can fill gaps the
  // parent doesn't cover but must not override the parent's own attributes.
  const runChainBases = ownLiteral.resolver
    ? resolveAttrs({ resolver: ownLiteral.resolver }, styleMap)
    : {};
  const merged = { ...runChainBases, ...parentResolved, ...ownLiteral };
  const run = {
    text: cdata.substring(start, start + length),
    kind,
    style: normalizeStyle(merged),
  };
  if (kind === "field") {
    const name = ownLiteral.fieldName;
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
  if (attrs.foreground != null) {
    const n = parseInt(attrs.foreground, 10);
    if (!Number.isNaN(n)) style.color = colorIntToRgb(n);
  }
  assignNumeric(style, "leftIndent", attrs.LeftIndent);
  assignNumeric(style, "rightIndent", attrs.RightIndent);
  assignNumeric(style, "firstLineIndent", attrs.FirstLineIndent);
  assignNumeric(style, "hanging", attrs.Hanging);
  assignNumeric(style, "spaceAbove", attrs.SpaceAbove);
  assignNumeric(style, "spaceBelow", attrs.SpaceBelow);
  assignNumeric(style, "lineSpacing", attrs.LineSpacing);
  if (attrs.TabSet) style.tabSet = attrs.TabSet;
  return style;
}

function assignNumeric(target, key, raw) {
  const n = parseNumeric(raw);
  if (n != null) target[key] = n;
}

export function colorIntToRgb(n) {
  // Java signed 32-bit int → ARGB. Use unsigned shifts so negatives are
  // interpreted as 0xFFnnnnnn. The high byte is alpha; we ignore it for now
  // and emit opaque rgb(r, g, b).
  const r = (n >>> 16) & 0xff;
  const g = (n >>> 8) & 0xff;
  const b = n & 0xff;
  return `rgb(${r}, ${g}, ${b})`;
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
