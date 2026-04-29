import JSZip from "jszip";

export async function parseUDF(arrayBuffer) {
  const zip = await loadZip(arrayBuffer);

  const contentXml = await readContentXml(zip);
  const doc = parseXml(contentXml);

  const root = doc.documentElement;
  const text = readTopLevelCData(root);

  return {
    text,
    pages: 1,
    properties: {},
    elements: [],
  };
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
