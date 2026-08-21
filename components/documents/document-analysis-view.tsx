import { ConfidenceBadge } from "./confidence-badge";
import { ExtractedFields } from "./extracted-fields";
import { formatDateTime } from "@/lib/format";

export interface DocumentAnalysisResultData {
  detected_document_type: string | null;
  summary: string | null;
  extracted_fields: unknown;
  confidence_score: number | string | null;
  model_name: string | null;
  prompt_version: string | null;
  created_at: string;
  updated_at: string;
}

function DetailMeta({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value || value.trim() === "") return null;
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm break-words text-zinc-700 dark:text-zinc-300">
        {value}
      </dd>
    </div>
  );
}

export function DocumentAnalysisView({
  result,
  needsReview = false,
}: {
  result: DocumentAnalysisResultData;
  needsReview?: boolean;
}) {
  const processedAt = result.updated_at || result.created_at;
  const summary = result.summary?.trim() || null;
  const detectedType = result.detected_document_type?.trim() || null;

  return (
    <div className="space-y-6">
      {needsReview ? (
        <div
          role="status"
          className="rounded-xl border border-orange-200 bg-orange-50 px-5 py-4 dark:border-orange-500/30 dark:bg-orange-500/10"
        >
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            This analysis has lower confidence. Review important extracted
            values against the original document.
          </p>
        </div>
      ) : null}

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        AI-generated analysis may contain errors. Verify important information
        against the original document.
      </p>

      <section
        aria-labelledby="ai-analysis-heading"
        className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h3
            id="ai-analysis-heading"
            className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
          >
          AI analysis
          </h3>
        </div>

        <div className="space-y-5 px-5 py-5">
          {detectedType ? (
            <div>
              <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                Detected document type
              </p>
              <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                {detectedType}
              </p>
            </div>
          ) : null}

          <div>
            <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Summary
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700 dark:text-zinc-300">
              {summary || "No summary was returned."}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Overall confidence
            </p>
            <div className="mt-2">
              <ConfidenceBadge score={result.confidence_score} size="md" />
            </div>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              Confidence is an estimate from the analysis model, not a
              guarantee of correctness.
            </p>
          </div>

          <dl className="grid grid-cols-1 gap-4 border-t border-zinc-100 pt-4 sm:grid-cols-2 dark:border-zinc-800/60">
            <DetailMeta label="Analysis model" value={result.model_name} />
            <DetailMeta
              label="Result timestamp"
              value={formatDateTime(processedAt)}
            />
          </dl>
        </div>
      </section>

      <ExtractedFields fields={result.extracted_fields} />
    </div>
  );
}
