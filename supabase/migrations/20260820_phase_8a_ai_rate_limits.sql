-- ============================================================================
-- Phase 8A — AI Rate Limits
-- ============================================================================
-- Creates public.ai_rate_limits and public.consume_ai_rate_limit() so the
-- application can enforce per-user hourly guardrails before expensive OpenAI
-- work. Limits are defined in this function, never accepted from the browser.
--
-- Initial portfolio limits (per authenticated user, per UTC hour):
--   document_analysis  10
--   document_index     10
--   semantic_search    60
--   document_qa        30
--
-- Security:
--   * RLS is enabled. There are no SELECT/INSERT/UPDATE/DELETE policies for
--     anon or authenticated, so PostgREST cannot read or write this table.
--   * Table privileges are revoked from PUBLIC, anon, and authenticated.
--   * Access is only through consume_ai_rate_limit(p_action text).
--   * The function is SECURITY DEFINER, uses auth.uid(), rejects anonymous
--     callers, and only upserts the caller's own (user_id, action, window).
--   * Numeric limits are not function arguments.
--   * EXECUTE is revoked from PUBLIC and anon; granted only to authenticated.
--   * search_path is emptied. No service-role key is used from app code.
--
-- Do not apply this migration automatically from the app. Apply it through
-- the project's usual Supabase migration workflow.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Rate-limit ledger
-- ----------------------------------------------------------------------------
create table if not exists public.ai_rate_limits (
  user_id        uuid not null references auth.users (id) on delete cascade,
  action         text not null,
  window_start   timestamptz not null,
  request_count  integer not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (user_id, action, window_start),
  constraint ai_rate_limits_action_check
    check (action in (
      'document_analysis',
      'document_index',
      'semantic_search',
      'document_qa'
    )),
  constraint ai_rate_limits_request_count_nonnegative
    check (request_count >= 0)
);

comment on table public.ai_rate_limits is
  'Per-user hourly AI request counts. Not readable via PostgREST. Mutated only by consume_ai_rate_limit().';

comment on column public.ai_rate_limits.action is
  'Server-defined action name. Limits for each action live in consume_ai_rate_limit().';

comment on column public.ai_rate_limits.window_start is
  'Start of the hourly window (UTC hour truncation of now()).';

comment on column public.ai_rate_limits.request_count is
  'Number of consume attempts in this window, including blocked attempts after the limit.';

drop trigger if exists set_ai_rate_limits_updated_at on public.ai_rate_limits;
create trigger set_ai_rate_limits_updated_at
  before update on public.ai_rate_limits
  for each row
  execute function public.set_updated_at();

alter table public.ai_rate_limits enable row level security;

revoke all on table public.ai_rate_limits from public;
revoke all on table public.ai_rate_limits from anon;
revoke all on table public.ai_rate_limits from authenticated;

-- ----------------------------------------------------------------------------
-- 2. Atomic consume
-- ----------------------------------------------------------------------------
drop function if exists public.consume_ai_rate_limit(text);

create function public.consume_ai_rate_limit(p_action text)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_limit integer;
  v_window_start timestamptz;
  v_reset_at timestamptz;
  v_count integer;
  v_allowed boolean;
  v_remaining integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not authenticated'
      using errcode = '42501';
  end if;

  v_limit := case p_action
    when 'document_analysis' then 10
    when 'document_index' then 10
    when 'semantic_search' then 60
    when 'document_qa' then 30
    else null
  end;

  if v_limit is null then
    raise exception 'invalid action'
      using errcode = '22023';
  end if;

  v_window_start := date_trunc('hour', timezone('utc', now())) at time zone 'utc';
  v_reset_at := v_window_start + interval '1 hour';

  insert into public.ai_rate_limits as rl (
    user_id,
    action,
    window_start,
    request_count
  )
  values (
    v_user_id,
    p_action,
    v_window_start,
    1
  )
  on conflict (user_id, action, window_start)
  do update
  set request_count = rl.request_count + 1
  returning rl.request_count into v_count;

  v_allowed := v_count <= v_limit;
  v_remaining := greatest(v_limit - v_count, 0);

  return query
    select v_allowed, v_remaining, v_reset_at;
end;
$$;

comment on function public.consume_ai_rate_limit(text) is
  'Atomically increments the caller''s hourly AI quota for a known action. Identity from auth.uid(); limits are server-defined. Does not return another user''s data.';

revoke all on function public.consume_ai_rate_limit(text) from public;
revoke all on function public.consume_ai_rate_limit(text) from anon;
grant execute on function public.consume_ai_rate_limit(text) to authenticated;

-- ============================================================================
-- End of Phase 8A AI rate-limit migration.
-- ============================================================================
