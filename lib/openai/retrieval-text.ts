import "server-only";

import { zodTextFormat } from "openai/helpers/zod";
import type { OpenAI } from "openai";
import { getDocumentModel } from "@/lib/openai/client";
import { ProcessingFailure } from "@/lib/openai/errors";
import type { PreparedOpenAIDocumentInput } from "@/lib/openai/document-input";
import {
  RETRIEVAL_TEXT_INSTRUCTIONS,
  RETRIEVAL_TEXT_USER_MESSAGE,
  RETRIEVAL_TEXT_VERSION,
} from "@/lib/openai/prompts/retrieval-text";
import {
  retrievalTextSchema,
  type RetrievalSegment,
} from "@/lib/openai/schemas/retrieval-text";
import { toNonNegativeInt } from "@/lib/format";

export { RETRIEVAL_TEXT_VERSION };
export type { RetrievalSegment };

export interface RetrievalTextUsage {
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
}

export interface RetrievalTextExtraction {
  segments: RetrievalSegment[];
  openaiRequestId: string | null;
  usage: RetrievalTextUsage;
}

function readRequestId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const requestId = (value as { _request_id?: unknown })._request_id;
  if (typeof requestId === "string" && requestId.trim().length > 0) {
    return requestId.trim();
  }
  return null;
}

function readUsageTokens(usage: unknown): RetrievalTextUsage {
  if (!usage || typeof usage !== "object") {
    return { input_tokens: null, output_tokens: null, total_tokens: null };
  }
  const record = usage as Record<string, unknown>;
  return {
    input_tokens: toNonNegativeInt(record.input_tokens),
    output_tokens: toNonNegativeInt(record.output_tokens),
    total_tokens: toNonNegativeInt(record.total_tokens),
  };
}

function normalizePageNumber(value: number | null): number | null {
  if (value == null || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

function normalizeSectionTitle(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Builds normalized retrieval segments from the original private document.
 * Uses the configured document model and Structured Outputs. Results are not
 * returned to the browser.
 */
export async function extractRetrievalText(params: {
  openai: OpenAI;
  preparedInput: PreparedOpenAIDocumentInput;
  requestId: string;
  modelName?: string;
}): Promise<RetrievalTextExtraction> {
  const modelName = params.modelName ?? getDocumentModel();

  const response = await params.openai.responses.parse(
    {
      model: modelName,
      store: false,
      instructions: RETRIEVAL_TEXT_INSTRUCTIONS,
      input: [
        {
          role: "user",
          content: [
            params.preparedInput.contentPart,
            {
              type: "input_text",
              text: RETRIEVAL_TEXT_USER_MESSAGE,
            },
          ],
        },
      ],
      text: {
        format: zodTextFormat(retrievalTextSchema, "retrieval_text"),
      },
    },
    {
      headers: {
        "X-Client-Request-Id": params.requestId,
      },
    },
  );

  const parsed = response.output_parsed;
  if (!parsed) {
    throw new ProcessingFailure(
      "structured_output",
      "Structured retrieval text missing",
    );
  }

  const segments: RetrievalSegment[] = parsed.segments
    .map((segment) => ({
      text: segment.text,
      page_number: normalizePageNumber(segment.page_number),
      section_title: normalizeSectionTitle(segment.section_title),
    }))
    .filter((segment) => segment.text.trim().length > 0);

  if (segments.length === 0) {
    throw new ProcessingFailure(
      "empty_retrieval",
      "No retrieval text was extracted",
    );
  }

  return {
    segments,
    openaiRequestId: readRequestId(response),
    usage: readUsageTokens(response.usage),
  };
}
