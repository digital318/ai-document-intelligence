import { NextResponse } from "next/server";
import { isValidUuid } from "@/lib/documents";
import { logServerEvent } from "@/lib/observability/log";
import { parseAskRequest } from "@/lib/rag/conversation-history";
import { answerDocumentQuestion } from "@/lib/rag/answer-document-question";
import {
  consumeAiRateLimit,
  rateLimitedResponse,
} from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

const GENERIC_ERROR =
  "Unable to answer this question right now. Please try again.";
const NOT_FOUND_ERROR = "Document not found";
const INVALID_QUESTION_ERROR = "Invalid or missing question";
const INVALID_HISTORY_ERROR = "Invalid conversation history";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * POST /api/documents/[id]/ask
 *
 * Authenticated grounded Q&A for one indexed document. The client sends
 * `{ question }` and optional `{ history }` (prior question/answer turns).
 * Retrieval, source IDs, model, and thresholds are server-controlled.
 * Questions, answers, and history are not persisted.
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
    return jsonError(INVALID_QUESTION_ERROR, 400);
  }

  const parsed = parseAskRequest(body);
  if (!parsed.ok) {
    return jsonError(
      parsed.reason === "history" ? INVALID_HISTORY_ERROR : INVALID_QUESTION_ERROR,
      400,
    );
  }

  const supabase = await createClient();
  const rateLimit = await consumeAiRateLimit(supabase, "document_qa");
  if (!rateLimit.ok) {
    logServerEvent("documents/ask", "error", "Rate limit check failed", {
      document: id,
      status: 500,
    });
    return jsonError(GENERIC_ERROR, 500);
  }
  if (!rateLimit.allowed) {
    logServerEvent("documents/ask", "info", "Rate limited", {
      document: id,
      status: 429,
    });
    return rateLimitedResponse(rateLimit.resetAt);
  }

  const outcome = await answerDocumentQuestion({
    documentId: id,
    question: parsed.question,
    history: parsed.history,
  });

  switch (outcome.status) {
    case "ok":
      return NextResponse.json({
        question: outcome.result.question,
        supported: outcome.result.supported,
        answer: outcome.result.answer,
        sources: outcome.result.sources,
      });
    case "not_found":
      return jsonError(NOT_FOUND_ERROR, 404);
    case "invalid_query":
      return jsonError(INVALID_QUESTION_ERROR, 400);
    case "not_indexed":
    case "stale_index":
      return jsonError(outcome.message, 409);
    case "error":
      return jsonError(GENERIC_ERROR, 500);
  }
}
