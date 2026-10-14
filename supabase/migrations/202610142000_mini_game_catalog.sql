begin;

-- =========================================================
-- DUELIST CIRCLE 2.0 - MINI GAME CATALOG
--
-- Until now every mini game was hard-coded in the shared SQL:
--   * start_game_run()      -> `target_game not in (...)`, plus a
--                              CASE for the "already played" message
--                              and the seed prefix
--   * _mini_game_max_score() -> CASE per game
--   * _mini_game_title()     -> CASE per game
--   * game_runs.game and mini_game_reward_config.game -> CHECK lists
--
-- Adding a game meant editing all of them, so two games built in
-- parallel would fight over the same functions. This migration
-- moves those facts into ONE table, public.mini_game_catalog, and
-- makes the functions read it. Behaviour for pyramid_climb and
-- auto_battler is exactly what shipped before (same messages,
-- same seed prefixes, same max-score formula and numbers, same
-- titles); only the lookups changed.
--
-- HOW TO ADD A GAME (no shared function edits needed):
--   one new migration that calls
--     select public.register_mini_game(
--       'my_game', 'My Game', 'mygame-', <max per tick>, <flat>,
--       <sort order>, 'You already played today''s Daily ... .'
--     );
--   That adds the catalog row (start_game_run accepts it, the
--   max-score bound and reward titles use it) and the default
--   leaderboard rewards (day #1 30 DP, week #1 150 DP + Normal
--   Pack), without touching amounts the owner already changed.
--   Then a src/lib/games/registry.ts entry puts it on /games.
--
-- Max score bound used by submit_game_run():
--   ceil(ticks * max_score_per_tick) + max_score_flat
--   (pyramid_climb: ceil(ticks * 2.7) + 30, identical to the old
--   ceil(ticks * 27 / 10.0) + 30; auto_battler: 0 per tick + 122012).
--   A game missing from the catalog keeps the old "no bound"
--   (2147483647), but start_game_run() refuses it anyway.
--
-- Backwards compatible with the live main app: the same two game
-- keys stay valid, the CHECK lists become foreign keys to the
-- catalog (stricter for nothing that exists), signatures and
-- grants are unchanged.
-- =========================================================

-- ---------------------------------------------------------
-- Catalog table
-- ---------------------------------------------------------

create table if not exists public.mini_game_catalog (
  game text primary key
    check (game ~ '^[a-z][a-z0-9_]{1,39}$'),

  title text not null
    check (length(trim(title)) between 1 and 60),

  active boolean not null default true,

  -- Prepended to every seed start_game_run() makes ('' or e.g. 'arena-').
  seed_prefix text not null default ''
    check (seed_prefix ~ '^[a-z0-9-]{0,16}$'),

  max_score_per_tick numeric not null default 0
    check (max_score_per_tick >= 0),

  max_score_flat integer not null default 0
    check (max_score_flat >= 0),

  sort_order integer not null default 100,

  -- Shown when the Daily attempt for today was already used.
  daily_used_message text not null
    default 'You already played today''s Daily challenge. A new one opens at midnight.',

  created_at timestamptz not null default now()
);

comment on table public.mini_game_catalog is
  'One row per mini game. start_game_run / _mini_game_max_score / _mini_game_title read it; add games with register_mini_game() in a migration. Readable by players, written only by migrations / service role.';

insert into public.mini_game_catalog (
  game,
  title,
  active,
  seed_prefix,
  max_score_per_tick,
  max_score_flat,
  sort_order,
  daily_used_message
)
values
  (
    'pyramid_climb',
    'Pyramid Climb',
    true,
    '',
    2.7,
    30,
    10,
    'You already used today''s Daily Climb. A new one opens at midnight.'
  ),
  (
    'auto_battler',
    'Shadow Arena',
    true,
    'arena-',
    0,
    122012,
    20,
    'You already played today''s Daily Arena. A new one opens at midnight.'
  )
on conflict (game) do nothing;

alter table public.mini_game_catalog enable row level security;

revoke all on public.mini_game_catalog from public, anon, authenticated;

grant select on public.mini_game_catalog to authenticated;

grant all on public.mini_game_catalog to service_role;

drop policy if exists mini_game_catalog_read on public.mini_game_catalog;

create policy mini_game_catalog_read
  on public.mini_game_catalog
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------
-- Hard-coded CHECK lists -> foreign keys to the catalog
-- ---------------------------------------------------------

alter table public.game_runs
  drop constraint if exists game_runs_game_check;

alter table public.game_runs
  drop constraint if exists game_runs_game_fkey;

alter table public.game_runs
  add constraint game_runs_game_fkey
  foreign key (game)
  references public.mini_game_catalog(game);

alter table public.mini_game_reward_config
  drop constraint if exists mini_game_reward_config_game_check;

alter table public.mini_game_reward_config
  drop constraint if exists mini_game_reward_config_game_fkey;

alter table public.mini_game_reward_config
  add constraint mini_game_reward_config_game_fkey
  foreign key (game)
  references public.mini_game_catalog(game);

-- ---------------------------------------------------------
-- Default rewards for every catalog game that has none yet
-- (catalog-driven; existing / owner-edited rows are untouched).
-- ---------------------------------------------------------

insert into public.mini_game_reward_config (
  game,
  period,
  place,
  dp,
  voucher_pack_code
)
select
  c.game,
  d.period,
  1,
  d.dp,
  d.voucher_pack_code
from public.mini_game_catalog c
cross join (
  values
    ('day', 30, null::text),
    ('week', 150, 'normal_pack')
) as d(period, dp, voucher_pack_code)
on conflict (game, period, place) do nothing;

-- ---------------------------------------------------------
-- register_mini_game(): the one call a new game's migration makes.
-- Upserts the catalog row (title, prefix, bounds, order, message,
-- active) and adds the default #1 rewards only where missing.
-- Migrations / service role only.
-- ---------------------------------------------------------

create or replace function public.register_mini_game(
  p_game text,
  p_title text,
  p_seed_prefix text,
  p_max_score_per_tick numeric,
  p_max_score_flat integer,
  p_sort_order integer,
  p_daily_used_message text,
  p_day_dp integer default 30,
  p_week_dp integer default 150,
  p_week_voucher text default 'normal_pack'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.mini_game_catalog (
    game,
    title,
    active,
    seed_prefix,
    max_score_per_tick,
    max_score_flat,
    sort_order,
    daily_used_message
  )
  values (
    p_game,
    p_title,
    true,
    coalesce(p_seed_prefix, ''),
    p_max_score_per_tick,
    p_max_score_flat,
    p_sort_order,
    p_daily_used_message
  )
  on conflict (game) do update
  set
    title = excluded.title,
    seed_prefix = excluded.seed_prefix,
    max_score_per_tick = excluded.max_score_per_tick,
    max_score_flat = excluded.max_score_flat,
    sort_order = excluded.sort_order,
    daily_used_message = excluded.daily_used_message;

  insert into public.mini_game_reward_config (
    game,
    period,
    place,
    dp,
    voucher_pack_code
  )
  values
    (p_game, 'day', 1, p_day_dp, null),
    (p_game, 'week', 1, p_week_dp, p_week_voucher)
  on conflict (game, period, place) do nothing;
end;
$$;

revoke all on function public.register_mini_game(text, text, text, numeric, integer, integer, text, integer, integer, text) from public, anon, authenticated;

grant execute on function public.register_mini_game(text, text, text, numeric, integer, integer, text, integer, integer, text) to service_role;

-- ---------------------------------------------------------
-- _mini_game_title: catalog title, same fallback as before.
-- (stable instead of immutable: it reads a table now.)
-- ---------------------------------------------------------

create or replace function public._mini_game_title(target_game text)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    (
      select c.title
      from public.mini_game_catalog c
      where c.game = target_game
    ),
    initcap(replace(target_game, '_', ' '))
  );
$$;

revoke all on function public._mini_game_title(text) from public, anon, authenticated;

-- ---------------------------------------------------------
-- _mini_game_max_score: catalog bound, same fallback as before.
-- ---------------------------------------------------------

create or replace function public._mini_game_max_score(
  target_game text,
  target_ticks integer
)
returns integer
language sql
stable
set search_path = public
as $$
  select case
    when exists (
      select 1
      from public.mini_game_catalog c
      where c.game = target_game
    ) then (
      select ceil(target_ticks * c.max_score_per_tick)::integer + c.max_score_flat
      from public.mini_game_catalog c
      where c.game = target_game
    )
    else 2147483647
  end;
$$;

revoke all on function public._mini_game_max_score(text, integer) from public, anon, authenticated;

-- ---------------------------------------------------------
-- start_game_run: body from 202610120900_shadow_arena.sql; only
-- the game list, message and seed prefix now come from the catalog.
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
  used_message text;
  seed_prefix text;
  catalog_row public.mini_game_catalog%rowtype;
begin
  if caller is null then
    raise exception 'Not authenticated.';
  end if;

  if target_game is not null then
    select *
    into catalog_row
    from public.mini_game_catalog c
    where c.game = target_game
      and c.active;
  end if;

  if target_game is null or catalog_row.game is null then
    raise exception 'Unknown game.';
  end if;

  if target_mode not in ('daily', 'practice') then
    raise exception 'Unknown mode.';
  end if;

  if target_engine_version is null or target_engine_version < 1 then
    raise exception 'Unknown game version.';
  end if;

  used_message := catalog_row.daily_used_message;

  seed_prefix := catalog_row.seed_prefix;

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
      raise exception '%', used_message;
    end if;

    insert into public.mini_game_daily_seeds (
      game,
      day,
      seed
    )
    values (
      target_game,
      today,
      seed_prefix || 'daily:' || today::text || ':' || substr(md5(gen_random_uuid()::text), 1, 12)
    )
    on conflict (game, day) do nothing;

    select s.seed
    into new_seed
    from public.mini_game_daily_seeds s
    where s.game = target_game
      and s.day = today;
  else
    new_seed := seed_prefix || 'practice:' || substr(md5(gen_random_uuid()::text), 1, 16);
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
      raise exception '%', used_message;
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

revoke all on function public.start_game_run(text, text, integer) from public, anon;

grant execute on function public.start_game_run(text, text, integer) to authenticated;

commit;
