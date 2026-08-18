import "server-only";

import {
  isIndexableDocumentStatus,
  isValidUuid,
} from "@/lib/documents";
import {
  EMBEDDING_VERSION,
  embedQuery,
  getEmbeddingModel,
  toVectorLiteral,
} from "@/lib/openai/embeddings";
import { classifyProcessingError } from "@/lib/openai/errors";
import {
  RAG_MATCH_COUNT,
  RAG_SIMILARITY_THRESHOLD,
  MAX_SEARCH_QUERY_LENGTH,
  MIN_SEARCH_QUERY_LENGTH,
} from "@/lib/rag/config";
import type {
  DocumentSearchMatch,
  DocumentSearchResult,
} from "@/lib/rag/types";
import { createClient } from "@/lib/supabase/server";

export type { DocumentSearchMatch, DocumentSearchResult };

export const DOCUMENT_NOT_INDEXED_MESSAGE =
  "This document must be indexed before it can be searched.";

export const STALE_INDEX_MESSAGE =
  "The document index is out of date. Re-index the document before searching.";

export type SearchDocumentOutcome =
  | { status: "ok"; result: DocumentSearchResult }
  | { status: "not_found" }
  | { status: "invalid_query" }
  | { status: "not_indexed"; message: string }
  | { status: "stale_index"; message: string }
  | { status: "error"; category: "lookup" | "embedding" | "rpc" };

interface MatchRpcRow {
  chunk_id: unknown;
  document_id: unknown;
  chunk_index: unknown;
  content: unknown;
  page_number: unknown;
  section_title: unknown;
  similarity: unknown;
}

function logSearch(
  level: "info" | "error",
  event: string,
  details: {
    documentId?: string;
    matchCount?: number;
    category?: string;
  } = {},
) {
  const parts = [event];
  if (details.documentId) parts.push(`document=${details.documentId}`);
  if (details.matchCount != null) parts.push(`matches=${details.matchCount}`);
  if (details.category) parts.push(`category=${details.category}`);
  if (level === "error") {
    console.error("[documents/search]", ...parts);
  } else {
    console.info("[documents/search]", ...parts);
  }
}

function readUuid(value: unknown): string | null {
  if (typeof value !== "string" || !isValidUuid(value)) return null;
  return value;
}

function readInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return null;
}

function readNullableInt(value: unknown): number | null {
  if (value == null) return null;
  return readInt(value);
}

function readNullableString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readSimilarity(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeMatch(row: MatchRpcRow): DocumentSearchMatch | null {
  const chunkId = readUuid(row.chunk_id);
  const chunkIndex = readInt(row.chunk_index);
  const similarity = readSimilarity(row.similarity);
  if (!chunkId || chunkIndex == null || chunkIndex < 0 || similarity == null) {
    return null;
  }
  if (typeof row.content !== "string") {
    return null;
  }

  return {
    chunkId,
    chunkIndex,
    content: row.content,
    pageNumber: readNullableInt(row.page_number),
    sectionTitle: readNullableString(row.section_title),
    similarity,
  };
}

function isMatchRpcRow(value: unknown): value is MatchRpcRow {
  return Boolean(value) && typeof value === "object";
}

/**
 * Authenticated, document-scoped semantic retrieval.
 *
 * Generates a query embedding with the configured indexing model, then ranks
 * that document's chunks by cosine similarity. Does not persist the query,
 * write processing jobs, or generate a natural-language answer.
 */
export async function searchDocument(params: {
  documentId: string;
  query: string;
}): Promise<SearchDocumentOutcome> {
  if (!isValidUuid(params.documentId)) {
    return { status: "not_found" };
  }

  const query = params.query.trim();
  if (
    query.length < MIN_SEARCH_QUERY_LENGTH ||
    query.length > MAX_SEARCH_QUERY_LENGTH
  ) {
    return { status: "invalid_query" };
  }

  const documentId = params.documentId;
  const supabase = await createClient();

  const { data: document, error: lookupError } = await supabase
    .from("documents")
    .select(
      "id, file_name, status, embedding_status, embedding_model, embedding_version",
    )
    .eq("id", documentId)
    .maybeSingle();

  if (lookupError) {
    logSearch("error", "Document lookup failed", {
      documentId,
      category: "lookup",
    });
    return { status: "error", category: "lookup" };
  }

  if (!document) {
    return { status: "not_found" };
  }

  if (document.embedding_status !== "indexed") {
    return {
      status: "not_indexed",
      message: DOCUMENT_NOT_INDEXED_MESSAGE,
    };
  }

  if (!isIndexableDocumentStatus(document.status)) {
    return {
      status: "not_indexed",
      message: DOCUMENT_NOT_INDEXED_MESSAGE,
    };
  }

  const configuredModel = getEmbeddingModel();
  if (
    document.embedding_model !== configuredModel ||
    document.embedding_version !== EMBEDDING_VERSION
  ) {
    return {
      status: "stale_index",
      message: STALE_INDEX_MESSAGE,
    };
  }

  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedQuery(query);
  } catch (error) {
    const classified = classifyProcessingError(error);
    logSearch("error", "Query embedding failed", {
      documentId,
      category: classified.failureCode,
    });
    return { status: "error", category: "embedding" };
  }

  const { data: rows, error: rpcError } = await supabase.rpc(
    "match_document_chunks",
    {
      p_document_id: documentId,
      p_query_embedding: toVectorLiteral(queryEmbedding),
      p_match_threshold: RAG_SIMILARITY_THRESHOLD,
      p_match_count: RAG_MATCH_COUNT,
    },
  );

  if (rpcError) {
    logSearch("error", "Chunk match failed", {
      documentId,
      category: "rpc",
    });
    return { status: "error", category: "rpc" };
  }

  const matches: DocumentSearchMatch[] = [];
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!isMatchRpcRow(row)) continue;
      const match = normalizeMatch(row);
      if (match) matches.push(match);
    }
  }

  matches.sort((a, b) => b.similarity - a.similarity);

  logSearch("info", "Retrieval completed", {
    documentId,
    matchCount: matches.length,
  });

  return {
    status: "ok",
    result: {
      documentId,
      query,
      matches,
    },
  };
}
