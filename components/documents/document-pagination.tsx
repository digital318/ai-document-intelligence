import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildDocumentsHref, type DocumentListParams } from "@/lib/documents";

const BUTTON_BASE =
  "inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors";
const BUTTON_ENABLED =
  "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900";
const BUTTON_DISABLED =
  "cursor-not-allowed border-zinc-200 bg-white text-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-700";

interface DocumentPaginationProps {
  params: DocumentListParams;
  page: number;
  totalPages: number;
}

export function DocumentPagination({
  params,
  page,
  totalPages,
}: DocumentPaginationProps) {
  if (totalPages <= 1) return null;

  const hasPrevious = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav
      aria-label="Pagination"
      className="mt-4 flex items-center justify-between gap-4"
    >
      {hasPrevious ? (
        <Link
          href={buildDocumentsHref(params, page - 1)}
          className={`${BUTTON_BASE} ${BUTTON_ENABLED}`}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Previous
        </Link>
      ) : (
        <span aria-disabled="true" className={`${BUTTON_BASE} ${BUTTON_DISABLED}`}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Previous
        </span>
      )}

      <span className="text-sm text-zinc-500 dark:text-zinc-400">
        Page {page} of {totalPages}
      </span>

      {hasNext ? (
        <Link
          href={buildDocumentsHref(params, page + 1)}
          className={`${BUTTON_BASE} ${BUTTON_ENABLED}`}
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : (
        <span aria-disabled="true" className={`${BUTTON_BASE} ${BUTTON_DISABLED}`}>
          Next
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      )}
    </nav>
  );
}
