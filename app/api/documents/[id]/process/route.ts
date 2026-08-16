import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { zodTextFormat } from "openai/helpers/zod";
import { isSupportedAnalysisMimeType, isValidUuid } from "@/lib/documents";
import { getDocumentModel, getOpenAIClient } from "@/lib/openai/client";
import {
  cleanupTemporaryOpenAIFile,
  DocumentInputError,
  prepareOpenAIDocumentInput,
} from "@/lib/openai/document-input";
import {
  DOCUMENT_ANALYSIS_INSTRUCTIONS,
  DOCUMENT_ANALYSIS_PROMPT_VERSION,
  DOCUMENT_ANALYSIS_USER_MESSAGE,
} from "@/lib/openai/prompts/document-analysis";
import {
  documentAnalysisSchema,
  type DocumentAnalysis,
} from "@/lib/openai/schemas/document-analysis";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

const GENERIC_ERROR = "Unable to analyze this document. Please try again.";
const NOT_FOUND_ERROR = "Document not found";
const UNSUPPORTED_TYPE_ERROR =
  "This file type is not supported for analysis.";
const CONFLICT_ERROR = "This document is already being analyzed.";

const CLAIMABLE_STATUSES = [
  "uploaded",
  "failed",
  "processed",
  "needs_review",
] as const;

class ProcessingFailure extends Error {
  constructor(diagnostic: string) {
    super(diagnostic);
    this.name = "ProcessingFailure";
  }
}

class ConcurrentProcessingFailure extends Error {
  constructor() {
    super("Document is already being processed");
    this.name = "ConcurrentProcessingFailure";
  }
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function logProcessError(stage: string, error: unknown) {
  if (error && typeof error === "object") {
    const record = error as { code?: unknown; status?: unknown; message?: unknown };
    const code = record.code ?? record.status;
    const message =
      typeof record.message === "string"
        ? record.message.slice(0, 200)
        : "unexpected error";
    console.error("[documents/process]", stage, code, message);
    return;
  }

  console.error("[documents/process]", stage, "unexpected error");
}

function roundConfidence(value: number): number {
  return Math.min(1, Math.max(0, Math.round(value * 10000) / 10000));
}

function nowIso(): string {
  return new Date().toISOString();
}

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

async function markJobFailed(
  supabase: ServerSupabase,
  jobId: string,
  diagnostic: string,
) {
  const { error } = await supabase
    .from("document_processing_jobs")
    .update({
      status: "failed",
      completed_at: nowIso(),
      error_message: diagnostic,
    })
    .eq("id", jobId);

  if (error) {
    logProcessError("Failed to mark job as failed", error);
  }
}

async function markDocumentFailed(
  supabase: ServerSupabase,
  documentId: string,
) {
  const { error } = await supabase
    .from("documents")
    .update({ status: "failed" })
    .eq("id", documentId)
    .eq("status", "processing");

  if (error) {
    logProcessError("Failed to mark document as failed", error);
  }
}

function diagnosticFromError(error: unknown): string {
  if (
    error instanceof ProcessingFailure ||
    error instanceof ConcurrentProcessingFailure ||
    error instanceof DocumentInputError
  ) {
    return error.message;
  }
  return "Unexpected processing failure";
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

  const { data: job, error: jobInsertError } = await supabase
    .from("document_processing_jobs")
    .insert({
      document_id: document.id,
      job_type: "initial_analysis",
      status: "queued",
    })
    .select("id")
    .single();

  if (jobInsertError || !job) {
    logProcessError("Failed to create processing job", jobInsertError);
    return jsonError(GENERIC_ERROR, 500);
  }

  let openaiFileId: string | null = null;
  let claimedDocument = false;

  try {
    const { data: claimed, error: claimError } = await supabase
      .from("documents")
      .update({ status: "processing" })
      .eq("id", document.id)
      .in("status", [...CLAIMABLE_STATUSES])
      .select("id")
      .maybeSingle();

    if (claimError) {
      logProcessError("Failed to claim document for processing", claimError);
      throw new ProcessingFailure("Failed to start processing");
    }

    if (!claimed) {
      throw new ConcurrentProcessingFailure();
    }

    claimedDocument = true;

    const { error: jobStartError } = await supabase
      .from("document_processing_jobs")
      .update({
        status: "running",
        started_at: nowIso(),
      })
      .eq("id", job.id);

    if (jobStartError) {
      logProcessError("Failed to mark job as running", jobStartError);
      throw new ProcessingFailure("Failed to start processing");
    }

    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from("documents")
      .download(document.storage_path);

    if (downloadError || !fileBlob) {
      logProcessError("Storage download failed", downloadError);
      throw new ProcessingFailure("Storage download failed");
    }

    let openai;
    let modelName;
    try {
      openai = getOpenAIClient();
      modelName = getDocumentModel();
    } catch (error) {
      logProcessError("OpenAI client initialization failed", error);
      throw new ProcessingFailure("OpenAI client initialization failed");
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
      const response = await openai.responses.parse({
        model: modelName,
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
      });
      parsed = response.output_parsed;
    } catch (error) {
      logProcessError("OpenAI response failed", error);
      throw new ProcessingFailure("OpenAI response failed");
    }

    if (!parsed) {
      throw new ProcessingFailure("Structured result missing");
    }

    const extractedFields = parsed.extracted_fields.map((field) => ({
      field_name: field.field_name,
      value: field.value,
      confidence: roundConfidence(field.confidence),
    }));

    const detectedType = parsed.detected_document_type.trim().slice(0, 120);
    const summary = parsed.summary.trim();
    const confidenceScore = roundConfidence(parsed.confidence_score);

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
      logProcessError("Result persistence failed", resultError);
      throw new ProcessingFailure("Result persistence failed");
    }

    const { error: documentCompleteError } = await supabase
      .from("documents")
      .update({
        status: "processed",
        document_type: detectedType,
      })
      .eq("id", document.id);

    if (documentCompleteError) {
      logProcessError("Failed to mark document as processed", documentCompleteError);
      throw new ProcessingFailure("Failed to complete processing");
    }

    const { error: jobCompleteError } = await supabase
      .from("document_processing_jobs")
      .update({
        status: "completed",
        completed_at: nowIso(),
        error_message: null,
      })
      .eq("id", job.id);

    if (jobCompleteError) {
      logProcessError("Failed to mark job as completed", jobCompleteError);
      throw new ProcessingFailure("Failed to complete processing");
    }

    revalidatePath("/");
    revalidatePath("/documents");
    revalidatePath(`/documents/${document.id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    const diagnostic = diagnosticFromError(error);

    if (
      !(error instanceof ProcessingFailure) &&
      !(error instanceof ConcurrentProcessingFailure) &&
      !(error instanceof DocumentInputError)
    ) {
      logProcessError("Processing failed", error);
    }

    await markJobFailed(supabase, job.id, diagnostic);

    if (claimedDocument && !(error instanceof ConcurrentProcessingFailure)) {
      await markDocumentFailed(supabase, document.id);
    }

    revalidatePath("/");
    revalidatePath("/documents");
    revalidatePath(`/documents/${document.id}`);

    if (error instanceof ConcurrentProcessingFailure) {
      return jsonError(CONFLICT_ERROR, 409);
    }

    return jsonError(GENERIC_ERROR, 500);
  } finally {
    await cleanupTemporaryOpenAIFile(openaiFileId);
  }
}
