import "server-only";

type LogLevel = "info" | "error";

type LogValue = string | number | boolean | null | undefined;

/**
 * Structured server log that only accepts an explicit allow-list of fields.
 * Callers must not pass questions, answers, document contents, embeddings,
 * prompts, tokens, cookies, API keys, or storage paths.
 */
export function logServerEvent(
  scope: string,
  level: LogLevel,
  event: string,
  details: Record<string, LogValue> = {},
) {
  const parts: Array<string | number | boolean> = [event];
  for (const [key, value] of Object.entries(details)) {
    if (value == null || value === "") continue;
    parts.push(`${key}=${value}`);
  }

  if (level === "error") {
    console.error(`[${scope}]`, ...parts);
  } else {
    console.info(`[${scope}]`, ...parts);
  }
}

/**
 * Extracts a provider/database error code or HTTP status only.
 * Does not return messages, bodies, or stack traces.
 */
export function readErrorCode(error: unknown): string | number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as { code?: unknown; status?: unknown };
  if (typeof record.code === "string" && record.code.trim().length > 0) {
    return record.code.trim();
  }
  if (typeof record.code === "number" && Number.isFinite(record.code)) {
    return record.code;
  }
  if (typeof record.status === "number" && Number.isFinite(record.status)) {
    return record.status;
  }
  if (typeof record.status === "string" && record.status.trim().length > 0) {
    return record.status.trim();
  }
  return undefined;
}
