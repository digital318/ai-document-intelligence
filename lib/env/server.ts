import "server-only";

/**
 * Server-only environment validation. Never import this module from Client
 * Components. Never log environment-variable values.
 *
 * OPENAI_API_KEY must not be exposed via NEXT_PUBLIC_*.
 */

const DEFAULT_DOCUMENT_MODEL = "gpt-5.6-terra";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

export class MissingServerEnvironmentError extends Error {
  constructor(name: string, extra?: string) {
    super(
      extra
        ? `Missing environment variable: ${name}. ${extra}`
        : `Missing environment variable: ${name}.`,
    );
    this.name = "MissingServerEnvironmentError";
  }
}

function readOpenAIApiKey(): string | undefined {
  const value = process.env.OPENAI_API_KEY?.trim();
  return value && value.length > 0 ? value : undefined;
}

/**
 * Required for any OpenAI call. Validated on first use so builds without
 * the secret can still succeed.
 */
export function getOpenAIApiKey(): string {
  const apiKey = readOpenAIApiKey();
  if (!apiKey) {
    throw new MissingServerEnvironmentError(
      "OPENAI_API_KEY",
      "Add it to your .env.local file (see .env.example).",
    );
  }
  return apiKey;
}

/**
 * Model used for document analysis, retrieval-text extraction, and Q&A.
 * Override with OPENAI_DOCUMENT_MODEL; otherwise gpt-5.6-terra.
 */
export function getOpenAIDocumentModel(): string {
  const configured = process.env.OPENAI_DOCUMENT_MODEL?.trim();
  return configured && configured.length > 0
    ? configured
    : DEFAULT_DOCUMENT_MODEL;
}

/**
 * Model used for vector embeddings.
 * Override with OPENAI_EMBEDDING_MODEL; otherwise text-embedding-3-small.
 */
export function getOpenAIEmbeddingModel(): string {
  const configured = process.env.OPENAI_EMBEDDING_MODEL?.trim();
  return configured && configured.length > 0
    ? configured
    : DEFAULT_EMBEDDING_MODEL;
}

/**
 * Reads OPENAI_REQUEST_TIMEOUT_MS when it is a positive integer.
 * Invalid or missing values fall back to 120000 milliseconds.
 * The raw value is never logged.
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
 * Confirms required server secrets exist without returning or logging them.
 * Call from server request paths that need OpenAI; not from public health checks.
 */
export function assertOpenAIConfigured(): void {
  getOpenAIApiKey();
}
