import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { basename } from "./path.js";

// Owns loading a .udf from a host filesystem path: the interactive Open
// dialog (Open button / Ctrl+O) and the OS file-association handoff (argv on
// Windows/Linux, the macOS RunEvent::Opened Apple Event). Both end in
// loadBytes; one in-flight guard serializes them so two loads never race
// onto the same DOM.
//
// loadBytes and showError are injected by main.js — this module reaches the
// rest (read_file_bytes / take_pending_path commands, the path-available
// event, the OS file picker) through the Tauri bindings directly. Calling
// createFileLoader also starts the handoff drain (and the listener for later
// arrivals) as a documented side effect; it returns { pickAndOpen } for the
// UI to wire to the Open button and Ctrl+O.
export function createFileLoader({ loadBytes, showError }) {
  // loadInFlight serializes every path that ends in loadBytes — the picker
  // and the handoff drain. drainPending records "a drain was wanted while
  // loadInFlight was held"; the in-flight finally block re-triggers the
  // drain on the way out, so a path-available emit during a busy window
  // isn't lost (it would otherwise sit in the Rust queue until restart).
  let loadInFlight = false;
  let drainPending = false;

  // Invoke read_file_bytes on a host path and pipe the bytes through
  // loadBytes. Tauri serializes Vec<u8> as a JSON number array, so the
  // result is already iterable into a Uint8Array.
  async function loadFromPath(path) {
    const filename = basename(path);
    let bytes;
    try {
      bytes = await invoke("read_file_bytes", { path });
    } catch (cause) {
      showError(`Failed to read ${filename}: ${cause}`);
      return;
    }
    const buffer = new Uint8Array(bytes).buffer;
    await loadBytes(filename, buffer.byteLength, buffer);
  }

  async function pickAndOpen() {
    if (loadInFlight) return;
    loadInFlight = true;
    try {
      let path;
      try {
        path = await openDialog({
          multiple: false,
          filters: [{ name: "UDF Document", extensions: ["udf"] }],
        });
      } catch (cause) {
        showError(cause.message || String(cause));
        return;
      }
      if (!path) return; // user canceled the OS picker
      await loadFromPath(path);
    } finally {
      loadInFlight = false;
      if (drainPending) {
        drainPending = false;
        drainPendingPath();
      }
    }
  }

  // Drain the backend's queue of OS-handed-off paths. On Windows/Linux a
  // double-clicked .udf is queued from argv before the frontend mounts, so
  // the startup drain picks it up. On macOS the path arrives via
  // RunEvent::Opened — before or after mount — so we drain on startup and on
  // each udf-viewer://path-available event. Looping until take_pending_path
  // returns null handles the multi-file Apple Event: "Open With" against
  // several files queues every path but emits the event only once.
  async function drainPendingPath() {
    if (loadInFlight) {
      // A load is mid-flight; record the want-to-drain so the in-flight
      // finally block re-triggers us once the guard frees.
      drainPending = true;
      return;
    }
    loadInFlight = true;
    drainPending = false;
    try {
      while (true) {
        let path;
        try {
          path = await invoke("take_pending_path");
        } catch {
          return; // backend not available (plain browser) — silently skip
        }
        if (!path) return;
        await loadFromPath(path);
      }
    } finally {
      loadInFlight = false;
      if (drainPending) {
        drainPending = false;
        drainPendingPath();
      }
    }
  }

  // Subscribe to path-available BEFORE the first drain: drainPendingPath
  // awaits an invoke() round-trip, and a macOS RunEvent::Opened firing in
  // that window would emit with no handler and be lost. listen() rejects
  // when there's no Tauri event bridge (standalone Vite during dev/tests) —
  // that's fine, drag-drop still works.
  (async () => {
    try {
      await listen("udf-viewer://path-available", () => {
        drainPendingPath();
      });
    } catch {
      /* no Tauri event bridge — standalone Vite */
    }
    drainPendingPath();
  })();

  return { pickAndOpen };
}
