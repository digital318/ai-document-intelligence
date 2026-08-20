"use server";

import { revalidatePath } from "next/cache";
import { isValidUuid } from "@/lib/documents";
import { logServerEvent, readErrorCode } from "@/lib/observability/log";
import { createClient } from "@/lib/supabase/server";

export type DeleteDocumentResult = {
  success: boolean;
  error?: string;
};

const GENERIC_FAILURE: DeleteDocumentResult = {
  success: false,
  error: "Unable to delete this document. Please try again.",
};

/**
 * Permanently deletes a document the current user owns.
 *
 * The browser supplies only the document id; the trusted storage_path is
 * resolved server-side under RLS. The Storage object is removed first, and
 * the public.documents row is deleted only after Storage deletion succeeds
 * (related rows cascade via existing foreign keys).
 */
export async function deleteDocument(
  documentId: string,
): Promise<DeleteDocumentResult> {
  if (typeof documentId !== "string" || !isValidUuid(documentId)) {
    return GENERIC_FAILURE;
  }

  const supabase = await createClient();

  // RLS restricts this lookup to the authenticated user's own rows, so a
  // missing result covers both "does not exist" and "not yours".
  const { data: document, error: lookupError } = await supabase
    .from("documents")
    .select("id, storage_path, file_name")
    .eq("id", documentId)
    .maybeSingle();

  if (lookupError) {
    logServerEvent("documents/delete", "error", "Document lookup failed", {
      code: readErrorCode(lookupError),
      category: "lookup",
    });
    return GENERIC_FAILURE;
  }

  if (!document) {
    return GENERIC_FAILURE;
  }

  // Delete the Storage object first so a failure here leaves the database
  // row intact and the document still visible (and retryable) in the UI.
  const { error: storageError } = await supabase.storage
    .from("documents")
    .remove([document.storage_path]);

  if (storageError) {
    logServerEvent("documents/delete", "error", "Storage removal failed", {
      code: readErrorCode(storageError),
      category: "storage",
    });
    return GENERIC_FAILURE;
  }

  const { error: deleteError } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId);

  if (deleteError) {
    // The file is gone but the row remains: report a safe partial failure.
    logServerEvent(
      "documents/delete",
      "error",
      "Row deletion failed after storage removal",
      {
        code: readErrorCode(deleteError),
        category: "row_delete",
      },
    );
    return {
      success: false,
      error:
        "The file was removed, but its record could not be deleted. Please try again.",
    };
  }

  revalidatePath("/documents");
  revalidatePath("/");
  revalidatePath("/history");

  return { success: true };
}
