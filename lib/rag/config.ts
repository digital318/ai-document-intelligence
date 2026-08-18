/**
 * Phase 7B retrieval constants.
 *
 * These are server-controlled. Clients cannot supply match count or
 * similarity threshold. Values are project tuning knobs, not secrets.
 */

/** Number of chunks returned for a document-scoped semantic search. */
export const RAG_MATCH_COUNT = 5;

/**
 * Minimum cosine similarity (1 - cosine distance) for a chunk to be
 * returned. 0.35 is an initial project tuning value, not a universal
 * semantic-search threshold.
 */
export const RAG_SIMILARITY_THRESHOLD = 0.35;

/** Maximum accepted length of a trimmed search query. */
export const MAX_SEARCH_QUERY_LENGTH = 1000;

/** Minimum accepted length of a trimmed search query. */
export const MIN_SEARCH_QUERY_LENGTH = 3;
