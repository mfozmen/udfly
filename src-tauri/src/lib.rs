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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![read_file_bytes])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
