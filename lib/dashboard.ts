import { EMBEDDING_INDEX_JOB_TYPE } from "@/lib/documents";
import { logServerEvent, readErrorCode } from "@/lib/observability/log";
import { createClient } from "@/lib/supabase/server";

const RECENT_LIMIT = 5;

export interface DashboardMetrics {
  total_documents: number;
  processed_documents: number;
  ai_requests_this_month: number;
  storage_bytes: number;
}

export interface DashboardDocument {
  id: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  status: string;
  created_at: string;
}

export type DashboardActivityKind =
  | "upload"
  | "processing_queued"
  | "processing_started"
  | "processing_completed"
  | "processing_failed";

export interface DashboardActivityItem {
  id: string;
  kind: DashboardActivityKind;
  text: string;
  timestamp: string;
}

export interface DashboardData {
  metrics: DashboardMetrics | null;
  recentDocuments: DashboardDocument[];
  recentActivity: DashboardActivityItem[];
  metricsError: boolean;
  documentsError: boolean;
  activityError: boolean;
  loadError: boolean;
}

const EMPTY_METRICS: DashboardMetrics = {
  total_documents: 0,
  processed_documents: 0,
  ai_requests_this_month: 0,
  storage_bytes: 0,
};

const RECENT_DOCUMENT_COLUMNS =
  "id, file_name, mime_type, file_size_bytes, status, created_at";

const JOB_COLUMNS =
  "id, document_id, job_type, status, created_at, started_at, completed_at, documents ( file_name )";

interface MetricsRow {
  total_documents: number | string | null;
  processed_documents: number | string | null;
  ai_requests_this_month: number | string | null;
  storage_bytes: number | string | null;
}

interface ProcessingJobRow {
  id: string;
  document_id: string;
  job_type: string;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  documents: { file_name: string } | { file_name: string }[] | null;
}

/**
 * Loads live dashboard metrics, recent documents, and derived activity for
 * the authenticated user. All queries use the cookie-based server client and
 * rely on RLS; no user_id is accepted from the caller.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();

  const [metricsResult, documentsResult, jobsResult] = await Promise.all([
    supabase.rpc("get_dashboard_metrics").maybeSingle<MetricsRow>(),
    supabase
      .from("documents")
      .select(RECENT_DOCUMENT_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT)
      .returns<DashboardDocument[]>(),
    supabase
      .from("document_processing_jobs")
      .select(JOB_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT)
      .returns<ProcessingJobRow[]>(),
  ]);

  let metrics: DashboardMetrics | null = null;
  let metricsError = false;

  if (metricsResult.error) {
    logServerEvent("dashboard", "error", "Failed to load metrics", {
      code: readErrorCode(metricsResult.error),
      category: "metrics",
    });
    metricsError = true;
  } else {
    metrics = parseMetrics(metricsResult.data);
  }

  let recentDocuments: DashboardDocument[] = [];
  let documentsError = false;

  if (documentsResult.error) {
    logServerEvent("dashboard", "error", "Failed to load recent documents", {
      code: readErrorCode(documentsResult.error),
      category: "documents",
    });
    documentsError = true;
  } else {
    recentDocuments = documentsResult.data ?? [];
  }

  let jobs: ProcessingJobRow[] = [];
  let jobsError = false;

  if (jobsResult.error) {
    logServerEvent("dashboard", "error", "Failed to load recent processing jobs", {
      code: readErrorCode(jobsResult.error),
      category: "jobs",
    });
    jobsError = true;
  } else {
    jobs = jobsResult.data ?? [];
  }

  const recentActivity = buildRecentActivity(
    documentsError ? [] : recentDocuments,
    jobsError ? [] : jobs,
  );

  // An empty feed is only trustworthy when both sources succeeded.
  const activityError =
    recentActivity.length === 0 && (documentsError || jobsError);

  return {
    metrics,
    recentDocuments,
    recentActivity,
    metricsError,
    documentsError,
    activityError,
    loadError: metricsError || documentsError || jobsError,
  };
}

function parseMetrics(row: MetricsRow | null): DashboardMetrics {
  if (!row) return EMPTY_METRICS;

  return {
    total_documents: toCount(row.total_documents),
    processed_documents: toCount(row.processed_documents),
    ai_requests_this_month: toCount(row.ai_requests_this_month),
    storage_bytes: toCount(row.storage_bytes),
  };
}

function toCount(value: number | string | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.trunc(parsed));
  }
  return 0;
}

function relatedFileName(
  documents: ProcessingJobRow["documents"],
): string {
  if (!documents) return "Document";
  const row = Array.isArray(documents) ? documents[0] : documents;
  const name = row?.file_name?.trim();
  return name && name.length > 0 ? name : "Document";
}

function activityFromJob(job: ProcessingJobRow): DashboardActivityItem | null {
  const fileName = relatedFileName(job.documents);
  const indexing = job.job_type === EMBEDDING_INDEX_JOB_TYPE;

  switch (job.status) {
    case "queued":
      return {
        id: `job:${job.id}`,
        kind: "processing_queued",
        text: indexing
          ? `${fileName} queued for indexing`
          : `${fileName} queued for analysis`,
        timestamp: job.created_at,
      };
    case "running":
      return {
        id: `job:${job.id}`,
        kind: "processing_started",
        text: indexing
          ? `${fileName} indexing started`
          : `${fileName} analysis started`,
        timestamp: job.started_at ?? job.created_at,
      };
    case "completed":
      return {
        id: `job:${job.id}`,
        kind: "processing_completed",
        text: indexing
          ? `${fileName} indexing completed`
          : `${fileName} analysis completed`,
        timestamp: job.completed_at ?? job.created_at,
      };
    case "failed":
      return {
        id: `job:${job.id}`,
        kind: "processing_failed",
        text: indexing
          ? `${fileName} indexing failed`
          : `${fileName} analysis failed`,
        timestamp: job.completed_at ?? job.created_at,
      };
    default:
      return null;
  }
}

function buildRecentActivity(
  documents: DashboardDocument[],
  jobs: ProcessingJobRow[],
): DashboardActivityItem[] {
  const uploads: DashboardActivityItem[] = documents.map((document) => ({
    id: `upload:${document.id}`,
    kind: "upload" as const,
    text: `${document.file_name} uploaded`,
    timestamp: document.created_at,
  }));

  const processing = jobs
    .map(activityFromJob)
    .filter((item): item is DashboardActivityItem => item !== null);

  return [...uploads, ...processing]
    .sort((a, b) => {
      const aTime = Date.parse(a.timestamp);
      const bTime = Date.parse(b.timestamp);
      const aValid = Number.isFinite(aTime) ? aTime : 0;
      const bValid = Number.isFinite(bTime) ? bTime : 0;
      return bValid - aValid;
    })
    .slice(0, RECENT_LIMIT);
}
