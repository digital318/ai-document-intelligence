type HealthResponse = {
  configured: boolean;
  connected: boolean;
  error?: string;
};

function json(body: HealthResponse, status: number) {
  return Response.json(body, { status });
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return json(
      {
        configured: false,
        connected: false,
        error: "Supabase environment variables are not configured",
      },
      503
    );
  }

  let healthUrl: URL;
  try {
    healthUrl = new URL("/auth/v1/health", supabaseUrl);
  } catch {
    return json(
      {
        configured: false,
        connected: false,
        error: "Supabase URL is not a valid URL",
      },
      503
    );
  }

  try {
    // Read-only probe of the GoTrue health endpoint: verifies the project
    // is reachable and the publishable key is accepted, without touching
    // any data. (The PostgREST root requires a secret key, so it is not
    // usable here.)
    const response = await fetch(healthUrl, {
      method: "GET",
      headers: { apikey: supabaseKey },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      return json({ configured: true, connected: true }, 200);
    }

    if (response.status === 401 || response.status === 403) {
      return json(
        {
          configured: true,
          connected: false,
          error: "Supabase rejected the provided credentials",
        },
        503
      );
    }

    return json(
      {
        configured: true,
        connected: false,
        error: `Supabase responded with an unexpected status (${response.status})`,
      },
      503
    );
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return json(
      {
        configured: true,
        connected: false,
        error: timedOut
          ? "Connection to Supabase timed out"
          : "Unable to reach Supabase",
      },
      503
    );
  }
}
