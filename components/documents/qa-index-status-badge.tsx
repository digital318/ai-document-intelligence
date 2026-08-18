import {
  EMBEDDING_STATUS_LABELS,
  isEmbeddingStatus,
  type EmbeddingStatus,
} from "@/lib/documents";

const STATUS_STYLES: Record<EmbeddingStatus, string> = {
  not_indexed:
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  indexing:
    "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  indexed:
    "bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-400",
  failed: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

const FALLBACK_STYLE =
  "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";

/**
 * Compact Q&A index status. Distinct from AI analysis DocumentStatusBadge.
 */
export function QaIndexStatusBadge({
  status,
}: {
  status: string | null | undefined;
}) {
  const value = status ?? "not_indexed";
  const isKnown = isEmbeddingStatus(value);
  const label = isKnown ? EMBEDDING_STATUS_LABELS[value] : "Not indexed";
  const style = isKnown ? STATUS_STYLES[value] : FALLBACK_STYLE;

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      {label}
    </span>
  );
}
