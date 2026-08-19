/**
 * Phase 7 retrieval and conversation constants.
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

/** Maximum prior Q&A turns accepted on the Ask API. */
export const MAX_CONVERSATION_HISTORY_TURNS = 6;

/** Maximum visible Q&A turns retained in the document-page session. */
export const MAX_VISIBLE_CONVERSATION_TURNS = 10;

/** Maximum trimmed question length in a history turn. */
export const MAX_HISTORY_QUESTION_LENGTH = 1000;

/** Maximum trimmed answer length in a history turn. */
export const MAX_HISTORY_ANSWER_LENGTH = 2000;

/** Maximum combined size of all history questions and answers. */
export const MAX_HISTORY_COMBINED_CHARS = 8000;

/** Maximum length of a model-supplied evidence excerpt after trim. */
export const MAX_EVIDENCE_EXCERPT_LENGTH = 300;
