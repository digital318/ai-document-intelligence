import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { zodTextFormat } from "openai/helpers/zod";
import { isSupportedAnalysisMimeType, isValidUuid } from "@/lib/documents";
import { toNonNegativeInt } from "@/lib/format";
import { getDocumentModel, getOpenAIClient } from "@/lib/openai/client";
import {
  cleanupTemporaryOpenAIFile,
  DocumentInputError,
  prepareOpenAIDocumentInput,
} from "@/lib/openai/document-input";
import {
  classifyProcessingError,
  ProcessingFailure,
  requestIdFromError,
  userMessageForFailureCode,
  type FailureCode,
} from "@/lib/openai/errors";
import {
  DOCUMENT_ANALYSIS_INSTRUCTIONS,
  DOCUMENT_ANALYSIS_PROMPT_VERSION,
  DOCUMENT_ANALYSIS_USER_MESSAGE,
} from "@/lib/openai/prompts/document-analysis";
import {
  documentStatusFromConfidence,
  type AnalysisCompletionStatus,
} from "@/lib/openai/quality";
import {
  documentAnalysisSchema,
  type DocumentAnalysis,
} from "@/lib/openai/schemas/document-analysis";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

const GENERIC_ERROR = "Unable to complete analysis. Please try again.";
const NOT_FOUND_ERROR = "Document not found";
const UNSUPPORTED_TYPE_ERROR =
  "This file type is not supported for analysis.";
const CONFLICT_ERROR = "This document is already being processed.";

const STABLE_RESULT_STATUSES = ["processed", "needs_review"] as const;
const IN_FLIGHT_STATUSES = ["queued", "processing"] as const;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function logProcessEvent(
  stage: string,
  details: {
    jobId?: string;
    openaiRequestId?: string | null;
    failureCode?: FailureCode | string;
  } = {},
) {
  const parts = [stage];
  if (details.jobId) parts.push(`job=${details.jobId}`);
  if (details.openaiRequestId) {
    parts.push(`openai_request_id=${details.openaiRequestId}`);
  }
  if (details.failureCode) parts.push(`failure_code=${details.failureCode}`);
  console.error("[documents/process]", ...parts);
}

function logProcessError(
  stage: string,
  error: unknown,
  details: {
    jobId?: string;
    openaiRequestId?: string | null;
    failureCode?: FailureCode | string;
  } = {},
) {
  logProcessEvent(stage, details);
  if (error && typeof error === "object") {
    const record = error as { code?: unknown; status?: unknown };
    const code = record.code ?? record.status;
    if (code != null) {
      console.error("[documents/process]", stage, "code", code);
    }
  }
}

function roundConfidence(value: number): number {
  return Math.min(1, Math.max(0, Math.round(value * 10000) / 10000));
}

function nowIso(): string {
  return new Date().toISOString();
}

function elapsedMs(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

function readRequestId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const requestId = (value as { _request_id?: unknown })._request_id;
  if (typeof requestId === "string" && requestId.trim().length > 0) {
    return requestId.trim();
  }
  return null;
}

function readUsageTokens(usage: unknown): {
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
} {
  if (!usage || typeof usage !== "object") {
    return { input_tokens: null, output_tokens: null, total_tokens: null };
  }
  const record = usage as Record<string, unknown>;
  return {
    input_tokens: toNonNegativeInt(record.input_tokens),
    output_tokens: toNonNegativeInt(record.output_tokens),
    total_tokens: toNonNegativeInt(record.total_tokens),
  };
}

function classifyRouteError(error: unknown): {
  failureCode: FailureCode;
  diagnostic: string;
} {
  if (error instanceof DocumentInputError) {
    return {
      failureCode: "openai_file_upload",
      diagnostic: error.message,
    };
  }
  return classifyProcessingError(error);
}

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

interface JobTelemetry {
  model_name?: string | null;
  openai_request_id?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
}

async function markJobFailed(
  supabase: ServerSupabase,
  jobId: string,
  diagnostic: string,
  failureCode: FailureCode,
  startedAt: number,
  extra: JobTelemetry = {},
) {
  const { error } = await supabase
    .from("document_processing_jobs")
    .update({
      status: "failed",
      completed_at: nowIso(),
      error_message: diagnostic,
      failure_code: failureCode,
      processing_duration_ms: elapsedMs(startedAt),
      model_name: extra.model_name ?? null,
      openai_request_id: extra.openai_request_id ?? null,
      input_tokens: extra.input_tokens ?? null,
      output_tokens: extra.output_tokens ?? null,
      total_tokens: extra.total_tokens ?? null,
    })
    .eq("id", jobId);

  if (error) {
    logProcessError("Failed to mark job as failed", error, {
      jobId,
      failureCode,
    });
  }
}

async function restoreOrFailDocument(
  supabase: ServerSupabase,
  documentId: string,
  previousStatus: string,
  hadValidPreviousResult: boolean,
) {
  const restoreTo =
    hadValidPreviousResult &&
    (previousStatus === "processed" || previousStatus === "needs_review")
      ? previousStatus
      : "failed";

  const { error } = await supabase
    .from("documents")
    .update({ status: restoreTo })
    .eq("id", documentId)
    .in("status", [...IN_FLIGHT_STATUSES]);

  if (error) {
    logProcessError("Failed to restore document status", error);
  }
}

function revalidateDocumentPaths(documentId: string) {
  revalidatePath("/");
  revalidatePath("/documents");
  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/history");
}

/**
 * POST /api/documents/[id]/process
 *
 * User-triggered multi-format analysis. The browser sends only the document
 * UUID. storage_path and mime_type are loaded from the RLS-protected row.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isValidUuid(id)) {
    return jsonError(NOT_FOUND_ERROR, 404);
  }

  const supabase = await createClient();

  const { data: document, error: lookupError } = await supabase
    .from("documents")
    .select("id, file_name, storage_path, mime_type, status")
    .eq("id", id)
    .maybeSingle();

  if (lookupError) {
    logProcessError("Document lookup failed", lookupError);
    return jsonError(NOT_FOUND_ERROR, 404);
  }

  if (!document) {
    return jsonError(NOT_FOUND_ERROR, 404);
  }

  if (!isSupportedAnalysisMimeType(document.mime_type)) {
    return jsonError(UNSUPPORTED_TYPE_ERROR, 400);
  }

  if (document.status === "queued" || document.status === "processing") {
    return jsonError(CONFLICT_ERROR, 409);
  }

  const previousStatus = document.status;
  let hadValidPreviousResult = false;

  const { data: existingResult, error: existingResultError } = await supabase
    .from("document_results")
    .select("document_id")
    .eq("document_id", document.id)
    .maybeSingle();

  if (existingResultError) {
    logProcessError("Previous result lookup failed", existingResultError);
    hadValidPreviousResult = (
      STABLE_RESULT_STATUSES as readonly string[]
    ).includes(previousStatus);
  } else {
    hadValidPreviousResult = Boolean(existingResult);
  }

  const { data: claimedJobId, error: claimError } = await supabase.rpc(
    "claim_document_processing",
    { p_document_id: document.id },
  );

  if (claimError) {
    logProcessError("Failed to claim document for processing", claimError);
    return jsonError(GENERIC_ERROR, 500);
  }

  if (typeof claimedJobId !== "string" || claimedJobId.length === 0) {
    return jsonError(CONFLICT_ERROR, 409);
  }

  const jobId = claimedJobId;
  const processingStartedAt = Date.now();

  let openaiFileId: string | null = null;
  let openaiRequestId: string | null = null;
  let modelName: string | null = null;
  let resultPersisted = false;
  let documentStatusFinalized = false;
  let completionStatus: AnalysisCompletionStatus | null = null;
  let detectedType: string | null = null;
  let usageTokens: {
    input_tokens: number | null;
    output_tokens: number | null;
    total_tokens: number | null;
  } = { input_tokens: null, output_tokens: null, total_tokens: null };

  try {
    const { data: processingRow, error: processingStatusError } = await supabase
      .from("documents")
      .update({ status: "processing" })
      .eq("id", document.id)
      .eq("status", "queued")
      .select("id")
      .maybeSingle();

    if (processingStatusError) {
      logProcessError("Failed to mark document as processing", processingStatusError, {
        jobId,
      });
      throw new ProcessingFailure("unknown", "Failed to start processing");
    }

    if (!processingRow) {
      throw new ProcessingFailure("unknown", "Failed to start processing");
    }

    const { error: jobStartError } = await supabase
      .from("document_processing_jobs")
      .update({
        status: "running",
        started_at: nowIso(),
      })
      .eq("id", jobId);

    if (jobStartError) {
      logProcessError("Failed to mark job as running", jobStartError, { jobId });
      throw new ProcessingFailure("unknown", "Failed to start processing");
    }

    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from("documents")
      .download(document.storage_path);

    if (downloadError || !fileBlob) {
      logProcessError("Storage download failed", downloadError, { jobId });
      throw new ProcessingFailure("storage_download", "Storage download failed");
    }

    let openai;
    try {
      openai = getOpenAIClient();
      modelName = getDocumentModel();
    } catch (error) {
      logProcessError("OpenAI client initialization failed", error, { jobId });
      throw new ProcessingFailure(
        "openai_auth",
        "OpenAI client initialization failed",
      );
    }

    const fileBytes = await fileBlob.arrayBuffer();
    const preparedInput = await prepareOpenAIDocumentInput({
      openai,
      bytes: fileBytes,
      fileName: document.file_name,
      mimeType: document.mime_type,
    });
    openaiFileId = preparedInput.openaiFileId;

    let parsed: DocumentAnalysis | null = null;
    try {
      const response = await openai.responses.parse(
        {
          model: modelName,
          store: false,
          instructions: DOCUMENT_ANALYSIS_INSTRUCTIONS,
          input: [
            {
              role: "user",
              content: [
                preparedInput.contentPart,
                {
                  type: "input_text",
                  text: DOCUMENT_ANALYSIS_USER_MESSAGE,
                },
              ],
            },
          ],
          text: {
            format: zodTextFormat(documentAnalysisSchema, "document_analysis"),
          },
        },
        {
          headers: {
            "X-Client-Request-Id": jobId,
          },
        },
      );
      openaiRequestId = readRequestId(response);
      usageTokens = readUsageTokens(response.usage);
      parsed = response.output_parsed;
    } catch (error) {
      openaiRequestId = openaiRequestId ?? requestIdFromError(error);
      const classified = classifyProcessingError(error);
      const failureCode =
        classified.failureCode === "unknown"
          ? "structured_output"
          : classified.failureCode;
      logProcessError("OpenAI response failed", error, {
        jobId,
        openaiRequestId,
        failureCode,
      });
      throw new ProcessingFailure(failureCode, classified.diagnostic);
    }

    if (!parsed) {
      throw new ProcessingFailure(
        "structured_output",
        "Structured result missing",
      );
    }

    const extractedFields = parsed.extracted_fields.map((field) => ({
      field_name: field.field_name,
      value: field.value,
      confidence: roundConfidence(field.confidence),
    }));

    detectedType = parsed.detected_document_type.trim().slice(0, 120);
    const summary = parsed.summary.trim();
    const confidenceScore = roundConfidence(parsed.confidence_score);
    completionStatus = documentStatusFromConfidence(confidenceScore);

    const { error: resultError } = await supabase.from("document_results").upsert(
      {
        document_id: document.id,
        detected_document_type: detectedType,
        summary,
        extracted_fields: extractedFields,
        confidence_score: confidenceScore,
        model_name: modelName,
        prompt_version: DOCUMENT_ANALYSIS_PROMPT_VERSION,
      },
      { onConflict: "document_id" },
    );

    if (resultError) {
      logProcessError("Result persistence failed", resultError, {
        jobId,
        openaiRequestId,
        failureCode: "result_persistence",
      });
      throw new ProcessingFailure(
        "result_persistence",
        "Result persistence failed",
      );
    }

    resultPersisted = true;

    const { error: documentCompleteError } = await supabase
      .from("documents")
      .update({
        status: completionStatus,
        document_type: detectedType,
      })
      .eq("id", document.id);

    if (documentCompleteError) {
      logProcessError(
        "Failed to mark document as processed",
        documentCompleteError,
        { jobId, openaiRequestId },
      );
      throw new ProcessingFailure(
        "result_persistence",
        "Failed to complete processing",
      );
    }

    documentStatusFinalized = true;

    const { error: jobCompleteError } = await supabase
      .from("document_processing_jobs")
      .update({
        status: "completed",
        completed_at: nowIso(),
        error_message: null,
        failure_code: null,
        model_name: modelName,
        openai_request_id: openaiRequestId,
        input_tokens: usageTokens.input_tokens,
        output_tokens: usageTokens.output_tokens,
        total_tokens: usageTokens.total_tokens,
        processing_duration_ms: elapsedMs(processingStartedAt),
      })
      .eq("id", jobId);

    if (jobCompleteError) {
      logProcessError("Failed to mark job as completed", jobCompleteError, {
        jobId,
        openaiRequestId,
      });
      throw new ProcessingFailure(
        "result_persistence",
        "Failed to complete processing",
      );
    }

    console.info(
      "[documents/process]",
      "Analysis completed",
      `job=${jobId}`,
      openaiRequestId ? `openai_request_id=${openaiRequestId}` : "",
    );

    revalidateDocumentPaths(document.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    const classified = classifyRouteError(error);
    logProcessEvent("Processing failed", {
      jobId,
      openaiRequestId,
      failureCode: classified.failureCode,
    });

    if (
      !(error instanceof ProcessingFailure) &&
      !(error instanceof DocumentInputError)
    ) {
      logProcessError("Processing failed", error, {
        jobId,
        openaiRequestId,
        failureCode: classified.failureCode,
      });
    }

    await markJobFailed(
      supabase,
      jobId,
      classified.diagnostic,
      classified.failureCode,
      processingStartedAt,
      {
        model_name: modelName,
        openai_request_id: openaiRequestId,
        input_tokens: usageTokens.input_tokens,
        output_tokens: usageTokens.output_tokens,
        total_tokens: usageTokens.total_tokens,
      },
    );

    if (!documentStatusFinalized) {
      if (resultPersisted && completionStatus) {
        const { error: fallbackError } = await supabase
          .from("documents")
          .update({
            status: completionStatus,
            ...(detectedType ? { document_type: detectedType } : {}),
          })
          .eq("id", document.id)
          .in("status", [...IN_FLIGHT_STATUSES]);

        if (fallbackError) {
          logProcessError(
            "Failed to finalize document after result persist",
            fallbackError,
            { jobId, failureCode: classified.failureCode },
          );
        }
      } else {
        await restoreOrFailDocument(
          supabase,
          document.id,
          previousStatus,
          hadValidPreviousResult,
        );
      }
    }

    revalidateDocumentPaths(document.id);

    return jsonError(userMessageForFailureCode(classified.failureCode), 500);
  } finally {
    await cleanupTemporaryOpenAIFile(openaiFileId);
  }
}
