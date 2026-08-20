import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicSupabaseConfig } from "@/lib/env/public";

/**
 * Creates a server Supabase client for Server Components, Server Actions,
 * and Route Handlers. Cookie writes from Server Components may fail; the
 * root proxy refreshes auth cookies on each request.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getPublicSupabaseConfig();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component where cookies cannot be written.
          // Safe to ignore when the proxy refreshes sessions on each request.
          // Cache headers from setAll cannot be applied here either.
        }
      },
    },
  });
}
