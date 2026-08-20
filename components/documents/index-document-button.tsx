"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ScanSearch } from "lucide-react";
import {
  isEmbeddingStatus,
  isIndexableDocumentStatus,
  isSupportedAnalysisMimeType,
  type EmbeddingStatus,
} from "@/lib/documents";
import { RATE_LIMIT_USER_MESSAGE } from "@/lib/security/rate-limit-messages";

const SAFE_INDEX_ERRORS = new Set([
  "Unable to complete indexing. Please try again.",
  "This file type is not supported for indexing.",
  "This document must be analyzed before it can be indexed.",
  "This document is already being indexed.",
  "Indexing is temporarily unavailable. Please try again.",
  "Indexing service is unavailable.",
  "Document not found",
]);

const DETAIL_BUTTON =
  "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors";

const BUTTON_PRIMARY = `${DETAIL_BUTTON} bg-teal-600 text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50`;
const BUTTON_SECONDARY = `${DETAIL_BUTTON} border border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800`;
const BUTTON_DISABLED = `${DETAIL_BUTTON} cursor-not-allowed border border-zinc-200 text-zinc-400 dark:border-zinc-800 dark:text-zinc-500`;

interface IndexDocumentButtonProps {
  documentId: string;
  status: string;
  embeddingStatus: string | null | undefined;
  /** Used only for accessible labels. Never a storage path. */
  fileName?: string;
  /** Used only to hide the control for unsupported file types. */
  mimeType?: string;
}

function actionLabel(embeddingStatus: EmbeddingStatus): string {
  switch (embeddingStatus) {
    case "not_indexed":
      return "Index for Q&A";
    case "failed":
      return "Retry indexing";
    case "indexing":
      return "Indexing...";
    case "indexed":
      return "Re-index for Q&A";
  }
}

/**
 * User-triggered vector indexing. The browser sends only the document UUID.
 */
export function IndexDocumentButton({
  documentId,
  status,
  embeddingStatus,
  fileName,
  mimeType,
}: IndexDocumentButtonProps) {
  const router = useRouter();
  const [isIndexing, setIsIndexing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (mimeType && !isSupportedAnalysisMimeType(mimeType)) {
    return null;
  }

  if (!isIndexableDocumentStatus(status)) {
    return null;
  }

  const rawStatus = embeddingStatus ?? "not_indexed";
  const currentStatus: EmbeddingStatus = isEmbeddingStatus(rawStatus)
    ? rawStatus
    : "not_indexed";

  const accessibleName = fileName?.trim() || "document";
  const busy = isIndexing || currentStatus === "indexing";
  const label = busy ? "Indexing..." : actionLabel(currentStatus);

  const handleIndex = async () => {
    if (busy) return;
    setIsIndexing(true);
    setErrorMessage(null);

    let succeeded = false;
    try {
      const response = await fetch(`/api/documents/${documentId}/index`, {
        method: "POST",
      });

      if (response.ok) {
        succeeded = true;
        router.refresh();
        return;
      }

      if (response.status === 429) {
        setErrorMessage(RATE_LIMIT_USER_MESSAGE);
        return;
      }

      let message = "Unable to complete indexing. Please try again.";
      try {
        const body = (await response.json()) as { error?: unknown };
        if (
          typeof body.error === "string" &&
          SAFE_INDEX_ERRORS.has(body.error)
        ) {
          message = body.error;
        }
      } catch {
        // Keep the generic message when the body is not JSON.
      }
      setErrorMessage(message);
    } catch {
      setErrorMessage("Unable to complete indexing. Please try again.");
    } finally {
      if (!succeeded) setIsIndexing(false);
    }
  };

  if (busy) {
    return (
      <span
        className={BUTTON_DISABLED}
        aria-label={`Indexing ${accessibleName} for Q&A`}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Indexing...
      </span>
    );
  }

  const kind = currentStatus === "indexed" ? "secondary" : "primary";

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleIndex}
        disabled={busy}
        className={kind === "primary" ? BUTTON_PRIMARY : BUTTON_SECONDARY}
        title={label}
        aria-label={`${label} ${accessibleName}`}
        aria-busy={busy}
      >
        <ScanSearch className="h-4 w-4" />
        {label}
      </button>
      {errorMessage ? (
        <span
          role="alert"
          className="max-w-xs text-left text-xs leading-snug text-red-600 dark:text-red-400"
        >
          {errorMessage}
        </span>
      ) : null}
    </span>
  );
}
