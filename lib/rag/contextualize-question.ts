import "server-only";

import { zodTextFormat } from "openai/helpers/zod";
import { getDocumentModel, getOpenAIClient } from "@/lib/openai/client";
import {
  RETRIEVAL_QUERY_INSTRUCTIONS,
  RETRIEVAL_QUERY_PROMPT_VERSION,
  buildRetrievalQueryUserMessage,
} from "@/lib/openai/prompts/retrieval-query";
import { retrievalQuerySchema } from "@/lib/openai/schemas/retrieval-query";
import {
  MAX_SEARCH_QUERY_LENGTH,
  MIN_SEARCH_QUERY_LENGTH,
} from "@/lib/rag/config";
import type { ConversationTurn } from "@/lib/rag/types";

export { RETRIEVAL_QUERY_PROMPT_VERSION };

function clampStandaloneQuery(query: string, fallback: string): string {
  const trimmed = query.trim();
  if (
    trimmed.length < MIN_SEARCH_QUERY_LENGTH ||
    trimmed.length > MAX_SEARCH_QUERY_LENGTH * 4
  ) {
    return fallback;
  }
  if (trimmed.length <= MAX_SEARCH_QUERY_LENGTH) return trimmed;

  const sliced = trimmed.slice(0, MAX_SEARCH_QUERY_LENGTH);
  const lastSpace = sliced.lastIndexOf(" ");
  const cut =
    lastSpace > MAX_SEARCH_QUERY_LENGTH * 0.6
      ? sliced.slice(0, lastSpace)
      : sliced;
  const result = cut.trim();
  return result.length >= MIN_SEARCH_QUERY_LENGTH ? result : fallback;
}

/**
 * Converts an ambiguous follow-up into a standalone semantic-search query.
 *
 * Conversation history is untrusted context only. Document content is not
 * retrieved or sent. Failures fall back to the original question.
 */
export async function contextualizeQuestion(params: {
  question: string;
  history: ConversationTurn[];
}): Promise<string> {
  const question = params.question.trim();
  if (params.history.length === 0) return question;

  try {
    const openai = getOpenAIClient();
    const response = await openai.responses.parse({
      model: getDocumentModel(),
      store: false,
      reasoning: { effort: "low" },
      tools: [],
      instructions: RETRIEVAL_QUERY_INSTRUCTIONS,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildRetrievalQueryUserMessage({
                question,
                history: params.history,
              }),
            },
          ],
        },
      ],
      text: {
        format: zodTextFormat(retrievalQuerySchema, "retrieval_query"),
      },
    });

    const parsed = response.output_parsed;
    if (!parsed) {
      console.error("[documents/ask]", "Contextualization missing output");
      return question;
    }

    return clampStandaloneQuery(parsed.standalone_query, question);
  } catch {
    console.error("[documents/ask]", "Contextualization failed");
    return question;
  }
}
