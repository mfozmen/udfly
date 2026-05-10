// Strip everything up to the last forward slash or backslash so the
// topbar's filename slot stays free of OS-specific directory prefixes.
// Only the dialog path needs this — Tauri's dialog plugin returns
// native paths (POSIX or Windows) — while the drop handler's File.name
// is already a basename and routes to loadBytes directly without going
// through here. Mixed separators round-trip safely because the regex
// treats either character as equally terminal.
export function basename(p) {
  return p.replace(/^.*[\\/]/, "");
}
