"use client";

import { useMemo, useState } from "react";
import { Loader2, MessageSquareText } from "lucide-react";
import { DocumentAnswerSourceCard } from "./document-answer-source";
import { IndexDocumentButton } from "./index-document-button";
import {
  isIndexableDocumentStatus,
  isSupportedAnalysisMimeType,
} from "@/lib/documents";
import {
  MAX_CONVERSATION_HISTORY_TURNS,
  MAX_HISTORY_ANSWER_LENGTH,
  MAX_HISTORY_COMBINED_CHARS,
  MAX_HISTORY_QUESTION_LENGTH,
  MAX_SEARCH_QUERY_LENGTH,
  MAX_VISIBLE_CONVERSATION_TURNS,
  MIN_SEARCH_QUERY_LENGTH,
} from "@/lib/rag/config";
import type { DocumentAnswerSource } from "@/lib/rag/types";

const GENERIC_ASK_ERROR =
  "Unable to answer this question right now. Please try again.";

const SAFE_ASK_ERRORS = new Set([
  GENERIC_ASK_ERROR,
  "This document needs to be indexed before Q&A is available.",
  "The document index is out of date. Re-index the document before searching.",
  "Invalid or missing question",
  "Invalid conversation history",
  "Document not found",
]);

interface AskTurn {
  id: string;
  question: string;
  answer: string;
  supported: boolean;
  sources: DocumentAnswerSource[];
}

interface AskDocumentProps {
  documentId: string;
  fileName: string;
  mimeType: string;
  status: string;
  embeddingStatus: string | null | undefined;
}

function historyForRequest(
  turns: AskTurn[],
): Array<{ question: string; answer: string }> {
  const selected = turns.slice(-MAX_CONVERSATION_HISTORY_TURNS);
  const payload: Array<{ question: string; answer: string }> = [];
  let combined = 0;

  for (let index = selected.length - 1; index >= 0; index -= 1) {
    const question = selected[index].question
      .trim()
      .slice(0, MAX_HISTORY_QUESTION_LENGTH);
    const answer = selected[index].answer
      .trim()
      .slice(0, MAX_HISTORY_ANSWER_LENGTH);
    if (question.length === 0 || answer.length === 0) continue;
    if (combined + question.length + answer.length > MAX_HISTORY_COMBINED_CHARS) {
      break;
    }
    payload.unshift({ question, answer });
    combined += question.length + answer.length;
  }

  return payload;
}

function parseSources(value: unknown): DocumentAnswerSource[] {
  if (!Array.isArray(value)) return [];
  const sources: DocumentAnswerSource[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.sourceId !== "string" || record.sourceId.trim() === "") {
      continue;
    }
    if (typeof record.chunkIndex !== "number" || !Number.isInteger(record.chunkIndex)) {
      continue;
    }
    if (typeof record.similarity !== "number" || !Number.isFinite(record.similarity)) {
      continue;
    }
    if (typeof record.excerpt !== "string") continue;

    const pageNumber =
      record.pageNumber == null
        ? null
        : typeof record.pageNumber === "number" && Number.isInteger(record.pageNumber)
          ? record.pageNumber
          : null;
    const sectionTitle =
      typeof record.sectionTitle === "string" && record.sectionTitle.trim().length > 0
        ? record.sectionTitle.trim()
        : null;

    sources.push({
      sourceId: record.sourceId.trim(),
      chunkIndex: record.chunkIndex,
      pageNumber,
      sectionTitle,
      similarity: record.similarity,
      excerpt: record.excerpt,
    });
  }
  return sources;
}

function QaTurnCard({
  turn,
  documentId,
  fileName,
}: {
  turn: AskTurn;
  documentId: string;
  fileName: string;
}) {
  return (
    <article className="space-y-4 border-t border-zinc-200 px-5 py-5 first:border-t-0 dark:border-zinc-800">
      <div>
        <h4 className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          Question
        </h4>
        <p className="mt-1 text-sm break-words text-zinc-900 dark:text-zinc-50">
          {turn.question}
        </p>
      </div>
      <div>
        <h4 className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          Answer
        </h4>
        <p className="mt-1 text-sm leading-relaxed break-words whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
          {turn.answer}
        </p>
      </div>
      {turn.supported && turn.sources.length > 0 ? (
        <div>
          <h4 className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            Sources
          </h4>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {turn.sources.map((source, index) => (
              <DocumentAnswerSourceCard
                key={`${turn.id}-${source.sourceId}`}
                source={source}
                index={index}
                documentId={documentId}
                fileName={fileName}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

/**
 * Grounded Ask This Document. Browser sends `{ question }` and optional
 * recent `{ history }`. Session history is in-memory and is not persisted.
 */
export function AskDocument({
  documentId,
  fileName,
  mimeType,
  status,
  embeddingStatus,
}: AskDocumentProps) {
  const [question, setQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<AskTurn[]>([]);

  const canAsk =
    isIndexableDocumentStatus(status) && embeddingStatus === "indexed";
  const supportedType = isSupportedAnalysisMimeType(mimeType);
  const trimmedLength = question.trim().length;
  const overLimit = question.length > MAX_SEARCH_QUERY_LENGTH;
  const tooShort = trimmedLength < MIN_SEARCH_QUERY_LENGTH;
  const canSubmit = canAsk && !isAsking && !tooShort && !overLimit;

  const remainingLabel = useMemo(() => {
    return `${question.length}/${MAX_SEARCH_QUERY_LENGTH}`;
  }, [question.length]);

  const handleAsk = async () => {
    if (!canSubmit) return;
    const nextQuestion = question.trim();
    setIsAsking(true);
    setErrorMessage(null);

    const priorHistory = historyForRequest(history);

    try {
      const response = await fetch(`/api/documents/${documentId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: nextQuestion,
          ...(priorHistory.length > 0 ? { history: priorHistory } : {}),
        }),
      });

      if (!response.ok) {
        let message = GENERIC_ASK_ERROR;
        try {
          const body = (await response.json()) as { error?: unknown };
          if (
            typeof body.error === "string" &&
            SAFE_ASK_ERRORS.has(body.error)
          ) {
            message = body.error;
          }
        } catch {
          // Keep the generic message when the body is not JSON.
        }
        setErrorMessage(message);
        return;
      }

      const body = (await response.json()) as {
        question?: unknown;
        answer?: unknown;
        supported?: unknown;
        sources?: unknown;
      };

      if (typeof body.answer !== "string" || typeof body.supported !== "boolean") {
        setErrorMessage(GENERIC_ASK_ERROR);
        return;
      }

      const turn: AskTurn = {
        id:
          typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}`,
        question:
          typeof body.question === "string" && body.question.trim().length > 0
            ? body.question
            : nextQuestion,
        answer: body.answer,
        supported: body.supported,
        sources: body.supported ? parseSources(body.sources) : [],
      };

      setHistory((previous) =>
        [...previous, turn].slice(-MAX_VISIBLE_CONVERSATION_TURNS),
      );
      setQuestion("");
    } catch {
      setErrorMessage(GENERIC_ASK_ERROR);
    } finally {
      setIsAsking(false);
    }
  };

  const handleClearConversation = () => {
    if (isAsking) return;
    setHistory([]);
    setErrorMessage(null);
  };

  return (
    <section
      aria-labelledby="ask-document-heading"
      className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3
              id="ask-document-heading"
              className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Ask This Document
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Answers are based only on this document. Follow-up questions use
              recent conversation on this page. Questions are not saved.
            </p>
          </div>
          {canAsk && history.length > 0 ? (
            <button
              type="button"
              onClick={handleClearConversation}
              disabled={isAsking}
              className="shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Clear conversation
            </button>
          ) : null}
        </div>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          Answers are generated from this document and may contain errors. Verify
          important information against the original.
        </p>
      </div>

      {!canAsk ? (
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-5">
          <p className="max-w-xl text-sm text-zinc-600 dark:text-zinc-300">
            Index this document for Q&A to ask questions about its contents.
          </p>
          {supportedType ? (
            <IndexDocumentButton
              documentId={documentId}
              fileName={fileName}
              mimeType={mimeType}
              status={status}
              embeddingStatus={embeddingStatus}
            />
          ) : null}
        </div>
      ) : (
        <div>
          <form
            className="space-y-3 px-5 py-5"
            onSubmit={(event) => {
              event.preventDefault();
              void handleAsk();
            }}
          >
            <label htmlFor="ask-document-question" className="sr-only">
              Question about this document
            </label>
            <textarea
              id="ask-document-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={MAX_SEARCH_QUERY_LENGTH}
              rows={3}
              disabled={isAsking}
              placeholder={
                history.length > 0
                  ? "Ask a follow-up about this document..."
                  : "Ask a question about this document..."
              }
              className="w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-500"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p
                className={`text-xs ${
                  overLimit
                    ? "text-red-600 dark:text-red-400"
                    : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                {remainingLabel}
              </p>
              <button
                type="submit"
                disabled={!canSubmit}
                aria-busy={isAsking}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isAsking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageSquareText className="h-4 w-4" />
                )}
                {isAsking ? "Thinking..." : "Ask"}
              </button>
            </div>
            {errorMessage ? (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {errorMessage}
              </p>
            ) : null}
          </form>

          {history.length > 0 ? (
            <div aria-live="polite">
              {history.map((turn) => (
                <QaTurnCard
                  key={turn.id}
                  turn={turn}
                  documentId={documentId}
                  fileName={fileName}
                />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
