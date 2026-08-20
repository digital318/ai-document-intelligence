import { NextResponse } from "next/server";
import { isValidUuid } from "@/lib/documents";
import { logServerEvent, readErrorCode } from "@/lib/observability/log";
import { createClient } from "@/lib/supabase/server";

const SIGNED_URL_TTL_SECONDS = 60;

/**
 * Redirects to a short-lived signed URL that forces a file download.
 *
 * The browser supplies only the document id. The trusted storage_path is
 * resolved server-side from public.documents under RLS. Non-existent and
 * inaccessible documents both return the same generic 404.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isValidUuid(id)) {
    return new NextResponse("Document not found", { status: 404 });
  }

  const supabase = await createClient();

  // RLS restricts this lookup to the authenticated user's own rows.
  const { data: document, error } = await supabase
    .from("documents")
    .select("id, storage_path, file_name")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logServerEvent("documents/download", "error", "Document lookup failed", {
      code: readErrorCode(error),
      category: "lookup",
    });
    return new NextResponse("Document not found", { status: 404 });
  }

  if (!document) {
    return new NextResponse("Document not found", { status: 404 });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from("documents")
    .createSignedUrl(document.storage_path, SIGNED_URL_TTL_SECONDS, {
      download: true,
    });

  if (signError || !signed?.signedUrl) {
    logServerEvent("documents/download", "error", "Failed to create signed URL", {
      code: readErrorCode(signError),
      category: "signed_url",
    });
    return new NextResponse("Document not found", { status: 404 });
  }

  return NextResponse.redirect(signed.signedUrl, { status: 302 });
}
