"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Loader2, MessageSquareText } from "lucide-react";
import { IndexDocumentButton } from "./index-document-button";
import {
  isIndexableDocumentStatus,
  isSupportedAnalysisMimeType,
} from "@/lib/documents";
import {
  MAX_SEARCH_QUERY_LENGTH,
  MIN_SEARCH_QUERY_LENGTH,
} from "@/lib/rag/config";
import type { DocumentAnswerSource } from "@/lib/rag/types";

const MAX_HISTORY = 10;

const GENERIC_ASK_ERROR =
  "Unable to answer this question right now. Please try again.";

const SAFE_ASK_ERRORS = new Set([
  GENERIC_ASK_ERROR,
  "This document needs to be indexed before Q&A is available.",
  "The document index is out of date. Re-index the document before searching.",
  "Invalid or missing question",
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

function formatSimilarityPercent(similarity: number): string | null {
  if (!Number.isFinite(similarity)) return null;
  const percent = Math.round(similarity * 100);
  if (!Number.isFinite(percent)) return null;
  const clamped = Math.min(100, Math.max(0, percent));
  return `${clamped}%`;
}

function sourceLabel(sourceId: string, index: number): string {
  const match = /^S(\d+)$/.exec(sourceId.trim());
  if (match) return `Source ${match[1]}`;
  return `Source ${index + 1}`;
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

function SourceCard({
  source,
  index,
}: {
  source: DocumentAnswerSource;
  index: number;
}) {
  const similarity = formatSimilarityPercent(source.similarity);
  const excerpt = source.excerpt.trim();

  return (
    <li className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
        {sourceLabel(source.sourceId, index)}
      </p>
      <dl className="mt-1 space-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
        {source.pageNumber != null ? (
          <div>
            <dt className="sr-only">Page</dt>
            <dd>Page {source.pageNumber}</dd>
          </div>
        ) : null}
        {source.sectionTitle ? (
          <div>
            <dt className="sr-only">Section</dt>
            <dd className="break-words">{source.sectionTitle}</dd>
          </div>
        ) : null}
        {similarity ? (
          <div>
            <dt className="sr-only">Similarity</dt>
            <dd>Similarity: {similarity}</dd>
          </div>
        ) : null}
      </dl>
      {excerpt ? (
        <details className="mt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-900 [&::-webkit-details-marker]:hidden dark:text-zinc-400 dark:hover:text-zinc-100">
            <ChevronDown className="h-3.5 w-3.5" />
            Excerpt
          </summary>
          <p className="mt-2 text-xs leading-relaxed break-words text-zinc-600 dark:text-zinc-400">
            {excerpt}
          </p>
        </details>
      ) : null}
    </li>
  );
}

function QaTurnCard({ turn }: { turn: AskTurn }) {
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
              <SourceCard
                key={`${turn.id}-${source.sourceId}`}
                source={source}
                index={index}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

/**
 * Grounded Ask This Document. Browser sends only `{ question }`.
 * Session history is in-memory and is not persisted.
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

    try {
      const response = await fetch(`/api/documents/${documentId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: nextQuestion }),
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

      setHistory((previous) => [turn, ...previous].slice(0, MAX_HISTORY));
      setQuestion("");
    } catch {
      setErrorMessage(GENERIC_ASK_ERROR);
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <section
      aria-labelledby="ask-document-heading"
      className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h3
          id="ask-document-heading"
          className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
        >
          Ask This Document
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Answers use only retrieved passages from this document. Questions are
          not saved.
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
              placeholder="Ask a question about this document..."
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
                <QaTurnCard key={turn.id} turn={turn} />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
