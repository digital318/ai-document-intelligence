-- ============================================================================
-- Phase 3 — Backend Foundation
-- ============================================================================
-- Creates the core schema for the AI Document Intelligence app:
--   * public.profiles                  (one row per auth user)
--   * public.documents                 (uploaded file metadata)
--   * public.document_processing_jobs  (async processing queue)
--   * public.document_results          (AI analysis output, one per document)
-- Plus:
--   * Row Level Security policies scoped to the authenticated role
--   * A private "documents" Storage bucket with per-user path policies
--
-- Notes:
--   * Chat, embeddings, and document_chunks tables are intentionally deferred.
--   * The migration is written to be rerunnable where reasonably safe
--     (IF NOT EXISTS, CREATE OR REPLACE, DROP ... IF EXISTS).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Reusable updated_at trigger function
-- ----------------------------------------------------------------------------
-- Keeps updated_at accurate on every UPDATE without relying on app code.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger function: sets updated_at to now() before each row update.';

-- ----------------------------------------------------------------------------
-- 2. profiles — one row per auth user
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  display_name      text,
  organization_name text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.profiles is
  'Per-user profile data. id mirrors auth.users.id.';

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. Auto-create a profile when a new auth user registers
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER with an empty search_path so the function runs with the
-- owner's privileges and only fully qualified object references.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates a public.profiles row after a new auth.users row is inserted.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 4. documents — uploaded file metadata
-- ----------------------------------------------------------------------------
create table if not exists public.documents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  file_name       text not null,
  storage_path    text not null unique,
  mime_type       text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  document_type   text,
  status          text not null default 'uploaded'
                    check (status in (
                      'uploaded',
                      'queued',
                      'processing',
                      'processed',
                      'needs_review',
                      'failed'
                    )),
  page_count      integer check (page_count is null or page_count > 0),
  checksum        text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.documents is
  'Uploaded document metadata. Binary content lives in the "documents" storage bucket.';
comment on column public.documents.storage_path is
  'Path in the documents bucket: <user-id>/<document-id>/<filename>.';

create index if not exists documents_user_id_idx    on public.documents (user_id);
create index if not exists documents_status_idx     on public.documents (status);
create index if not exists documents_created_at_idx on public.documents (created_at desc);

drop trigger if exists set_documents_updated_at on public.documents;
create trigger set_documents_updated_at
  before update on public.documents
  for each row
  execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. document_processing_jobs — async processing queue
-- ----------------------------------------------------------------------------
create table if not exists public.document_processing_jobs (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.documents (id) on delete cascade,
  job_type      text not null default 'initial_analysis',
  status        text not null default 'queued'
                  check (status in ('queued', 'running', 'completed', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  error_message text,
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.document_processing_jobs is
  'Queue of AI processing jobs; each job belongs to a document.';

create index if not exists document_processing_jobs_document_id_idx
  on public.document_processing_jobs (document_id);
create index if not exists document_processing_jobs_status_idx
  on public.document_processing_jobs (status);
create index if not exists document_processing_jobs_created_at_idx
  on public.document_processing_jobs (created_at desc);

drop trigger if exists set_document_processing_jobs_updated_at
  on public.document_processing_jobs;
create trigger set_document_processing_jobs_updated_at
  before update on public.document_processing_jobs
  for each row
  execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 6. document_results — AI analysis output (one row per document)
-- ----------------------------------------------------------------------------
create table if not exists public.document_results (
  id                     uuid primary key default gen_random_uuid(),
  document_id            uuid not null unique references public.documents (id) on delete cascade,
  detected_document_type text,
  summary                text,
  extracted_fields       jsonb not null default '{}'::jsonb,
  confidence_score       numeric(5,4)
                           check (
                             confidence_score is null
                             or (confidence_score >= 0 and confidence_score <= 1)
                           ),
  model_name             text,
  prompt_version         text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.document_results is
  'AI analysis output for a document; unique per document.';

create index if not exists document_results_document_id_idx
  on public.document_results (document_id);

drop trigger if exists set_document_results_updated_at on public.document_results;
create trigger set_document_results_updated_at
  before update on public.document_results
  for each row
  execute function public.set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- All access requires authentication; every policy is scoped to the
-- authenticated role and to rows owned (directly or via the parent document)
-- by auth.uid(). No anonymous or public policies are created.

alter table public.profiles                 enable row level security;
alter table public.documents                enable row level security;
alter table public.document_processing_jobs enable row level security;
alter table public.document_results         enable row level security;

-- ---------------------------------------------------------------------------
-- profiles policies: users manage only their own profile row
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- documents policies: users manage only their own documents
-- ---------------------------------------------------------------------------
drop policy if exists "documents_select_own" on public.documents;
create policy "documents_select_own"
  on public.documents
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "documents_insert_own" on public.documents;
create policy "documents_insert_own"
  on public.documents
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "documents_update_own" on public.documents;
create policy "documents_update_own"
  on public.documents
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "documents_delete_own" on public.documents;
create policy "documents_delete_own"
  on public.documents
  for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- document_processing_jobs policies: access via owning document
-- ---------------------------------------------------------------------------
drop policy if exists "jobs_select_own_document" on public.document_processing_jobs;
create policy "jobs_select_own_document"
  on public.document_processing_jobs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_processing_jobs.document_id
        and d.user_id = auth.uid()
    )
  );

drop policy if exists "jobs_insert_own_document" on public.document_processing_jobs;
create policy "jobs_insert_own_document"
  on public.document_processing_jobs
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.documents d
      where d.id = document_processing_jobs.document_id
        and d.user_id = auth.uid()
    )
  );

drop policy if exists "jobs_update_own_document" on public.document_processing_jobs;
create policy "jobs_update_own_document"
  on public.document_processing_jobs
  for update
  to authenticated
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_processing_jobs.document_id
        and d.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.documents d
      where d.id = document_processing_jobs.document_id
        and d.user_id = auth.uid()
    )
  );

drop policy if exists "jobs_delete_own_document" on public.document_processing_jobs;
create policy "jobs_delete_own_document"
  on public.document_processing_jobs
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_processing_jobs.document_id
        and d.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- document_results policies: access via owning document
-- ---------------------------------------------------------------------------
drop policy if exists "results_select_own_document" on public.document_results;
create policy "results_select_own_document"
  on public.document_results
  for select
  to authenticated
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_results.document_id
        and d.user_id = auth.uid()
    )
  );

drop policy if exists "results_insert_own_document" on public.document_results;
create policy "results_insert_own_document"
  on public.document_results
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.documents d
      where d.id = document_results.document_id
        and d.user_id = auth.uid()
    )
  );

drop policy if exists "results_update_own_document" on public.document_results;
create policy "results_update_own_document"
  on public.document_results
  for update
  to authenticated
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_results.document_id
        and d.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.documents d
      where d.id = document_results.document_id
        and d.user_id = auth.uid()
    )
  );

drop policy if exists "results_delete_own_document" on public.document_results;
create policy "results_delete_own_document"
  on public.document_results
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_results.document_id
        and d.user_id = auth.uid()
    )
  );

-- ============================================================================
-- STORAGE — private "documents" bucket
-- ============================================================================
-- Upsert the bucket configuration so this migration is rerunnable.
-- Configuring storage.buckets via SQL is the supported approach for
-- declaring buckets in migrations; object rows are never touched directly.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  26214400, -- 25 MiB
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do update set
  name               = excluded.name,
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- storage.objects policies for the documents bucket
-- ---------------------------------------------------------------------------
-- Required object path convention: <user-id>/<document-id>/<filename>
-- Authenticated users may only touch objects whose first path folder is
-- their own user id.

drop policy if exists "documents_bucket_insert_own_folder" on storage.objects;
create policy "documents_bucket_insert_own_folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "documents_bucket_select_own_folder" on storage.objects;
create policy "documents_bucket_select_own_folder"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "documents_bucket_update_own_folder" on storage.objects;
create policy "documents_bucket_update_own_folder"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "documents_bucket_delete_own_folder" on storage.objects;
create policy "documents_bucket_delete_own_folder"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- End of Phase 3 backend foundation migration.
-- ============================================================================
