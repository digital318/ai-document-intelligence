-- ============================================================================
-- Phase 5D — Dashboard Metrics
-- ============================================================================
-- Adds public.get_dashboard_metrics(), an authenticated, per-user aggregate
-- used by the live dashboard.
--
-- Returns exactly:
--   * total_documents         bigint  — documents owned by auth.uid()
--   * processed_documents     bigint  — those with status = 'processed'
--   * ai_requests_this_month  bigint  — processing jobs this calendar month
--   * storage_bytes           bigint  — sum of file_size_bytes for the user
--
-- Security:
--   * SECURITY INVOKER — runs as the calling role; does not bypass RLS.
--   * Identity is taken only from auth.uid(); the function has no arguments.
--   * Rows are also filtered with user_id = auth.uid() as defense in depth.
--   * EXECUTE is revoked from PUBLIC and granted only to authenticated.
--   * No document contents, storage_path, checksum, or other details leak.
--
-- Do not apply this migration automatically from the app. Apply it through
-- the project's usual Supabase migration workflow.
-- ============================================================================

-- Recreate so the return shape stays exact if this migration is reapplied.
drop function if exists public.get_dashboard_metrics();

create function public.get_dashboard_metrics()
returns table (
  total_documents bigint,
  processed_documents bigint,
  ai_requests_this_month bigint,
  storage_bytes bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (
      select count(*)
      from public.documents as d
      where d.user_id = auth.uid()
    ) as total_documents,
    (
      select count(*)
      from public.documents as d
      where d.user_id = auth.uid()
        and d.status = 'processed'
    ) as processed_documents,
    (
      -- A processing job is treated as one AI-processing request.
      -- Expected to stay 0 until the AI processing phase is implemented.
      select count(*)
      from public.document_processing_jobs as j
      inner join public.documents as d
        on d.id = j.document_id
      where d.user_id = auth.uid()
        and j.created_at >= date_trunc('month', now())
    ) as ai_requests_this_month,
    (
      select coalesce(sum(d.file_size_bytes), 0)::bigint
      from public.documents as d
      where d.user_id = auth.uid()
    ) as storage_bytes;
$$;

comment on function public.get_dashboard_metrics() is
  'Per-user dashboard aggregates for auth.uid(). SECURITY INVOKER; RLS still applies. No user_id argument.';

revoke all on function public.get_dashboard_metrics() from public;
revoke all on function public.get_dashboard_metrics() from anon;
grant execute on function public.get_dashboard_metrics() to authenticated;

-- ============================================================================
-- End of Phase 5D dashboard metrics migration.
-- ============================================================================
