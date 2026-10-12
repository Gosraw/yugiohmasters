-- =========================================================
-- 2.0 engagement, part 2: SEASON PATH (one free reward track)
-- + the page-load refresh / overview RPC for Home and /season.
--
-- Numbers = PROPOSAL from docs/season-sim-report.md (20 tiers x 85
-- XP; XP 10 per competition duel played, +5 per win, 10 per
-- completed round, 15 per weekly goal). Not owner-approved yet, so
-- they live in config tables:
--   * season_path_tiers       - XP needed + reward per tier
--   * season_path_xp_sources  - XP per source (on/off switch each)
--
-- XP is an append-only ledger (season_path_xp_events) synced from
-- real events: one row per (season, player, source, source id), so
-- re-running never double counts. A corrected duel that is no
-- longer a win loses its "won" XP row; tiers that were already
-- reached stay granted (rewards are never taken back).
--
-- Reaching a tier auto-grants its reward once
-- (season_path_tier_grants primary key): DP via _credit_duel_points
-- ("Season Path: tier 5 reward"), pack vouchers via reward_vouchers
-- (note shown by the reward pop-up), and a title on the final tier
-- (public.profile_titles).
--
-- get_my_season_overview(): the ONE call Home and /season make. It
-- refreshes the signed-in player's weekly goals (this week + last
-- week, so a goal finished Sunday night still pays on Monday), syncs
-- XP, grants reached tiers, and returns everything as JSON.
-- =========================================================

-- ---------------------------------------------------------
-- Config
-- ---------------------------------------------------------

create table if not exists public.season_path_tiers (
  season_number integer not null references public.seasons(season_number) on delete cascade,
  tier integer not null check (tier >= 1),
  -- XP needed for THIS tier, on top of the previous tier.
  xp_required integer not null check (xp_required > 0),
  dp_reward integer not null default 0 check (dp_reward >= 0),
  voucher_type text check (voucher_type is null or voucher_type in ('normal_pack', 'premium_pack', 'deluxe_pack', 'special_pack')),
  voucher_quantity integer not null default 0 check (voucher_quantity >= 0),
  title_reward text,
  -- Placeholder for cosmetics that do not exist yet (e.g. a card frame).
  cosmetic_reward text,
  label text,
  updated_at timestamptz not null default now(),
  primary key (season_number, tier)
);

comment on table public.season_path_tiers is
  'Season Path reward track (PROPOSAL from docs/season-sim-report.md). Change amounts here, never in code.';

insert into public.season_path_tiers (
  season_number, tier, xp_required, dp_reward, voucher_type, voucher_quantity, title_reward, cosmetic_reward, label
)
values
  (2, 1, 85, 100, null, 0, null, null, null),
  (2, 2, 85, 0, 'normal_pack', 1, null, null, null),
  (2, 3, 85, 150, null, 0, null, null, null),
  (2, 4, 85, 0, 'normal_pack', 1, null, null, null),
  (2, 5, 85, 0, 'premium_pack', 1, null, null, null),
  (2, 6, 85, 200, null, 0, null, null, null),
  (2, 7, 85, 0, 'normal_pack', 1, null, null, null),
  (2, 8, 85, 250, null, 0, null, null, null),
  (2, 9, 85, 0, 'premium_pack', 1, null, null, null),
  (2, 10, 85, 400, 'premium_pack', 1, null, null, 'Halfway chest'),
  (2, 11, 85, 200, null, 0, null, null, null),
  (2, 12, 85, 0, 'normal_pack', 1, null, null, null),
  (2, 13, 85, 300, null, 0, null, null, null),
  (2, 14, 85, 0, 'premium_pack', 1, null, null, null),
  (2, 15, 85, 400, null, 0, null, null, null),
  (2, 16, 85, 0, 'normal_pack', 1, null, null, null),
  (2, 17, 85, 500, null, 0, null, null, null),
  (2, 18, 85, 0, 'premium_pack', 1, null, null, null),
  (2, 19, 85, 600, null, 0, null, null, null),
  (2, 20, 85, 800, 'deluxe_pack', 1, 'Pharaoh''s Ascendant', 'Season 2 card frame', 'Final tier')
on conflict (season_number, tier) do nothing;

create table if not exists public.season_path_xp_sources (
  source text primary key check (source in (
    'competition_match_played',
    'competition_match_won',
    'round_completed',
    'weekly_goal_completed'
  )),
  xp integer not null default 0 check (xp >= 0),
  is_enabled boolean not null default true,
  label text not null,
  updated_at timestamptz not null default now()
);

comment on table public.season_path_xp_sources is
  'Season Path XP per source (PROPOSAL). New XP rows use the value at the moment they are recorded.';

insert into public.season_path_xp_sources (source, xp, label)
values
  ('competition_match_played', 10, 'Season duel played'),
  ('competition_match_won', 5, 'Season duel won (bonus)'),
  ('round_completed', 10, 'Round completed'),
  ('weekly_goal_completed', 15, 'Weekly goal completed')
on conflict (source) do nothing;

-- ---------------------------------------------------------
-- Per player
-- ---------------------------------------------------------

create table if not exists public.season_path_xp_events (
  id uuid primary key default gen_random_uuid(),
  season_number integer not null references public.seasons(season_number) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  source text not null,
  source_id uuid not null,
  xp integer not null check (xp >= 0),
  description text not null,
  created_at timestamptz not null default now(),
  unique (season_number, profile_id, source, source_id)
);

create index if not exists season_path_xp_events_profile_idx
  on public.season_path_xp_events (profile_id, season_number, created_at desc);

create table if not exists public.season_path_tier_grants (
  season_number integer not null references public.seasons(season_number) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tier integer not null,
  xp_at_grant integer not null,
  dp_granted integer not null default 0,
  duel_point_transaction_id uuid references public.duel_point_transactions(id) on delete set null,
  voucher_id uuid references public.reward_vouchers(id) on delete set null,
  voucher_type text,
  voucher_quantity integer not null default 0,
  title_granted text,
  granted_at timestamptz not null default now(),
  primary key (season_number, profile_id, tier)
);

create table if not exists public.profile_titles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  season_number integer references public.seasons(season_number) on delete set null,
  source text not null,
  granted_at timestamptz not null default now(),
  unique (profile_id, title)
);

comment on table public.profile_titles is
  'Permanent titles a player earned (Season Path final tier, later: season champion). Shown on Profile.';

alter table public.season_path_tiers enable row level security;
alter table public.season_path_xp_sources enable row level security;
alter table public.season_path_xp_events enable row level security;
alter table public.season_path_tier_grants enable row level security;
alter table public.profile_titles enable row level security;

drop policy if exists season_path_tiers_read on public.season_path_tiers;
create policy season_path_tiers_read on public.season_path_tiers
  for select to authenticated using (true);

drop policy if exists season_path_xp_sources_read on public.season_path_xp_sources;
create policy season_path_xp_sources_read on public.season_path_xp_sources
  for select to authenticated using (true);

drop policy if exists season_path_xp_events_read_own on public.season_path_xp_events;
create policy season_path_xp_events_read_own on public.season_path_xp_events
  for select to authenticated using (profile_id = (select auth.uid()));

drop policy if exists season_path_tier_grants_read_own on public.season_path_tier_grants;
create policy season_path_tier_grants_read_own on public.season_path_tier_grants
  for select to authenticated using (profile_id = (select auth.uid()));

drop policy if exists profile_titles_read on public.profile_titles;
create policy profile_titles_read on public.profile_titles
  for select to authenticated using (true);

-- ---------------------------------------------------------
-- XP sync
-- ---------------------------------------------------------

create or replace function public._sync_season_path_xp(
  target_profile_id uuid,
  target_season_number integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  season_row public.seasons%rowtype;
  window_from timestamptz;
  window_to timestamptz;
  played_xp integer;
  won_xp integer;
  round_xp integer;
  goal_xp integer;
  inserted_total integer := 0;
  inserted_now integer;
begin
  select *
  into season_row
  from public.seasons
  where season_number = target_season_number;

  if not found then
    return 0;
  end if;

  window_from := public._amsterdam_day_start(season_row.starts_on);
  window_to := case
    when season_row.ends_on is null then 'infinity'::timestamptz
    else public._amsterdam_day_start(season_row.ends_on + 1)
  end;

  select coalesce(max(xp) filter (where source = 'competition_match_played' and is_enabled), 0),
         coalesce(max(xp) filter (where source = 'competition_match_won' and is_enabled), 0),
         coalesce(max(xp) filter (where source = 'round_completed' and is_enabled), 0),
         coalesce(max(xp) filter (where source = 'weekly_goal_completed' and is_enabled), 0)
  into played_xp, won_xp, round_xp, goal_xp
  from public.season_path_xp_sources;

  -- A corrected duel that is no longer this player's win loses its
  -- bonus XP (XP only; reached tiers stay granted).
  delete from public.season_path_xp_events e
  where e.season_number = target_season_number
    and e.profile_id = target_profile_id
    and e.source = 'competition_match_won'
    and not exists (
      select 1
      from public.matches m
      where m.id = e.source_id
        and m.status = 'completed'
        and m.winner_id = target_profile_id
    );

  if played_xp > 0 then
    insert into public.season_path_xp_events (season_number, profile_id, source, source_id, xp, description)
    select
      target_season_number,
      target_profile_id,
      'competition_match_played',
      m.id,
      played_xp,
      'Season duel vs ' || coalesce(op.duelist_name, op.username, 'an opponent')
    from public.matches m
    left join public.profiles op
      on op.id = case when m.player_one_id = target_profile_id then m.player_two_id else m.player_one_id end
    where m.competition_id is not null
      and m.status = 'completed'
      and target_profile_id in (m.player_one_id, m.player_two_id)
      and m.completed_at >= window_from
      and m.completed_at < window_to
    on conflict (season_number, profile_id, source, source_id) do nothing;

    get diagnostics inserted_now = row_count;
    inserted_total := inserted_total + inserted_now;
  end if;

  if won_xp > 0 then
    insert into public.season_path_xp_events (season_number, profile_id, source, source_id, xp, description)
    select
      target_season_number,
      target_profile_id,
      'competition_match_won',
      m.id,
      won_xp,
      'Won a season duel vs ' || coalesce(op.duelist_name, op.username, 'an opponent')
    from public.matches m
    left join public.profiles op
      on op.id = case when m.player_one_id = target_profile_id then m.player_two_id else m.player_one_id end
    where m.competition_id is not null
      and m.status = 'completed'
      and m.winner_id = target_profile_id
      and m.completed_at >= window_from
      and m.completed_at < window_to
    on conflict (season_number, profile_id, source, source_id) do nothing;

    get diagnostics inserted_now = row_count;
    inserted_total := inserted_total + inserted_now;
  end if;

  if round_xp > 0 then
    insert into public.season_path_xp_events (season_number, profile_id, source, source_id, xp, description)
    select
      target_season_number,
      target_profile_id,
      'round_completed',
      g.id,
      round_xp,
      'Round ' || g.round_number || ' complete'
    from public.competition_round_reward_grants g
    where g.profile_id = target_profile_id
      and g.reward_role = 'participation'
      and g.status = 'granted'
      and g.granted_at >= window_from
      and g.granted_at < window_to
    on conflict (season_number, profile_id, source, source_id) do nothing;

    get diagnostics inserted_now = row_count;
    inserted_total := inserted_total + inserted_now;
  end if;

  if goal_xp > 0 then
    insert into public.season_path_xp_events (season_number, profile_id, source, source_id, xp, description)
    select
      target_season_number,
      target_profile_id,
      'weekly_goal_completed',
      i.id,
      goal_xp,
      'Weekly goal: ' || i.title
    from public.weekly_goal_progress p
    join public.weekly_goal_set_items i on i.id = p.set_item_id
    where p.profile_id = target_profile_id
      and p.completed_at is not null
      and p.completed_at >= window_from
      and p.completed_at < window_to
    on conflict (season_number, profile_id, source, source_id) do nothing;

    get diagnostics inserted_now = row_count;
    inserted_total := inserted_total + inserted_now;
  end if;

  return inserted_total;
end;
$$;

-- ---------------------------------------------------------
-- Tier grants
-- ---------------------------------------------------------

create or replace function public._grant_season_path_tiers(
  target_profile_id uuid,
  target_season_number integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  season_row public.seasons%rowtype;
  total_xp integer;
  cumulative_xp integer := 0;
  tier_row public.season_path_tiers%rowtype;
  grant_inserted boolean;
  new_tx_id uuid;
  new_voucher_id uuid;
  reward_line text;
  granted_count integer := 0;
begin
  select *
  into season_row
  from public.seasons
  where season_number = target_season_number;

  if not found then
    return 0;
  end if;

  select coalesce(sum(xp), 0)
  into total_xp
  from public.season_path_xp_events
  where season_number = target_season_number
    and profile_id = target_profile_id;

  for tier_row in
    select *
    from public.season_path_tiers
    where season_number = target_season_number
    order by tier
  loop
    cumulative_xp := cumulative_xp + tier_row.xp_required;

    exit when total_xp < cumulative_xp;

    grant_inserted := null;

    insert into public.season_path_tier_grants (
      season_number,
      profile_id,
      tier,
      xp_at_grant,
      dp_granted,
      voucher_type,
      voucher_quantity,
      title_granted
    )
    values (
      target_season_number,
      target_profile_id,
      tier_row.tier,
      total_xp,
      tier_row.dp_reward,
      tier_row.voucher_type,
      case when tier_row.voucher_type is null then 0 else tier_row.voucher_quantity end,
      tier_row.title_reward
    )
    on conflict (season_number, profile_id, tier) do nothing
    returning true
    into grant_inserted;

    if grant_inserted is not true then
      continue;
    end if;

    granted_count := granted_count + 1;
    reward_line := 'Season Path: tier ' || tier_row.tier || ' reward';
    new_tx_id := null;
    new_voucher_id := null;

    if tier_row.dp_reward > 0 then
      new_tx_id := public._credit_duel_points(
        target_profile_id,
        tier_row.dp_reward,
        'season_path_reward',
        null,
        season_row.name,
        jsonb_build_object(
          'season_number', target_season_number,
          'tier', tier_row.tier,
          'xp', total_xp
        ),
        reward_line
      );
    end if;

    if tier_row.voucher_type is not null and tier_row.voucher_quantity > 0 then
      insert into public.reward_vouchers (
        profile_id,
        voucher_type,
        quantity,
        source_type,
        note
      )
      values (
        target_profile_id,
        tier_row.voucher_type,
        tier_row.voucher_quantity,
        'season_path',
        reward_line
      )
      returning id
      into new_voucher_id;
    end if;

    if tier_row.title_reward is not null and length(trim(tier_row.title_reward)) > 0 then
      insert into public.profile_titles (profile_id, title, season_number, source)
      values (target_profile_id, tier_row.title_reward, target_season_number, 'season_path')
      on conflict (profile_id, title) do nothing;
    end if;

    update public.season_path_tier_grants
    set
      duel_point_transaction_id = new_tx_id,
      voucher_id = new_voucher_id
    where season_number = target_season_number
      and profile_id = target_profile_id
      and tier = tier_row.tier;
  end loop;

  return granted_count;
end;
$$;

-- ---------------------------------------------------------
-- Refresh everything for one player (idempotent).
-- ---------------------------------------------------------

create or replace function public._refresh_season_progress(
  target_profile_id uuid,
  target_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  season_row public.seasons%rowtype;
  league_id_value uuid;
  this_week date;
  season_first_week date;
  previous_set_id uuid;
  current_set_id uuid;
begin
  if target_profile_id is null then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('season_progress_' || target_profile_id::text));

  select *
  into season_row
  from public.seasons
  where is_current
  limit 1;

  if not found or target_at < public._amsterdam_day_start(season_row.starts_on) then
    return;
  end if;

  select lm.league_id
  into league_id_value
  from public.league_members lm
  where lm.profile_id = target_profile_id
  order by lm.joined_at nulls last
  limit 1;

  if league_id_value is not null then
    this_week := public._amsterdam_week_start(target_at);
    season_first_week := public._amsterdam_week_start(public._amsterdam_day_start(season_row.starts_on));

    -- Last week: only if that set exists (someone saw those goals)
    -- and it was part of this season.
    if this_week - 7 >= season_first_week then
      select id
      into previous_set_id
      from public.weekly_goal_sets
      where league_id = league_id_value
        and week_start = this_week - 7;

      if previous_set_id is not null then
        perform public._refresh_weekly_goal_set(target_profile_id, previous_set_id);
      end if;
    end if;

    current_set_id := public._ensure_weekly_goal_set(league_id_value, this_week);
    perform public._refresh_weekly_goal_set(target_profile_id, current_set_id);
  end if;

  perform public._sync_season_path_xp(target_profile_id, season_row.season_number);
  perform public._grant_season_path_tiers(target_profile_id, season_row.season_number);
end;
$$;

-- ---------------------------------------------------------
-- Public: refresh + read for the signed-in player.
-- ---------------------------------------------------------

create or replace function public.get_my_season_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  season_row public.seasons%rowtype;
  league_id_value uuid;
  this_week date;
  set_row public.weekly_goal_sets%rowtype;
  config_row public.weekly_goal_config%rowtype;
  weekly_json jsonb := null;
  total_xp integer := 0;
  tiers_json jsonb;
  events_json jsonb;
  sources_json jsonb;
  titles_json jsonb;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  perform public._refresh_season_progress(current_user_id, now());

  select *
  into season_row
  from public.seasons
  where is_current
  limit 1;

  if not found then
    return jsonb_build_object('season', null);
  end if;

  select lm.league_id
  into league_id_value
  from public.league_members lm
  where lm.profile_id = current_user_id
  order by lm.joined_at nulls last
  limit 1;

  this_week := public._amsterdam_week_start(now());

  select *
  into config_row
  from public.weekly_goal_config
  where id = true;

  if league_id_value is not null then
    select *
    into set_row
    from public.weekly_goal_sets
    where league_id = league_id_value
      and week_start = this_week;

    if found then
      weekly_json := jsonb_build_object(
        'set_id', set_row.id,
        'iso_week', set_row.iso_week,
        'week_start', set_row.week_start,
        'ends_at', public._amsterdam_day_start(set_row.week_start + 7),
        'items', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', i.id,
              'slot', i.slot,
              'category', i.category,
              'goal_type', i.goal_type,
              'title', i.title,
              'description', t.description,
              'target', i.target,
              'progress', least(coalesce(p.progress, 0), i.target),
              'completed', p.completed_at is not null,
              'dp_reward', i.dp_reward
            )
            order by i.slot
          )
          from public.weekly_goal_set_items i
          left join public.goal_templates t on t.id = i.template_id
          left join public.weekly_goal_progress p
            on p.set_item_id = i.id
           and p.profile_id = current_user_id
          where i.set_id = set_row.id
        ), '[]'::jsonb),
        'bonus', jsonb_build_object(
          'voucher_type', config_row.all_done_voucher_type,
          'voucher_quantity', config_row.all_done_voucher_quantity,
          'granted', exists (
            select 1
            from public.weekly_goal_bonus_grants b
            where b.set_id = set_row.id
              and b.profile_id = current_user_id
          )
        )
      );
    end if;
  end if;

  select coalesce(sum(xp), 0)
  into total_xp
  from public.season_path_xp_events
  where season_number = season_row.season_number
    and profile_id = current_user_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'tier', t.tier,
      'xp_required', t.xp_required,
      'cumulative_xp', t.cumulative_xp,
      'dp_reward', t.dp_reward,
      'voucher_type', t.voucher_type,
      'voucher_quantity', t.voucher_quantity,
      'title_reward', t.title_reward,
      'cosmetic_reward', t.cosmetic_reward,
      'label', t.label,
      'granted', g.tier is not null
    )
    order by t.tier
  ), '[]'::jsonb)
  into tiers_json
  from (
    select
      st.*,
      sum(st.xp_required) over (order by st.tier)::integer as cumulative_xp
    from public.season_path_tiers st
    where st.season_number = season_row.season_number
  ) t
  left join public.season_path_tier_grants g
    on g.season_number = t.season_number
   and g.profile_id = current_user_id
   and g.tier = t.tier;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'source', e.source,
      'xp', e.xp,
      'description', e.description,
      'created_at', e.created_at
    )
    order by e.created_at desc, e.id
  ), '[]'::jsonb)
  into events_json
  from (
    select *
    from public.season_path_xp_events
    where season_number = season_row.season_number
      and profile_id = current_user_id
    order by created_at desc, id
    limit 12
  ) e;

  select coalesce(jsonb_agg(
    jsonb_build_object('source', s.source, 'xp', s.xp, 'label', s.label)
    order by s.source
  ), '[]'::jsonb)
  into sources_json
  from public.season_path_xp_sources s
  where s.is_enabled
    and s.xp > 0;

  select coalesce(jsonb_agg(pt.title order by pt.granted_at), '[]'::jsonb)
  into titles_json
  from public.profile_titles pt
  where pt.profile_id = current_user_id;

  return jsonb_build_object(
    'season', jsonb_build_object(
      'number', season_row.season_number,
      'name', season_row.name,
      'starts_on', season_row.starts_on,
      'ends_on', season_row.ends_on,
      'week', public._season_week_number(season_row, now())
    ),
    'weekly', weekly_json,
    'path', jsonb_build_object(
      'xp', total_xp,
      'tiers', tiers_json,
      'recent_xp', events_json,
      'xp_sources', sources_json
    ),
    'titles', titles_json
  );
end;
$$;

comment on function public.get_my_season_overview() is
  'Home + /season: refreshes the signed-in player''s weekly goals, Season Path XP and tier rewards (idempotent), then returns season/week, this week''s goals and the Season Path as JSON.';

revoke all on function public._sync_season_path_xp(uuid, integer) from public, anon, authenticated;
revoke all on function public._grant_season_path_tiers(uuid, integer) from public, anon, authenticated;
revoke all on function public._refresh_season_progress(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.get_my_season_overview() from public, anon;
grant execute on function public.get_my_season_overview() to authenticated;
