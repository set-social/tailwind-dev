-- Phase 0 of the AI roadmap (docs/FLIGHTIQ_AI_ROADMAP.md): make the `assistant`
-- Edge Function safe to leave running.
--
--  * assistant_usage — how many questions each user has asked per UTC day, so
--    the function can rate limit per person (and cap the whole app per day).
--  * consume_assistant_call() — the ONE atomic way to spend a question. It
--    checks the global cap, then upserts the user's counter only while under
--    their limit, in a single statement, so two simultaneous requests can't
--    both squeeze past the limit.
--  * ai_calls — one row per model call (tokens, cache hits, latency, tool
--    calls, model), for the daily cost query in supabase/README.md and for
--    checking that prompt caching is actually working.
--
-- Access design: both tables are service-role only. RLS is enabled with NO
-- policies and every grant to anon/authenticated is revoked, so the app can
-- neither read nor tamper with its own quota or the cost log — only the Edge
-- Functions (service role) touch them. New tables are NOT auto-exposed to the
-- Data API roles (see supabase/config.toml), so the grants below are explicit.

-- ─── assistant_usage ────────────────────────────────────────────────────

create table public.assistant_usage (
  user_id  uuid not null references auth.users (id) on delete cascade,
  day      date not null default ((now() at time zone 'utc')::date),
  calls    integer not null default 0,
  primary key (user_id, day)
);

-- The global cap sums a whole day's rows.
create index assistant_usage_day_idx on public.assistant_usage (day);

alter table public.assistant_usage enable row level security;
revoke all on public.assistant_usage from anon, authenticated;
grant select, insert, update on public.assistant_usage to service_role;

-- Returns {"ok": true, "used": n} when the call was counted, or
-- {"ok": false, "reason": "user" | "global"} when a limit was hit (and
-- nothing was counted). The global check and the per-user upsert are not one
-- transaction-wide lock, so the global cap is a soft ceiling: it can overshoot
-- by the number of requests in flight at that instant, which is fine for a
-- cost circuit breaker. The per-user limit is exact.
create function public.consume_assistant_call(
  p_user_id       uuid,
  p_user_limit    integer,
  p_global_limit  integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day    date := ((now() at time zone 'utc')::date);
  v_global bigint;
  v_used   integer;
begin
  select coalesce(sum(calls), 0) into v_global
    from public.assistant_usage where day = v_day;

  if v_global >= p_global_limit then
    return jsonb_build_object('ok', false, 'reason', 'global');
  end if;

  insert into public.assistant_usage as u (user_id, day, calls)
  values (p_user_id, v_day, 1)
  on conflict (user_id, day) do update
    set calls = u.calls + 1
    where u.calls < p_user_limit
  returning u.calls into v_used;

  -- The conflict branch's WHERE was false: the user is at their limit.
  if v_used is null then
    return jsonb_build_object('ok', false, 'reason', 'user');
  end if;

  return jsonb_build_object('ok', true, 'used', v_used);
end;
$$;

revoke execute on function public.consume_assistant_call(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_assistant_call(uuid, integer, integer) to service_role;

-- ─── ai_calls ───────────────────────────────────────────────────────────

create table public.ai_calls (
  id                  uuid primary key default gen_random_uuid(),
  -- set null (not cascade) so cost history survives an account deletion.
  user_id             uuid references auth.users (id) on delete set null,
  function_name       text not null,
  model               text not null,
  input_tokens        integer,
  output_tokens       integer,
  cache_read_tokens   integer,
  cache_write_tokens  integer,
  latency_ms          integer not null,
  tool_calls          integer not null default 0,
  stop_reason         text,
  flight_key          text,
  error               text,
  created_at          timestamptz not null default now()
);

create index ai_calls_created_at_idx on public.ai_calls (created_at desc);

alter table public.ai_calls enable row level security;
revoke all on public.ai_calls from anon, authenticated;
grant select, insert on public.ai_calls to service_role;
