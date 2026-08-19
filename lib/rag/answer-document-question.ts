import "server-only";

import { zodTextFormat } from "openai/helpers/zod";
import { getDocumentModel, getOpenAIClient } from "@/lib/openai/client";
import { classifyProcessingError } from "@/lib/openai/errors";
import {
  DOCUMENT_QA_INSTRUCTIONS,
  DOCUMENT_QA_PROMPT_VERSION,
  buildDocumentQaUserMessage,
} from "@/lib/openai/prompts/document-answer";
import { documentAnswerSchema } from "@/lib/openai/schemas/document-answer";
import {
  MAX_SEARCH_QUERY_LENGTH,
  MIN_SEARCH_QUERY_LENGTH,
  RAG_MATCH_COUNT,
} from "@/lib/rag/config";
import { contextualizeQuestion } from "@/lib/rag/contextualize-question";
import { searchDocument } from "@/lib/rag/search-document";
import type {
  ConversationTurn,
  DocumentAnswerResult,
  DocumentAnswerSource,
  DocumentSearchMatch,
} from "@/lib/rag/types";
import { validateModelCitations } from "@/lib/rag/validate-citations";

export { DOCUMENT_QA_PROMPT_VERSION };
export type { DocumentAnswerResult, DocumentAnswerSource };

export const UNSUPPORTED_ANSWER =
  "I couldn't find enough information in this document to answer that question.";

export const DOCUMENT_NOT_INDEXED_QA_MESSAGE =
  "This document needs to be indexed before Q&A is available.";

const EXCERPT_MAX_CHARS = 280;
const SOURCE_BLOCK_BEGIN = "----- BEGIN SOURCE";
const SOURCE_BLOCK_END = "----- END SOURCE";

export type AnswerDocumentQuestionOutcome =
  | { status: "ok"; result: DocumentAnswerResult }
  | { status: "not_found" }
  | { status: "invalid_query" }
  | { status: "not_indexed"; message: string }
  | { status: "stale_index"; message: string }
  | { status: "error"; category: "lookup" | "embedding" | "rpc" | "answer" };

interface AssignedSource {
  sourceId: string;
  match: DocumentSearchMatch;
}

function logAsk(
  level: "info" | "error",
  event: string,
  details: {
    documentId?: string;
    matchCount?: number;
    supported?: boolean;
    category?: string;
  } = {},
) {
  const parts = [event];
  if (details.documentId) parts.push(`document=${details.documentId}`);
  if (details.matchCount != null) parts.push(`matches=${details.matchCount}`);
  if (details.supported != null) {
    parts.push(details.supported ? "supported" : "unsupported");
  }
  if (details.category) parts.push(`category=${details.category}`);
  if (level === "error") {
    console.error("[documents/ask]", ...parts);
  } else {
    console.info("[documents/ask]", ...parts);
  }
}

function sourceIdForIndex(index: number): string {
  return `S${index + 1}`;
}

function excerptFromChunk(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= EXCERPT_MAX_CHARS) return normalized;
  const sliced = normalized.slice(0, EXCERPT_MAX_CHARS);
  const lastSpace = sliced.lastIndexOf(" ");
  const cut = lastSpace > EXCERPT_MAX_CHARS * 0.6 ? sliced.slice(0, lastSpace) : sliced;
  return `${cut}…`;
}

function formatSourceBlock(source: AssignedSource): string {
  const lines = [
    `${SOURCE_BLOCK_BEGIN} ${source.sourceId} -----`,
    `source_id: ${source.sourceId}`,
  ];
  if (source.match.pageNumber != null) {
    lines.push(`Page: ${source.match.pageNumber}`);
  }
  if (source.match.sectionTitle) {
    lines.push(`Section: ${source.match.sectionTitle}`);
  }
  lines.push("Content:");
  lines.push(source.match.content);
  lines.push(`${SOURCE_BLOCK_END} ${source.sourceId} -----`);
  return lines.join("\n");
}

function assignSources(matches: DocumentSearchMatch[]): AssignedSource[] {
  const limited = matches.slice(0, RAG_MATCH_COUNT);
  return limited.map((match, index) => ({
    sourceId: sourceIdForIndex(index),
    match,
  }));
}

function toPublicSource(
  source: AssignedSource,
  evidenceExcerpt?: string,
): DocumentAnswerSource {
  const excerpt = evidenceExcerpt?.trim()
    ? evidenceExcerpt.trim()
    : excerptFromChunk(source.match.content);
  return {
    sourceId: source.sourceId,
    chunkIndex: source.match.chunkIndex,
    pageNumber: source.match.pageNumber,
    sectionTitle: source.match.sectionTitle,
    similarity: source.match.similarity,
    excerpt,
  };
}

function unsupportedResult(question: string): DocumentAnswerResult {
  return {
    question,
    answer: UNSUPPORTED_ANSWER,
    supported: false,
    sources: [],
  };
}

/**
 * Grounded Q&A for one authenticated, indexed document.
 *
 * Optional conversation history is untrusted context used only to interpret
 * follow-ups. Retrieval still runs on every turn via Phase 7B searchDocument().
 * Questions, answers, history, and standalone retrieval queries are not persisted.
 */
export async function answerDocumentQuestion(params: {
  documentId: string;
  question: string;
  history?: ConversationTurn[];
}): Promise<AnswerDocumentQuestionOutcome> {
  const question = params.question.trim();
  const history = params.history ?? [];
  if (
    question.length < MIN_SEARCH_QUERY_LENGTH ||
    question.length > MAX_SEARCH_QUERY_LENGTH
  ) {
    return { status: "invalid_query" };
  }

  const retrievalQuery = await contextualizeQuestion({
    question,
    history,
  });

  const retrieval = await searchDocument({
    documentId: params.documentId,
    query: retrievalQuery,
  });

  switch (retrieval.status) {
    case "not_found":
      return { status: "not_found" };
    case "invalid_query":
      return { status: "invalid_query" };
    case "not_indexed":
      return {
        status: "not_indexed",
        message: DOCUMENT_NOT_INDEXED_QA_MESSAGE,
      };
    case "stale_index":
      return { status: "stale_index", message: retrieval.message };
    case "error":
      return { status: "error", category: retrieval.category };
    case "ok":
      break;
  }

  const matches = retrieval.result.matches;
  if (matches.length === 0) {
    logAsk("info", "Zero retrieval matches", {
      documentId: params.documentId,
      matchCount: 0,
      supported: false,
    });
    return {
      status: "ok",
      result: unsupportedResult(question),
    };
  }

  const assigned = assignSources(matches);
  const sourceContentById = new Map(
    assigned.map((source) => [source.sourceId, source.match.content]),
  );
  const sourceBlocks = assigned.map(formatSourceBlock).join("\n\n");
  const userMessage = buildDocumentQaUserMessage({
    question,
    history,
    sourceBlocks,
  });

  try {
    const openai = getOpenAIClient();
    const response = await openai.responses.parse({
      model: getDocumentModel(),
      store: false,
      reasoning: { effort: "low" },
      tools: [],
      instructions: DOCUMENT_QA_INSTRUCTIONS,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: userMessage,
            },
          ],
        },
      ],
      text: {
        format: zodTextFormat(documentAnswerSchema, "document_answer"),
      },
    });

    const parsed = response.output_parsed;
    if (!parsed) {
      logAsk("error", "Structured answer missing", {
        documentId: params.documentId,
        matchCount: assigned.length,
        category: "answer",
      });
      return { status: "error", category: "answer" };
    }

    const answer = parsed.answer.trim();
    if (!parsed.supported) {
      logAsk("info", "Answer generated", {
        documentId: params.documentId,
        matchCount: assigned.length,
        supported: false,
      });
      return {
        status: "ok",
        result: {
          question,
          answer: answer.length > 0 ? answer : UNSUPPORTED_ANSWER,
          supported: false,
          sources: [],
        },
      };
    }

    const validated = validateModelCitations(
      parsed.citations,
      sourceContentById,
    );
    if (validated.length === 0 || answer.length === 0) {
      logAsk("info", "Supported claim rejected", {
        documentId: params.documentId,
        matchCount: assigned.length,
        supported: false,
        category: "citations",
      });
      return {
        status: "ok",
        result: unsupportedResult(question),
      };
    }

    const excerptBySourceId = new Map(
      validated.map((citation) => [citation.sourceId, citation.evidenceExcerpt]),
    );
    const sources = assigned
      .filter((source) => excerptBySourceId.has(source.sourceId))
      .map((source) =>
        toPublicSource(source, excerptBySourceId.get(source.sourceId)),
      );

    logAsk("info", "Answer generated", {
      documentId: params.documentId,
      matchCount: assigned.length,
      supported: true,
    });

    return {
      status: "ok",
      result: {
        question,
        answer,
        supported: true,
        sources,
      },
    };
  } catch (error) {
    const classified = classifyProcessingError(error);
    logAsk("error", "Answer generation failed", {
      documentId: params.documentId,
      matchCount: assigned.length,
      category: classified.failureCode,
    });
    return { status: "error", category: "answer" };
  }
}
