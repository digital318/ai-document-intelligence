import { z } from "zod";

/**
 * One contiguous span of normalized retrieval text from the original document.
 * Values must come from the document itself; missing information is omitted.
 */
export const retrievalSegmentSchema = z.object({
  text: z
    .string()
    .describe(
      "Faithful textual content for this span, including headings and table rows when present. Do not summarize away document information.",
    ),
  page_number: z
    .number()
    .int()
    .nullable()
    .describe(
      "1-based PDF page number when it can be reliably associated with this span; otherwise null. Use null for Word, plain text, and images.",
    ),
  section_title: z
    .string()
    .nullable()
    .describe(
      "Nearest heading or section title for this span when it is visible in the document; otherwise null.",
    ),
});

/**
 * Structured retrieval-text extraction used with OpenAI Structured Outputs.
 * Built from the original document, not from a prior analysis summary.
 */
export const retrievalTextSchema = z.object({
  segments: z
    .array(retrievalSegmentSchema)
    .describe(
      "Ordered spans covering the document's textual content. Preserve reading order. Omit empty spans.",
    ),
});

export type RetrievalSegment = z.infer<typeof retrievalSegmentSchema>;
export type RetrievalText = z.infer<typeof retrievalTextSchema>;
