-- ============================================================================
-- Phase 6D — AI Processing Hardening, Quality Controls, and Observability
-- ============================================================================
-- Extends public.document_processing_jobs with operational telemetry and
-- adds public.claim_document_processing() so two concurrent analysis
-- requests cannot both start for the same document.
--
-- Security:
--   * RLS remains enabled; existing policies are not dropped or replaced.
--   * claim_document_processing is SECURITY INVOKER and uses auth.uid().
--   * EXECUTE is revoked from PUBLIC and granted only to authenticated.
--
-- Do not store API keys, tokens, raw document content, temporary OpenAI
-- file ids, cookies, or Authorization headers.
--
-- Do not apply this migration automatically from the app. Apply it through
-- the project's usual Supabase migration workflow.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Telemetry columns on document_processing_jobs
-- ----------------------------------------------------------------------------
alter table public.document_processing_jobs
  add column if not exists model_name text,
  add column if not exists openai_request_id text,
  add column if not exists input_tokens bigint,
  add column if not exists output_tokens bigint,
  add column if not exists total_tokens bigint,
  add column if not exists processing_duration_ms bigint,
  add column if not exists failure_code text;

comment on column public.document_processing_jobs.model_name is
  'Configured OpenAI model used for this analysis attempt. Operational telemetry only.';

comment on column public.document_processing_jobs.openai_request_id is
  'OpenAI X-Request-ID captured after a successful Responses API call. Operational troubleshooting metadata; never shown on public document pages.';

comment on column public.document_processing_jobs.input_tokens is
  'Prompt/input token count from the Responses API usage object, when available.';

comment on column public.document_processing_jobs.output_tokens is
  'Completion/output token count from the Responses API usage object, when available.';

comment on column public.document_processing_jobs.total_tokens is
  'Total token count from the Responses API usage object, when available.';

comment on column public.document_processing_jobs.processing_duration_ms is
  'Server-side duration of this processing attempt in milliseconds, measured after the document is claimed.';

comment on column public.document_processing_jobs.failure_code is
  'Machine-readable failure category for failed attempts (for example openai_rate_limit). Never stores credentials, raw provider bodies, or document content.';

alter table public.document_processing_jobs
  drop constraint if exists document_processing_jobs_input_tokens_nonnegative,
  add constraint document_processing_jobs_input_tokens_nonnegative
    check (input_tokens is null or input_tokens >= 0);

alter table public.document_processing_jobs
  drop constraint if exists document_processing_jobs_output_tokens_nonnegative,
  add constraint document_processing_jobs_output_tokens_nonnegative
    check (output_tokens is null or output_tokens >= 0);

alter table public.document_processing_jobs
  drop constraint if exists document_processing_jobs_total_tokens_nonnegative,
  add constraint document_processing_jobs_total_tokens_nonnegative
    check (total_tokens is null or total_tokens >= 0);

alter table public.document_processing_jobs
  drop constraint if exists document_processing_jobs_processing_duration_ms_nonnegative,
  add constraint document_processing_jobs_processing_duration_ms_nonnegative
    check (processing_duration_ms is null or processing_duration_ms >= 0);

-- RLS stays enabled. Existing policies are left unchanged.
alter table public.document_processing_jobs enable row level security;

-- ----------------------------------------------------------------------------
-- 2. Atomic processing claim
-- ----------------------------------------------------------------------------
-- First concurrent caller: updates the owned document to queued (only from a
-- stable status) and inserts a queued job, returning the job UUID.
-- Second concurrent caller: finds no claimable row and receives NULL.
-- The update and insert share the function's transaction so a failed insert
-- cannot leave the document stuck in queued.

drop function if exists public.claim_document_processing(uuid);

create function public.claim_document_processing(p_document_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_claimed_id uuid;
  v_job_id uuid;
begin
  update public.documents as d
  set status = 'queued'
  where d.id = p_document_id
    and d.user_id = auth.uid()
    and d.status in ('uploaded', 'failed', 'processed', 'needs_review')
  returning d.id into v_claimed_id;

  if v_claimed_id is null then
    return null;
  end if;

  insert into public.document_processing_jobs (
    document_id,
    job_type,
    status
  )
  values (
    v_claimed_id,
    'initial_analysis',
    'queued'
  )
  returning id into v_job_id;

  return v_job_id;
end;
$$;

comment on function public.claim_document_processing(uuid) is
  'Atomically claims an owned document for analysis and inserts a queued processing job. Returns the job UUID, or NULL when the document cannot be claimed. SECURITY INVOKER; RLS still applies.';

revoke all on function public.claim_document_processing(uuid) from public;
revoke all on function public.claim_document_processing(uuid) from anon;
grant execute on function public.claim_document_processing(uuid) to authenticated;

-- ============================================================================
-- End of Phase 6D processing hardening migration.
-- ============================================================================
