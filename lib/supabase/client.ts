import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

let client: SupabaseClient | undefined;

/**
 * Returns a shared Supabase client instance.
 *
 * The client is created lazily on first use and reused afterwards, so
 * importing this module never throws — errors about missing environment
 * variables only surface when the client is actually requested.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    const { url, publishableKey } = getSupabaseConfig();
    client = createClient(url, publishableKey);
  }

  return client;
}
