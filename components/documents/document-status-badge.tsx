import { STATUS_LABELS, type DocumentStatus } from "@/lib/documents";

const STATUS_STYLES: Record<DocumentStatus, string> = {
  uploaded:
    "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400",
  queued: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400",
  processing:
    "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  processed:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  needs_review:
    "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400",
  failed: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

const FALLBACK_STYLE =
  "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";

export function DocumentStatusBadge({ status }: { status: string }) {
  const isKnown = status in STATUS_LABELS;
  const label = isKnown ? STATUS_LABELS[status as DocumentStatus] : status;
  const style = isKnown ? STATUS_STYLES[status as DocumentStatus] : FALLBACK_STYLE;

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      {label}
    </span>
  );
}
