-- =========================================================
-- 2.0 engagement, part 1: season calendar + WEEKLY GOALS
-- (docs/V2_PLAN.md "Engagement"; numbers from
-- docs/season-sim-report.md - PROPOSAL, not owner-approved yet,
-- so every amount lives in a config table, never in code).
--
-- 1. public.seasons: which season is current and on which Monday
--    it started (Europe/Amsterdam). "Season 2 · Week N" on Home and
--    the Season Path window both come from here.
--    LAUNCH NIGHT: set seasons.starts_on for season 2 to the real
--    launch Monday.
-- 2. Weekly goals engine (owner will design the real goals later,
--    so it is data-driven):
--    * goal_templates      - the goal pool (category, type, target,
--                            params, title, weight).
--    * weekly_goal_config  - DP per goal (150), the "all goals done"
--                            voucher (Premium), the category slots
--                            (one Play, one Collect, one Trade).
--    * weekly_goal_sets    - one set per league + week (Monday,
--      + weekly_goal_set_items   Europe/Amsterdam), chosen by a
--                            seeded random pick per category, the
--                            same for everyone. Items SNAPSHOT
--                            title/target/DP so editing a template
--                            never changes a running week.
--    * weekly_goal_progress / weekly_goal_bonus_grants - per player.
--    Progress is always RECOMPUTED from real events (competition
--    duels, completed rounds, opened packs, newly collected copies,
--    accepted trades) by _refresh_weekly_goals - called on page
--    load through get_my_season_overview (migration 0810).
--    Completing a goal pays its DP once via _credit_duel_points
--    ("Weekly goal: Play 3 season duels"); completing all of them
--    pays the voucher once. Idempotent (primary keys + a per-player
--    advisory lock).
--
-- New tables only; nothing the live app uses changes.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Seasons
-- ---------------------------------------------------------

create table if not exists public.seasons (
  season_number integer primary key check (season_number >= 1),
  name text not null check (length(trim(name)) > 0),
  starts_on date not null,
  ends_on date,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seasons_dates_check check (ends_on is null or ends_on >= starts_on)
);

create unique index if not exists seasons_one_current
  on public.seasons (is_current)
  where is_current;

comment on table public.seasons is
  'Season calendar. starts_on (a date in Europe/Amsterdam) drives "Season N · Week W", the weekly goal window and the Season Path XP window. Exactly one row is_current.';

insert into public.seasons (season_number, name, starts_on, is_current)
values (2, 'Season 2', date '2026-10-12', true)
on conflict (season_number) do nothing;

alter table public.seasons enable row level security;

drop policy if exists seasons_read on public.seasons;
create policy seasons_read on public.seasons
  for select to authenticated
  using (true);

-- Europe/Amsterdam calendar helpers.
create or replace function public._amsterdam_week_start(target_at timestamptz default now())
returns date
language sql
stable
set search_path = public
as $$
  select (date_trunc('week', target_at at time zone 'Europe/Amsterdam'))::date;
$$;

create or replace function public._amsterdam_day_start(target_day date)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select (target_day::timestamp at time zone 'Europe/Amsterdam');
$$;

create or replace function public._current_season()
returns public.seasons
language sql
stable
security definer
set search_path = public
as $$
  select s.*
  from public.seasons s
  where s.is_current
  limit 1;
$$;

-- Week 1 = the Monday-to-Sunday week that contains starts_on.
-- Null before the season starts.
create or replace function public._season_week_number(
  target_season public.seasons,
  target_at timestamptz default now()
)
returns integer
language sql
stable
set search_path = public
as $$
  select case
    when target_season.season_number is null then null
    when target_at < public._amsterdam_day_start(target_season.starts_on) then null
    else (
      (public._amsterdam_week_start(target_at)
        - public._amsterdam_week_start(public._amsterdam_day_start(target_season.starts_on))) / 7
    ) + 1
  end;
$$;

-- Deterministic number in (0, 1) from a text seed.
create or replace function public._seeded_unit(seed text)
returns double precision
language sql
immutable
set search_path = public
as $$
  select ((('x' || substr(md5(seed), 1, 8))::bit(32)::bigint)::double precision + 0.5)
    / 4294967296.0;
$$;

-- ---------------------------------------------------------
-- 2. Weekly goal config + templates
-- ---------------------------------------------------------

create table if not exists public.weekly_goal_config (
  id boolean primary key default true check (id),
  goal_dp integer not null default 150 check (goal_dp >= 0),
  all_done_voucher_type text default 'premium_pack'
    check (all_done_voucher_type is null or all_done_voucher_type in ('normal_pack', 'premium_pack', 'deluxe_pack', 'special_pack')),
  all_done_voucher_quantity integer not null default 1 check (all_done_voucher_quantity >= 0),
  -- One goal per entry, in this order (slot 1, 2, 3...).
  categories text[] not null default array['play', 'collect', 'trade'],
  updated_at timestamptz not null default now()
);

comment on table public.weekly_goal_config is
  'Weekly goal economy (PROPOSAL from docs/season-sim-report.md: 3 x 150 DP, Premium voucher for all 3). Change here, not in code.';

insert into public.weekly_goal_config (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.goal_templates (
  id text primary key check (id ~ '^[a-z0-9_]+$'),
  category text not null check (length(trim(category)) > 0),
  goal_type text not null check (goal_type in (
    'competition_matches_played',
    'competition_matches_won',
    'rounds_completed',
    'packs_opened',
    'cards_collected',
    'trades_completed'
  )),
  target integer not null check (target >= 1),
  -- packs_opened:    {"pack_codes": ["premium", "deluxe"]}
  -- cards_collected: {"rarities": ["Super Rare", "Ultra Rare"]}
  params jsonb not null default '{}'::jsonb,
  title text not null check (length(trim(title)) > 0),
  description text,
  -- null = weekly_goal_config.goal_dp
  dp_reward integer check (dp_reward is null or dp_reward >= 0),
  weight integer not null default 1 check (weight >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.goal_templates is
  'Weekly goal pool. Each Monday one active template per weekly_goal_config.categories entry is picked by a seeded weighted random (same for the whole league). PROVISIONAL set - the owner will design the real goals.';

insert into public.goal_templates (id, category, goal_type, target, params, title, description, weight)
values
  ('play_duels_3', 'play', 'competition_matches_played', 3, '{}', 'Play 3 season duels', 'Finish 3 duels in the season competition.', 3),
  ('play_duels_5', 'play', 'competition_matches_played', 5, '{}', 'Play 5 season duels', 'Finish 5 duels in the season competition.', 1),
  ('play_wins_2', 'play', 'competition_matches_won', 2, '{}', 'Win 2 season duels', 'Win 2 duels in the season competition.', 2),
  ('play_rounds_2', 'play', 'rounds_completed', 2, '{}', 'Complete 2 rounds', 'Be part of 2 fully played season rounds.', 2),
  ('collect_packs_2', 'collect', 'packs_opened', 2, '{}', 'Open 2 packs', 'Open any 2 packs (vouchers count).', 3),
  ('collect_packs_4', 'collect', 'packs_opened', 4, '{}', 'Open 4 packs', 'Open any 4 packs (vouchers count).', 1),
  ('collect_cards_20', 'collect', 'cards_collected', 20, '{}', 'Collect 20 new cards', 'Add 20 new card copies to your collection (trades and the initial draft do not count).', 2),
  ('collect_super_rare', 'collect', 'cards_collected', 1,
    '{"rarities": ["Super Rare", "Ultra Rare", "Secret Rare", "Legendary"]}',
    'Pull a Super Rare or better', 'Get a new Super Rare, Ultra Rare, Secret Rare or Legendary copy.', 1),
  ('trade_once', 'trade', 'trades_completed', 1, '{}', 'Complete a trade', 'Have 1 trade accepted (sent or received).', 3),
  ('trade_twice', 'trade', 'trades_completed', 2, '{}', 'Complete 2 trades', 'Have 2 trades accepted (sent or received).', 1)
on conflict (id) do nothing;

-- ---------------------------------------------------------
-- 3. Weekly sets + progress
-- ---------------------------------------------------------

create table if not exists public.weekly_goal_sets (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  iso_week text not null,
  seed text not null,
  created_at timestamptz not null default now(),
  unique (league_id, week_start)
);

create table if not exists public.weekly_goal_set_items (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.weekly_goal_sets(id) on delete cascade,
  slot integer not null check (slot >= 1),
  category text not null,
  template_id text references public.goal_templates(id) on delete set null,
  goal_type text not null,
  target integer not null check (target >= 1),
  params jsonb not null default '{}'::jsonb,
  title text not null,
  dp_reward integer not null default 0 check (dp_reward >= 0),
  unique (set_id, slot)
);

create table if not exists public.weekly_goal_progress (
  set_item_id uuid not null references public.weekly_goal_set_items(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  progress integer not null default 0 check (progress >= 0),
  completed_at timestamptz,
  duel_point_transaction_id uuid references public.duel_point_transactions(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (set_item_id, profile_id)
);

create index if not exists weekly_goal_progress_profile_idx
  on public.weekly_goal_progress (profile_id, completed_at);

create table if not exists public.weekly_goal_bonus_grants (
  set_id uuid not null references public.weekly_goal_sets(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  voucher_id uuid references public.reward_vouchers(id) on delete set null,
  voucher_type text,
  voucher_quantity integer not null default 0,
  granted_at timestamptz not null default now(),
  primary key (set_id, profile_id)
);

alter table public.goal_templates enable row level security;
alter table public.weekly_goal_config enable row level security;
alter table public.weekly_goal_sets enable row level security;
alter table public.weekly_goal_set_items enable row level security;
alter table public.weekly_goal_progress enable row level security;
alter table public.weekly_goal_bonus_grants enable row level security;

drop policy if exists goal_templates_read on public.goal_templates;
create policy goal_templates_read on public.goal_templates
  for select to authenticated using (true);

drop policy if exists weekly_goal_config_read on public.weekly_goal_config;
create policy weekly_goal_config_read on public.weekly_goal_config
  for select to authenticated using (true);

drop policy if exists weekly_goal_sets_read on public.weekly_goal_sets;
create policy weekly_goal_sets_read on public.weekly_goal_sets
  for select to authenticated using (public.is_league_member(league_id));

drop policy if exists weekly_goal_set_items_read on public.weekly_goal_set_items;
create policy weekly_goal_set_items_read on public.weekly_goal_set_items
  for select to authenticated
  using (exists (
    select 1 from public.weekly_goal_sets s
    where s.id = set_id and public.is_league_member(s.league_id)
  ));

drop policy if exists weekly_goal_progress_read_own on public.weekly_goal_progress;
create policy weekly_goal_progress_read_own on public.weekly_goal_progress
  for select to authenticated using (profile_id = (select auth.uid()));

drop policy if exists weekly_goal_bonus_grants_read_own on public.weekly_goal_bonus_grants;
create policy weekly_goal_bonus_grants_read_own on public.weekly_goal_bonus_grants
  for select to authenticated using (profile_id = (select auth.uid()));

-- ---------------------------------------------------------
-- 4. Engine
-- ---------------------------------------------------------

-- The league's goal set for the week starting target_week_start
-- (a Monday). Created on first use: one template per configured
-- category, weighted seeded random (Efraimidis-Spirakis: smallest
-- -ln(u)/weight wins), so every member sees the same goals.
create or replace function public._ensure_weekly_goal_set(
  target_league_id uuid,
  target_week_start date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_id uuid;
  new_set_id uuid;
  config_row public.weekly_goal_config%rowtype;
  set_seed text;
  category_name text;
  template_row public.goal_templates%rowtype;
  next_slot integer := 0;
begin
  if target_league_id is null or target_week_start is null then
    return null;
  end if;

  if extract(isodow from target_week_start) <> 1 then
    raise exception 'A weekly goal set must start on a Monday.';
  end if;

  select id
  into existing_id
  from public.weekly_goal_sets
  where league_id = target_league_id
    and week_start = target_week_start;

  if existing_id is not null then
    return existing_id;
  end if;

  perform pg_advisory_xact_lock(
    hashtext('weekly_goal_set_' || target_league_id::text || '_' || target_week_start::text)
  );

  select id
  into existing_id
  from public.weekly_goal_sets
  where league_id = target_league_id
    and week_start = target_week_start;

  if existing_id is not null then
    return existing_id;
  end if;

  select *
  into config_row
  from public.weekly_goal_config
  where id = true;

  if not found then
    raise exception 'weekly_goal_config is missing.';
  end if;

  set_seed := md5(target_league_id::text || ':' || target_week_start::text);

  insert into public.weekly_goal_sets (league_id, week_start, iso_week, seed)
  values (
    target_league_id,
    target_week_start,
    to_char(target_week_start, 'IYYY-"W"IW'),
    set_seed
  )
  returning id
  into new_set_id;

  foreach category_name in array config_row.categories
  loop
    select t.*
    into template_row
    from public.goal_templates t
    where t.is_active
      and t.weight > 0
      and t.category = category_name
    order by
      -ln(public._seeded_unit(set_seed || ':' || category_name || ':' || t.id)) / t.weight,
      t.id
    limit 1;

    if not found then
      continue;
    end if;

    next_slot := next_slot + 1;

    insert into public.weekly_goal_set_items (
      set_id,
      slot,
      category,
      template_id,
      goal_type,
      target,
      params,
      title,
      dp_reward
    )
    values (
      new_set_id,
      next_slot,
      template_row.category,
      template_row.id,
      template_row.goal_type,
      template_row.target,
      template_row.params,
      template_row.title,
      coalesce(template_row.dp_reward, config_row.goal_dp)
    );
  end loop;

  return new_set_id;
end;
$$;

-- How far a player got on one goal type inside [from, to).
create or replace function public._weekly_goal_progress_count(
  target_goal_type text,
  target_params jsonb,
  target_profile_id uuid,
  target_league_id uuid,
  target_from timestamptz,
  target_to timestamptz
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result_count integer := 0;
begin
  if target_goal_type = 'competition_matches_played' then
    select count(*)
    into result_count
    from public.matches m
    where m.league_id = target_league_id
      and m.competition_id is not null
      and m.status = 'completed'
      and target_profile_id in (m.player_one_id, m.player_two_id)
      and m.completed_at >= target_from
      and m.completed_at < target_to;
  elsif target_goal_type = 'competition_matches_won' then
    select count(*)
    into result_count
    from public.matches m
    where m.league_id = target_league_id
      and m.competition_id is not null
      and m.status = 'completed'
      and m.winner_id = target_profile_id
      and m.completed_at >= target_from
      and m.completed_at < target_to;
  elsif target_goal_type = 'rounds_completed' then
    select count(*)
    into result_count
    from public.competition_round_reward_grants g
    join public.competitions c on c.id = g.competition_id
    where c.league_id = target_league_id
      and g.profile_id = target_profile_id
      and g.reward_role = 'participation'
      and g.status = 'granted'
      and g.granted_at >= target_from
      and g.granted_at < target_to;
  elsif target_goal_type = 'packs_opened' then
    select count(*)
    into result_count
    from public.shop_pack_openings o
    where o.profile_id = target_profile_id
      and o.opened_at >= target_from
      and o.opened_at < target_to
      and (
        jsonb_typeof(target_params -> 'pack_codes') is distinct from 'array'
        or o.pack_code in (select jsonb_array_elements_text(target_params -> 'pack_codes'))
      );
  elsif target_goal_type = 'cards_collected' then
    -- New physical copies (packs, rewards, shop singles...). Trades
    -- move an existing copy (from_owner_id is set) and do not count;
    -- neither does the one-time initial draft (64 cards in launch
    -- week would complete every Collect goal for free).
    select count(*)
    into result_count
    from public.ownership_history h
    join public.card_instances ci on ci.id = h.card_instance_id
    join public.card_catalog cc on cc.id = ci.card_catalog_id
    where h.league_id = target_league_id
      and h.to_owner_id = target_profile_id
      and h.from_owner_id is null
      and h.event_type like 'acquired:%'
      and h.event_type <> 'acquired:draft'
      and h.created_at >= target_from
      and h.created_at < target_to
      and (
        jsonb_typeof(target_params -> 'rarities') is distinct from 'array'
        or cc.game_rarity in (select jsonb_array_elements_text(target_params -> 'rarities'))
      );
  elsif target_goal_type = 'trades_completed' then
    select count(*)
    into result_count
    from public.trades t
    where t.league_id = target_league_id
      and t.status = 'accepted'
      and target_profile_id in (t.sender_id, t.receiver_id)
      and coalesce(t.completed_at, t.updated_at) >= target_from
      and coalesce(t.completed_at, t.updated_at) < target_to;
  else
    raise exception 'Unknown weekly goal type %.', target_goal_type;
  end if;

  return coalesce(result_count, 0);
end;
$$;

-- Recompute one player's progress on one weekly set and pay what is
-- newly completed. Returns the number of goals newly completed.
-- Callers hold the per-player advisory lock (see
-- _refresh_season_progress in migration 0810).
create or replace function public._refresh_weekly_goal_set(
  target_profile_id uuid,
  target_set_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  set_row public.weekly_goal_sets%rowtype;
  config_row public.weekly_goal_config%rowtype;
  item_row public.weekly_goal_set_items%rowtype;
  window_from timestamptz;
  window_to timestamptz;
  current_count integer;
  progress_row public.weekly_goal_progress%rowtype;
  new_tx_id uuid;
  newly_completed integer := 0;
  item_total integer;
  done_total integer;
  bonus_inserted boolean;
  new_voucher_id uuid;
begin
  select *
  into set_row
  from public.weekly_goal_sets
  where id = target_set_id;

  if not found then
    return 0;
  end if;

  window_from := public._amsterdam_day_start(set_row.week_start);
  window_to := public._amsterdam_day_start(set_row.week_start + 7);

  for item_row in
    select *
    from public.weekly_goal_set_items
    where set_id = target_set_id
    order by slot
  loop
    current_count := public._weekly_goal_progress_count(
      item_row.goal_type,
      item_row.params,
      target_profile_id,
      set_row.league_id,
      window_from,
      window_to
    );

    insert into public.weekly_goal_progress (set_item_id, profile_id, progress)
    values (item_row.id, target_profile_id, current_count)
    on conflict (set_item_id, profile_id)
    do update set
      progress = excluded.progress,
      updated_at = now()
    where public.weekly_goal_progress.progress is distinct from excluded.progress;

    select *
    into progress_row
    from public.weekly_goal_progress
    where set_item_id = item_row.id
      and profile_id = target_profile_id
    for update;

    -- Completed stays completed (a later correction never takes a
    -- weekly goal reward back).
    if progress_row.completed_at is not null or current_count < item_row.target then
      continue;
    end if;

    new_tx_id := null;

    if item_row.dp_reward > 0 then
      new_tx_id := public._credit_duel_points(
        target_profile_id,
        item_row.dp_reward,
        'weekly_goal',
        null,
        set_row.iso_week,
        jsonb_build_object(
          'weekly_goal_set_id', set_row.id,
          'weekly_goal_set_item_id', item_row.id,
          'iso_week', set_row.iso_week,
          'goal_type', item_row.goal_type,
          'target', item_row.target
        ),
        'Weekly goal: ' || item_row.title
      );
    end if;

    update public.weekly_goal_progress
    set
      completed_at = now(),
      duel_point_transaction_id = new_tx_id,
      updated_at = now()
    where set_item_id = item_row.id
      and profile_id = target_profile_id;

    newly_completed := newly_completed + 1;
  end loop;

  -- All goals of the week done -> the bonus voucher, once.
  select count(*)
  into item_total
  from public.weekly_goal_set_items
  where set_id = target_set_id;

  select count(*)
  into done_total
  from public.weekly_goal_set_items i
  join public.weekly_goal_progress p
    on p.set_item_id = i.id
   and p.profile_id = target_profile_id
  where i.set_id = target_set_id
    and p.completed_at is not null;

  if item_total > 0 and done_total = item_total then
    select *
    into config_row
    from public.weekly_goal_config
    where id = true;

    insert into public.weekly_goal_bonus_grants (
      set_id,
      profile_id,
      voucher_type,
      voucher_quantity
    )
    values (
      target_set_id,
      target_profile_id,
      config_row.all_done_voucher_type,
      case
        when config_row.all_done_voucher_type is null then 0
        else config_row.all_done_voucher_quantity
      end
    )
    on conflict (set_id, profile_id) do nothing
    returning true
    into bonus_inserted;

    if bonus_inserted
       and config_row.all_done_voucher_type is not null
       and config_row.all_done_voucher_quantity > 0 then
      insert into public.reward_vouchers (
        profile_id,
        voucher_type,
        quantity,
        source_type,
        source_id,
        note
      )
      values (
        target_profile_id,
        config_row.all_done_voucher_type,
        config_row.all_done_voucher_quantity,
        'weekly_goals',
        target_set_id,
        'Weekly goals: all ' || item_total || ' done'
      )
      returning id
      into new_voucher_id;

      update public.weekly_goal_bonus_grants
      set voucher_id = new_voucher_id
      where set_id = target_set_id
        and profile_id = target_profile_id;
    end if;
  end if;

  return newly_completed;
end;
$$;

-- ---------------------------------------------------------
-- Privileges: everything above is internal.
-- ---------------------------------------------------------

revoke all on function public._amsterdam_week_start(timestamptz) from public, anon, authenticated;
revoke all on function public._amsterdam_day_start(date) from public, anon, authenticated;
revoke all on function public._current_season() from public, anon, authenticated;
revoke all on function public._season_week_number(public.seasons, timestamptz) from public, anon, authenticated;
revoke all on function public._seeded_unit(text) from public, anon, authenticated;
revoke all on function public._ensure_weekly_goal_set(uuid, date) from public, anon, authenticated;
revoke all on function public._weekly_goal_progress_count(text, jsonb, uuid, uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public._refresh_weekly_goal_set(uuid, uuid) from public, anon, authenticated;
