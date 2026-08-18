import { formatDateTime } from "@/lib/format";
import { IndexDocumentButton } from "./index-document-button";
import { QaIndexStatusBadge } from "./qa-index-status-badge";

interface DocumentQaIndexProps {
  documentId: string;
  fileName: string;
  mimeType: string;
  status: string;
  embeddingStatus: string | null | undefined;
  embeddingModel: string | null | undefined;
  indexedAt: string | null | undefined;
}

/**
 * Concise Q&A index panel. Does not display vectors, retrieval text,
 * storage paths, or OpenAI request ids.
 */
export function DocumentQaIndex({
  documentId,
  fileName,
  mimeType,
  status,
  embeddingStatus,
  embeddingModel,
  indexedAt,
}: DocumentQaIndexProps) {
  const isIndexed = embeddingStatus === "indexed";
  const modelName = embeddingModel?.trim() || null;
  const indexedLabel = indexedAt ? formatDateTime(indexedAt) : null;

  return (
    <section
      aria-labelledby="qa-index-heading"
      className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h3
          id="qa-index-heading"
          className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
        >
          Q&A Index
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Vector index for later question answering. Distinct from AI analysis.
          Natural-language Q&A is not available yet.
        </p>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-5">
        <div className="min-w-0 space-y-3">
          <div>
            <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Q&A index status
            </p>
            <div className="mt-2">
              <QaIndexStatusBadge status={embeddingStatus} />
            </div>
          </div>

          {isIndexed ? (
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {modelName ? (
                <div className="min-w-0">
                  <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                    Embedding model
                  </dt>
                  <dd className="mt-1 text-sm break-words text-zinc-700 dark:text-zinc-300">
                    {modelName}
                  </dd>
                </div>
              ) : null}
              {indexedLabel ? (
                <div className="min-w-0">
                  <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                    Indexed
                  </dt>
                  <dd className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                    {indexedLabel}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </div>

        <IndexDocumentButton
          documentId={documentId}
          fileName={fileName}
          mimeType={mimeType}
          status={status}
          embeddingStatus={embeddingStatus}
        />
      </div>
    </section>
  );
}
