import { FileText } from "lucide-react";
import { formatMimeTypeLabel } from "@/lib/documents";
import { formatFileSize } from "@/lib/format";
import { DocumentStatusBadge } from "./document-status-badge";

export interface DocumentListItem {
  id: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  document_type: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const HEADER_CELL =
  "px-5 py-3 font-medium text-zinc-500 dark:text-zinc-400";

export function DocumentTable({
  documents,
}: {
  documents: DocumentListItem[];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className={HEADER_CELL}>Name</th>
              <th className={HEADER_CELL}>Type</th>
              <th className={HEADER_CELL}>Size</th>
              <th className={HEADER_CELL}>Status</th>
              <th className={HEADER_CELL}>Uploaded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {documents.map((doc) => (
              <tr
                key={doc.id}
                className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
              >
                <td className="max-w-xs px-5 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <FileText className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-zinc-900 dark:text-zinc-50">
                        {doc.file_name}
                      </p>
                      {doc.document_type ? (
                        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                          {doc.document_type}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                  {formatMimeTypeLabel(doc.mime_type)}
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                  {formatFileSize(doc.file_size_bytes)}
                </td>
                <td className="px-5 py-3.5">
                  <DocumentStatusBadge status={doc.status} />
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                  {dateFormatter.format(new Date(doc.created_at))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
