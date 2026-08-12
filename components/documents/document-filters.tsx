"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import {
  DEFAULT_SORT,
  DOCUMENT_STATUSES,
  SORT_OPTIONS,
  STATUS_LABELS,
  TYPE_FILTER_LABELS,
  hasActiveFilters,
  type DocumentListParams,
  type DocumentSort,
} from "@/lib/documents";

const SEARCH_DEBOUNCE_MS = 300;

const SELECT_CLASS =
  "rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50";

export function DocumentFilters({ params }: { params: DocumentListParams }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(params.q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSubmittedSearch = useRef(params.q);

  // Sync the input when q changes outside this component (e.g. Clear filters)
  // without clobbering in-flight typing after our own debounced updates.
  useEffect(() => {
    if (params.q !== lastSubmittedSearch.current) {
      lastSubmittedSearch.current = params.q;
      setSearch(params.q);
    }
  }, [params.q]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  function updateParams(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
    }
    // Any filter/search/sort change restarts pagination at page 1.
    next.delete("page");
    const queryString = next.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    });
  }

  function submitSearch(value: string) {
    const trimmed = value.trim();
    lastSubmittedSearch.current = trimmed;
    updateParams({ q: trimmed || null });
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => submitSearch(value),
      SEARCH_DEBOUNCE_MS,
    );
  }

  function clearSearch() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearch("");
    submitSearch("");
  }

  function clearAllFilters() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearch("");
    lastSubmittedSearch.current = "";
    router.replace(pathname, { scroll: false });
  }

  const showClearAll = hasActiveFilters(params) || params.sort !== DEFAULT_SORT;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="relative min-w-56 flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
          aria-hidden="true"
        />
        <input
          type="search"
          value={search}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder="Search documents…"
          aria-label="Search documents by name"
          className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-9 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 [&::-webkit-search-cancel-button]:hidden"
        />
        {search ? (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <select
        value={params.status ?? ""}
        onChange={(event) =>
          updateParams({ status: event.target.value || null })
        }
        aria-label="Filter by status"
        className={SELECT_CLASS}
      >
        <option value="">All statuses</option>
        {DOCUMENT_STATUSES.map((status) => (
          <option key={status} value={status}>
            {STATUS_LABELS[status]}
          </option>
        ))}
      </select>

      <select
        value={params.type ?? ""}
        onChange={(event) => updateParams({ type: event.target.value || null })}
        aria-label="Filter by file type"
        className={SELECT_CLASS}
      >
        <option value="">All types</option>
        {(
          Object.keys(TYPE_FILTER_LABELS) as Array<
            keyof typeof TYPE_FILTER_LABELS
          >
        ).map((type) => (
          <option key={type} value={type}>
            {TYPE_FILTER_LABELS[type]}
          </option>
        ))}
      </select>

      <select
        value={params.sort}
        onChange={(event) =>
          updateParams({
            sort:
              event.target.value === DEFAULT_SORT ? null : event.target.value,
          })
        }
        aria-label="Sort documents"
        className={SELECT_CLASS}
      >
        {(Object.keys(SORT_OPTIONS) as DocumentSort[]).map((sort) => (
          <option key={sort} value={sort}>
            {SORT_OPTIONS[sort].label}
          </option>
        ))}
      </select>

      {showClearAll ? (
        <button
          type="button"
          onClick={clearAllFilters}
          className="text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
