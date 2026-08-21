import type { ReactNode } from "react";
import { DocumentStatusBadge } from "./document-status-badge";
import { formatMimeTypeLabel } from "@/lib/documents";
import { formatDateTime, formatFileSize } from "@/lib/format";

interface DocumentDetailsProps {
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  createdAt: string;
  status: string;
  detectedDocumentType: string | null;
  pageCount: number | null;
}

function DetailItem({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm break-words text-zinc-900 dark:text-zinc-50">
        {children}
      </dd>
    </div>
  );
}

export function DocumentDetails({
  fileName,
  mimeType,
  fileSizeBytes,
  createdAt,
  status,
  detectedDocumentType,
  pageCount,
}: DocumentDetailsProps) {
  const detectedType = detectedDocumentType?.trim() || null;

  return (
    <section
      aria-labelledby="document-details-heading"
      className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h3
          id="document-details-heading"
          className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
        >
          Document information
        </h3>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
        <DetailItem label="File name">
          <span title={fileName}>{fileName}</span>
        </DetailItem>
        <DetailItem label="File type">
          {formatMimeTypeLabel(mimeType)}
        </DetailItem>
        <DetailItem label="File size">
          {formatFileSize(fileSizeBytes)}
        </DetailItem>
        <DetailItem label="Uploaded">{formatDateTime(createdAt)}</DetailItem>
        <DetailItem label="Status">
          <DocumentStatusBadge status={status} />
        </DetailItem>
        {detectedType ? (
          <DetailItem label="Detected type">{detectedType}</DetailItem>
        ) : null}
        {pageCount != null && pageCount > 0 ? (
          <DetailItem label="Page count">{pageCount}</DetailItem>
        ) : null}
      </dl>
    </section>
  );
}
