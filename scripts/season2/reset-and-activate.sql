-- =========================================================
-- Duelist Circle 2.0 - Season 2 launch night: light reset +
-- Classic v2 activation. ONE transaction, pre-flight + post-flight
-- assertions (same pattern as
-- supabase/manual_deploy/20260902_season1_release.sql).
--
-- NOT a migration. Run it once, on launch night, AFTER every
-- 2026-10-12 migration is applied (see docs/LAUNCH_2_0_RUNBOOK.md),
-- with psql:
--
--   psql "<database url>" -v ON_ERROR_STOP=1 \
--     -v launch_date=2026-10-19 -v mode=dry_run \
--     -f scripts/season2/reset-and-activate.sql
--
--   mode=dry_run  everything runs, every assertion is checked, then
--                 ROLLBACK - nothing changes. Always do this first.
--   mode=apply    same, then COMMIT.
--   launch_date   first day of Season 2 (seasons.starts_on; "Week 1"
--                 is the Monday-Sunday week containing it).
--
-- WHAT IT DOES
--   Wipes gameplay: owned cards (+ ownership history), DP (balances
--   to 0, ledger cleared), decks, matches + wagers, trades,
--   competitions (+ results, grants, deck locks), drafts (so every
--   player does a new Initial Draft), Boss Paths / evolution
--   progress, pack luck + pity, reward vouchers, shop purchase /
--   pack-opening history, weekly goals, Season Path XP + tier
--   grants, bounty / catch-up grants, mini game runs + rewards,
--   P2W achievement claims, coach insights, and the welcome-pack
--   claims (so all players get the 3 welcome packs again).
--   KEEPS: accounts (auth users, profiles, wallets rows), leagues and
--   league membership INCLUDING roles (the admin stays admin - unlike
--   the Season 1 reset nobody has to re-register), profile titles
--   (season titles are permanent), card catalog, every config table,
--   the card vote history, audit log, wishlists.
--   Then: seasons.starts_on = :launch_date; activates
--   duelist_circle_classic_v2 (deactivates any other format) and
--   recomputes card_catalog.format_eligible with it; copies the
--   proposed rarities into card_catalog.game_rarity; regenerates the
--   current shop singles rotation from the new pool.
--   Onboarding after this is the Season 1 flow: Boss Path -> Initial
--   Draft -> 3 welcome packs (proxy.ts drives it from DB state).
--
-- SAFETY
--   - Every public table must be classified below (wipe / keep).
--     A table this script doesn't know (e.g. a new mini game table)
--     aborts the run before anything is written.
--   - A kept table that still points at a wiped table with a
--     RESTRICT / NO ACTION foreign key aborts the run.
--   - Post-flight proves: wiped tables are empty, memberships and
--     roles are byte-for-byte the same, the pool is exactly the
--     6,136 cards, every pool card has its proposed rarity.
-- =========================================================

\set ON_ERROR_STOP on

\if :{?launch_date}
\else
  \echo 'Missing -v launch_date=YYYY-MM-DD (first day of Season 2). Nothing was changed.'
  \quit
\endif

\if :{?mode}
\else
  \echo 'Missing -v mode=dry_run or -v mode=apply. Nothing was changed.'
  \quit
\endif

select (:'mode' = 'apply') as season2_apply, (:'mode' in ('apply', 'dry_run')) as season2_mode_ok \gset

\if :season2_mode_ok
\else
  \echo 'mode must be dry_run or apply. Nothing was changed.'
  \quit
\endif

begin;

select set_config('season2.launch_date', (:'launch_date')::date::text, true);
select set_config('season2.mode', :'mode', true);

-- ---------------------------------------------------------
-- Table plan: every public table, wipe or keep.
-- ---------------------------------------------------------

create temp table season2_table_plan (
  table_name text primary key,
  plan text not null check (plan in ('wipe', 'keep'))
) on commit drop;

insert into season2_table_plan (table_name, plan)
select unnest(array[
  'achievement_claims',
  'card_instances', 'ownership_history',
  'competition_deck_locks', 'competition_players', 'competition_results',
  'competition_reward_grants', 'competition_reward_rules',
  'competition_round_reward_grants', 'competition_round_reward_rules',
  'competition_tiebreaks', 'competitions',
  'dashboard_coach_insights',
  'deck_cards', 'decks',
  'draft_offer_cards', 'draft_offers', 'draft_picks', 'draft_players', 'drafts',
  'duel_point_transactions',
  'game_runs', 'mini_game_period_settlements', 'mini_game_reward_grants',
  'match_dp_escrows', 'match_wager_cards', 'matches',
  'player_boss_achievement_events', 'player_boss_paths', 'player_boss_stage_unlocks',
  'player_pack_luck',
  'reward_vouchers',
  'season1_welcome_bonus_claims',
  'season_bonus_grants', 'season_match_bounty_checks',
  'season_path_tier_grants', 'season_path_xp_events',
  'shop_pack_openings', 'shop_pack_pity', 'shop_pack_pulls', 'shop_purchases',
  'trade_items', 'trades',
  'weekly_goal_bonus_grants', 'weekly_goal_progress', 'weekly_goal_set_items', 'weekly_goal_sets'
]), 'wipe'
union all
select unnest(array[
  '_devstack_migrations',
  'achievements', 'archetype_cards', 'archetype_registry', 'audit_log',
  'boss_monster_options', 'boss_route_achievement_events', 'boss_route_achievement_requirements',
  'boss_route_stage_grants', 'boss_route_stages', 'boss_routes',
  'card_catalog', 'card_mechanics', 'card_synergy_edges', 'card_synergy_engine_runs',
  'card_vote_items', 'card_vote_tiebreaks', 'card_votes',
  'card_wishlist_items',
  'duelist_circle_card_limits', 'duelist_circle_formats', 'duelist_circle_proposed_rarities',
  'format_card_overrides',
  'goal_templates', 'league_economy_defaults', 'league_members', 'leagues',
  'mini_game_daily_seeds', 'mini_game_reward_config',
  'profile_titles', 'profiles',
  'season_bonus_config', 'season_path_tiers', 'season_path_xp_sources', 'seasons',
  'settings',
  'shop_pack_types', 'shop_rotation_cards', 'shop_rotations',
  'shop_special_pack_definitions', 'shop_special_pack_pool_cards',
  'shop_special_pack_rotations', 'shop_special_pack_slots',
  'wallets', 'weekly_goal_config'
]), 'keep';


-- =========================================================
-- PRE-FLIGHT (nothing written yet)
-- =========================================================

do $preflight$
declare
  v_unknown text;
  v_blocking text;
  v_format public.duelist_circle_formats;
  v_includes integer;
  v_rarities integer;
  v_limits integer;
  v_current_seasons integer;
  v_launch date := current_setting('season2.launch_date')::date;
  v_admins integer;
begin
  -- 1. Every table classified.
  select string_agg(c.relname, ', ' order by c.relname)
  into v_unknown
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and not exists (select 1 from season2_table_plan p where p.table_name = c.relname);

  if v_unknown is not null then
    raise exception 'PRE-FLIGHT ABORTED: table(s) not classified as wipe/keep in scripts/season2/reset-and-activate.sql: %. Decide what Season 2 does with them, add them to season2_table_plan, and run again.', v_unknown;
  end if;

  -- 2. No kept table blocks a wiped one.
  select string_agg(format('%s -> %s', con.conrelid::regclass, con.confrelid::regclass), ', ')
  into v_blocking
  from pg_constraint con
  join season2_table_plan target on target.table_name = con.confrelid::regclass::text and target.plan = 'wipe'
  join season2_table_plan source on source.table_name = con.conrelid::regclass::text and source.plan = 'keep'
  where con.contype = 'f'
    and con.confdeltype in ('a', 'r');

  if v_blocking is not null then
    raise exception 'PRE-FLIGHT ABORTED: kept table(s) reference wiped tables with RESTRICT/NO ACTION: %', v_blocking;
  end if;

  -- 3. Classic v2 is ready (the 2026-10-12 migrations ran).
  select * into v_format from public.duelist_circle_formats where code = 'duelist_circle_classic_v2';

  if v_format.id is null then
    raise exception 'PRE-FLIGHT ABORTED: format duelist_circle_classic_v2 missing - apply the 202610121030 migration first.';
  end if;

  if not v_format.curated_pool_only then
    raise exception 'PRE-FLIGHT ABORTED: duelist_circle_classic_v2 is not curated_pool_only.';
  end if;

  select count(*) into v_includes
  from public.format_card_overrides
  where format_id = v_format.id and override_type = 'include';

  select count(*) into v_rarities
  from public.duelist_circle_proposed_rarities
  where format_code = v_format.code;

  select count(*) into v_limits
  from public.duelist_circle_card_limits
  where format_code = v_format.code;

  if v_includes <> 6136 or v_rarities <> 6136 or v_limits = 0 then
    raise exception 'PRE-FLIGHT ABORTED: Classic v2 data incomplete (includes %, proposed rarities %, banlist rows %; expected 6136 / 6136 / >0). If the pool changed after the vote, update the expected numbers here deliberately.', v_includes, v_rarities, v_limits;
  end if;

  -- 4. Season calendar.
  select count(*) into v_current_seasons from public.seasons where is_current;

  if v_current_seasons <> 1 or not exists (select 1 from public.seasons where is_current and season_number = 2) then
    raise exception 'PRE-FLIGHT ABORTED: expected exactly one current season, season 2 (found % current).', v_current_seasons;
  end if;

  if v_launch < current_date - 7 or v_launch > current_date + 60 then
    raise exception 'PRE-FLIGHT ABORTED: launch_date % looks wrong (more than a week ago or 60+ days ahead).', v_launch;
  end if;

  -- 5. Every league keeps an admin.
  select count(*) into v_admins
  from public.leagues l
  where exists (select 1 from public.league_members m where m.league_id = l.id)
    and not exists (select 1 from public.league_members m where m.league_id = l.id and m.role = 'admin');

  if v_admins > 0 then
    raise exception 'PRE-FLIGHT ABORTED: % league(s) with members have no admin - fix that first (claim_league_admin_if_none).', v_admins;
  end if;

  raise notice 'PRE-FLIGHT OK: all tables classified, no blocking FKs, Classic v2 ready (% includes, % rarities, % banlist rows), launch_date %, mode %.',
    v_includes, v_rarities, v_limits, v_launch, current_setting('season2.mode');
end;
$preflight$;

-- Snapshots for the post-flight "kept exactly" checks.
create temp table season2_before_members on commit drop as
  select league_id, profile_id, role::text as role from public.league_members;

create temp table season2_before_counts on commit drop as
  select
    (select count(*) from public.profiles) as profiles,
    (select count(*) from public.leagues) as leagues,
    (select count(*) from public.card_catalog) as card_catalog,
    (select count(*) from public.profile_titles) as profile_titles,
    (select count(*) from public.card_votes) as card_votes,
    (select count(*) from public.audit_log) as audit_log;

-- Preview: rows about to be wiped (printed as notices).
do $preview$
declare
  t record;
  n bigint;
  total bigint := 0;
begin
  for t in select table_name from season2_table_plan where plan = 'wipe' order by table_name loop
    execute format('select count(*) from public.%I', t.table_name) into n;
    total := total + n;
    if n > 0 then
      raise notice 'WIPE %: % rows', rpad(t.table_name, 34), n;
    end if;
  end loop;
  raise notice 'WIPE total: % rows; DP to reset: % across % profiles',
    total,
    (select coalesce(sum(duel_points), 0) from public.profiles),
    (select count(*) from public.profiles where duel_points <> 0);
end;
$preview$;


-- =========================================================
-- 1. WIPE GAMEPLAY (dependency order: children first)
-- =========================================================

-- Weekly goals, Season Path, bounty / catch-up, mini games (their
-- grants point at reward_vouchers, so they go first).
delete from public.weekly_goal_bonus_grants where true;
delete from public.weekly_goal_progress where true;
delete from public.weekly_goal_set_items where true;
delete from public.weekly_goal_sets where true;
delete from public.season_path_tier_grants where true;
delete from public.season_path_xp_events where true;
delete from public.season_bonus_grants where true;
delete from public.season_match_bounty_checks where true;
delete from public.mini_game_reward_grants where true;
delete from public.mini_game_period_settlements where true;
delete from public.game_runs where true;

-- Boss progress, luck, coach, welcome-pack claims.
delete from public.player_boss_achievement_events where true;
delete from public.player_boss_stage_unlocks where true;
delete from public.player_boss_paths where true;
delete from public.player_pack_luck where true;
delete from public.dashboard_coach_insights where true;
delete from public.season1_welcome_bonus_claims where true;

-- Drafts (every player gets a new one-time Initial Draft).
delete from public.draft_picks where true;
delete from public.draft_offer_cards where true;
delete from public.draft_offers where true;
delete from public.draft_players where true;
delete from public.drafts where true;

-- Shop history, pity, vouchers; un-sell rotation slots.
delete from public.shop_pack_pulls where true;
delete from public.shop_pack_openings where true;
delete from public.shop_purchases where true;
delete from public.shop_pack_pity where true;
delete from public.reward_vouchers where true;

update public.shop_rotation_cards
set sold_to_profile_id = null, sold_at = null
where sold_to_profile_id is not null or sold_at is not null;

-- Competitions (cascades rules, tiebreaks, deck locks, round grants).
delete from public.competition_reward_grants where true;
delete from public.competition_round_reward_grants where true;
delete from public.competition_results where true;
delete from public.competition_players where true;
delete from public.competitions where true;

-- Matches, wagers, DP ledger.
delete from public.match_wager_cards where true;
delete from public.match_dp_escrows where true;
delete from public.duel_point_transactions where true;
delete from public.matches where true;

-- Trades, decks, P2W claims.
delete from public.trade_items where true;
delete from public.trades where true;
delete from public.deck_cards where true;
delete from public.decks where true;
delete from public.achievement_claims where true;

-- Owned cards. card_instances has a deliberate hard BEFORE DELETE
-- guard (prevent_card_instance_delete_trigger); a season reset is
-- the one sanctioned exception. Suspended for exactly this
-- statement, inside this transaction (a failure rolls the
-- suspension back too) - never dropped or weakened.
delete from public.ownership_history where true;
alter table public.card_instances disable trigger prevent_card_instance_delete_trigger;
delete from public.card_instances where true;
alter table public.card_instances enable trigger prevent_card_instance_delete_trigger;

-- DP balances (wallets follow via profiles_sync_wallet_balance).
update public.profiles set duel_points = 0, updated_at = now() where duel_points <> 0;
update public.wallets set duel_points = 0, updated_at = now() where duel_points <> 0;


-- =========================================================
-- 2. SEASON CALENDAR
-- =========================================================

update public.seasons
set starts_on = current_setting('season2.launch_date')::date,
    updated_at = now()
where is_current and season_number = 2;


-- =========================================================
-- 3. ACTIVATE CLASSIC V2 + RECOMPUTE ELIGIBILITY
--    (same work as recompute_format_eligibility(), which needs a
--    signed-in admin and so can't run from here)
-- =========================================================

update public.duelist_circle_formats
set is_active = false, updated_at = now()
where is_active and code <> 'duelist_circle_classic_v2';

update public.duelist_circle_formats
set is_active = true, updated_at = now()
where code = 'duelist_circle_classic_v2';

with v2 as (
  select id, code from public.duelist_circle_formats where code = 'duelist_circle_classic_v2'
),
computed as (
  select c.id, public.is_duelist_circle_format_eligible(c.id, v2.id) as eligible, v2.code
  from public.card_catalog c
  cross join v2
)
update public.card_catalog c
set
  format_eligible = computed.eligible,
  format_exclusion_reason = case
    when computed.eligible then null
    else 'Not in ' || computed.code || ' (Season 2 Classic pool)'
  end,
  updated_at = now()
from computed
where c.id = computed.id
  and (c.format_eligible is distinct from computed.eligible
       or (not computed.eligible and c.format_exclusion_reason is distinct from 'Not in ' || computed.code || ' (Season 2 Classic pool)')
       or (computed.eligible and c.format_exclusion_reason is not null));


-- =========================================================
-- 4. PROPOSED RARITIES -> LIVE game_rarity
-- =========================================================

update public.card_catalog c
set
  game_rarity = p.proposed_rarity,
  rarity_reason = 'Season 2 Classic ranking (' || p.source || coalesce(', rank ' || p.rank, '') || ')',
  rarity_needs_review = false,
  rarity_reviewed_at = now(),
  updated_at = now()
from public.duelist_circle_proposed_rarities p
where p.format_code = 'duelist_circle_classic_v2'
  and p.card_catalog_id = c.id
  and (c.game_rarity is distinct from p.proposed_rarity or c.rarity_needs_review);


-- =========================================================
-- 5. SHOP: retire the current singles rotation (it lists concrete
--    cards from the old pool) and regenerate it from the new pool.
--    Special pack rotations only hold a theme - their cards are
--    picked at purchase time from format_eligible cards - so they
--    keep running.
-- =========================================================

update public.shop_rotations
set status = 'completed', ends_at = least(ends_at, now()), updated_at = now()
where status = 'active';

select public.ensure_shop_rotations_current();


-- =========================================================
-- POST-FLIGHT
-- =========================================================

do $postflight$
declare
  t record;
  n bigint;
  v_format public.duelist_circle_formats;
  v_before season2_before_counts;
  v_eligible integer;
  v_wrong_rarity integer;
  v_member_diff integer;
  v_bad_rotation integer;
  v_active_formats integer;
  v_launch date := current_setting('season2.launch_date')::date;
  v_def record;
begin
  -- Wiped tables are empty.
  for t in select table_name from season2_table_plan where plan = 'wipe' order by table_name loop
    execute format('select count(*) from public.%I', t.table_name) into n;
    if n <> 0 then
      raise exception 'POST-FLIGHT FAILED: % still has % rows', t.table_name, n;
    end if;
  end loop;
  raise notice 'POST-FLIGHT: all % wiped tables are empty', (select count(*) from season2_table_plan where plan = 'wipe');

  if exists (select 1 from public.profiles where duel_points <> 0)
    or exists (select 1 from public.wallets where duel_points <> 0)
  then
    raise exception 'POST-FLIGHT FAILED: a DP balance is not 0';
  end if;

  if exists (select 1 from public.shop_rotation_cards where sold_to_profile_id is not null) then
    raise exception 'POST-FLIGHT FAILED: shop rotation slots still marked sold';
  end if;

  if exists (
    select tgenabled from pg_trigger
    where tgname = 'prevent_card_instance_delete_trigger' and tgenabled <> 'O'
  ) then
    raise exception 'POST-FLIGHT FAILED: prevent_card_instance_delete_trigger is not enabled';
  end if;
  raise notice 'POST-FLIGHT: DP all 0, shop slots unsold, card-instance delete guard re-enabled';

  -- Accounts, memberships and roles kept exactly.
  select count(*) into v_member_diff
  from (
    (select league_id, profile_id, role::text from public.league_members
     except
     select league_id, profile_id, role from season2_before_members)
    union all
    (select league_id, profile_id, role from season2_before_members
     except
     select league_id, profile_id, role::text from public.league_members)
  ) diff;

  if v_member_diff <> 0 then
    raise exception 'POST-FLIGHT FAILED: league membership changed (% differing rows)', v_member_diff;
  end if;

  select * into v_before from season2_before_counts;

  if (select count(*) from public.profiles) <> v_before.profiles
    or (select count(*) from public.leagues) <> v_before.leagues
    or (select count(*) from public.card_catalog) <> v_before.card_catalog
    or (select count(*) from public.profile_titles) <> v_before.profile_titles
    or (select count(*) from public.card_votes) <> v_before.card_votes
    or (select count(*) from public.audit_log) < v_before.audit_log
  then
    raise exception 'POST-FLIGHT FAILED: a kept table changed size (profiles/leagues/card_catalog/profile_titles/card_votes/audit_log)';
  end if;
  raise notice 'POST-FLIGHT: % profiles, % league memberships (roles unchanged), % titles kept',
    v_before.profiles, (select count(*) from season2_before_members), v_before.profile_titles;

  -- Season calendar.
  if not exists (select 1 from public.seasons where is_current and season_number = 2 and starts_on = v_launch) then
    raise exception 'POST-FLIGHT FAILED: current season 2 does not start on %', v_launch;
  end if;
  raise notice 'POST-FLIGHT: Season 2 starts on % (week 1 = the Monday-Sunday week containing it)', v_launch;

  -- Format active, pool exact.
  select count(*) into v_active_formats from public.duelist_circle_formats where is_active;
  select * into v_format from public.duelist_circle_formats where code = 'duelist_circle_classic_v2';

  if v_active_formats <> 1 or not v_format.is_active then
    raise exception 'POST-FLIGHT FAILED: duelist_circle_classic_v2 is not the one active format';
  end if;

  select count(*) into v_eligible from public.card_catalog where format_eligible;

  if v_eligible <> 6136 then
    raise exception 'POST-FLIGHT FAILED: % format_eligible cards, expected exactly 6136', v_eligible;
  end if;

  if exists (
    select 1 from public.card_catalog c
    where c.format_eligible
      and not exists (
        select 1 from public.format_card_overrides o
        where o.format_id = v_format.id and o.card_catalog_id = c.id and o.override_type = 'include'
      )
  ) then
    raise exception 'POST-FLIGHT FAILED: an eligible card is not in the Classic v2 pool';
  end if;
  raise notice 'POST-FLIGHT: duelist_circle_classic_v2 active, exactly 6136 eligible cards (boss_route_exempt = %)', v_format.boss_route_exempt;

  -- Rarities.
  select count(*) into v_wrong_rarity
  from public.duelist_circle_proposed_rarities p
  join public.card_catalog c on c.id = p.card_catalog_id
  where p.format_code = v_format.code
    and c.game_rarity is distinct from p.proposed_rarity;

  if v_wrong_rarity <> 0 then
    raise exception 'POST-FLIGHT FAILED: % pool cards do not have their proposed rarity', v_wrong_rarity;
  end if;

  raise notice 'POST-FLIGHT: rarities live - %',
    (select string_agg(format('%s %s', d.game_rarity, d.cnt), ', ' order by min_rank)
     from (
       select c.game_rarity, count(*) as cnt,
              min(case c.game_rarity when 'Legendary' then 1 when 'Secret Rare' then 2 when 'Ultra Rare' then 3
                                     when 'Super Rare' then 4 when 'Rare' then 5 else 6 end) as min_rank
       from public.card_catalog c
       where c.format_eligible
       group by c.game_rarity
     ) d);

  -- Shop regenerated from the new pool.
  if not exists (select 1 from public.shop_rotations where status = 'active' and starts_at <= now() and ends_at > now()) then
    raise exception 'POST-FLIGHT FAILED: no active shop singles rotation';
  end if;

  select count(*) into v_bad_rotation
  from public.shop_rotation_cards rc
  join public.shop_rotations r on r.id = rc.rotation_id
  join public.card_catalog c on c.id = rc.card_catalog_id
  where r.status = 'active' and not c.format_eligible;

  if v_bad_rotation <> 0 then
    raise exception 'POST-FLIGHT FAILED: % active shop singles are outside the new pool', v_bad_rotation;
  end if;

  raise notice 'POST-FLIGHT: shop singles rotation regenerated (% cards), % special pack rotations active',
    (select count(*) from public.shop_rotation_cards rc join public.shop_rotations r on r.id = rc.rotation_id where r.status = 'active'),
    (select count(*) from public.shop_special_pack_rotations where status = 'active');

  -- Informational: special pack pools that shrank a lot in the new pool.
  for v_def in
    select d.name, count(pc.*) as pool_cards, count(pc.*) filter (where c.format_eligible) as eligible_cards
    from public.shop_special_pack_definitions d
    left join public.shop_special_pack_pool_cards pc on pc.pack_definition_id = d.id
    left join public.card_catalog c on c.id = pc.card_catalog_id
    group by d.name
    having count(pc.*) filter (where c.format_eligible) < 40
    order by 3
  loop
    raise notice 'NOTE: special pack "%" has only % of % pool cards in the Classic v2 pool', v_def.name, v_def.eligible_cards, v_def.pool_cards;
  end loop;

  raise notice 'POST-FLIGHT OK. Mode: %', current_setting('season2.mode');
end;
$postflight$;

\if :season2_apply
  commit;
  \echo 'SEASON 2 RESET APPLIED (committed).'
\else
  rollback;
  \echo 'DRY RUN finished - every assertion passed, everything was rolled back. Nothing changed.'
\endif
