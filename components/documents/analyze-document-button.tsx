"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { PDF_MIME_TYPE } from "@/lib/documents";

const ACTION_BUTTON =
  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors";

const PRIMARY_BUTTON = `${ACTION_BUTTON} bg-indigo-600 text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50`;

const SECONDARY_BUTTON = `${ACTION_BUTTON} border border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800`;

const DISABLED_BUTTON = `${ACTION_BUTTON} cursor-not-allowed border border-zinc-200 text-zinc-400 dark:border-zinc-800 dark:text-zinc-500`;

interface AnalyzeDocumentButtonProps {
  documentId: string;
  fileName: string;
  mimeType: string;
  status: string;
  /** When false, a processed document does not render the "View analysis" link. */
  showViewLink?: boolean;
}

/**
 * Phase 6A PDF analysis trigger. The browser sends only the document UUID.
 */
export function AnalyzeDocumentButton({
  documentId,
  fileName,
  mimeType,
  status,
  showViewLink = true,
}: AnalyzeDocumentButtonProps) {
  const router = useRouter();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (mimeType !== PDF_MIME_TYPE) {
    return null;
  }

  if (status === "processed") {
    if (!showViewLink) return null;
    return (
      <Link
        href={`/documents/${documentId}`}
        className={SECONDARY_BUTTON}
        title="View analysis"
        aria-label={`View analysis for ${fileName}`}
      >
        View analysis
      </Link>
    );
  }

  if (status === "queued" || status === "processing") {
    return (
      <span
        className={DISABLED_BUTTON}
        aria-label={`Analysis in progress for ${fileName}`}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Processing…
      </span>
    );
  }

  if (status !== "uploaded" && status !== "failed") {
    return null;
  }

  const label = status === "failed" ? "Retry analysis" : "Analyze";

  const handleAnalyze = async () => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/documents/${documentId}/process`, {
        method: "POST",
      });

      if (response.ok) {
        router.refresh();
        return;
      }

      let message = "Unable to analyze this document. Please try again.";
      try {
        const body = (await response.json()) as { error?: unknown };
        if (typeof body.error === "string" && body.error.trim().length > 0) {
          message = body.error;
        }
      } catch {
        // Keep the generic message when the body is not JSON.
      }
      setErrorMessage(message);
    } catch {
      setErrorMessage("Unable to analyze this document. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleAnalyze}
        disabled={isAnalyzing}
        className={PRIMARY_BUTTON}
        title={label}
        aria-label={`${label} ${fileName}`}
        aria-busy={isAnalyzing}
      >
        {isAnalyzing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        {isAnalyzing ? "Analyzing..." : label}
      </button>
      {errorMessage ? (
        <span className="max-w-[12rem] text-right text-[11px] leading-snug text-red-600 dark:text-red-400">
          {errorMessage}
        </span>
      ) : null}
    </span>
  );
}
