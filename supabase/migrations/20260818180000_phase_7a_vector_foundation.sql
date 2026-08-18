-- ============================================================================
-- Phase 7A — Document Chunking and Vector Embeddings
-- ============================================================================
-- Creates the private vector-index foundation for later Phase 7 Q&A:
--   * pgvector in the extensions schema
--   * public.document_chunks          (1536-d embeddings, HNSW cosine)
--   * documents.embedding_status      (separate from analysis status)
--   * one-active-embedding-job guard
--   * claim_document_embedding_index() SECURITY INVOKER helper
--
-- Security:
--   * RLS is enabled on document_chunks; policies are authenticated-only.
--   * Access is via EXISTS on public.documents (user_id = auth.uid()).
--   * No anonymous/public policies. No SECURITY DEFINER.
--   * Do not apply this migration automatically from the app.
--
-- Natural-language Q&A and semantic-search UI are not part of this phase.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. pgvector
-- ----------------------------------------------------------------------------
create extension if not exists vector
  with schema extensions;

-- ----------------------------------------------------------------------------
-- 2. Indexing state on public.documents
--    Separate from documents.status so a document can be processed and
--    indexed (or not) at the same time.
-- ----------------------------------------------------------------------------
alter table public.documents
  add column if not exists embedding_status text not null default 'not_indexed',
  add column if not exists embedding_model text,
  add column if not exists embedding_version text,
  add column if not exists indexed_at timestamptz;

comment on column public.documents.embedding_status is
  'Vector-index state. Independent of documents.status (AI analysis).';
comment on column public.documents.embedding_model is
  'Embedding model used for the current vector index, when indexed.';
comment on column public.documents.embedding_version is
  'Embedding/chunk schema version for the current vector index, when indexed.';
comment on column public.documents.indexed_at is
  'Timestamp of the last successful vector index for this document.';

alter table public.documents
  drop constraint if exists documents_embedding_status_check,
  add constraint documents_embedding_status_check
    check (embedding_status in (
      'not_indexed',
      'indexing',
      'indexed',
      'failed'
    ));

-- ----------------------------------------------------------------------------
-- 3. document_chunks
-- ----------------------------------------------------------------------------
create table if not exists public.document_chunks (
  id                uuid primary key default gen_random_uuid(),
  document_id       uuid not null references public.documents (id) on delete cascade,
  chunk_index       integer not null check (chunk_index >= 0),
  content           text not null check (length(trim(content)) > 0),
  page_number       integer check (page_number is null or page_number > 0),
  section_title     text,
  embedding         extensions.vector(1536) not null,
  embedding_model   text not null,
  embedding_version text not null default 'v1',
  created_at        timestamptz not null default now(),
  unique (document_id, embedding_version, chunk_index)
);

comment on table public.document_chunks is
  'Private retrieval chunks and 1536-dimensional embeddings for owned documents. Deleted with the parent document.';
comment on column public.document_chunks.embedding is
  '1536-dimensional embedding vector. Never exposed to the browser.';
comment on column public.document_chunks.embedding_version is
  'Chunk/embedding schema version. Re-index upserts the current version then removes stale indexes.';

create index if not exists document_chunks_document_id_idx
  on public.document_chunks (document_id);

-- HNSW cosine index for later semantic retrieval. IVFFlat is not used.
-- vector_cosine_ops lives with the vector extension in `extensions`.
set search_path = public, extensions;

create index if not exists document_chunks_embedding_hnsw_idx
  on public.document_chunks
  using hnsw (embedding vector_cosine_ops);

-- ----------------------------------------------------------------------------
-- 4. One active embedding job per document
--    Does not affect initial_analysis (or other) jobs.
-- ----------------------------------------------------------------------------
create unique index if not exists document_processing_jobs_one_active_embedding_idx
  on public.document_processing_jobs (document_id)
  where job_type = 'embedding_index'
    and status in ('queued', 'running');

comment on index public.document_processing_jobs_one_active_embedding_idx is
  'At most one queued or running embedding_index job per document.';

-- ----------------------------------------------------------------------------
-- 5. document_chunks RLS — authenticated owners only
-- ----------------------------------------------------------------------------
alter table public.document_chunks enable row level security;

drop policy if exists "chunks_select_own_document" on public.document_chunks;
create policy "chunks_select_own_document"
  on public.document_chunks
  for select
  to authenticated
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_chunks.document_id
        and d.user_id = auth.uid()
    )
  );

drop policy if exists "chunks_insert_own_document" on public.document_chunks;
create policy "chunks_insert_own_document"
  on public.document_chunks
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.documents d
      where d.id = document_chunks.document_id
        and d.user_id = auth.uid()
    )
  );

drop policy if exists "chunks_update_own_document" on public.document_chunks;
create policy "chunks_update_own_document"
  on public.document_chunks
  for update
  to authenticated
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_chunks.document_id
        and d.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.documents d
      where d.id = document_chunks.document_id
        and d.user_id = auth.uid()
    )
  );

drop policy if exists "chunks_delete_own_document" on public.document_chunks;
create policy "chunks_delete_own_document"
  on public.document_chunks
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_chunks.document_id
        and d.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 6. Atomic embedding-index claim
--    First concurrent caller inserts a running embedding_index job and sets
--    embedding_status = indexing. The second receives NULL.
--    A stuck indexing row with no active job can be claimed again.
--    documents.status is never changed.
-- ----------------------------------------------------------------------------
drop function if exists public.claim_document_embedding_index(uuid);

create function public.claim_document_embedding_index(p_document_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_claimed_id uuid;
  v_job_id uuid;
begin
  select d.id
  into v_claimed_id
  from public.documents as d
  where d.id = p_document_id
    and d.user_id = auth.uid()
    and d.status in ('processed', 'needs_review')
    and (
      d.embedding_status in ('not_indexed', 'indexed', 'failed')
      or (
        d.embedding_status = 'indexing'
        and not exists (
          select 1
          from public.document_processing_jobs as j
          where j.document_id = d.id
            and j.job_type = 'embedding_index'
            and j.status in ('queued', 'running')
        )
      )
    )
  for update;

  if v_claimed_id is null then
    return null;
  end if;

  insert into public.document_processing_jobs (
    document_id,
    job_type,
    status,
    started_at
  )
  values (
    v_claimed_id,
    'embedding_index',
    'running',
    now()
  )
  returning id into v_job_id;

  update public.documents as d
  set embedding_status = 'indexing'
  where d.id = v_claimed_id;

  return v_job_id;
end;
$$;

comment on function public.claim_document_embedding_index(uuid) is
  'Atomically claims an owned analyzed document for vector indexing and inserts a running embedding_index job. Returns the job UUID, or NULL when the document cannot be claimed. SECURITY INVOKER; RLS still applies. Does not change documents.status.';

revoke all on function public.claim_document_embedding_index(uuid) from public;
revoke all on function public.claim_document_embedding_index(uuid) from anon;
grant execute on function public.claim_document_embedding_index(uuid) to authenticated;

-- ============================================================================
-- End of Phase 7A vector foundation migration.
-- ============================================================================
