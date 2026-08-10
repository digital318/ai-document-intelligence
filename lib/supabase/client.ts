import { createBrowserClient } from "@supabase/ssr";

/**
 * Reads and validates the Supabase environment variables.
 *
 * Note: `process.env.NEXT_PUBLIC_*` must be referenced statically so Next.js
 * can inline the values into the client bundle at build time.
 */
function getSupabaseConfig(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url) {
    throw new Error(
      "Missing environment variable: NEXT_PUBLIC_SUPABASE_URL. " +
        "Add it to your .env.local file (see .env.example). " +
        "You can find this value in your Supabase dashboard under Project Settings > API.",
    );
  }

  if (!publishableKey) {
    throw new Error(
      "Missing environment variable: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
        "Add it to your .env.local file (see .env.example). " +
        "You can find this value in your Supabase dashboard under Project Settings > API.",
    );
  }

  return { url, publishableKey };
}

/**
 * Creates a browser Supabase client for Client Components.
 *
 * `createBrowserClient` uses a singleton pattern internally, so repeated
 * calls reuse the same instance.
 */
export function createClient() {
  const { url, publishableKey } = getSupabaseConfig();
  return createBrowserClient(url, publishableKey);
}
