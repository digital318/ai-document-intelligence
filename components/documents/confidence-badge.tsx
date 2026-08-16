import {
  CONFIDENCE_LEVEL_LABELS,
  formatConfidence,
  getConfidenceLevel,
  type ConfidenceLevel,
} from "@/lib/format";

const LEVEL_STYLES: Record<ConfidenceLevel, string> = {
  high: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300",
  medium:
    "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300",
  low: "bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-300",
};

const FALLBACK_STYLE =
  "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";

interface ConfidenceBadgeProps {
  score: number | string | null | undefined;
  /** Larger badge for overall analysis confidence. */
  size?: "sm" | "md";
}

function toScore(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Accessible confidence presentation: numeric percentage plus a High /
 * Medium / Low category. Color is never the only signal.
 */
export function ConfidenceBadge({ score, size = "sm" }: ConfidenceBadgeProps) {
  const numeric = toScore(score);
  const level = getConfidenceLevel(numeric);
  const percent = formatConfidence(numeric);
  const category = level ? CONFIDENCE_LEVEL_LABELS[level] : null;
  const style = level ? LEVEL_STYLES[level] : FALLBACK_STYLE;
  const sizeClass =
    size === "md"
      ? "px-2.5 py-1 text-sm"
      : "px-2 py-0.5 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${sizeClass} ${style}`}
      title="Confidence is an estimate from the analysis model, not a guarantee of correctness."
    >
      <span className="tabular-nums">{percent}</span>
      {category ? (
        <>
          <span aria-hidden="true">·</span>
          <span>{category}</span>
        </>
      ) : null}
    </span>
  );
}
