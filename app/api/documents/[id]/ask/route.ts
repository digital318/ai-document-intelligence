import { NextResponse } from "next/server";
import { z } from "zod";
import { isValidUuid } from "@/lib/documents";
import { answerDocumentQuestion } from "@/lib/rag/answer-document-question";

export const maxDuration = 120;

const GENERIC_ERROR =
  "Unable to answer this question right now. Please try again.";
const NOT_FOUND_ERROR = "Document not found";
const INVALID_QUESTION_ERROR = "Invalid or missing question";

const askRequestSchema = z.object({
  question: z.string(),
});

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * POST /api/documents/[id]/ask
 *
 * Authenticated grounded Q&A for one indexed document. The client sends
 * only `{ question }`. Retrieval, source IDs, model, and thresholds are
 * server-controlled. Questions are not persisted.
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

  const parsed = askRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(INVALID_QUESTION_ERROR, 400);
  }

  const outcome = await answerDocumentQuestion({
    documentId: id,
    question: parsed.data.question,
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
