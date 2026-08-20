import "server-only";

import OpenAI from "openai";
import {
  getOpenAIApiKey,
  getOpenAIDocumentModel,
  getOpenAIEmbeddingModel,
  getOpenAIRequestTimeoutMs,
} from "@/lib/env/server";

const OPENAI_MAX_RETRIES = 2;

let client: OpenAI | null = null;

export { getOpenAIRequestTimeoutMs } from "@/lib/env/server";

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

  client = new OpenAI({
    apiKey: getOpenAIApiKey(),
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
  return getOpenAIDocumentModel();
}

/** Output dimensionality requested from the embeddings API. */
export const EMBEDDING_DIMENSIONS = 1536;

/** Chunk/embedding schema version persisted on document_chunks. */
export const EMBEDDING_VERSION = "v1";

/**
 * Model used for vector embeddings.
 * Override with OPENAI_EMBEDDING_MODEL; otherwise text-embedding-3-small.
 */
export function getEmbeddingModel(): string {
  return getOpenAIEmbeddingModel();
}
