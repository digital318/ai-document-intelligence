/**
 * Shared configuration for the document library: status/type/sort whitelists,
 * friendly labels, and URL search-param parsing.
 *
 * Every value that reaches a Supabase query is validated against these
 * whitelists — raw URL input is never used as a column name or filter value.
 */

export const PAGE_SIZE = 10;

/** Matches the `documents.status` CHECK constraint. */
export const DOCUMENT_STATUSES = [
  "uploaded",
  "queued",
  "processing",
  "processed",
  "needs_review",
  "failed",
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  uploaded: "Uploaded",
  queued: "Queued",
  processing: "Processing",
  processed: "Processed",
  needs_review: "Needs review",
  failed: "Failed",
};

/** Maps each URL `type` filter value to the MIME types it covers. */
export const TYPE_FILTERS = {
  pdf: ["application/pdf"],
  word: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  image: ["image/jpeg", "image/png", "image/webp"],
  text: ["text/plain"],
} as const satisfies Record<string, readonly string[]>;

export type DocumentTypeFilter = keyof typeof TYPE_FILTERS;

export const TYPE_FILTER_LABELS: Record<DocumentTypeFilter, string> = {
  pdf: "PDF",
  word: "Word",
  image: "Image",
  text: "Text",
};

const MIME_TYPE_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "Word",
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "text/plain": "Text",
};

/** Friendly label for a MIME type, e.g. "application/pdf" -> "PDF". */
export function formatMimeTypeLabel(mimeType: string): string {
  return MIME_TYPE_LABELS[mimeType] ?? "File";
}

/** Sort keys map to predefined column/direction pairs — never raw URL input. */
export const SORT_OPTIONS = {
  newest: { label: "Newest", column: "created_at", ascending: false },
  oldest: { label: "Oldest", column: "created_at", ascending: true },
  "name-asc": { label: "Name A-Z", column: "file_name", ascending: true },
  "name-desc": { label: "Name Z-A", column: "file_name", ascending: false },
  largest: { label: "Largest", column: "file_size_bytes", ascending: false },
  smallest: { label: "Smallest", column: "file_size_bytes", ascending: true },
} as const;

export type DocumentSort = keyof typeof SORT_OPTIONS;

export const DEFAULT_SORT: DocumentSort = "newest";

const MAX_SEARCH_LENGTH = 200;

export interface DocumentListParams {
  q: string;
  status: DocumentStatus | null;
  type: DocumentTypeFilter | null;
  sort: DocumentSort;
  page: number;
}

type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Parses raw page searchParams into a validated shape. Unknown status/type/
 * sort values fall back to defaults; invalid page numbers become page 1.
 */
export function parseDocumentListParams(
  raw: RawSearchParams,
): DocumentListParams {
  const q = (firstValue(raw.q) ?? "").trim().slice(0, MAX_SEARCH_LENGTH);

  const statusRaw = firstValue(raw.status);
  const status =
    statusRaw && (DOCUMENT_STATUSES as readonly string[]).includes(statusRaw)
      ? (statusRaw as DocumentStatus)
      : null;

  const typeRaw = firstValue(raw.type);
  const type =
    typeRaw && typeRaw in TYPE_FILTERS ? (typeRaw as DocumentTypeFilter) : null;

  const sortRaw = firstValue(raw.sort);
  const sort =
    sortRaw && sortRaw in SORT_OPTIONS
      ? (sortRaw as DocumentSort)
      : DEFAULT_SORT;

  const pageRaw = Number.parseInt(firstValue(raw.page) ?? "", 10);
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  return { q, status, type, sort, page };
}

/** True when any result-narrowing filter is active (sort does not narrow). */
export function hasActiveFilters(params: DocumentListParams): boolean {
  return params.q.length > 0 || params.status !== null || params.type !== null;
}

/** Escapes LIKE/ILIKE wildcards so user input matches literally. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/** Builds a /documents href that preserves filters, omitting default values. */
export function buildDocumentsHref(
  params: DocumentListParams,
  page: number,
): string {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.status) query.set("status", params.status);
  if (params.type) query.set("type", params.type);
  if (params.sort !== DEFAULT_SORT) query.set("sort", params.sort);
  if (page > 1) query.set("page", String(page));
  const queryString = query.toString();
  return queryString ? `/documents?${queryString}` : "/documents";
}
