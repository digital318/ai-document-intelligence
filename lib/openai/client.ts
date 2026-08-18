import "server-only";

import OpenAI from "openai";

const DEFAULT_DOCUMENT_MODEL = "gpt-5.6-terra";
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const OPENAI_MAX_RETRIES = 2;

let client: OpenAI | null = null;

/**
 * Reads OPENAI_REQUEST_TIMEOUT_MS when it is a positive integer.
 * Invalid or missing values fall back to 120000 milliseconds.
 */
export function getOpenAIRequestTimeoutMs(): number {
  const raw = process.env.OPENAI_REQUEST_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_REQUEST_TIMEOUT_MS;

  if (!/^\d+$/.test(raw)) {
    console.error(
      "[openai] Invalid OPENAI_REQUEST_TIMEOUT_MS; using default timeout",
    );
    return DEFAULT_REQUEST_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    console.error(
      "[openai] Invalid OPENAI_REQUEST_TIMEOUT_MS; using default timeout",
    );
    return DEFAULT_REQUEST_TIMEOUT_MS;
  }

  return parsed;
}

/**
 * Returns a reusable server-only OpenAI client.
 *
 * The API key is read from OPENAI_API_KEY and is never sent to the browser.
 * The key is validated on first use so builds without the secret still succeed.
 *
 * Retries are limited to the official SDK (maxRetries: 2). There is no
 * additional application-level retry loop around OpenAI calls.
 */
export function getOpenAIClient(): OpenAI {
  if (client) return client;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing environment variable: OPENAI_API_KEY. " +
        "Add it to your .env.local file (see .env.example).",
    );
  }

  client = new OpenAI({
    apiKey,
    maxRetries: OPENAI_MAX_RETRIES,
    timeout: getOpenAIRequestTimeoutMs(),
  });
  return client;
}

/**
 * Model used for document analysis.
 * Override with OPENAI_DOCUMENT_MODEL; otherwise gpt-5.6-terra.
 */
export function getDocumentModel(): string {
  const configured = process.env.OPENAI_DOCUMENT_MODEL?.trim();
  return configured && configured.length > 0
    ? configured
    : DEFAULT_DOCUMENT_MODEL;
}
