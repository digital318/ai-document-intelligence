import "server-only";

/** Overall confidence at or above this value is treated as processed. */
export const REVIEW_CONFIDENCE_THRESHOLD = 0.7;

export type AnalysisCompletionStatus = "processed" | "needs_review";

/**
 * Maps a successful structured-analysis confidence score to a document status.
 * Low confidence is a quality signal, not an API failure.
 */
export function documentStatusFromConfidence(
  confidenceScore: number,
): AnalysisCompletionStatus {
  return confidenceScore >= REVIEW_CONFIDENCE_THRESHOLD
    ? "processed"
    : "needs_review";
}
