import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, FileText, Upload } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { formatFileSize } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Documents",
};

interface DocumentRow {
  id: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  status: string;
  created_at: string;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const STATUS_STYLES: Record<string, string> = {
  uploaded:
    "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400",
  processing:
    "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  processed:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  failed: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

export default async function DocumentsPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userEmail =
    typeof claimsData?.claims?.email === "string"
      ? claimsData.claims.email
      : null;

  // RLS restricts results to the authenticated user's own rows.
  const { data: documents, error } = await supabase
    .from("documents")
    .select("id, file_name, mime_type, file_size_bytes, status, created_at")
    .order("created_at", { ascending: false })
    .returns<DocumentRow[]>();

  return (
    <DashboardLayout userEmail={userEmail}>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Documents
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            All documents stored in your workspace.
          </p>
        </div>
        <Link
          href="/upload"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          <Upload className="h-4 w-4" />
          Upload Document
        </Link>
      </div>

      {error ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-5 py-4 dark:border-red-500/30 dark:bg-red-500/10">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          <p className="text-sm text-red-700 dark:text-red-400">
            We couldn&apos;t load your documents. Please try again later.
          </p>
        </div>
      ) : !documents || documents.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-col items-center justify-center gap-2 px-5 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500">
              <FileText className="h-6 w-6" />
            </span>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              No documents yet.
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Upload your first document to get started.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="px-5 py-3 font-medium text-zinc-500 dark:text-zinc-400">
                    Name
                  </th>
                  <th className="px-5 py-3 font-medium text-zinc-500 dark:text-zinc-400">
                    Type
                  </th>
                  <th className="px-5 py-3 font-medium text-zinc-500 dark:text-zinc-400">
                    Size
                  </th>
                  <th className="px-5 py-3 font-medium text-zinc-500 dark:text-zinc-400">
                    Status
                  </th>
                  <th className="px-5 py-3 font-medium text-zinc-500 dark:text-zinc-400">
                    Uploaded
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td className="max-w-xs px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <FileText className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
                        <span className="truncate font-medium text-zinc-900 dark:text-zinc-50">
                          {doc.file_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-zinc-500 dark:text-zinc-400">
                      {doc.mime_type}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                      {formatFileSize(doc.file_size_bytes)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          STATUS_STYLES[doc.status] ??
                          "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        }`}
                      >
                        {doc.status}
                      </span>
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
      )}
    </DashboardLayout>
  );
}
