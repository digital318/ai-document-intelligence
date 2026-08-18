import "server-only";

import type { OpenAI } from "openai";
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_VERSION,
  getEmbeddingModel,
} from "@/lib/openai/client";
import { ProcessingFailure } from "@/lib/openai/errors";
import { toNonNegativeInt } from "@/lib/format";

export { EMBEDDING_DIMENSIONS, EMBEDDING_VERSION, getEmbeddingModel };

const EMBEDDING_BATCH_SIZE = 64;

export interface EmbeddingUsage {
  input_tokens: number | null;
  output_tokens: null;
  total_tokens: number | null;
}

export interface EmbedTextsResult {
  embeddings: number[][];
  model: string;
  usage: EmbeddingUsage;
}

function addNullable(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  return (a ?? 0) + (b ?? 0);
}

function emptyUsage(): EmbeddingUsage {
  return { input_tokens: null, output_tokens: null, total_tokens: null };
}

function readEmbeddingUsage(usage: unknown): EmbeddingUsage {
  if (!usage || typeof usage !== "object") return emptyUsage();
  const record = usage as Record<string, unknown>;
  const promptTokens = toNonNegativeInt(record.prompt_tokens);
  const inputTokens = toNonNegativeInt(record.input_tokens) ?? promptTokens;
  const totalTokens = toNonNegativeInt(record.total_tokens);
  return {
    input_tokens: inputTokens,
    output_tokens: null,
    total_tokens: totalTokens,
  };
}

function mergeUsage(current: EmbeddingUsage, next: EmbeddingUsage): EmbeddingUsage {
  return {
    input_tokens: addNullable(current.input_tokens, next.input_tokens),
    output_tokens: null,
    total_tokens: addNullable(current.total_tokens, next.total_tokens),
  };
}

function assertFiniteVector(values: number[]): void {
  if (values.length !== EMBEDDING_DIMENSIONS) {
    throw new ProcessingFailure(
      "embedding_generation",
      "Unexpected embedding dimensions",
    );
  }
  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new ProcessingFailure(
        "embedding_generation",
        "Invalid embedding values",
      );
    }
  }
}

/**
 * Serializes a 1536-d float embedding as a pgvector literal.
 * The numeric values are never logged.
 */
export function toVectorLiteral(embedding: number[]): string {
  assertFiniteVector(embedding);
  return `[${embedding.join(",")}]`;
}

/**
 * Embeds chunk strings with the configured embedding model.
 * Preserves input order: result N matches input N. Empty strings are rejected.
 */
export async function embedTexts(params: {
  openai: OpenAI;
  texts: string[];
  requestId: string;
  modelName?: string;
}): Promise<EmbedTextsResult> {
  if (params.texts.length === 0) {
    throw new ProcessingFailure("embedding_generation", "No texts to embed");
  }

  for (const text of params.texts) {
    if (text.trim().length === 0) {
      throw new ProcessingFailure(
        "embedding_generation",
        "Empty embedding input",
      );
    }
  }

  const modelName = params.modelName ?? getEmbeddingModel();
  const embeddings: number[][] = [];
  let usage = emptyUsage();

  for (let offset = 0; offset < params.texts.length; offset += EMBEDDING_BATCH_SIZE) {
    const batch = params.texts.slice(offset, offset + EMBEDDING_BATCH_SIZE);
    const response = await params.openai.embeddings.create(
      {
        model: modelName,
        input: batch,
        dimensions: EMBEDDING_DIMENSIONS,
        encoding_format: "float",
      },
      {
        headers: {
          "X-Client-Request-Id": params.requestId,
        },
      },
    );

    const ordered = [...response.data].sort((a, b) => a.index - b.index);
    if (ordered.length !== batch.length) {
      throw new ProcessingFailure(
        "embedding_generation",
        "Embedding result count mismatch",
      );
    }

    for (let i = 0; i < ordered.length; i += 1) {
      if (ordered[i].index !== i) {
        throw new ProcessingFailure(
          "embedding_generation",
          "Embedding result order mismatch",
        );
      }
      const vector = ordered[i].embedding;
      if (!Array.isArray(vector)) {
        throw new ProcessingFailure(
          "embedding_generation",
          "Unexpected embedding encoding",
        );
      }
      assertFiniteVector(vector);
      embeddings.push(vector);
    }

    usage = mergeUsage(usage, readEmbeddingUsage(response.usage));
  }

  if (embeddings.length !== params.texts.length) {
    throw new ProcessingFailure(
      "embedding_generation",
      "Embedding result count mismatch",
    );
  }

  return { embeddings, model: modelName, usage };
}
