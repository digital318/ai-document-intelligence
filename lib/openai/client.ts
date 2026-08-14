import "server-only";

import OpenAI from "openai";

const DEFAULT_DOCUMENT_MODEL = "gpt-5.6-terra";

let client: OpenAI | null = null;

/**
 * Returns a reusable server-only OpenAI client.
 *
 * The API key is read from OPENAI_API_KEY and is never sent to the browser.
 * The key is validated on first use so builds without the secret still succeed.
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

  client = new OpenAI({ apiKey });
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
