import { z } from "zod";

/**
 * One citation pointing at an application-assigned retrieved source ID,
 * with a short evidence excerpt copied from that source.
 */
export const documentAnswerCitationSchema = z.object({
  source_id: z
    .string()
    .describe(
      "Application-supplied source ID such as S1. Use only IDs provided with the retrieved sources. Never invent source IDs.",
    ),
  evidence_excerpt: z
    .string()
    .describe(
      "Short verbatim excerpt copied from that source that supports the answer. Approximately 300 characters or fewer. Do not invent, paraphrase, or combine text from multiple sources.",
    ),
});

/**
 * Structured grounded Q&A result used with OpenAI Structured Outputs.
 *
 * supported is true only when the supplied retrieval evidence supports the
 * answer. Do not include chain-of-thought or reasoning.
 */
export const documentAnswerSchema = z.object({
  answer: z
    .string()
    .describe(
      "Concise grounded answer to the current user question based only on the supplied document sources. If the evidence is insufficient, say so without inventing facts. Do not answer from conversation history alone.",
    ),
  supported: z
    .boolean()
    .describe(
      "True only when the supplied retrieval evidence supports the answer. False when the evidence is insufficient or conflicting without a resolvable fact.",
    ),
  citations: z
    .array(documentAnswerCitationSchema)
    .describe(
      "Supporting source IDs and verbatim evidence excerpts when supported is true; must be empty when supported is false. Include at least one valid supplied source ID when supported is true.",
    ),
});

export type DocumentAnswerCitation = z.infer<
  typeof documentAnswerCitationSchema
>;
export type DocumentAnswer = z.infer<typeof documentAnswerSchema>;
