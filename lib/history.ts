import { toNonNegativeInt } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const HISTORY_PAGE_SIZE = 25;

export interface HistoryJobItem {
  id: string;
  documentId: string | null;
  fileName: string;
  jobType: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  modelName: string | null;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface HistoryPageData {
  jobs: HistoryJobItem[];
  loadError: boolean;
}

const HISTORY_JOB_COLUMNS =
  "id, document_id, job_type, status, created_at, completed_at, model_name, input_tokens, output_tokens, total_tokens, processing_duration_ms, documents ( id, file_name )";

interface HistoryJobRow {
  id: string;
  document_id: string;
  job_type: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  model_name: string | null;
  input_tokens: number | string | null;
  output_tokens: number | string | null;
  total_tokens: number | string | null;
  processing_duration_ms: number | string | null;
  documents: { id: string; file_name: string } | { id: string; file_name: string }[] | null;
}

function relatedDocument(
  documents: HistoryJobRow["documents"],
): { id: string; fileName: string } | null {
  if (!documents) return null;
  const row = Array.isArray(documents) ? documents[0] : documents;
  if (!row?.id) return null;
  const fileName = row.file_name?.trim();
  return {
    id: row.id,
    fileName: fileName && fileName.length > 0 ? fileName : "Document",
  };
}

/**
 * Loads recent processing attempts for the authenticated user via RLS.
 * Does not select storage_path, openai_request_id, error_message,
 * failure_code, or user_id.
 */
export async function getHistoryPageData(): Promise<HistoryPageData> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("document_processing_jobs")
    .select(HISTORY_JOB_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(HISTORY_PAGE_SIZE)
    .returns<HistoryJobRow[]>();

  if (error) {
    console.error(
      "[history] Failed to load processing jobs:",
      error.code,
      error.message,
    );
    return { jobs: [], loadError: true };
  }

  const jobs: HistoryJobItem[] = (data ?? []).map((row) => {
    const related = relatedDocument(row.documents);
    return {
      id: row.id,
      documentId: related?.id ?? row.document_id ?? null,
      fileName: related?.fileName ?? "Document",
      jobType: row.job_type,
      status: row.status,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      modelName: row.model_name?.trim() || null,
      durationMs: toNonNegativeInt(row.processing_duration_ms),
      inputTokens: toNonNegativeInt(row.input_tokens),
      outputTokens: toNonNegativeInt(row.output_tokens),
      totalTokens: toNonNegativeInt(row.total_tokens),
    };
  });

  return { jobs, loadError: false };
}
