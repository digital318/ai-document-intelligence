import { NextResponse } from "next/server";
import { z } from "zod";
import { isValidUuid } from "@/lib/documents";
import { logServerEvent } from "@/lib/observability/log";
import { searchDocument } from "@/lib/rag/search-document";
import {
  consumeAiRateLimit,
  rateLimitedResponse,
} from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

const GENERIC_ERROR = "Unable to complete search. Please try again.";
const NOT_FOUND_ERROR = "Document not found";
const INVALID_QUERY_ERROR = "Invalid or missing query";

const searchRequestSchema = z.object({
  query: z.string(),
});

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * POST /api/documents/[id]/search
 *
 * Authenticated semantic retrieval for one indexed document. The client
 * sends only `{ query }`. Match count, similarity threshold, embedding
 * model, and storage paths are server-controlled. No natural-language
 * answer is generated.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isValidUuid(id)) {
    return jsonError(NOT_FOUND_ERROR, 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(INVALID_QUERY_ERROR, 400);
  }

  const parsed = searchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(INVALID_QUERY_ERROR, 400);
  }

  const supabase = await createClient();
  const rateLimit = await consumeAiRateLimit(supabase, "semantic_search");
  if (!rateLimit.ok) {
    logServerEvent("documents/search", "error", "Rate limit check failed", {
      document: id,
      status: 500,
    });
    return jsonError(GENERIC_ERROR, 500);
  }
  if (!rateLimit.allowed) {
    logServerEvent("documents/search", "info", "Rate limited", {
      document: id,
      status: 429,
    });
    return rateLimitedResponse(rateLimit.resetAt);
  }

  const outcome = await searchDocument({
    documentId: id,
    query: parsed.data.query,
  });

  switch (outcome.status) {
    case "ok":
      return NextResponse.json({
        query: outcome.result.query,
        matches: outcome.result.matches.map((match) => ({
          chunkId: match.chunkId,
          chunkIndex: match.chunkIndex,
          content: match.content,
          pageNumber: match.pageNumber,
          sectionTitle: match.sectionTitle,
          similarity: match.similarity,
        })),
      });
    case "not_found":
      return jsonError(NOT_FOUND_ERROR, 404);
    case "invalid_query":
      return jsonError(INVALID_QUERY_ERROR, 400);
    case "not_indexed":
    case "stale_index":
      return jsonError(outcome.message, 409);
    case "error":
      return jsonError(GENERIC_ERROR, 500);
  }
}
