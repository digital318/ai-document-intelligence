import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  EMBEDDING_INDEX_JOB_TYPE,
  isIndexableDocumentStatus,
  isSupportedAnalysisMimeType,
  isValidUuid,
} from "@/lib/documents";
import {
  EMBEDDING_VERSION,
  embedTexts,
  getEmbeddingModel,
  toVectorLiteral,
} from "@/lib/openai/embeddings";
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
  userMessageForIndexingFailureCode,
  type FailureCode,
} from "@/lib/openai/errors";
import { extractRetrievalText } from "@/lib/openai/retrieval-text";
import { chunkDocument } from "@/lib/rag/chunk-document";
import { logServerEvent, readErrorCode } from "@/lib/observability/log";
import {
  consumeAiRateLimit,
  rateLimitedResponse,
} from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

const GENERIC_ERROR = "Unable to complete indexing. Please try again.";
const NOT_FOUND_ERROR = "Document not found";
const UNSUPPORTED_TYPE_ERROR =
  "This file type is not supported for indexing.";
const NOT_READY_ERROR =
  "This document must be analyzed before it can be indexed.";
const CONFLICT_ERROR = "This document is already being indexed.";

const CHUNK_UPSERT_BATCH = 50;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function logIndexEvent(
  stage: string,
  details: {
    documentId?: string;
    jobId?: string;
    openaiRequestId?: string | null;
    failureCode?: FailureCode | string;
    chunkCount?: number;
    durationMs?: number;
    statusCode?: number;
  } = {},
) {
  logServerEvent("documents/index", "error", stage, {
    document: details.documentId,
    job: details.jobId,
    openai_request_id: details.openaiRequestId,
    failure_code: details.failureCode,
    chunks: details.chunkCount,
    duration_ms: details.durationMs,
    status: details.statusCode,
  });
}

function logIndexError(
  stage: string,
  error: unknown,
  details: {
    documentId?: string;
    jobId?: string;
    openaiRequestId?: string | null;
    failureCode?: FailureCode | string;
  } = {},
) {
  logIndexEvent(stage, details);
  const code = readErrorCode(error);
  if (code != null) {
    logServerEvent("documents/index", "error", stage, { code });
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function elapsedMs(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
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
    logIndexError("Failed to mark job as failed", error, {
      jobId,
      failureCode,
    });
  }
}

async function restoreEmbeddingStatus(
  supabase: ServerSupabase,
  documentId: string,
  hadValidPreviousIndex: boolean,
) {
  const restoreTo = hadValidPreviousIndex ? "indexed" : "failed";
  const { error } = await supabase
    .from("documents")
    .update({ embedding_status: restoreTo })
    .eq("id", documentId)
    .eq("embedding_status", "indexing");

  if (error) {
    logIndexError("Failed to restore embedding status", error);
  }
}

function revalidateDocumentPaths(documentId: string) {
  revalidatePath("/");
  revalidatePath("/documents");
  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/history");
}

function mergeTokenUsage(
  current: {
    input_tokens: number | null;
    output_tokens: number | null;
    total_tokens: number | null;
  },
  next: {
    input_tokens: number | null;
    output_tokens: number | null;
    total_tokens: number | null;
  },
) {
  const add = (a: number | null, b: number | null) => {
    if (a == null && b == null) return null;
    return (a ?? 0) + (b ?? 0);
  };
  return {
    input_tokens: add(current.input_tokens, next.input_tokens),
    output_tokens: add(current.output_tokens, next.output_tokens),
    total_tokens: add(current.total_tokens, next.total_tokens),
  };
}

/**
 * POST /api/documents/[id]/index
 *
 * User-triggered private vector indexing. The browser sends only the document
 * UUID. storage_path is loaded from the RLS-protected row. Analysis status
 * is never changed.
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
    .select(
      "id, file_name, storage_path, mime_type, status, embedding_status, indexed_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (lookupError) {
    logIndexError("Document lookup failed", lookupError, { documentId: id });
    return jsonError(NOT_FOUND_ERROR, 404);
  }

  if (!document) {
    return jsonError(NOT_FOUND_ERROR, 404);
  }

  if (!isSupportedAnalysisMimeType(document.mime_type)) {
    return jsonError(UNSUPPORTED_TYPE_ERROR, 400);
  }

  if (!isIndexableDocumentStatus(document.status)) {
    return jsonError(NOT_READY_ERROR, 400);
  }

  const hadValidPreviousIndex =
    document.embedding_status === "indexed" || Boolean(document.indexed_at);

  const rateLimit = await consumeAiRateLimit(supabase, "document_index");
  if (!rateLimit.ok) {
    logServerEvent("documents/index", "error", "Rate limit check failed", {
      document: document.id,
      status: 500,
    });
    return jsonError(GENERIC_ERROR, 500);
  }
  if (!rateLimit.allowed) {
    logServerEvent("documents/index", "info", "Rate limited", {
      document: document.id,
      status: 429,
    });
    return rateLimitedResponse(rateLimit.resetAt);
  }

  const { data: claimedJobId, error: claimError } = await supabase.rpc(
    "claim_document_embedding_index",
    { p_document_id: document.id },
  );

  if (claimError) {
    if (claimError.code === "23505") {
      return jsonError(CONFLICT_ERROR, 409);
    }
    logIndexError("Failed to claim document for indexing", claimError);
    return jsonError(GENERIC_ERROR, 500);
  }

  if (typeof claimedJobId !== "string" || claimedJobId.length === 0) {
    return jsonError(CONFLICT_ERROR, 409);
  }

  const jobId = claimedJobId;
  const indexingStartedAt = Date.now();

  let openaiFileId: string | null = null;
  let openaiRequestId: string | null = null;
  let embeddingModelName: string | null = null;
  let indexFinalized = false;
  let usageTokens: {
    input_tokens: number | null;
    output_tokens: number | null;
    total_tokens: number | null;
  } = { input_tokens: null, output_tokens: null, total_tokens: null };

  try {
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from("documents")
      .download(document.storage_path);

    if (downloadError || !fileBlob) {
      logIndexError("Storage download failed", downloadError, { jobId });
      throw new ProcessingFailure("storage_download", "Storage download failed");
    }

    let openai;
    try {
      openai = getOpenAIClient();
      embeddingModelName = getEmbeddingModel();
    } catch (error) {
      logIndexError("OpenAI client initialization failed", error, { jobId });
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

    let extraction;
    try {
      extraction = await extractRetrievalText({
        openai,
        preparedInput,
        requestId: jobId,
        modelName: getDocumentModel(),
      });
    } catch (error) {
      openaiRequestId = openaiRequestId ?? requestIdFromError(error);
      const classified = classifyProcessingError(error);
      const failureCode =
        classified.failureCode === "unknown"
          ? "structured_output"
          : classified.failureCode;
      logIndexError("Retrieval text extraction failed", error, {
        jobId,
        openaiRequestId,
        failureCode,
      });
      throw error instanceof ProcessingFailure
        ? error
        : new ProcessingFailure(failureCode, classified.diagnostic);
    }

    openaiRequestId = extraction.openaiRequestId ?? openaiRequestId;
    usageTokens = mergeTokenUsage(usageTokens, extraction.usage);

    const chunks = chunkDocument(extraction.segments);
    if (chunks.length === 0) {
      throw new ProcessingFailure(
        "empty_retrieval",
        "No retrieval chunks were produced",
      );
    }

    let embeddingResult;
    try {
      embeddingResult = await embedTexts({
        openai,
        texts: chunks.map((chunk) => chunk.content),
        requestId: jobId,
        modelName: embeddingModelName,
      });
    } catch (error) {
      openaiRequestId = openaiRequestId ?? requestIdFromError(error);
      const classified = classifyProcessingError(error);
      const failureCode =
        classified.failureCode === "unknown"
          ? "embedding_generation"
          : classified.failureCode;
      logIndexError("Embedding generation failed", error, {
        jobId,
        openaiRequestId,
        failureCode,
      });
      throw error instanceof ProcessingFailure
        ? error
        : new ProcessingFailure(failureCode, classified.diagnostic);
    }

    usageTokens = {
      input_tokens: addUsage(
        usageTokens.input_tokens,
        embeddingResult.usage.input_tokens,
      ),
      output_tokens: usageTokens.output_tokens,
      total_tokens: addUsage(
        usageTokens.total_tokens,
        embeddingResult.usage.total_tokens,
      ),
    };

    const rows = chunks.map((chunk, index) => ({
      document_id: document.id,
      chunk_index: chunk.chunk_index,
      content: chunk.content,
      page_number: chunk.page_number,
      section_title: chunk.section_title,
      embedding: toVectorLiteral(embeddingResult.embeddings[index]),
      embedding_model: embeddingResult.model,
      embedding_version: EMBEDDING_VERSION,
    }));

    for (let offset = 0; offset < rows.length; offset += CHUNK_UPSERT_BATCH) {
      const batch = rows.slice(offset, offset + CHUNK_UPSERT_BATCH);
      const { error: upsertError } = await supabase
        .from("document_chunks")
        .upsert(batch, {
          onConflict: "document_id,embedding_version,chunk_index",
        });

      if (upsertError) {
        logIndexError("Chunk persistence failed", upsertError, {
          jobId,
          failureCode: "chunk_persistence",
        });
        throw new ProcessingFailure(
          "chunk_persistence",
          "Chunk persistence failed",
        );
      }
    }

    const lastIndex = rows[rows.length - 1]?.chunk_index ?? -1;
    const { error: staleDeleteError } = await supabase
      .from("document_chunks")
      .delete()
      .eq("document_id", document.id)
      .eq("embedding_version", EMBEDDING_VERSION)
      .gt("chunk_index", lastIndex);

    if (staleDeleteError) {
      logIndexError("Failed to remove stale chunks", staleDeleteError, {
        jobId,
        failureCode: "chunk_persistence",
      });
      throw new ProcessingFailure(
        "chunk_persistence",
        "Failed to remove stale chunks",
      );
    }

    const { error: documentCompleteError } = await supabase
      .from("documents")
      .update({
        embedding_status: "indexed",
        embedding_model: embeddingResult.model,
        embedding_version: EMBEDDING_VERSION,
        indexed_at: nowIso(),
      })
      .eq("id", document.id);

    if (documentCompleteError) {
      logIndexError("Failed to mark document as indexed", documentCompleteError, {
        jobId,
        openaiRequestId,
      });
      throw new ProcessingFailure(
        "chunk_persistence",
        "Failed to complete indexing",
      );
    }

    indexFinalized = true;

    const { error: jobCompleteError } = await supabase
      .from("document_processing_jobs")
      .update({
        status: "completed",
        completed_at: nowIso(),
        error_message: null,
        failure_code: null,
        model_name: embeddingResult.model,
        openai_request_id: openaiRequestId,
        input_tokens: usageTokens.input_tokens,
        output_tokens: usageTokens.output_tokens,
        total_tokens: usageTokens.total_tokens,
        processing_duration_ms: elapsedMs(indexingStartedAt),
      })
      .eq("id", jobId)
      .eq("job_type", EMBEDDING_INDEX_JOB_TYPE);

    if (jobCompleteError) {
      logIndexError("Failed to mark job as completed", jobCompleteError, {
        jobId,
        openaiRequestId,
      });
      throw new ProcessingFailure(
        "chunk_persistence",
        "Failed to complete indexing",
      );
    }

    logServerEvent("documents/index", "info", "Indexing completed", {
      document: document.id,
      job: jobId,
      chunks: rows.length,
      openai_request_id: openaiRequestId,
      duration_ms: elapsedMs(indexingStartedAt),
      status: 200,
    });

    revalidateDocumentPaths(document.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    const classified = classifyRouteError(error);
    logIndexEvent("Indexing failed", {
      jobId,
      openaiRequestId,
      failureCode: classified.failureCode,
    });

    if (
      !(error instanceof ProcessingFailure) &&
      !(error instanceof DocumentInputError)
    ) {
      logIndexError("Indexing failed", error, {
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
      indexingStartedAt,
      {
        model_name: embeddingModelName,
        openai_request_id: openaiRequestId,
        input_tokens: usageTokens.input_tokens,
        output_tokens: usageTokens.output_tokens,
        total_tokens: usageTokens.total_tokens,
      },
    );

    if (!indexFinalized) {
      await restoreEmbeddingStatus(
        supabase,
        document.id,
        hadValidPreviousIndex,
      );
    }

    revalidateDocumentPaths(document.id);

    return jsonError(
      userMessageForIndexingFailureCode(classified.failureCode),
      500,
    );
  } finally {
    await cleanupTemporaryOpenAIFile(openaiFileId);
  }
}

function addUsage(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  return (a ?? 0) + (b ?? 0);
}
