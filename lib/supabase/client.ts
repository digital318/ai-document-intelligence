import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseConfig } from "@/lib/env/public";

/**
 * Creates a browser Supabase client for Client Components.
 *
 * `createBrowserClient` uses a singleton pattern internally, so repeated
 * calls reuse the same instance.
 */
export function createClient() {
  const { url, publishableKey } = getPublicSupabaseConfig();
  return createBrowserClient(url, publishableKey);
}
