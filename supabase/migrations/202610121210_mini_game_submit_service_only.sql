-- =========================================================
-- Mini games: submit_game_run / reject_game_run become
-- SERVICE-ROLE ONLY.
--
-- Security review finding: both functions were granted to
-- `authenticated`, so any signed-in player could call
-- submit_game_run straight from the browser with any score and
-- skip the server-side replay in src/app/actions/games.ts and
-- src/app/actions/autobattler.ts (auto_battler had no real max
-- score either), forging leaderboard wins -> DP / vouchers.
--
-- Fix:
--   * New signatures take an explicit p_profile_id (the server
--     action passes the id of the session user it resolved with
--     requireUser(); it never accepts a profile id from the
--     client). The old signatures are dropped.
--   * EXECUTE is revoked from public / anon / authenticated and
--     granted to service_role only. The server actions call them
--     through the service-role client (src/lib/supabase/admin.ts)
--     AFTER replaying the run.
--   * auth.uid() is null for service_role, so ownership is checked
--     against p_profile_id (game_runs.profile_id) and the run must
--     still be open (status = 'started'). All other checks are
--     unchanged.
--   * auto_battler gets a real max score:
--     survived*10000 + health*100 + wins, 20 waves, 30 health
--     -> 20*10000 + 30*100 + 20 = 203020.
--
-- get_my_game_run stays user-callable: it only ever returns the
-- caller's own run (profile_id = auth.uid()).
-- =========================================================

create or replace function public._mini_game_max_score(
  target_game text,
  target_ticks integer
)
returns integer
language sql
immutable
set search_path = public
as $$
  select case target_game
    when 'pyramid_climb' then ceil(target_ticks * 27 / 10.0)::integer + 30
    when 'auto_battler' then 203020
    else 2147483647
  end;
$$;

revoke all on function public._mini_game_max_score(text, integer) from public, anon, authenticated;

drop function if exists public.submit_game_run(uuid, integer, integer, jsonb);
drop function if exists public.reject_game_run(uuid, text, integer, jsonb);

create or replace function public.submit_game_run(
  p_profile_id uuid,
  target_run_id uuid,
  target_score integer,
  target_ticks integer,
  target_inputs jsonb
)
returns table (
  run_id uuid,
  run_status text,
  run_score integer,
  run_reject_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  run_row public.game_runs%rowtype;
  elapsed_seconds numeric;
  problem text;
begin
  if p_profile_id is null then
    raise exception 'Not authenticated.';
  end if;

  select *
  into run_row
  from public.game_runs r
  where r.id = target_run_id
  for update;

  if not found or run_row.profile_id <> p_profile_id then
    raise exception 'Run not found.';
  end if;

  if run_row.status <> 'started' then
    raise exception 'This run was already submitted.';
  end if;

  elapsed_seconds := extract(epoch from (now() - run_row.started_at));

  if exists (
    select 1
    from public.mini_game_period_settlements s
    where s.league_id = run_row.league_id
      and s.game = run_row.game
      and (
        (run_row.mode = 'daily' and s.period = 'day' and s.period_key = run_row.day::text)
        or (run_row.mode = 'practice' and s.period = 'week' and s.period_key = run_row.iso_week)
      )
  ) then
    problem := 'This leaderboard was already settled.';
  elsif target_ticks is null or target_ticks < 1 or target_ticks > 108000 then
    problem := 'Impossible run length.';
  elsif target_score is null or target_score < 0
    or target_score > public._mini_game_max_score(run_row.game, target_ticks) then
    problem := 'Impossible score for this run length.';
  elsif elapsed_seconds + 5 < (target_ticks / 60.0) * 0.9 then
    problem := 'Run finished faster than real time.';
  elsif target_inputs is null
    or jsonb_typeof(target_inputs) <> 'object'
    or octet_length(target_inputs::text) > 800000 then
    problem := 'Malformed inputs.';
  end if;

  if problem is not null then
    update public.game_runs
    set
      status = 'rejected',
      validated = false,
      score = null,
      ticks = target_ticks,
      inputs = case
        when target_inputs is not null and octet_length(target_inputs::text) <= 800000 then target_inputs
        else null
      end,
      reject_reason = problem,
      finished_at = now()
    where id = run_row.id;

    return query
    select
      run_row.id,
      'rejected'::text,
      null::integer,
      problem;

    return;
  end if;

  update public.game_runs
  set
    status = 'validated',
    validated = true,
    score = target_score,
    ticks = target_ticks,
    inputs = target_inputs,
    reject_reason = null,
    finished_at = now()
  where id = run_row.id;

  return query
  select
    run_row.id,
    'validated'::text,
    target_score,
    null::text;
end;
$$;

create or replace function public.reject_game_run(
  p_profile_id uuid,
  target_run_id uuid,
  target_reason text,
  target_ticks integer,
  target_inputs jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_profile_id is null then
    raise exception 'Not authenticated.';
  end if;

  update public.game_runs
  set
    status = 'rejected',
    validated = false,
    score = null,
    ticks = case
      when target_ticks between 0 and 108000 then target_ticks
      else null
    end,
    inputs = case
      when target_inputs is not null and octet_length(target_inputs::text) <= 800000 then target_inputs
      else null
    end,
    reject_reason = left(coalesce(nullif(trim(target_reason), ''), 'Rejected.'), 200),
    finished_at = now()
  where id = target_run_id
    and profile_id = p_profile_id
    and status = 'started';

  if not found then
    raise exception 'Run not found.';
  end if;
end;
$$;

revoke all on function public.submit_game_run(uuid, uuid, integer, integer, jsonb) from public, anon, authenticated;
revoke all on function public.reject_game_run(uuid, uuid, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.submit_game_run(uuid, uuid, integer, integer, jsonb) to service_role;
grant execute on function public.reject_game_run(uuid, uuid, text, integer, jsonb) to service_role;
