"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { isSupportedAnalysisMimeType } from "@/lib/documents";
import { RATE_LIMIT_USER_MESSAGE } from "@/lib/security/rate-limit-messages";

const SAFE_PROCESS_ERRORS = new Set([
  "Unable to analyze this document. Please try again.",
  "Unable to complete analysis. Please try again.",
  "This file type is not supported for analysis.",
  "This document is already being analyzed.",
  "This document is already being processed.",
  "Analysis is temporarily unavailable. Please try again.",
  "Analysis service is unavailable.",
  "Document not found",
]);

const TABLE_BUTTON =
  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors";

const DETAIL_BUTTON =
  "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors";

interface AnalyzeDocumentButtonProps {
  documentId: string;
  status: string;
  /** Used only for accessible labels. Never a storage path. */
  fileName?: string;
  /** Used only to hide the control for unsupported file types. */
  mimeType?: string;
  /**
   * table: processed and needs_review documents link to the analysis page.
   * detail: processed and needs_review documents can be analyzed again.
   */
  placement?: "table" | "detail";
}

function buttonClasses(placement: "table" | "detail", kind: "primary" | "secondary" | "disabled") {
  const base = placement === "detail" ? DETAIL_BUTTON : TABLE_BUTTON;

  if (kind === "primary") {
    return `${base} bg-indigo-600 text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50`;
  }
  if (kind === "secondary") {
    return `${base} border border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800`;
  }
  return `${base} cursor-not-allowed border border-zinc-200 text-zinc-400 dark:border-zinc-800 dark:text-zinc-500`;
}

function hasViewableAnalysis(status: string): boolean {
  return status === "processed" || status === "needs_review";
}

function actionLabel(status: string, placement: "table" | "detail"): string | null {
  if (status === "queued" || status === "processing") return null;
  if (status === "failed") return "Retry analysis";
  if (status === "uploaded") return "Analyze";
  if (hasViewableAnalysis(status) && placement === "detail") return "Analyze Again";
  return null;
}

/**
 * User-triggered document analysis. The browser sends only the document UUID.
 */
export function AnalyzeDocumentButton({
  documentId,
  status,
  fileName,
  mimeType,
  placement = "table",
}: AnalyzeDocumentButtonProps) {
  const router = useRouter();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (mimeType && !isSupportedAnalysisMimeType(mimeType)) {
    return null;
  }

  const accessibleName = fileName?.trim() || "document";
  const iconClass = placement === "detail" ? "h-4 w-4" : "h-3.5 w-3.5";

  if (hasViewableAnalysis(status) && placement === "table") {
    return (
      <Link
        href={`/documents/${documentId}`}
        className={buttonClasses(placement, "secondary")}
        title="View analysis"
        aria-label={`View analysis for ${accessibleName}`}
      >
        View analysis
      </Link>
    );
  }

  if (status === "queued" || status === "processing") {
    return (
      <span
        className={buttonClasses(placement, "disabled")}
        aria-label={`Analysis in progress for ${accessibleName}`}
      >
        <Loader2 className={`${iconClass} animate-spin`} aria-hidden="true" />
        Analyzing...
      </span>
    );
  }

  const label = actionLabel(status, placement);
  if (!label) return null;

  const handleAnalyze = async () => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setErrorMessage(null);

    let succeeded = false;
    try {
      const response = await fetch(`/api/documents/${documentId}/process`, {
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

      let message = "Unable to analyze this document. Please try again.";
      try {
        const body = (await response.json()) as { error?: unknown };
        if (
          typeof body.error === "string" &&
          SAFE_PROCESS_ERRORS.has(body.error)
        ) {
          message = body.error;
        }
      } catch {
        // Keep the generic message when the body is not JSON.
      }
      setErrorMessage(message);
    } catch {
      setErrorMessage("Unable to analyze this document. Please try again.");
    } finally {
      if (!succeeded) setIsAnalyzing(false);
    }
  };

  return (
    <span
      className={`inline-flex flex-col gap-1 ${
        placement === "detail" ? "items-start" : "items-end"
      }`}
    >
      <button
        type="button"
        onClick={handleAnalyze}
        disabled={isAnalyzing}
        className={buttonClasses(placement, "primary")}
        title={label}
        aria-label={`${label} ${accessibleName}`}
        aria-busy={isAnalyzing}
      >
        {isAnalyzing ? (
          <Loader2 className={`${iconClass} animate-spin`} />
        ) : (
          <Sparkles className={iconClass} />
        )}
        {isAnalyzing ? "Analyzing..." : label}
      </button>
      {errorMessage ? (
        <span
          role="alert"
          className={`text-right leading-snug text-red-600 dark:text-red-400 ${
            placement === "detail" ? "max-w-xs text-left text-xs" : "max-w-[12rem] text-right text-[11px]"
          }`}
        >
          {errorMessage}
        </span>
      ) : null}
    </span>
  );
}
