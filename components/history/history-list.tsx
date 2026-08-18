import Link from "next/link";
import { Clock } from "lucide-react";
import {
  JOB_STATUS_LABELS,
  type JobStatus,
} from "@/lib/documents";
import type { HistoryJobItem } from "@/lib/history";
import {
  formatDateTime,
  formatDurationMs,
  formatJobType,
  formatTokenCount,
} from "@/lib/format";

const HEADER_CELL =
  "px-5 py-3 font-medium text-zinc-500 dark:text-zinc-400";

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

function TokenSummary({
  inputTokens,
  outputTokens,
  totalTokens,
}: {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}) {
  if (inputTokens == null && outputTokens == null && totalTokens == null) {
    return <span className="text-zinc-400 dark:text-zinc-500">—</span>;
  }

  return (
    <span className="whitespace-nowrap">
      {formatTokenCount(inputTokens)} in
      {" · "}
      {formatTokenCount(outputTokens)} out
      {" · "}
      {formatTokenCount(totalTokens)} total
    </span>
  );
}

export function HistoryList({ jobs }: { jobs: HistoryJobItem[] }) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col items-center justify-center gap-2 px-5 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500">
            <Clock className="h-6 w-6" />
          </span>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            No processing history yet
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Analysis attempts will appear here after you process a document.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className={HEADER_CELL}>Document</th>
              <th className={HEADER_CELL}>Status</th>
              <th className={HEADER_CELL}>Job type</th>
              <th className={HEADER_CELL}>Created</th>
              <th className={HEADER_CELL}>Completed</th>
              <th className={HEADER_CELL}>Duration</th>
              <th className={HEADER_CELL}>Model</th>
              <th className={HEADER_CELL}>Tokens</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {jobs.map((job) => (
              <tr
                key={job.id}
                className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
              >
                <td className="max-w-xs px-5 py-3.5">
                  {job.documentId ? (
                    <Link
                      href={`/documents/${job.documentId}`}
                      className="truncate font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                      title={job.fileName}
                    >
                      {job.fileName}
                    </Link>
                  ) : (
                    <span
                      className="truncate font-medium text-zinc-900 dark:text-zinc-50"
                      title={job.fileName}
                    >
                      {job.fileName}
                    </span>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <JobStatusBadge status={job.status} />
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                  {formatJobType(job.jobType)}
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                  {formatDateTime(job.createdAt)}
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                  {job.completedAt ? formatDateTime(job.completedAt) : "—"}
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                  {formatDurationMs(job.durationMs)}
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                  {job.modelName || "—"}
                </td>
                <td className="px-5 py-3.5 text-zinc-500 dark:text-zinc-400">
                  <TokenSummary
                    inputTokens={job.inputTokens}
                    outputTokens={job.outputTokens}
                    totalTokens={job.totalTokens}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
