// Recent-files store backing the File > Open Recent menu. A plain JSON
// string array in localStorage, newest first. Only path-driven loads
// (Tauri open dialog, OS file-association handoff, recent-menu clicks)
// land here — browser File objects carry no host path and are excluded
// at the call site.
//
// The storage handle is injectable so Node tests can run without a DOM;
// production callers use the localStorage default.

const STORAGE_KEY = "udfly.recentFiles";

// Ten entries matches the common OS convention and keeps the submenu
// scannable; older entries silently fall off.
export const MAX_RECENT = 10;

export function getRecentFiles(storage = localStorage) {
  let parsed;
  try {
    parsed = JSON.parse(storage.getItem(STORAGE_KEY));
  } catch {
    return []; // corrupted store — treat as empty rather than crash the menu
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((entry) => typeof entry === "string" && entry);
}

export function addRecentFile(path, storage = localStorage) {
  if (typeof path !== "string" || !path) return;
  const list = [path, ...getRecentFiles(storage).filter((p) => p !== path)];
  storage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
}

export function clearRecentFiles(storage = localStorage) {
  storage.removeItem(STORAGE_KEY);
}
