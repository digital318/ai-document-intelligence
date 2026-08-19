import "server-only";

import {
  MAX_CONVERSATION_HISTORY_TURNS,
  MAX_HISTORY_ANSWER_LENGTH,
  MAX_HISTORY_COMBINED_CHARS,
  MAX_HISTORY_QUESTION_LENGTH,
} from "@/lib/rag/config";
import type { ConversationTurn } from "@/lib/rag/types";

const ASK_REQUEST_KEYS = new Set(["question", "history"]);
const HISTORY_TURN_KEYS = new Set(["question", "answer"]);

export type ParseAskRequestResult =
  | { ok: true; question: string; history: ConversationTurn[] }
  | { ok: false; reason: "question" | "history" };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyAllowedKeys(
  record: Record<string, unknown>,
  allowed: Set<string>,
): boolean {
  return Object.keys(record).every((key) => allowed.has(key));
}

function parseHistoryTurn(value: unknown): ConversationTurn | null {
  if (!isPlainObject(value)) return null;
  if (!hasOnlyAllowedKeys(value, HISTORY_TURN_KEYS)) return null;
  if (typeof value.question !== "string" || typeof value.answer !== "string") {
    return null;
  }

  const question = value.question.trim();
  const answer = value.answer.trim();
  if (question.length === 0 || answer.length === 0) return null;
  if (question.length > MAX_HISTORY_QUESTION_LENGTH) return null;
  if (answer.length > MAX_HISTORY_ANSWER_LENGTH) return null;

  return { question, answer };
}

/**
 * Validates the Ask This Document request body.
 *
 * History is optional, limited, and treated as untrusted user input.
 * Extra keys (document ids, source ids, embeddings, chunks, model names)
 * are rejected rather than ignored.
 */
export function parseAskRequest(body: unknown): ParseAskRequestResult {
  if (!isPlainObject(body)) return { ok: false, reason: "question" };
  if (!hasOnlyAllowedKeys(body, ASK_REQUEST_KEYS)) {
    return { ok: false, reason: "question" };
  }
  if (typeof body.question !== "string") {
    return { ok: false, reason: "question" };
  }

  const question = body.question.trim();
  if (!("history" in body) || body.history === undefined) {
    return { ok: true, question, history: [] };
  }

  if (!Array.isArray(body.history)) {
    return { ok: false, reason: "history" };
  }
  if (body.history.length > MAX_CONVERSATION_HISTORY_TURNS) {
    return { ok: false, reason: "history" };
  }

  const history: ConversationTurn[] = [];
  let combinedChars = 0;
  for (const item of body.history) {
    const turn = parseHistoryTurn(item);
    if (!turn) return { ok: false, reason: "history" };
    combinedChars += turn.question.length + turn.answer.length;
    if (combinedChars > MAX_HISTORY_COMBINED_CHARS) {
      return { ok: false, reason: "history" };
    }
    history.push(turn);
  }

  return { ok: true, question, history };
}
