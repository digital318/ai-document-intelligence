import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, ArrowLeft, FileText, Loader2 } from "lucide-react";
import { AnalyzeDocumentButton } from "@/components/documents/analyze-document-button";
import { DocumentActions } from "@/components/documents/document-actions";
import {
  DocumentAnalysisView,
  type DocumentAnalysisResultData,
} from "@/components/documents/document-analysis-view";
import { DocumentDetails } from "@/components/documents/document-details";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import {
  ProcessingHistory,
  type ProcessingHistoryJob,
} from "@/components/documents/processing-history";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import {
  isValidUuid,
  PDF_MIME_TYPE,
  formatMimeTypeLabel,
} from "@/lib/documents";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Document analysis",
};

const DOCUMENT_DETAIL_COLUMNS = `
  id,
  file_name,
  mime_type,
  file_size_bytes,
  document_type,
  status,
  page_count,
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

const JOB_COLUMNS =
  "id, job_type, status, created_at, started_at, completed_at, error_message";

interface DocumentDetailRow {
  id: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  document_type: string | null;
  status: string;
  page_count: number | null;
  created_at: string;
  updated_at: string;
  document_results:
    | DocumentAnalysisResultData
    | DocumentAnalysisResultData[]
    | null;
}

interface ProcessingJobRow {
  id: string;
  job_type: string;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

function firstResult(
  value: DocumentDetailRow["document_results"],
): DocumentAnalysisResultData | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toHistoryJobs(rows: ProcessingJobRow[]): ProcessingHistoryJob[] {
  const chronological = [...rows].sort((a, b) => {
    const aTime = Date.parse(a.created_at);
    const bTime = Date.parse(b.created_at);
    const aValid = Number.isFinite(aTime) ? aTime : 0;
    const bValid = Number.isFinite(bTime) ? bTime : 0;
    if (aValid !== bValid) return aValid - bValid;
    return a.id.localeCompare(b.id);
  });

  const attemptById = new Map(
    chronological.map((job, index) => [job.id, index + 1]),
  );

  return rows.map((job) => ({
    id: job.id,
    jobType: job.job_type,
    status: job.status,
    createdAt: job.created_at,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    attemptNumber: attemptById.get(job.id) ?? 1,
    failed: job.status === "failed",
    hasSafeFailureMessage:
      job.status === "failed" &&
      typeof job.error_message === "string" &&
      job.error_message.trim().length > 0,
  }));
}

function ProcessingState({
  status,
  isPdf,
  documentId,
  fileName,
  mimeType,
}: {
  status: string;
  isPdf: boolean;
  documentId: string;
  fileName: string;
  mimeType: string;
}) {
  if (status === "queued" || status === "processing") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-12 text-center dark:border-amber-500/30 dark:bg-amber-500/10">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-600 dark:text-amber-400" />
        <p className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Analysis in progress
        </p>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          The document is being analyzed. Results will appear when processing
          completes.
        </p>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Refresh this page to check for completed results.
        </p>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-12 text-center dark:border-red-500/30 dark:bg-red-500/10">
        <AlertCircle className="mx-auto h-8 w-8 text-red-600 dark:text-red-400" />
        <p className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Analysis failed
        </p>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          The previous analysis attempt did not complete.
        </p>
        {isPdf ? (
          <div className="mt-5 flex justify-center">
            <AnalyzeDocumentButton
              documentId={documentId}
              fileName={fileName}
              mimeType={mimeType}
              status={status}
              placement="detail"
            />
          </div>
        ) : null}
      </div>
    );
  }

  if (status === "needs_review") {
    return (
      <div className="rounded-xl border border-orange-200 bg-orange-50 px-5 py-12 text-center dark:border-orange-500/30 dark:bg-orange-500/10">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Needs review
        </p>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          This document is waiting for review. Analysis results are not ready
          to display yet.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-5 py-12 text-center dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
        Not analyzed yet
      </p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        {isPdf
          ? "This PDF has been uploaded but has not been analyzed."
          : "This document has been uploaded. This phase currently analyzes PDF documents only."}
      </p>
      {isPdf ? (
        <div className="mt-5 flex justify-center">
          <AnalyzeDocumentButton
            documentId={documentId}
            fileName={fileName}
            mimeType={mimeType}
            status={status}
            placement="detail"
          />
        </div>
      ) : null}
    </div>
  );
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
  const detectedType =
    result?.detected_document_type?.trim() ||
    row.document_type?.trim() ||
    null;

  const { data: jobRows, error: jobsError } = await supabase
    .from("document_processing_jobs")
    .select(JOB_COLUMNS)
    .eq("document_id", row.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .returns<ProcessingJobRow[]>();

  if (jobsError) {
    console.error(
      "[documents/detail] Processing history lookup failed:",
      jobsError.code,
      jobsError.message,
    );
  }

  const historyJobs = jobsError ? [] : toHistoryJobs(jobRows ?? []);

  return (
    <DashboardLayout userEmail={userEmail}>
      <div className="mb-6">
        <Link
          href="/documents"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Documents
        </Link>
      </div>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
              <FileText className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2
                className="text-2xl font-semibold tracking-tight break-words text-zinc-900 dark:text-zinc-50"
                title={row.file_name}
              >
                {row.file_name}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
                <span>{formatMimeTypeLabel(row.mime_type)}</span>
                <span aria-hidden="true">·</span>
                <DocumentStatusBadge status={row.status} />
                {detectedType ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="break-words">{detectedType}</span>
                  </>
                ) : null}
                <span aria-hidden="true">·</span>
                <span>Uploaded {formatDateTime(row.created_at)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <DocumentActions
          documentId={row.id}
          fileName={row.file_name}
          variant="labeled"
        >
          <AnalyzeDocumentButton
            documentId={row.id}
            fileName={row.file_name}
            mimeType={row.mime_type}
            status={row.status}
            placement="detail"
          />
        </DocumentActions>
      </div>

      <div className="space-y-6">
        {isProcessed && result ? (
          <DocumentAnalysisView result={result} />
        ) : isProcessed ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-5 py-12 text-center dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Analysis result unavailable
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              This document is marked processed, but no analysis result could
              be loaded.
            </p>
          </div>
        ) : (
          <ProcessingState
            status={row.status}
            isPdf={isPdf}
            documentId={row.id}
            fileName={row.file_name}
            mimeType={row.mime_type}
          />
        )}

        <DocumentDetails
          fileName={row.file_name}
          mimeType={row.mime_type}
          fileSizeBytes={row.file_size_bytes}
          createdAt={row.created_at}
          status={row.status}
          detectedDocumentType={detectedType}
          pageCount={row.page_count}
        />

        <ProcessingHistory jobs={historyJobs} loadError={Boolean(jobsError)} />
      </div>
    </DashboardLayout>
  );
}
