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

export type ConfidenceLevel = "high" | "medium" | "low";

/**
 * Friendly confidence category from a 0–1 score.
 * High: >= 0.90, Medium: >= 0.70 and < 0.90, Low: < 0.70.
 */
export function getConfidenceLevel(
  score: number | null | undefined,
): ConfidenceLevel | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  const clamped = Math.min(1, Math.max(0, score));
  if (clamped >= 0.9) return "high";
  if (clamped >= 0.7) return "medium";
  return "low";
}

export const CONFIDENCE_LEVEL_LABELS: Record<ConfidenceLevel, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

/**
 * Turns stored field names into a readable label.
 * Examples: policy_number → Policy Number, effectiveDate → Effective Date.
 */
export function formatFieldLabel(fieldName: string): string {
  const normalized = fieldName
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return fieldName;

  return normalized
    .split(" ")
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === "id") return "ID";
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

const JOB_TYPE_LABELS: Record<string, string> = {
  embedding_index: "Document indexing",
};

/** Friendly label for a processing job type, e.g. initial_analysis → Initial Analysis. */
export function formatJobType(jobType: string): string {
  const mapped = JOB_TYPE_LABELS[jobType];
  if (mapped) return mapped;
  const label = formatFieldLabel(jobType);
  return label.trim().length > 0 ? label : jobType;
}

/**
 * Formats a non-negative millisecond duration for operational history.
 * Examples: 850 → "850 ms", 12400 → "12.4 s", 125000 → "2 min 5 s".
 */
export function formatDurationMs(ms: number | null | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;

  const seconds = ms / 1000;
  if (seconds < 60) {
    const rounded =
      seconds >= 10
        ? Math.round(seconds).toString()
        : seconds.toFixed(1).replace(/\.0$/, "");
    return `${rounded} s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remain = Math.round(seconds % 60);
  return remain === 0 ? `${minutes} min` : `${minutes} min ${remain} s`;
}

/** Formats a token count with grouping separators, e.g. 1204 → "1,204". */
export function formatTokenCount(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "—";
  }
  return Math.trunc(value).toLocaleString("en-US");
}

/**
 * Coerces a numeric database/API value that may arrive as number or string.
 * Returns null when the value is missing or not a non-negative finite number.
 */
export function toNonNegativeInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.trunc(parsed);
  }
  return null;
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
