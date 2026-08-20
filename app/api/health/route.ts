import { readPublicSupabaseConfig } from "@/lib/env/public";

type HealthResponse = {
  status: "ok" | "degraded";
};

function json(body: HealthResponse, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Public readiness probe. Does not call OpenAI, and does not return URLs,
 * keys, model names, schema, or stack traces.
 */
export async function GET() {
  const config = readPublicSupabaseConfig();
  if (!config) {
    return json({ status: "degraded" }, 503);
  }

  let healthUrl: URL;
  try {
    healthUrl = new URL("/auth/v1/health", config.url);
  } catch {
    return json({ status: "degraded" }, 503);
  }

  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      headers: { apikey: config.publishableKey },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      return json({ status: "ok" }, 200);
    }

    return json({ status: "degraded" }, 503);
  } catch {
    return json({ status: "degraded" }, 503);
  }
}
