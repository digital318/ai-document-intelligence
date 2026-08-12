/**
 * Formats a byte count for humans, e.g. 1536 -> "1.5 KB".
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = -1;

  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < units.length - 1);

  const rounded =
    value >= 10
      ? Math.round(value).toString()
      : value.toFixed(1).replace(/\.0$/, "");
  return `${rounded} ${units[unitIndex]}`;
}
