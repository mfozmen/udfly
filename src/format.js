// Pretty-print a byte count for the status bar. Below 1 KiB shows raw bytes
// with no decimals; KB and MB use a single decimal place to keep the status
// bar narrow without losing precision people care about.
export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
