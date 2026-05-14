// Pretty-print a byte count for the status bar. Below 1 KiB shows raw bytes
// with no decimals; KB and MB use a single decimal place to keep the status
// bar narrow without losing precision people care about. The space between
// the number and unit is a non-breaking space (U+00A0) so the pair never
// wraps — "3.4" alone on one line is unreadable noise.
const NBSP = " ";

export function formatBytes(n) {
  if (n < 1024) return `${n}${NBSP}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}${NBSP}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}${NBSP}MB`;
}
