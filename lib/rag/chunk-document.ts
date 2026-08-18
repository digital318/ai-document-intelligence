import "server-only";

import type { RetrievalSegment } from "@/lib/openai/schemas/retrieval-text";

/** Target chunk size in characters (middle of the 3000–4000 range). */
const TARGET_CHUNK_CHARS = 3500;
const MIN_PREFERRED_CHARS = 3000;
const MAX_CHUNK_CHARS = 4000;
const OVERLAP_CHARS = 450;

export interface DocumentChunkDraft {
  chunk_index: number;
  content: string;
  page_number: number | null;
  section_title: string | null;
}

interface SegmentSpan {
  start: number;
  end: number;
  page_number: number | null;
  section_title: string | null;
}

/**
 * Collapses excessive whitespace without changing factual wording.
 */
export function normalizeRetrievalWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function lastIndexOfInRange(
  text: string,
  needle: string,
  start: number,
  end: number,
): number {
  const slice = text.slice(start, end);
  const index = slice.lastIndexOf(needle);
  return index === -1 ? -1 : start + index;
}

function lastMatchInRange(
  text: string,
  pattern: RegExp,
  start: number,
  end: number,
): number {
  const slice = text.slice(start, end);
  let last = -1;
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(slice)) !== null) {
    last = start + match.index + match[0].length;
    if (match[0].length === 0) matcher.lastIndex += 1;
  }
  return last;
}

/**
 * Chooses a split end index in [start, start+MAX], preferring paragraph,
 * then sentence, then word boundaries near the target size.
 */
function chooseChunkEnd(text: string, start: number): number {
  const remaining = text.length - start;
  if (remaining <= MAX_CHUNK_CHARS) return text.length;

  const minEnd = start + MIN_PREFERRED_CHARS;
  const targetEnd = start + TARGET_CHUNK_CHARS;
  const maxEnd = start + MAX_CHUNK_CHARS;

  const paragraph = lastIndexOfInRange(text, "\n\n", minEnd, maxEnd);
  if (paragraph !== -1) return paragraph;

  const line = lastIndexOfInRange(text, "\n", minEnd, maxEnd);
  if (line !== -1) return line;

  const sentence = lastMatchInRange(
    text,
    /[.!?]["')\]]*(?:\s|$)/,
    minEnd,
    maxEnd,
  );
  if (sentence !== -1) return sentence;

  const space = lastIndexOfInRange(text, " ", targetEnd - 200, maxEnd);
  if (space !== -1) return space + 1;

  return maxEnd;
}

function chooseOverlapStart(text: string, chunkStart: number, chunkEnd: number): number {
  const raw = Math.max(chunkStart + 1, chunkEnd - OVERLAP_CHARS);
  if (raw >= chunkEnd) return chunkEnd;

  const paragraph = text.indexOf("\n\n", raw);
  if (paragraph !== -1 && paragraph + 2 < chunkEnd) {
    return paragraph + 2;
  }

  const sentence = text.slice(raw, chunkEnd).search(/[.!?]\s+/);
  if (sentence !== -1) {
    const next = raw + sentence + 2;
    if (next < chunkEnd) return next;
  }

  const space = text.indexOf(" ", raw);
  if (space !== -1 && space + 1 < chunkEnd) return space + 1;

  return raw;
}

function metadataForRange(
  spans: SegmentSpan[],
  start: number,
  end: number,
): { page_number: number | null; section_title: string | null } {
  const overlapping = spans.filter((span) => span.start < end && span.end > start);
  if (overlapping.length === 0) {
    return { page_number: null, section_title: null };
  }

  const pages = new Set(
    overlapping
      .map((span) => span.page_number)
      .filter((page): page is number => page != null),
  );
  const page_number = pages.size === 1 ? [...pages][0] : null;

  const titleCoverage = new Map<string, number>();
  for (const span of overlapping) {
    if (!span.section_title) continue;
    const overlapStart = Math.max(start, span.start);
    const overlapEnd = Math.min(end, span.end);
    const coverage = Math.max(0, overlapEnd - overlapStart);
    titleCoverage.set(
      span.section_title,
      (titleCoverage.get(span.section_title) ?? 0) + coverage,
    );
  }

  let section_title: string | null = null;
  let bestCoverage = 0;
  for (const [title, coverage] of titleCoverage) {
    if (coverage > bestCoverage) {
      section_title = title;
      bestCoverage = coverage;
    }
  }

  return { page_number, section_title };
}

function joinNormalizedSegments(segments: RetrievalSegment[]): {
  text: string;
  spans: SegmentSpan[];
} {
  const spans: SegmentSpan[] = [];
  const parts: string[] = [];
  let cursor = 0;

  for (const segment of segments) {
    const text = normalizeRetrievalWhitespace(segment.text);
    if (!text) continue;

    if (parts.length > 0) {
      parts.push("\n\n");
      cursor += 2;
    }

    const start = cursor;
    parts.push(text);
    cursor += text.length;
    spans.push({
      start,
      end: cursor,
      page_number:
        segment.page_number != null && segment.page_number > 0
          ? segment.page_number
          : null,
      section_title: segment.section_title?.trim() || null,
    });
  }

  return { text: parts.join(""), spans };
}

/**
 * Builds deterministic, overlapping chunks from retrieval segments.
 * Chunk indexes start at 0. Empty chunks are never emitted.
 */
export function chunkDocument(segments: RetrievalSegment[]): DocumentChunkDraft[] {
  const { text, spans } = joinNormalizedSegments(segments);
  if (!text) return [];

  const drafts: DocumentChunkDraft[] = [];
  let start = 0;

  while (start < text.length) {
    const end = chooseChunkEnd(text, start);
    const content = text.slice(start, end).trim();

    if (content.length > 0) {
      const contentStart = text.indexOf(content, start);
      const contentEnd =
        contentStart === -1 ? end : contentStart + content.length;
      const metadata = metadataForRange(
        spans,
        contentStart === -1 ? start : contentStart,
        contentEnd,
      );

      drafts.push({
        chunk_index: drafts.length,
        content,
        page_number: metadata.page_number,
        section_title: metadata.section_title,
      });
    }

    if (end >= text.length) break;

    const nextStart = chooseOverlapStart(text, start, end);
    start = nextStart > start ? nextStart : end;
  }

  return drafts;
}
