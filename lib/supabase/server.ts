import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Creates a server Supabase client for Server Components, Server Actions,
 * and Route Handlers. Cookie writes from Server Components may fail; the
 * root proxy refreshes auth cookies on each request.
 */
export async function createClient() {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url) {
    throw new Error(
      "Missing environment variable: NEXT_PUBLIC_SUPABASE_URL. " +
        "Add it to your .env.local file (see .env.example).",
    );
  }

  if (!publishableKey) {
    throw new Error(
      "Missing environment variable: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
        "Add it to your .env.local file (see .env.example).",
    );
  }

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
