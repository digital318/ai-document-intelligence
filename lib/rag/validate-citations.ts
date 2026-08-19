import "server-only";

import { MAX_EVIDENCE_EXCERPT_LENGTH } from "@/lib/rag/config";

export interface ModelCitation {
  source_id: string;
  evidence_excerpt: string;
}

export interface ValidatedCitation {
  sourceId: string;
  evidenceExcerpt: string;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/[\s\u00a0\u2000-\u200b\u2028\u2029]+/g, " ").trim();
}

function excerptContainedInSource(excerpt: string, source: string): boolean {
  if (excerpt.length === 0 || source.length === 0) return false;
  if (source.includes(excerpt)) return true;
  const normalizedExcerpt = normalizeWhitespace(excerpt);
  const normalizedSource = normalizeWhitespace(source);
  if (normalizedExcerpt.length === 0) return false;
  return normalizedSource.includes(normalizedExcerpt);
}

/**
 * Keeps only citations whose source IDs were assigned for this retrieval and
 * whose evidence excerpts actually appear in that source's content.
 *
 * Invalid IDs and unverified excerpts are discarded. Duplicate source IDs
 * keep the first verified excerpt.
 */
export function validateModelCitations(
  citations: ModelCitation[],
  sourceContentById: Map<string, string>,
): ValidatedCitation[] {
  const seen = new Set<string>();
  const valid: ValidatedCitation[] = [];

  for (const citation of citations) {
    const sourceId = citation.source_id.trim();
    if (!sourceContentById.has(sourceId) || seen.has(sourceId)) continue;

    const excerpt = citation.evidence_excerpt.trim();
    if (excerpt.length === 0 || excerpt.length > MAX_EVIDENCE_EXCERPT_LENGTH) {
      continue;
    }

    const sourceContent = sourceContentById.get(sourceId);
    if (!sourceContent || !excerptContainedInSource(excerpt, sourceContent)) {
      continue;
    }

    seen.add(sourceId);
    valid.push({
      sourceId,
      evidenceExcerpt: normalizeWhitespace(excerpt),
    });
  }

  return valid;
}
