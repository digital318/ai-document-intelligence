import Link from "next/link";
import { AlertCircle, FileText, Upload } from "lucide-react";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import type { DashboardDocument } from "@/lib/dashboard";
import { formatMimeTypeLabel } from "@/lib/documents";
import { formatDateTime } from "@/lib/format";

export function RecentDocuments({
  documents,
  error,
}: {
  documents: DashboardDocument[];
  error: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Recent Documents
        </h3>
      </div>

      {error ? (
        <div className="flex items-start gap-2.5 px-5 py-8">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          <p className="text-sm text-red-700 dark:text-red-400">
            Unable to load recent documents right now.
          </p>
        </div>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500">
            <FileText className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            No documents yet
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Upload your first document to begin.
          </p>
          <Link
            href="/upload"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            <Upload className="h-4 w-4" />
            Upload Document
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
          {documents.map((document) => (
            <li key={document.id}>
              <Link
                href={`/documents/${document.id}`}
                className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {document.file_name}
                    </p>
                    <DocumentStatusBadge status={document.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {formatMimeTypeLabel(document.mime_type)}
                    {" · "}
                    {formatDateTime(document.created_at)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}