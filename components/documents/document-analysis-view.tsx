import { DocumentStatusBadge } from "./document-status-badge";
import { formatConfidence, formatDateTime } from "@/lib/format";

export interface AnalysisField {
  field_name: string;
  value: string;
  confidence: number;
}

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

function toConfidenceNumber(value: number | string | null): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseExtractedFields(value: unknown): AnalysisField[] {
  if (!Array.isArray(value)) return [];

  const fields: AnalysisField[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.field_name !== "string") continue;
    if (typeof record.value !== "string") continue;
    const confidence = toConfidenceNumber(
      typeof record.confidence === "number" || typeof record.confidence === "string"
        ? record.confidence
        : null,
    );
    if (confidence === null) continue;
    fields.push({
      field_name: record.field_name,
      value: record.value,
      confidence,
    });
  }
  return fields;
}

export function DocumentAnalysisView({
  result,
}: {
  result: DocumentAnalysisResultData;
}) {
  const fields = parseExtractedFields(result.extracted_fields);
  const processedAt = result.updated_at || result.created_at;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            Detected type
          </p>
          <p className="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
            {result.detected_document_type?.trim() || "—"}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            Overall confidence
          </p>
          <p className="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
            {formatConfidence(toConfidenceNumber(result.confidence_score))}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          Summary
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700 dark:text-zinc-300">
          {result.summary?.trim() || "No summary was returned."}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Extracted fields
          </h3>
        </div>
        {fields.length === 0 ? (
          <p className="px-5 py-8 text-sm text-zinc-500 dark:text-zinc-400">
            No structured fields were extracted from this document.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="px-5 py-3 font-medium text-zinc-500 dark:text-zinc-400">
                    Field
                  </th>
                  <th className="px-5 py-3 font-medium text-zinc-500 dark:text-zinc-400">
                    Value
                  </th>
                  <th className="px-5 py-3 font-medium text-zinc-500 dark:text-zinc-400">
                    Confidence
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {fields.map((field, index) => (
                  <tr key={`${field.field_name}-${index}`}>
                    <td className="px-5 py-3 align-top font-medium whitespace-nowrap text-zinc-900 dark:text-zinc-50">
                      {field.field_name}
                    </td>
                    <td className="px-5 py-3 align-top break-words text-zinc-700 dark:text-zinc-300">
                      {field.value}
                    </td>
                    <td className="px-5 py-3 align-top whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                      {formatConfidence(field.confidence)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        {result.model_name ? <span>Model: {result.model_name}</span> : null}
        {result.prompt_version ? (
          <span>Prompt: {result.prompt_version}</span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          Processed: {formatDateTime(processedAt)}
          <DocumentStatusBadge status="processed" />
        </span>
      </div>
    </div>
  );
}
