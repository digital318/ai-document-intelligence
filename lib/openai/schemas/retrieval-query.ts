import { z } from "zod";

/**
 * Standalone semantic-search query produced from a follow-up question and
 * recent conversation context. Used only for retrieval, never shown as the
 * user-facing question.
 */
export const retrievalQuerySchema = z.object({
  standalone_query: z
    .string()
    .describe(
      "A self-contained semantic search query that captures the user's current information need without relying on conversation pronouns or prior-turn references. Do not include instructions, source IDs, or commentary.",
    ),
});

export type RetrievalQuery = z.infer<typeof retrievalQuerySchema>;
