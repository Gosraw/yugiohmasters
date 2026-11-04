-- =========================================================
-- PASTE THIS WHOLE FILE INTO THE SUPABASE SQL EDITOR, THEN PRESS RUN.
--
-- Chaos Soldier: new Stage 1 for the route, and for bossg, who has it.
-- It is one transaction: if anything goes wrong, nothing changes.
-- Pressing Run a second time does no harm.
--
-- The result is one row. checks_passed must say true.
--
-- Same content as supabase/migrations/202611041000_chaos_soldier_stage1.sql
-- plus the check at the end.
-- =========================================================

-- =========================================================
-- Chaos Soldier: a Stage 1 that can actually summon its monster
-- (owner decision, 2026-11-04)
--
-- Why: Stage 1 gave Black Luster Soldier + Super Soldier Synthesis, but
-- Synthesis needs a LIGHT and a DARK monster with exactly 8 Levels
-- together, and the route's DARK half (Envoy of Chaos) only arrives at
-- Stage 2. The plain Black Luster Ritual only arrived at Stage 4.
--
--   Stage  Before                             After
--   1      Synthesis, Gateway, D.D. Lady      Black Luster Ritual, Gateway,
--                                             Sonic Bird, D.D. Lady,
--                                             Breaker the Magical Warrior (new)
--   2      Envoy, Valkyria, Sonic Bird        Envoy, Valkyria, Synthesis
--   3      unchanged                          unchanged
--   4      Shield, Black Luster Ritual        Shield
--
-- This makes it the one route with 12 support grants instead of 11; the
-- owner knows. data/boss-route-registry-v3.mjs keeps the launch list:
-- this later migration overrides it on a replay.
--
-- A player who already holds the route at Stage 1 swaps along: Synthesis
-- goes (it comes back at Stage 2), the three new Stage 1 cards arrive.
-- It refuses to run if such a player is past Stage 1 or has Synthesis in
-- a deck, a trade or a wager, because then this swap is not safe.
--
-- One transaction. Safe to run twice. Backwards compatible.
-- =========================================================

begin;

do $chaos$
declare
  v_route uuid;
  v_stage1 uuid;
  v_stage2 uuid;
  v_stage4 uuid;
  v_synthesis uuid;
  v_ritual uuid;
  v_bird uuid;
  v_breaker uuid;
  v_path public.player_boss_paths%rowtype;
  v_card uuid;
  v_next_copy integer;
begin
  select id into strict v_route from public.boss_routes where code = 's2_chaos_bls';

  select id into strict v_stage1 from public.boss_route_stages where route_id = v_route and stage_number = 1;
  select id into strict v_stage2 from public.boss_route_stages where route_id = v_route and stage_number = 2;
  select id into strict v_stage4 from public.boss_route_stages where route_id = v_route and stage_number = 4;

  select id into strict v_synthesis from public.card_catalog where name = 'Super Soldier Synthesis';
  select id into strict v_ritual from public.card_catalog where name = 'Black Luster Ritual';
  select id into strict v_bird from public.card_catalog where name = 'Sonic Bird';
  select id into strict v_breaker from public.card_catalog where name = 'Breaker the Magical Warrior';

  if exists (
    select 1
    from public.player_boss_paths
    where route_id = v_route
      and current_stage >= 2
  ) then
    raise exception 'Chaos Soldier change aborted: a player is already past Stage 1. Nothing changed - ask Claude.';
  end if;

  if exists (
    select 1
    from public.card_instances ci
    join public.player_boss_paths p
      on p.id = ci.original_source_id
    where p.route_id = v_route
      and ci.card_catalog_id = v_synthesis
      and (
        ci.current_owner_id <> p.profile_id
        or exists (select 1 from public.deck_cards dc where dc.card_instance_id = ci.id)
        or exists (select 1 from public.trade_items ti where ti.card_instance_id = ci.id)
        or exists (select 1 from public.match_wager_cards mw where mw.card_instance_id = ci.id)
      )
  ) then
    raise exception 'Chaos Soldier change aborted: Super Soldier Synthesis is in a deck, trade or wager. Nothing changed - ask Claude.';
  end if;

  -- The route itself.
  update public.boss_route_stage_grants
  set stage_id = v_stage2
  where stage_id = v_stage1
    and card_catalog_id = v_synthesis;

  update public.boss_route_stage_grants
  set stage_id = v_stage1
  where stage_id = v_stage2
    and card_catalog_id = v_bird;

  update public.boss_route_stage_grants
  set stage_id = v_stage1
  where stage_id = v_stage4
    and card_catalog_id = v_ritual;

  insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
  values (v_stage1, v_breaker, false, 1)
  on conflict (stage_id, card_catalog_id) do nothing;

  -- Players who already hold the route at Stage 1. The delete guard on
  -- card_instances is the deliberate scarcity rule, so it is switched
  -- off only here, inside this transaction.
  perform set_config('app.boss_route_grant', 'true', true);

  for v_path in
    select *
    from public.player_boss_paths
    where route_id = v_route
  loop
    delete from public.ownership_history
    where card_instance_id in (
      select id
      from public.card_instances
      where original_source_id = v_path.id
        and card_catalog_id = v_synthesis
    );

    alter table public.card_instances disable trigger prevent_card_instance_delete_trigger;

    delete from public.card_instances
    where original_source_id = v_path.id
      and card_catalog_id = v_synthesis;

    alter table public.card_instances enable trigger prevent_card_instance_delete_trigger;

    foreach v_card in array array[v_ritual, v_bird, v_breaker]
    loop
      if not exists (
        select 1
        from public.card_instances
        where original_source_id = v_path.id
          and card_catalog_id = v_card
      ) then
        select coalesce(max(copy_number), 0) + 1
        into v_next_copy
        from public.card_instances
        where league_id = v_path.league_id
          and card_catalog_id = v_card;

        insert into public.card_instances (
          league_id,
          card_catalog_id,
          current_owner_id,
          original_owner_id,
          original_acquisition_type,
          original_source_id,
          copy_number,
          acquired_at,
          locked
        )
        values (
          v_path.league_id,
          v_card,
          v_path.profile_id,
          v_path.profile_id,
          'achievement',
          v_path.id,
          v_next_copy,
          now(),
          false
        );
      end if;
    end loop;
  end loop;
end;
$chaos$;

commit;

-- =========================================================
-- VERIFICATION (reads only)
-- =========================================================

with route as (
  select id
  from public.boss_routes
  where code = 's2_chaos_bls'
),
grants as (
  select
    s.stage_number,
    string_agg(c.name, ', ' order by c.name) as cards
  from public.boss_route_stage_grants g
  join public.boss_route_stages s on s.id = g.stage_id
  join public.card_catalog c on c.id = g.card_catalog_id
  join route on route.id = s.route_id
  group by s.stage_number
),
holder as (
  select
    string_agg(c.name, ', ' order by c.name) as cards
  from public.card_instances ci
  join public.card_catalog c on c.id = ci.card_catalog_id
  join public.player_boss_paths p on p.id = ci.original_source_id
  join public.profiles pr on pr.id = p.profile_id
  join route on route.id = p.route_id
  where pr.username = 'bossg'
)
select
  (select cards from grants where stage_number = 1) as stage_1,
  (select cards from grants where stage_number = 2) as stage_2,
  (select cards from grants where stage_number = 4) as stage_4,
  (select cards from holder) as bossg_route_cards,
  (
    (select cards from grants where stage_number = 1) = 'Black Luster Ritual, Breaker the Magical Warrior, D.D. Warrior Lady, Gateway to Chaos, Sonic Bird'
    and (select cards from grants where stage_number = 2) = 'Chaos Valkyria, Envoy of Chaos, Super Soldier Synthesis'
    and (select cards from grants where stage_number = 4) = 'Super Soldier Shield'
    and (select cards from holder) = 'Black Luster Ritual, Black Luster Soldier, Breaker the Magical Warrior, D.D. Warrior Lady, Gateway to Chaos, Sonic Bird'
    and (select tgenabled from pg_trigger where tgname = 'prevent_card_instance_delete_trigger') = 'O'
  ) as checks_passed;
