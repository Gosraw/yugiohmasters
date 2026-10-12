begin;

-- =========================================================
-- DUELIST CIRCLE 2.0 - MINI GAMES (Pyramid Climb first)
--
-- docs/V2_PLAN.md, "Mini games (under Play)":
--   - AI-proof skill games; daily challenge (same level for
--     everyone, 1 attempt) + weekly board (unlimited practice,
--     best score counts).
--   - Rewards ONLY via leaderboard placement, with server-side
--     score validation.
--
-- How a run flows
--   1. start_game_run()   the server hands out the level seed and
--                         records the attempt. The daily attempt is
--                         spent the moment you START (no "reload
--                         until it goes well"). Practice seeds are
--                         random and server-issued, so nobody can
--                         pick an easy level.
--   2. The browser plays the deterministic engine
--      (src/lib/games/climber-engine.ts) and records only the
--      steering inputs per tick.
--   3. The server action (src/app/actions/games.ts) replays the
--      exact same engine from seed + inputs and computes the
--      score itself. Only then does it call submit_game_run() with
--      the REPLAYED score (or reject_game_run() when the replay
--      does not match the claim).
--   4. submit_game_run() adds its own sanity checks that do not
--      need the engine: the run must belong to you, still be open,
--      its period must not be settled yet, the score must be
--      physically reachable in that many ticks, and at least that
--      much real time must have passed since the start.
--
-- Rewards
--   mini_game_reward_config holds the amounts (seeded with the
--   season-sim proposal: daily winner +30 DP; weekly winner +150 DP
--   + a Normal pack voucher - NOT yet owner-approved, so they live
--   in a table, not in code). settle_mini_game_period() pays the
--   winners of every finished period of the caller's league via
--   _credit_duel_points, exactly once (settlement row + unique
--   grant rows + an advisory lock). The app calls it lazily when a
--   leaderboard loads; no cron needed.
--
-- Additive only: new tables + new functions. Nothing the live main
-- app uses is touched.
-- =========================================================

-- ---------------------------------------------------------
-- Tables
-- ---------------------------------------------------------

create table if not exists public.mini_game_daily_seeds (
  game text not null,
  day date not null,
  seed text not null,
  created_at timestamptz not null default now(),
  primary key (game, day)
);

comment on table public.mini_game_daily_seeds is
  'The one level seed per game per (Europe/Amsterdam) day, shared by everyone. Generated on the first start of the day so it cannot be known in advance. Only readable through start_game_run().';

create table if not exists public.game_runs (
  id uuid primary key default gen_random_uuid(),

  league_id uuid not null
    references public.leagues(id)
    on delete cascade,

  profile_id uuid not null
    references public.profiles(id)
    on delete cascade,

  game text not null
    check (game in ('pyramid_climb', 'auto_battler')),

  mode text not null
    check (mode in ('daily', 'practice')),

  seed text not null,

  -- Europe/Amsterdam calendar day and ISO week of the START.
  day date not null,

  iso_week text not null
    check (iso_week ~ '^[0-9]{4}-W[0-9]{2}$'),

  engine_version integer not null,

  status text not null default 'started'
    check (status in ('started', 'validated', 'rejected')),

  score integer
    check (score is null or score >= 0),

  ticks integer
    check (ticks is null or ticks >= 0),

  -- Delta-encoded steering inputs: {"v":1,"e":[dt,steer,...],"end":"death","ticks":n}
  inputs jsonb,

  validated boolean not null default false,

  reject_reason text,

  started_at timestamptz not null default now(),

  finished_at timestamptz,

  created_at timestamptz not null default now(),

  constraint game_runs_validated_shape
    check (validated = (status = 'validated'))
);

comment on table public.game_runs is
  'One row per mini game attempt. Written only by start_game_run / submit_game_run / reject_game_run.';

-- One daily attempt per game per player per day.
create unique index if not exists game_runs_one_daily_attempt
  on public.game_runs (game, profile_id, day)
  where mode = 'daily';

create index if not exists game_runs_daily_board_idx
  on public.game_runs (league_id, game, day)
  where mode = 'daily' and validated;

create index if not exists game_runs_weekly_board_idx
  on public.game_runs (league_id, game, iso_week)
  where mode = 'practice' and validated;

create index if not exists game_runs_profile_idx
  on public.game_runs (profile_id, game, created_at desc);

create table if not exists public.mini_game_reward_config (
  game text not null
    check (game in ('pyramid_climb', 'auto_battler')),

  period text not null
    check (period in ('day', 'week')),

  place integer not null
    check (place >= 1),

  dp integer not null default 0
    check (dp >= 0),

  voucher_pack_code text
    check (
      voucher_pack_code is null
      or voucher_pack_code in ('normal_pack', 'premium_pack', 'deluxe_pack', 'special_pack')
    ),

  updated_at timestamptz not null default now(),

  primary key (game, period, place)
);

comment on table public.mini_game_reward_config is
  'Mini game leaderboard rewards per game / period / place. Seeded from docs/season-sim-report.md (proposal, not yet owner-approved) - change amounts here, not in code.';

insert into public.mini_game_reward_config (
  game,
  period,
  place,
  dp,
  voucher_pack_code
)
values
  ('pyramid_climb', 'day', 1, 30, null),
  ('pyramid_climb', 'week', 1, 150, 'normal_pack'),
  ('auto_battler', 'day', 1, 30, null),
  ('auto_battler', 'week', 1, 150, 'normal_pack')
on conflict (game, period, place) do nothing;

create table if not exists public.mini_game_period_settlements (
  league_id uuid not null
    references public.leagues(id)
    on delete cascade,

  game text not null,

  period text not null
    check (period in ('day', 'week')),

  -- 'YYYY-MM-DD' for a day, 'IYYY-Www' for a week.
  period_key text not null,

  settled_by uuid
    references public.profiles(id)
    on delete set null,

  settled_at timestamptz not null default now(),

  primary key (league_id, game, period, period_key)
);

create table if not exists public.mini_game_reward_grants (
  id uuid primary key default gen_random_uuid(),

  league_id uuid not null
    references public.leagues(id)
    on delete cascade,

  game text not null,

  period text not null
    check (period in ('day', 'week')),

  period_key text not null,

  profile_id uuid not null
    references public.profiles(id)
    on delete cascade,

  place integer not null,

  score integer not null,

  run_id uuid
    references public.game_runs(id)
    on delete set null,

  duel_points integer not null default 0,

  voucher_type text,

  duel_point_transaction_id uuid
    references public.duel_point_transactions(id)
    on delete set null,

  reward_voucher_id uuid
    references public.reward_vouchers(id)
    on delete set null,

  description text not null,

  created_at timestamptz not null default now(),

  constraint mini_game_reward_grants_one_per_place
    unique (league_id, game, period, period_key, place),

  constraint mini_game_reward_grants_one_per_profile_place
    unique (game, period, period_key, profile_id, place)
);

-- ---------------------------------------------------------
-- Row level security: members read their league; nobody writes
-- directly (all writes go through the SECURITY DEFINER RPCs).
-- ---------------------------------------------------------

alter table public.mini_game_daily_seeds enable row level security;
alter table public.game_runs enable row level security;
alter table public.mini_game_reward_config enable row level security;
alter table public.mini_game_period_settlements enable row level security;
alter table public.mini_game_reward_grants enable row level security;

revoke all on public.mini_game_daily_seeds from anon, authenticated;
revoke all on public.game_runs from anon, authenticated;
revoke all on public.mini_game_reward_config from anon, authenticated;
revoke all on public.mini_game_period_settlements from anon, authenticated;
revoke all on public.mini_game_reward_grants from anon, authenticated;

-- Seed and inputs stay private (today's daily seed must not leak
-- through a friend's run before you start yours).
grant select (
  id,
  league_id,
  profile_id,
  game,
  mode,
  day,
  iso_week,
  engine_version,
  status,
  score,
  ticks,
  validated,
  reject_reason,
  started_at,
  finished_at,
  created_at
) on public.game_runs to authenticated;

grant select on public.mini_game_reward_config to authenticated;
grant select on public.mini_game_period_settlements to authenticated;
grant select on public.mini_game_reward_grants to authenticated;

drop policy if exists game_runs_read_league on public.game_runs;
create policy game_runs_read_league
  on public.game_runs
  for select
  to authenticated
  using (public.is_league_member(league_id));

drop policy if exists mini_game_reward_config_read on public.mini_game_reward_config;
create policy mini_game_reward_config_read
  on public.mini_game_reward_config
  for select
  to authenticated
  using (true);

drop policy if exists mini_game_period_settlements_read_league on public.mini_game_period_settlements;
create policy mini_game_period_settlements_read_league
  on public.mini_game_period_settlements
  for select
  to authenticated
  using (public.is_league_member(league_id));

drop policy if exists mini_game_reward_grants_read_league on public.mini_game_reward_grants;
create policy mini_game_reward_grants_read_league
  on public.mini_game_reward_grants
  for select
  to authenticated
  using (public.is_league_member(league_id));

-- ---------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------

create or replace function public._mini_game_today()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'Europe/Amsterdam')::date;
$$;

create or replace function public._mini_game_iso_week(target_day date)
returns text
language sql
immutable
set search_path = public
as $$
  select to_char(target_day, 'IYYY-"W"IW');
$$;

create or replace function public._mini_game_title(target_game text)
returns text
language sql
immutable
set search_path = public
as $$
  select case target_game
    when 'pyramid_climb' then 'Pyramid Climb'
    when 'auto_battler' then 'Auto Battler'
    else initcap(replace(target_game, '_', ' '))
  end;
$$;

-- Max world units the climber can rise per tick (the Pot of Greed
-- boost launch speed in climber-engine.ts), x10 because score is
-- height / 10. Used for a physics sanity bound in submit_game_run.
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
    else 2147483647
  end;
$$;

create or replace function public._mini_game_league_for(target_profile_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select lm.league_id
  from public.league_members lm
  where lm.profile_id = target_profile_id
  order by lm.joined_at
  limit 1;
$$;

-- A period counts as finished (and may be settled) 35 minutes after
-- it ends in Amsterdam, so a run started just before midnight can
-- still be submitted (a run lasts 30 minutes at most).
create or replace function public._mini_game_period_finished(
  target_period text,
  target_period_key text
)
returns boolean
language sql
stable
set search_path = public
as $$
  select case target_period
    when 'day' then
      (now() at time zone 'Europe/Amsterdam')
        >= (target_period_key::date + 1)::timestamp + interval '35 minutes'
    when 'week' then
      (now() at time zone 'Europe/Amsterdam')
        >= (to_date(target_period_key || '-1', 'IYYY-"W"IW-ID') + 7)::timestamp + interval '35 minutes'
    else false
  end;
$$;

-- ---------------------------------------------------------
-- start_game_run
-- ---------------------------------------------------------

create or replace function public.start_game_run(
  target_game text,
  target_mode text,
  target_engine_version integer
)
returns table (
  run_id uuid,
  run_seed text,
  run_mode text,
  run_day date,
  run_iso_week text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_league uuid;
  today date := public._mini_game_today();
  new_seed text;
  new_id uuid;
begin
  if caller is null then
    raise exception 'Not authenticated.';
  end if;

  if target_game is distinct from 'pyramid_climb' then
    raise exception 'Unknown game.';
  end if;

  if target_mode not in ('daily', 'practice') then
    raise exception 'Unknown mode.';
  end if;

  if target_engine_version is null or target_engine_version < 1 then
    raise exception 'Unknown game version.';
  end if;

  caller_league := public._mini_game_league_for(caller);

  if caller_league is null then
    raise exception 'Join a league first.';
  end if;

  if target_mode = 'daily' then
    if exists (
      select 1
      from public.game_runs r
      where r.game = target_game
        and r.profile_id = caller
        and r.day = today
        and r.mode = 'daily'
    ) then
      raise exception 'You already used today''s Daily Climb. A new one opens at midnight.';
    end if;

    insert into public.mini_game_daily_seeds (
      game,
      day,
      seed
    )
    values (
      target_game,
      today,
      'daily:' || today::text || ':' || substr(md5(gen_random_uuid()::text), 1, 12)
    )
    on conflict (game, day) do nothing;

    select s.seed
    into new_seed
    from public.mini_game_daily_seeds s
    where s.game = target_game
      and s.day = today;
  else
    new_seed := 'practice:' || substr(md5(gen_random_uuid()::text), 1, 16);
  end if;

  begin
    insert into public.game_runs (
      league_id,
      profile_id,
      game,
      mode,
      seed,
      day,
      iso_week,
      engine_version
    )
    values (
      caller_league,
      caller,
      target_game,
      target_mode,
      new_seed,
      today,
      public._mini_game_iso_week(today),
      target_engine_version
    )
    returning id
    into new_id;
  exception
    when unique_violation then
      raise exception 'You already used today''s Daily Climb. A new one opens at midnight.';
  end;

  return query
  select
    new_id,
    new_seed,
    target_mode,
    today,
    public._mini_game_iso_week(today);
end;
$$;

-- ---------------------------------------------------------
-- submit_game_run (called by the server action AFTER it replayed
-- the run and computed the score itself)
-- ---------------------------------------------------------

create or replace function public.submit_game_run(
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
  caller uuid := auth.uid();
  run_row public.game_runs%rowtype;
  elapsed_seconds numeric;
  problem text;
begin
  if caller is null then
    raise exception 'Not authenticated.';
  end if;

  select *
  into run_row
  from public.game_runs r
  where r.id = target_run_id
  for update;

  if not found or run_row.profile_id <> caller then
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

-- ---------------------------------------------------------
-- get_my_game_run: the caller's OWN run including its seed (the
-- seed was handed to them at start anyway). The server action
-- uses it to replay; the client uses it to resume a run after the
-- phone killed the tab.
-- ---------------------------------------------------------

create or replace function public.get_my_game_run(target_run_id uuid)
returns table (
  run_id uuid,
  run_game text,
  run_mode text,
  run_seed text,
  run_status text,
  run_engine_version integer,
  run_day date,
  run_iso_week text,
  run_started_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.game,
    r.mode,
    r.seed,
    r.status,
    r.engine_version,
    r.day,
    r.iso_week,
    r.started_at
  from public.game_runs r
  where r.id = target_run_id
    and r.profile_id = auth.uid();
$$;

-- ---------------------------------------------------------
-- reject_game_run (server action: replay did not match)
-- ---------------------------------------------------------

create or replace function public.reject_game_run(
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
declare
  caller uuid := auth.uid();
begin
  if caller is null then
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
    and profile_id = caller
    and status = 'started';

  if not found then
    raise exception 'Run not found.';
  end if;
end;
$$;

-- ---------------------------------------------------------
-- Leaderboard: best validated score per player in a period.
--   day:  daily-challenge runs of that day
--   week: practice runs of that ISO week
-- period_key null = the current day / week.
-- ---------------------------------------------------------

create or replace function public._mini_game_board(
  target_league uuid,
  target_game text,
  target_period text,
  target_period_key text
)
returns table (
  place integer,
  profile_id uuid,
  duelist_name text,
  best_score integer,
  runs integer,
  run_id uuid,
  achieved_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with period_runs as (
    select r.*
    from public.game_runs r
    where r.league_id = target_league
      and r.game = target_game
      and r.validated
      and (
        (target_period = 'day' and r.mode = 'daily' and r.day::text = target_period_key)
        or (target_period = 'week' and r.mode = 'practice' and r.iso_week = target_period_key)
      )
  ),
  best as (
    select distinct on (pr.profile_id)
      pr.profile_id,
      pr.score,
      pr.id,
      pr.finished_at
    from period_runs pr
    order by pr.profile_id, pr.score desc, pr.finished_at asc, pr.id
  ),
  counts as (
    select
      pr.profile_id,
      count(*)::integer as runs
    from period_runs pr
    group by pr.profile_id
  )
  select
    (row_number() over (order by b.score desc, b.finished_at asc, b.id))::integer,
    b.profile_id,
    p.duelist_name,
    b.score,
    c.runs,
    b.id,
    b.finished_at
  from best b
  join counts c
    on c.profile_id = b.profile_id
  join public.profiles p
    on p.id = b.profile_id
  order by 1;
$$;

create or replace function public.mini_game_leaderboard(
  target_game text,
  target_period text,
  target_period_key text default null
)
returns table (
  place integer,
  profile_id uuid,
  duelist_name text,
  best_score integer,
  runs integer,
  achieved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_league uuid;
  resolved_key text;
begin
  if caller is null then
    raise exception 'Not authenticated.';
  end if;

  if target_period not in ('day', 'week') then
    raise exception 'Unknown period.';
  end if;

  caller_league := public._mini_game_league_for(caller);

  if caller_league is null then
    return;
  end if;

  resolved_key := coalesce(
    nullif(trim(target_period_key), ''),
    case target_period
      when 'day' then public._mini_game_today()::text
      else public._mini_game_iso_week(public._mini_game_today())
    end
  );

  return query
  select
    b.place,
    b.profile_id,
    b.duelist_name,
    b.best_score,
    b.runs,
    b.achieved_at
  from public._mini_game_board(
    caller_league,
    target_game,
    target_period,
    resolved_key
  ) b;
end;
$$;

-- ---------------------------------------------------------
-- settle_mini_game_period: pay the winners of every FINISHED,
-- not-yet-settled period of the caller's league. Idempotent:
-- the settlement row is claimed first (under an advisory lock),
-- grant rows are unique per place, and DP only flows through
-- _credit_duel_points. Returns the number of grants made.
-- ---------------------------------------------------------

create or replace function public.settle_mini_game_period(
  target_game text,
  target_period text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_league uuid;
  key_row record;
  cfg public.mini_game_reward_config%rowtype;
  winner record;
  claimed boolean;
  new_grant_id uuid;
  new_tx_id uuid;
  new_voucher_id uuid;
  reward_description text;
  period_label text;
  grants_made integer := 0;
begin
  if caller is null then
    raise exception 'Not authenticated.';
  end if;

  if target_period not in ('day', 'week') then
    raise exception 'Unknown period.';
  end if;

  caller_league := public._mini_game_league_for(caller);

  if caller_league is null then
    return 0;
  end if;

  for key_row in
    select distinct
      case target_period
        when 'day' then r.day::text
        else r.iso_week
      end as period_key
    from public.game_runs r
    where r.league_id = caller_league
      and r.game = target_game
      and r.validated
      and r.mode = case target_period when 'day' then 'daily' else 'practice' end
    order by 1
  loop
    continue when not public._mini_game_period_finished(target_period, key_row.period_key);

    perform pg_advisory_xact_lock(
      hashtext('mini_game_settle:' || caller_league::text || ':' || target_game || ':' || target_period),
      hashtext(key_row.period_key)
    );

    insert into public.mini_game_period_settlements (
      league_id,
      game,
      period,
      period_key,
      settled_by
    )
    values (
      caller_league,
      target_game,
      target_period,
      key_row.period_key,
      caller
    )
    on conflict do nothing
    returning true
    into claimed;

    continue when claimed is null;

    period_label := case target_period
      when 'day' then 'daily'
      else 'weekly'
    end;

    for cfg in
      select *
      from public.mini_game_reward_config c
      where c.game = target_game
        and c.period = target_period
      order by c.place
    loop
      select *
      into winner
      from public._mini_game_board(
        caller_league,
        target_game,
        target_period,
        key_row.period_key
      ) b
      where b.place = cfg.place
        and b.best_score > 0;

      exit when not found;

      reward_description :=
        public._mini_game_title(target_game)
        || ' — '
        || period_label
        || case
          when cfg.place = 1 then ' winner'
          else ' ' || public._ordinal_label(cfg.place) || ' place'
        end
        || case target_period
          when 'day' then ' ' || to_char(key_row.period_key::date, 'FMDD Mon')
          else ', week of '
            || to_char(to_date(key_row.period_key || '-1', 'IYYY-"W"IW-ID'), 'FMDD Mon')
        end;

      insert into public.mini_game_reward_grants (
        league_id,
        game,
        period,
        period_key,
        profile_id,
        place,
        score,
        run_id,
        duel_points,
        voucher_type,
        description
      )
      values (
        caller_league,
        target_game,
        target_period,
        key_row.period_key,
        winner.profile_id,
        cfg.place,
        winner.best_score,
        winner.run_id,
        cfg.dp,
        cfg.voucher_pack_code,
        reward_description
      )
      on conflict do nothing
      returning id
      into new_grant_id;

      continue when new_grant_id is null;

      grants_made := grants_made + 1;

      if cfg.dp > 0 then
        new_tx_id := public._credit_duel_points(
          winner.profile_id,
          cfg.dp,
          'mini_game_reward',
          null,
          public._mini_game_title(target_game),
          jsonb_build_object(
            'game', target_game,
            'period', target_period,
            'period_key', key_row.period_key,
            'place', cfg.place,
            'score', winner.best_score,
            'grant_id', new_grant_id
          ),
          reward_description
        );

        update public.mini_game_reward_grants
        set duel_point_transaction_id = new_tx_id
        where id = new_grant_id;
      end if;

      if cfg.voucher_pack_code is not null then
        insert into public.reward_vouchers (
          profile_id,
          voucher_type,
          quantity,
          source_type,
          source_id,
          note
        )
        values (
          winner.profile_id,
          cfg.voucher_pack_code,
          1,
          'mini_game_reward',
          new_grant_id,
          reward_description
        )
        returning id
        into new_voucher_id;

        update public.mini_game_reward_grants
        set reward_voucher_id = new_voucher_id
        where id = new_grant_id;
      end if;

      new_grant_id := null;
    end loop;

    claimed := null;
  end loop;

  return grants_made;
end;
$$;

-- ---------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------

revoke all on function public._mini_game_today() from public, anon, authenticated;
revoke all on function public._mini_game_iso_week(date) from public, anon, authenticated;
revoke all on function public._mini_game_title(text) from public, anon, authenticated;
revoke all on function public._mini_game_max_score(text, integer) from public, anon, authenticated;
revoke all on function public._mini_game_league_for(uuid) from public, anon, authenticated;
revoke all on function public._mini_game_period_finished(text, text) from public, anon, authenticated;
revoke all on function public._mini_game_board(uuid, text, text, text) from public, anon, authenticated;

revoke all on function public.start_game_run(text, text, integer) from public, anon;
revoke all on function public.submit_game_run(uuid, integer, integer, jsonb) from public, anon;
revoke all on function public.reject_game_run(uuid, text, integer, jsonb) from public, anon;
revoke all on function public.get_my_game_run(uuid) from public, anon;
revoke all on function public.mini_game_leaderboard(text, text, text) from public, anon;
revoke all on function public.settle_mini_game_period(text, text) from public, anon;

grant execute on function public.start_game_run(text, text, integer) to authenticated;
grant execute on function public.submit_game_run(uuid, integer, integer, jsonb) to authenticated;
grant execute on function public.reject_game_run(uuid, text, integer, jsonb) to authenticated;
grant execute on function public.get_my_game_run(uuid) to authenticated;
grant execute on function public.mini_game_leaderboard(text, text, text) to authenticated;
grant execute on function public.settle_mini_game_period(text, text) to authenticated;

commit;
