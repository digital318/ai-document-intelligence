-- ============================================================================
-- Phase 7B — Secure Semantic Document Retrieval
-- ============================================================================
-- Adds public.match_document_chunks(), an authenticated, document-scoped
-- cosine-similarity search over private vector chunks.
--
-- Returns ranked chunks for one owned, version-compatible document:
--   * chunk_id, document_id, chunk_index, content
--   * page_number, section_title
--   * similarity = 1 - cosine_distance  (embedding <=> query)
--
-- Security:
--   * SECURITY INVOKER — runs as the calling role; does not bypass RLS.
--   * Explicit join requires documents.id = p_document_id and
--     documents.user_id = auth.uid().
--   * document_chunks RLS still applies (owner via parent documents row).
--   * Chunks must match the parent document's embedding_model and
--     embedding_version so stale or incompatible indexes are excluded.
--   * Embedding vectors are never returned.
--   * EXECUTE is revoked from PUBLIC and granted only to authenticated.
--   * No SECURITY DEFINER.
--
-- p_match_count is clamped to [1, 10]. Threshold and count are supplied by
-- the server; clients cannot set them.
--
-- Natural-language answer generation is not part of this phase.
--
-- Do not apply this migration automatically from the app. Apply it through
-- the project's usual Supabase migration workflow.
-- ============================================================================

drop function if exists public.match_document_chunks(uuid, extensions.vector, double precision, integer);

create or replace function public.match_document_chunks(
  p_document_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_threshold double precision,
  p_match_count integer
)
returns table (
  chunk_id uuid,
  document_id uuid,
  chunk_index integer,
  content text,
  page_number integer,
  section_title text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    ranked.chunk_id,
    ranked.document_id,
    ranked.chunk_index,
    ranked.content,
    ranked.page_number,
    ranked.section_title,
    ranked.similarity
  from (
    select
      c.id as chunk_id,
      c.document_id,
      c.chunk_index,
      c.content,
      c.page_number,
      c.section_title,
      1 - (c.embedding operator(extensions.<=>) p_query_embedding) as similarity
    from public.document_chunks as c
    inner join public.documents as d
      on d.id = c.document_id
    where d.id = p_document_id
      and d.user_id = auth.uid()
      and c.document_id = p_document_id
      and c.embedding_model = d.embedding_model
      and c.embedding_version = d.embedding_version
  ) as ranked
  where ranked.similarity >= p_match_threshold
  order by ranked.similarity desc
  limit greatest(1, least(p_match_count, 10));
$$;

comment on function public.match_document_chunks(uuid, extensions.vector, double precision, integer) is
  'Document-scoped cosine similarity search over owned chunks whose embedding_model and embedding_version match the parent document. SECURITY INVOKER; RLS still applies. Does not return embedding vectors.';

revoke all on function public.match_document_chunks(uuid, extensions.vector, double precision, integer) from public;
revoke all on function public.match_document_chunks(uuid, extensions.vector, double precision, integer) from anon;
grant execute on function public.match_document_chunks(uuid, extensions.vector, double precision, integer) to authenticated;

-- ============================================================================
-- End of Phase 7B semantic retrieval migration.
-- ============================================================================
