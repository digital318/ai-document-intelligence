import { ExternalLink } from "lucide-react";
import type { DocumentAnswerSource } from "@/lib/rag/types";

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

interface DocumentAnswerSourceCardProps {
  source: DocumentAnswerSource;
  index: number;
  documentId: string;
  fileName: string;
}

/**
 * Supporting source for a grounded answer. Shows question-aware evidence
 * when available. View Original uses the authenticated document view route.
 */
export function DocumentAnswerSourceCard({
  source,
  index,
  documentId,
  fileName,
}: DocumentAnswerSourceCardProps) {
  const similarity = formatSimilarityPercent(source.similarity);
  const excerpt = source.excerpt.trim();

  return (
    <li className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
        {sourceLabel(source.sourceId, index)}
      </p>
      <dl className="mt-1 space-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
        {source.sectionTitle ? (
          <div>
            <dt className="sr-only">Section</dt>
            <dd className="break-words">{source.sectionTitle}</dd>
          </div>
        ) : null}
        {source.pageNumber != null ? (
          <div>
            <dt className="sr-only">Page</dt>
            <dd>Page {source.pageNumber}</dd>
          </div>
        ) : null}
        {similarity ? (
          <div>
            <dt className="sr-only">Similarity</dt>
            <dd>{similarity} similar</dd>
          </div>
        ) : null}
      </dl>
      {excerpt ? (
        <blockquote className="mt-2 border-l-2 border-zinc-300 pl-2 text-xs leading-relaxed break-words text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          {excerpt}
        </blockquote>
      ) : null}
      <a
        href={`/api/documents/${documentId}/view`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
        aria-label={`View original ${fileName}`}
      >
        <ExternalLink className="h-3 w-3" />
        View Original
      </a>
    </li>
  );
}
