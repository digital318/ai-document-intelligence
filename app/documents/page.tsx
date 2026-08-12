import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, FileText, SearchX, Upload } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { DocumentFilters } from "@/components/documents/document-filters";
import { DocumentPagination } from "@/components/documents/document-pagination";
import {
  DocumentTable,
  type DocumentListItem,
} from "@/components/documents/document-table";
import {
  PAGE_SIZE,
  SORT_OPTIONS,
  TYPE_FILTERS,
  escapeLikePattern,
  hasActiveFilters,
  parseDocumentListParams,
} from "@/lib/documents";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Documents",
};

const DOCUMENT_COLUMNS =
  "id, file_name, mime_type, file_size_bytes, document_type, status, created_at, updated_at";

interface DocumentsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DocumentsPage({
  searchParams,
}: DocumentsPageProps) {
  const params = parseDocumentListParams(await searchParams);
  const filtersActive = hasActiveFilters(params);

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userEmail =
    typeof claimsData?.claims?.email === "string"
      ? claimsData.claims.email
      : null;

  // RLS restricts every query below to the authenticated user's own rows.
  let loadError = false;
  let totalCount = 0;
  let documents: DocumentListItem[] = [];
  let accountIsEmpty = false;

  // Filter values below come exclusively from whitelists in lib/documents;
  // raw URL input never reaches column names or query operators.
  let countQuery = supabase
    .from("documents")
    .select("id", { count: "exact", head: true });
  if (params.q) {
    countQuery = countQuery.ilike(
      "file_name",
      `%${escapeLikePattern(params.q)}%`,
    );
  }
  if (params.status) {
    countQuery = countQuery.eq("status", params.status);
  }
  if (params.type) {
    countQuery = countQuery.in("mime_type", [...TYPE_FILTERS[params.type]]);
  }
  const { count, error: countError } = await countQuery;

  if (countError) {
    // Log only Supabase's safe error metadata — never tokens or keys.
    console.error(
      "[documents] Failed to count documents:",
      countError.code,
      countError.message,
    );
    loadError = true;
  } else {
    totalCount = count ?? 0;
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  // Out-of-range pages (e.g. stale links) clamp to the last real page.
  const page = Math.min(params.page, totalPages);

  if (!loadError && totalCount > 0) {
    const sortOption = SORT_OPTIONS[params.sort];
    const rangeStart = (page - 1) * PAGE_SIZE;

    let dataQuery = supabase.from("documents").select(DOCUMENT_COLUMNS);
    if (params.q) {
      dataQuery = dataQuery.ilike(
        "file_name",
        `%${escapeLikePattern(params.q)}%`,
      );
    }
    if (params.status) {
      dataQuery = dataQuery.eq("status", params.status);
    }
    if (params.type) {
      dataQuery = dataQuery.in("mime_type", [...TYPE_FILTERS[params.type]]);
    }

    const { data, error } = await dataQuery
      .order(sortOption.column, { ascending: sortOption.ascending })
      // Secondary key keeps pagination deterministic across equal values.
      .order("id", { ascending: true })
      .range(rangeStart, rangeStart + PAGE_SIZE - 1)
      .returns<DocumentListItem[]>();

    if (error) {
      console.error(
        "[documents] Failed to load documents:",
        error.code,
        error.message,
      );
      loadError = true;
    } else {
      documents = data ?? [];
    }
  }

  if (!loadError && totalCount === 0 && filtersActive) {
    // Distinguish "filters matched nothing" from "no documents at all".
    const { count: ownedCount, error: ownedError } = await supabase
      .from("documents")
      .select("id", { count: "exact", head: true });
    accountIsEmpty = !ownedError && (ownedCount ?? 0) === 0;
  } else if (!loadError && totalCount === 0) {
    accountIsEmpty = true;
  }

  return (
    <DashboardLayout userEmail={userEmail}>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Documents
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            All documents stored in your workspace.
          </p>
        </div>
        <Link
          href="/upload"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          <Upload className="h-4 w-4" />
          Upload Document
        </Link>
      </div>

      {loadError ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-5 py-4 dark:border-red-500/30 dark:bg-red-500/10">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          <p className="text-sm text-red-700 dark:text-red-400">
            Unable to load documents right now. Please try again later.
          </p>
        </div>
      ) : (
        <>
          <DocumentFilters params={params} />

          {accountIsEmpty ? (
            <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex flex-col items-center justify-center gap-2 px-5 py-16 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500">
                  <FileText className="h-6 w-6" />
                </span>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  No documents yet
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Upload your first document to begin.
                </p>
                <Link
                  href="/upload"
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                >
                  <Upload className="h-4 w-4" />
                  Upload Document
                </Link>
              </div>
            </div>
          ) : totalCount === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex flex-col items-center justify-center gap-2 px-5 py-16 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500">
                  <SearchX className="h-6 w-6" />
                </span>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  No documents match your filters.
                </p>
                <Link
                  href="/documents"
                  className="mt-1 text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  Clear filters
                </Link>
              </div>
            </div>
          ) : (
            <>
              <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
                {totalCount} {totalCount === 1 ? "document" : "documents"}
              </p>
              <DocumentTable documents={documents} />
              <DocumentPagination
                params={params}
                page={page}
                totalPages={totalPages}
              />
            </>
          )}
        </>
      )}
    </DashboardLayout>
  );
}
