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

/**
 * Formats dashboard storage usage. Zero usage is shown as "0 MB" so the
 * metric card stays consistent with its empty placeholder.
 */
export function formatStorageUsed(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  return formatFileSize(bytes);
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

/** Formats a 0–1 confidence score as a percentage, e.g. 0.87 -> "87%". */
export function formatConfidence(score: number | null | undefined): string {
  if (typeof score !== "number" || !Number.isFinite(score)) return "—";
  const clamped = Math.min(1, Math.max(0, score));
  return `${Math.round(clamped * 100)}%`;
}

/** Readable local date and time, e.g. "Aug 14, 2026, 5:53 PM". */
export function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeFormatter.format(date);
}

/** Relative timestamp for recent activity, falling back to a readable date. */
export function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "—";

  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;

  if (absMs >= week) return formatDateTime(isoDate);

  let value: number;
  let unit: Intl.RelativeTimeFormatUnit;

  if (absMs < minute) {
    value = Math.round(diffMs / 1000);
    unit = "second";
  } else if (absMs < hour) {
    value = Math.round(diffMs / minute);
    unit = "minute";
  } else if (absMs < day) {
    value = Math.round(diffMs / hour);
    unit = "hour";
  } else {
    value = Math.round(diffMs / day);
    unit = "day";
  }

  return relativeTimeFormatter.format(value, unit);
}
