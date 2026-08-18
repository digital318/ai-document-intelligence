import { AlertCircle, Clock } from "lucide-react";
import {
  JOB_STATUS_LABELS,
  type JobStatus,
} from "@/lib/documents";
import {
  formatDateTime,
  formatDurationMs,
  formatJobType,
  formatTokenCount,
} from "@/lib/format";

export interface ProcessingHistoryJob {
  id: string;
  jobType: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  attemptNumber: number;
  /** True when the job failed. Raw error text is never included. */
  failed: boolean;
  modelName: string | null;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

const JOB_STATUS_STYLES: Record<JobStatus, string> = {
  queued: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400",
  running:
    "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  completed:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  failed: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

const FALLBACK_STATUS_STYLE =
  "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";

function JobStatusBadge({ status }: { status: string }) {
  const isKnown = status in JOB_STATUS_LABELS;
  const label = isKnown ? JOB_STATUS_LABELS[status as JobStatus] : status;
  const style = isKnown
    ? JOB_STATUS_STYLES[status as JobStatus]
    : FALLBACK_STATUS_STYLE;

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      {label}
    </span>
  );
}

function TelemetryRow({
  modelName,
  durationMs,
  inputTokens,
  outputTokens,
  totalTokens,
}: {
  modelName: string | null;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}) {
  const hasModel = Boolean(modelName?.trim());
  const hasDuration = durationMs != null;
  const hasTokens =
    inputTokens != null || outputTokens != null || totalTokens != null;

  if (!hasModel && !hasDuration && !hasTokens) return null;

  return (
    <div className="mt-2 flex flex-col gap-0.5 text-xs text-zinc-500 dark:text-zinc-400">
      {hasModel ? <p>Model: {modelName}</p> : null}
      {hasDuration ? <p>Duration: {formatDurationMs(durationMs)}</p> : null}
      {hasTokens ? (
        <p>
          Tokens:
          {inputTokens != null ? ` ${formatTokenCount(inputTokens)} in` : ""}
          {outputTokens != null
            ? `${inputTokens != null ? " ·" : ""} ${formatTokenCount(outputTokens)} out`
            : ""}
          {totalTokens != null
            ? `${inputTokens != null || outputTokens != null ? " ·" : ""} ${formatTokenCount(totalTokens)} total`
            : ""}
        </p>
      ) : null}
    </div>
  );
}

function TimestampRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <p className="text-xs text-zinc-500 dark:text-zinc-400">
      {label}: {formatDateTime(value)}
    </p>
  );
}

export function ProcessingHistory({
  jobs,
  loadError = false,
}: {
  jobs: ProcessingHistoryJob[];
  loadError?: boolean;
}) {
  return (
    <section
      aria-labelledby="processing-history-heading"
      className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h3
          id="processing-history-heading"
          className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
        >
          Processing history
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Each analysis attempt is listed, newest first.
        </p>
      </div>

      {loadError ? (
        <div className="flex items-start gap-2.5 px-5 py-8">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          <p className="text-sm text-red-700 dark:text-red-400">
            Unable to load processing history right now.
          </p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500">
            <Clock className="h-5 w-5" />
          </span>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No processing attempts yet.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
          {jobs.map((job) => (
            <li
              key={job.id}
              className={`px-5 py-4 ${
                job.failed
                  ? "border-l-2 border-l-red-400 bg-red-50/40 dark:border-l-red-500 dark:bg-red-500/5"
                  : ""
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    Attempt {job.attemptNumber}
                    <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">
                      ·
                    </span>
                    <span className="font-normal text-zinc-600 dark:text-zinc-300">
                      {formatJobType(job.jobType)}
                    </span>
                  </p>
                </div>
                <JobStatusBadge status={job.status} />
              </div>

              <div className="mt-2 flex flex-col gap-0.5">
                <TimestampRow label="Created" value={job.createdAt} />
                <TimestampRow label="Started" value={job.startedAt} />
                <TimestampRow label="Completed" value={job.completedAt} />
              </div>

              <TelemetryRow
                modelName={job.modelName}
                durationMs={job.durationMs}
                inputTokens={job.inputTokens}
                outputTokens={job.outputTokens}
                totalTokens={job.totalTokens}
              />

              {job.failed ? (
                <p className="mt-2 flex items-start gap-1.5 text-sm text-red-700 dark:text-red-400">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  Analysis attempt failed.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
