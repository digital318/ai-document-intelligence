import { NextResponse } from "next/server";
import { isValidUuid } from "@/lib/documents";
import { createClient } from "@/lib/supabase/server";

const SIGNED_URL_TTL_SECONDS = 60;

/**
 * Redirects to a short-lived signed URL for viewing a document inline.
 *
 * The browser supplies only the document id. The trusted storage_path is
 * resolved server-side from public.documents under RLS, so a user can never
 * reach another account's file. Non-existent and inaccessible documents both
 * return the same generic 404.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Reject malformed ids before they reach the database. Responds identically
  // to a missing document so nothing is revealed about valid id shapes.
  if (!isValidUuid(id)) {
    return new NextResponse("Document not found", { status: 404 });
  }

  const supabase = await createClient();

  // RLS restricts this lookup to the authenticated user's own rows.
  const { data: document, error } = await supabase
    .from("documents")
    .select("id, storage_path, file_name, mime_type")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(
      "[documents/view] Document lookup failed:",
      error.code,
      error.message,
    );
    return new NextResponse("Document not found", { status: 404 });
  }

  if (!document) {
    return new NextResponse("Document not found", { status: 404 });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from("documents")
    .createSignedUrl(document.storage_path, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed?.signedUrl) {
    console.error(
      "[documents/view] Failed to create signed URL:",
      signError?.message ?? "no URL returned",
    );
    return new NextResponse("Document not found", { status: 404 });
  }

  return NextResponse.redirect(signed.signedUrl, { status: 302 });
}
