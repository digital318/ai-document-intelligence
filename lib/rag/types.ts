/**
 * Normalized document-scoped retrieval types.
 * Embedding vectors and pgvector operators are not part of this surface.
 */

export interface DocumentSearchMatch {
  chunkId: string;
  chunkIndex: number;
  content: string;
  pageNumber: number | null;
  sectionTitle: string | null;
  similarity: number;
}

export interface DocumentSearchResult {
  documentId: string;
  query: string;
  matches: DocumentSearchMatch[];
}

/** Supporting evidence returned with a grounded document answer. */
export interface DocumentAnswerSource {
  sourceId: string;
  chunkIndex: number;
  pageNumber: number | null;
  sectionTitle: string | null;
  similarity: number;
  excerpt: string;
}

export interface DocumentAnswerResult {
  question: string;
  answer: string;
  supported: boolean;
  sources: DocumentAnswerSource[];
}

/**
 * One prior Q&A turn supplied by the browser for conversational follow-ups.
 * Untrusted user input. Does not include source ids, embeddings, or chunks.
 */
export interface ConversationTurn {
  question: string;
  answer: string;
}
