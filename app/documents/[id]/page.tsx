import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { AnalyzeDocumentButton } from "@/components/documents/analyze-document-button";
import { DocumentActions } from "@/components/documents/document-actions";
import {
  DocumentAnalysisView,
  type DocumentAnalysisResultData,
} from "@/components/documents/document-analysis-view";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { isValidUuid, PDF_MIME_TYPE, STATUS_LABELS, formatMimeTypeLabel } from "@/lib/documents";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Document analysis",
};

const DOCUMENT_DETAIL_COLUMNS = `
  id,
  file_name,
  mime_type,
  document_type,
  status,
  created_at,
  updated_at,
  document_results (
    detected_document_type,
    summary,
    extracted_fields,
    confidence_score,
    model_name,
    prompt_version,
    created_at,
    updated_at
  )
`;

interface DocumentDetailRow {
  id: string;
  file_name: string;
  mime_type: string;
  document_type: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  document_results:
    | DocumentAnalysisResultData
    | DocumentAnalysisResultData[]
    | null;
}

function firstResult(
  value: DocumentDetailRow["document_results"],
): DocumentAnalysisResultData | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function pendingCopy(status: string, isPdf: boolean): { title: string; body: string } {
  switch (status) {
    case "queued":
    case "processing":
      return {
        title: "Analysis in progress",
        body: "This document is currently being analyzed. Refresh in a moment to see results.",
      };
    case "failed":
      return {
        title: "Analysis failed",
        body: isPdf
          ? "The previous analysis attempt did not complete. You can retry analysis for this PDF."
          : "The previous analysis attempt did not complete.",
      };
    case "needs_review":
      return {
        title: "Needs review",
        body: "This document is waiting for review. Analysis results are not ready to display yet.",
      };
    default:
      return {
        title: "Not analyzed yet",
        body: isPdf
          ? "This PDF has been uploaded but has not been analyzed. Analysis is user-triggered in this phase."
          : "This document has been uploaded. This phase currently analyzes PDF documents only.",
      };
  }
}

interface DocumentPageProps {
  params: Promise<{ id: string }>;
}

export default async function DocumentPage({ params }: DocumentPageProps) {
  const { id } = await params;

  if (!isValidUuid(id)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userEmail =
    typeof claimsData?.claims?.email === "string"
      ? claimsData.claims.email
      : null;

  const { data: document, error } = await supabase
    .from("documents")
    .select(DOCUMENT_DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(
      "[documents/detail] Document lookup failed:",
      error.code,
      error.message,
    );
    notFound();
  }

  if (!document) {
    notFound();
  }

  const row = document as DocumentDetailRow;
  const result = firstResult(row.document_results);
  const isPdf = row.mime_type === PDF_MIME_TYPE;
  const isProcessed = row.status === "processed";
  const pending = pendingCopy(row.status, isPdf);

  return (
    <DashboardLayout userEmail={userEmail}>
      <div className="mb-6">
        <Link
          href="/documents"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to documents
        </Link>
      </div>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
              <FileText className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                {row.file_name}
              </h2>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                <DocumentStatusBadge status={row.status} />
                <span>{formatMimeTypeLabel(row.mime_type)}</span>
                {row.document_type ? <span>· {row.document_type}</span> : null}
                <span>· Uploaded {formatDateTime(row.created_at)}</span>
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AnalyzeDocumentButton
            documentId={row.id}
            fileName={row.file_name}
            mimeType={row.mime_type}
            status={row.status}
            showViewLink={false}
          />
          <DocumentActions documentId={row.id} fileName={row.file_name} />
        </div>
      </div>

      {isProcessed && result ? (
        <DocumentAnalysisView result={result} />
      ) : isProcessed ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-5 py-12 text-center dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            Analysis result unavailable
          </p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            This document is marked processed, but no analysis result could be
            loaded.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white px-5 py-12 text-center dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            {pending.title}
          </p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {pending.body}
          </p>
          <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
            Status: {STATUS_LABELS[row.status as keyof typeof STATUS_LABELS] ?? row.status}
          </p>
        </div>
      )}
    </DashboardLayout>
  );
}
