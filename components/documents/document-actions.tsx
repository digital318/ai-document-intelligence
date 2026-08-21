"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Download,
  Eye,
  Loader2,
  Trash2,
} from "lucide-react";
import { deleteDocument } from "@/app/documents/actions";

const ICON_BUTTON =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";

const LABELED_BUTTON =
  "inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";

const LABELED_DELETE_BUTTON =
  "inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-red-500/30 dark:hover:bg-red-500/10 dark:hover:text-red-400";

interface DocumentActionsProps {
  documentId: string;
  fileName: string;
  variant?: "icons" | "labeled";
  /** Extra controls rendered between Download and Delete (e.g. Analyze). */
  children?: ReactNode;
}

/**
 * View / Download / Delete actions for a document row. Only the document id
 * ever reaches the browser — storage paths stay on the server.
 */
export function DocumentActions({
  documentId,
  fileName,
  variant = "icons",
  children,
}: DocumentActionsProps) {
  const router = useRouter();
  const labeled = variant === "labeled";
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const closeDialog = useCallback(() => {
    if (isDeleting) return;
    setConfirmOpen(false);
    setErrorMessage(null);
  }, [isDeleting]);

  useEffect(() => {
    if (!confirmOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDialog();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmOpen, closeDialog]);

  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    setErrorMessage(null);

    try {
      const result = await deleteDocument(documentId);
      if (result.success) {
        setConfirmOpen(false);
        // Re-render the server-rendered list while keeping the current
        // search/filter/pagination URL state intact.
        router.refresh();
      } else {
        setErrorMessage(
          result.error ?? "Unable to delete this document. Please try again.",
        );
      }
    } catch {
      setErrorMessage("Unable to delete this document. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div
        className={
          labeled
            ? "flex flex-wrap items-center gap-2"
            : "flex items-center justify-end gap-1"
        }
      >
        <a
          href={`/api/documents/${documentId}/view`}
          target="_blank"
          rel="noopener noreferrer"
          className={labeled ? LABELED_BUTTON : ICON_BUTTON}
          title="View Original"
          aria-label={`View original ${fileName}`}
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          {labeled ? "View Original" : null}
        </a>
        <a
          href={`/api/documents/${documentId}/download`}
          className={labeled ? LABELED_BUTTON : ICON_BUTTON}
          title="Download"
          aria-label={`Download ${fileName}`}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {labeled ? "Download" : null}
        </a>
        {children}
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className={
            labeled
              ? LABELED_DELETE_BUTTON
              : "inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
          }
          title="Delete"
          aria-label={`Delete ${fileName}`}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {labeled ? "Delete" : null}
        </button>
      </div>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4"
          onClick={closeDialog}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`delete-dialog-title-${documentId}`}
            onClick={(event) => event.stopPropagation()}
            className="w-[calc(100%-2rem)] max-w-lg whitespace-normal rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
                <Trash2 className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3
                  id={`delete-dialog-title-${documentId}`}
                  className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
                >
                  Delete document?
                </h3>
                <p className="mt-1 text-sm break-words text-zinc-500 dark:text-zinc-400">
                  <span className="font-medium break-all text-zinc-700 dark:text-zinc-300">
                    {fileName}
                  </span>{" "}
                  will be permanently deleted. This action cannot be undone.
                </p>
              </div>
            </div>

            {errorMessage && (
              <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-500/30 dark:bg-red-500/10">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                <p className="text-sm text-red-700 dark:text-red-400">
                  {errorMessage}
                </p>
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeDialog}
                disabled={isDeleting}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeleting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {isDeleting ? "Deleting..." : "Delete document"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
