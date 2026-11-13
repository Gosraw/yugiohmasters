-- =========================================================
-- PASTE INTO THE SUPABASE SQL EDITOR (production), 2026-11-14
--
-- Fixes 20261114_utopia_route_reset_sam.sql. That file was meant only as
-- a preview of the Utopia route; Samo keeps Ancient Gear (owner decision).
--
-- 1. sam: the 4 Utopia Stage 1 cards and his Utopia path go, he gets
--    Ancient Gear Stage 1 again. The rest of the reset (draft, packs,
--    DP back to the start) stays; anything he did since then stays too.
-- 2. The Utopia route leaves the app again (stages and grants go with
--    it). The design is kept in docs/BOSS_PATH_PROPOSAL_UTOPIA.md.
--
-- Refuses to run if a Utopia route card is in a deck, trade or wager,
-- or if anyone else holds the Utopia route. Then nothing changes.
-- Safe to run twice. The last row must say checks_passed = true.
-- =========================================================

begin;

do $fix$
declare
  v_sam uuid;
  v_league uuid;
  v_utopia uuid;
  v_blockers text;
begin
  select id into strict v_sam from public.profiles where username = 'sam';
  select league_id into strict v_league from public.league_members where profile_id = v_sam;
  select id into v_utopia from public.boss_routes where code = 's2_utopia';

  create temp table utopia_cards on commit drop as
  select ci.id
  from public.card_instances ci
  join public.player_boss_paths p on p.id = ci.original_source_id
  where p.route_id = v_utopia;

  select string_agg(blocker, ', ')
  into v_blockers
  from (
    select 'someone else holds Utopia' as blocker where exists (
      select 1 from public.player_boss_paths where route_id = v_utopia and profile_id <> v_sam
    )
    union all
    select 'a Utopia card in a deck, trade or wager' where exists (
      select 1 from public.deck_cards where card_instance_id in (select id from utopia_cards)
      union all
      select 1 from public.trade_items where card_instance_id in (select id from utopia_cards)
      union all
      select 1 from public.match_wager_cards where card_instance_id in (select id from utopia_cards)
    )
  ) blockers;

  if v_blockers is not null then
    raise exception 'Fix aborted: found %. Nothing changed - ask Claude.', v_blockers;
  end if;

  -- The Utopia route cards. The delete guard on card_instances is the
  -- deliberate scarcity rule, so it is switched off only here, inside
  -- this transaction.
  delete from public.ownership_history
  where card_instance_id in (select id from utopia_cards);

  alter table public.card_instances disable trigger prevent_card_instance_delete_trigger;
  delete from public.card_instances where id in (select id from utopia_cards);
  alter table public.card_instances enable trigger prevent_card_instance_delete_trigger;

  -- sam's Utopia path (its unlocks cascade), then Ancient Gear Stage 1.
  delete from public.player_boss_paths
  where profile_id = v_sam
    and route_id = v_utopia;

  if not exists (
    select 1
    from public.player_boss_paths p
    join public.boss_routes r on r.id = p.route_id
    where p.profile_id = v_sam
      and r.code = 's2_ancient_gear'
  ) then
    perform public._boss_path_start(
      v_sam,
      v_league,
      1,
      (select id from public.boss_routes where code = 's2_ancient_gear' and is_active),
      0
    );
  end if;

  -- The Utopia route itself (stages and grants cascade).
  delete from public.boss_routes
  where id = v_utopia;
end;
$fix$;

commit;

-- =========================================================
-- VERIFICATION (reads only)
-- =========================================================

select
  (
    select string_agg(r.code || ', ' || (select count(*) from public.card_instances ci where ci.original_source_id = p.id) || ' route cards', ' | ')
    from public.player_boss_paths p
    join public.boss_routes r on r.id = p.route_id
    where p.profile_id = (select id from public.profiles where username = 'sam')
  ) as sam_route,
  (
    (select count(*) from public.player_boss_paths p join public.boss_routes r on r.id = p.route_id
     where p.profile_id = (select id from public.profiles where username = 'sam')) = 1
    and exists (
      select 1 from public.player_boss_paths p join public.boss_routes r on r.id = p.route_id
      where p.profile_id = (select id from public.profiles where username = 'sam')
        and r.code = 's2_ancient_gear'
        and p.current_stage = 1
        and (select count(*) from public.card_instances ci where ci.original_source_id = p.id) = 4
    )
    and not exists (select 1 from public.boss_routes where code = 's2_utopia')
    and not exists (
      select 1 from public.card_instances ci
      join public.card_catalog c on c.id = ci.card_catalog_id
      where ci.current_owner_id = (select id from public.profiles where username = 'sam')
        and c.name in ('Number 39: Utopia', 'ZS - Armed Sage', 'ZW - Sleipnir Mail', 'Xyz Change Tactics')
        and ci.original_acquisition_type = 'achievement'
    )
    and (select count(*) from public.boss_routes where is_active) = 15
    and (select tgenabled from pg_trigger where tgname = 'prevent_card_instance_delete_trigger') = 'O'
  ) as checks_passed;
