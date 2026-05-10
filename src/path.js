// Strip everything up to the last forward slash or backslash so the
// topbar's filename slot stays free of OS-specific directory prefixes.
// Tauri's dialog plugin returns native paths (POSIX or Windows), and the
// drop handler's File.name is already a basename — both flow through this
// helper for consistency. Mixed separators round-trip safely because the
// regex treats either character as equally terminal.
export function basename(p) {
  return p.replace(/^.*[\\/]/, "");
}
