import { type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * PKCE callback for Supabase's default confirmation email. Exchanges the
 * `code` query parameter for a session.
 *
 * On success: redirect to "/".
 * On failure or missing code: redirect to "/login" with a generic error
 * indicator (no tokens, codes, or raw Supabase errors are exposed).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      redirect("/");
    }
  }

  redirect("/login?error=confirmation_failed");
}
