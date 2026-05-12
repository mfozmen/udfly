use std::collections::VecDeque;
use std::sync::Mutex;
// Manager (for app_handle.state()) and Emitter (for app_handle.emit()) are
// both only used inside the macOS-only RunEvent::Opened arm. Gating the
// imports avoids dead-import warnings on Windows and Linux where that arm
// is compiled out.
#[cfg(target_os = "macos")]
use tauri::{Emitter, Manager};

// FIFO queue of paths the OS has handed the app for us to open. Filled
// from CLI argv on launch (Windows / Linux file-association double-click)
// and from RunEvent::Opened at runtime (macOS Apple-Event handoff). The
// frontend drains it via take_pending_path on startup and again whenever
// the udf-viewer://path-available event fires.
//
// VecDeque (with pop_front) preserves selection order across a multi-file
// "Open With → UDF Viewer" — Finder hands the URLs in the order the user
// selected them, and a Vec/pop tail would reverse that.
struct PendingPaths(Mutex<VecDeque<String>>);

// Read a file the user picked via the dialog plugin and return its bytes
// to the frontend. The path is supplied by JS — which only has access to
// it because the user just chose it in an OS file picker — so this
// command's authority is bounded by the dialog's UI flow rather than by
// a static fs scope. Synchronous std::fs::read is fine here: .udf files
// are tiny (typically well under 10 MB) and the IPC round-trip dominates
// the wall-clock cost. The stringified IO error reaches JS so the error
// state can show why a path failed.
#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| e.to_string())
}

// Pop the next queued path the OS has handed us. Frontend calls this on
// startup (so a Windows / Linux argv path is consumed) and on each
// udf-viewer://path-available event (so macOS Apple-Event paths that
// arrive after the frontend mounted are picked up too).
#[tauri::command]
fn take_pending_path(state: tauri::State<PendingPaths>) -> Option<String> {
    state.0.lock().unwrap().pop_front()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // The OS hands a file-association double-click as argv[1] on Windows
    // and Linux. (macOS goes through RunEvent::Opened instead — handled
    // in the run-loop callback below.)
    let argv_paths: VecDeque<String> = std::env::args().skip(1).take(1).collect();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingPaths(Mutex::new(argv_paths)))
        .invoke_handler(tauri::generate_handler![read_file_bytes, take_pending_path])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        // macOS dispatches file-association double-clicks via the
        // kAEOpenDocuments Apple Event, which Tauri surfaces as
        // RunEvent::Opened. Argv handling above doesn't cover this case
        // on macOS — the path simply isn't in argv there.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = &event {
            let state = app_handle.state::<PendingPaths>();
            let mut queue = state.0.lock().unwrap();
            for url in urls {
                if let Ok(path) = url.to_file_path() {
                    queue.push_back(path.to_string_lossy().into_owned());
                }
            }
            drop(queue);
            // Tell the frontend a path is waiting; the listener over there
            // drains the queue via take_pending_path.
            let _ = app_handle.emit("udf-viewer://path-available", ());
        }

        // event is unused on non-macOS targets after the cfg-gated arm above.
        let _ = (app_handle, event);
    });
}
