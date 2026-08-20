/**
 * Browser-safe environment helpers.
 *
 * `process.env.NEXT_PUBLIC_*` is referenced statically so Next.js can inline
 * values into the client bundle. Never put OPENAI_API_KEY or other secrets
 * in NEXT_PUBLIC_* variables. Do not log environment-variable values.
 */

const LOCAL_SITE_URL = "http://localhost:3000";

export class MissingPublicEnvironmentError extends Error {
  constructor(name: string, extra?: string) {
    super(
      extra
        ? `Missing environment variable: ${name}. ${extra}`
        : `Missing environment variable: ${name}.`,
    );
    this.name = "MissingPublicEnvironmentError";
  }
}

const PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLIC_SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;
const PUBLIC_VERCEL_URL = process.env.NEXT_PUBLIC_VERCEL_URL;

function readNonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Normalizes an origin/base URL: optional https:// for host-only values,
 * no trailing slash, http(s) only.
 */
export function normalizeSiteUrl(raw: string): string {
  let value = raw.trim();
  if (!value) {
    throw new Error("Site URL is empty.");
  }

  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Site URL is not a valid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Site URL must use http or https.");
  }

  const path = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${path === "/" ? "" : path}`;
}

/**
 * Application base URL for auth redirects and absolute links.
 *
 * Precedence:
 * 1. NEXT_PUBLIC_SITE_URL
 * 2. NEXT_PUBLIC_VERCEL_URL (https:// added when needed)
 * 3. http://localhost:3000
 *
 * Production (VERCEL_ENV=production) requires NEXT_PUBLIC_SITE_URL so email
 * confirmation returns to the canonical domain rather than a preview URL.
 */
export function getSiteUrl(): string {
  const configured = readNonEmpty(PUBLIC_SITE_URL);
  if (configured) {
    return normalizeSiteUrl(configured);
  }

  if (process.env.VERCEL_ENV === "production") {
    throw new MissingPublicEnvironmentError(
      "NEXT_PUBLIC_SITE_URL",
      "Set it to the HTTPS production URL (see .env.example).",
    );
  }

  const vercelUrl = readNonEmpty(PUBLIC_VERCEL_URL);
  if (vercelUrl) {
    return normalizeSiteUrl(vercelUrl);
  }

  return LOCAL_SITE_URL;
}

export function getPublicSupabaseUrl(): string {
  const url = readNonEmpty(PUBLIC_SUPABASE_URL);
  if (!url) {
    throw new MissingPublicEnvironmentError(
      "NEXT_PUBLIC_SUPABASE_URL",
      "Add it to your .env.local file (see .env.example). " +
        "You can find this value in your Supabase dashboard under Project Settings > API.",
    );
  }
  return url;
}

export function getPublicSupabasePublishableKey(): string {
  const publishableKey = readNonEmpty(PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  if (!publishableKey) {
    throw new MissingPublicEnvironmentError(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "Add it to your .env.local file (see .env.example). " +
        "You can find this value in your Supabase dashboard under Project Settings > API.",
    );
  }
  return publishableKey;
}

export function getPublicSupabaseConfig(): {
  url: string;
  publishableKey: string;
} {
  return {
    url: getPublicSupabaseUrl(),
    publishableKey: getPublicSupabasePublishableKey(),
  };
}

/** Non-throwing read for probes that must not crash when env is incomplete. */
export function readPublicSupabaseConfig(): {
  url: string;
  publishableKey: string;
} | null {
  const url = readNonEmpty(PUBLIC_SUPABASE_URL);
  const publishableKey = readNonEmpty(PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}
