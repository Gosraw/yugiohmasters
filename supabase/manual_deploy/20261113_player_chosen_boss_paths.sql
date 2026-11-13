-- =========================================================
-- PASTE THIS WHOLE FILE INTO THE SUPABASE SQL EDITOR, THEN PRESS RUN.
--
-- The Boss Paths the players chose (2026-11-13):
--   faro  -> Earthbound Immortals (new route); keeps his cards, only his
--            4 Volcanic route cards go.
--   sam   -> Ancient Gear; back to the very start (new draft).
--   bossg -> Legendary Ocean with Fisherman II / III; back to the very
--            start (new draft).
--
-- Two transactions: first the routes, then the players. If a part goes
-- wrong, that part changes nothing. Pressing Run a second time is refused
-- safely by the players part (faro no longer has Volcanic).
--
-- The result is one row. checks_passed must say true.
--
-- Part 1 is the same as
-- supabase/migrations/202611131000_player_chosen_boss_paths.sql.
-- =========================================================

-- =========================================================
-- Boss Paths the players chose themselves (owner decision, 2026-11-13)
--
-- 1. New route s2_earthbound "Earthbound Immortals" (display order 15),
--    chosen by faro: Cusillu -> Aslla piscu -> Uru -> Ccapac Apu (Boss).
-- 2. Legendary Ocean (s2_atlantean_ocean), chosen by bossg: The Legendary
--    Fisherman is skipped. Stage 1 Fisherman II, 2 Poseidra, 3 Daedalus,
--    4 (Boss) The Legendary Fisherman III; the support grants are
--    re-spread and Citadel Whale leaves the route.
--
-- Source: data/boss-route-registry-v3.mjs (validated with
-- scripts/generate-boss-routes-v3-migration.mjs --check, scored with
-- scripts/boss-route-balance.mjs; Ocean 81.0 / Earthbound 76.8, mean 78.6).
-- Written by hand instead of regenerating 202610301000: that file would
-- also drop Chaos Soldier's Breaker grant (202611041000).
--
-- Stage prices are copied from the live Blue-Eyes route, like the
-- generator does. Refuses to touch Legendary Ocean while a player holds
-- it (the stage layout would change underneath their path).
--
-- One transaction. Safe to run twice. Backwards compatible.
-- =========================================================

begin;

do $routes$
declare
  v_route uuid;
  v_missing text;
begin
  -- Every card name must resolve to exactly one catalog row.
  select string_agg(v.card_name, ', ')
  into v_missing
  from (
    values
    ('A Legendary Ocean'),
    ('Atlantean Attack Squad'),
    ('Atlantean Heavy Infantry'),
    ('Atlantean Marksman'),
    ('Big Wave Small Wave'),
    ('Call of the Earthbound'),
    ('Codarus'),
    ('Double Coston'),
    ('Earthbound Immortal Aslla piscu'),
    ('Earthbound Immortal Ccapac Apu'),
    ('Earthbound Immortal Cusillu'),
    ('Earthbound Immortal Revival'),
    ('Earthbound Immortal Uru'),
    ('Earthbound Linewalker'),
    ('Earthbound Prison'),
    ('Earthbound Spirit'),
    ('Earthbound Wave'),
    ('Earthbound Whirlwind'),
    ('Levia-Dragon - Daedalus'),
    ('Mother Grizzly'),
    ('Mound of the Bound Creator'),
    ('Poseidra, the Atlantean Dragon'),
    ('Revival of the Immortals'),
    ('Roar of the Earthbound Immortal'),
    ('Salvage'),
    ('Sea Stealth Attack'),
    ('The Legendary Fisherman II'),
    ('The Legendary Fisherman III'),
    ('Torpedo Fish'),
    ('Umi')
  ) as v(card_name)
  where (select count(*) from public.card_catalog c where c.name = v.card_name) <> 1;

  if v_missing is not null then
    raise exception 'Boss path change aborted: card name not found exactly once: %', v_missing;
  end if;

  -- ---------------------------------------------------------
  -- 1. Earthbound Immortals
  -- ---------------------------------------------------------
  insert into public.boss_routes (
    code,
    name,
    display_order,
    teaser_story,
    how_it_plays,
    star_profile,
    target_power_grade,
    is_active
  )
  values (
    's2_earthbound',
    'Earthbound Immortals',
    15,
    'Lines older than any city are carved into the desert. Nobody remembers who drew them, but on the right night the giants they show climb out of the sand - and they do not walk around your defences, they step over them.',
    'Keep a Field Spell on the board and bring out one giant Level 10 Immortal at a time: your opponent cannot attack it, and it attacks your opponent directly.',
    '{"startStrength":3,"growth":3,"bossPower":4,"synergy":4,"flexibility":2}'::jsonb,
    'A',
    true
  )
  on conflict (code) do update set
    name = excluded.name,
    display_order = excluded.display_order,
    teaser_story = excluded.teaser_story,
    how_it_plays = excluded.how_it_plays,
    star_profile = excluded.star_profile,
    target_power_grade = excluded.target_power_grade,
    is_active = true;

  select id into strict v_route from public.boss_routes where code = 's2_earthbound';

  insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
  select
    v_route,
    v.stage_number,
    c.id,
    (
      select s.dp_cost_to_reach
      from public.boss_route_stages s
      join public.boss_routes r on r.id = s.route_id
      where r.code = 's2_blue_eyes'
        and s.stage_number = v.stage_number
    )
  from (
    values
    (1, 'Earthbound Immortal Cusillu'),
    (2, 'Earthbound Immortal Aslla piscu'),
    (3, 'Earthbound Immortal Uru'),
    (4, 'Earthbound Immortal Ccapac Apu')
  ) as v(stage_number, card_name)
  join public.card_catalog c on c.name = v.card_name
  on conflict (route_id, stage_number) do update set
    evolution_card_catalog_id = excluded.evolution_card_catalog_id;

  delete from public.boss_route_stage_grants g
  using public.boss_route_stages s
  where s.id = g.stage_id
    and s.route_id = v_route;

  insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
  select s.id, c.id, v.is_route_exclusive, 1
  from (
    values
    (1, 'Mound of the Bound Creator', false),
    (1, 'Double Coston', false),
    (1, 'Earthbound Linewalker', false),
    (2, 'Earthbound Prison', true),
    (2, 'Earthbound Wave', false),
    (2, 'Earthbound Spirit', false),
    (3, 'Earthbound Whirlwind', false),
    (3, 'Earthbound Immortal Revival', false),
    (3, 'Roar of the Earthbound Immortal', false),
    (4, 'Revival of the Immortals', false),
    (4, 'Call of the Earthbound', false)
  ) as v(stage_number, card_name, is_route_exclusive)
  join public.boss_route_stages s on s.route_id = v_route and s.stage_number = v.stage_number
  join public.card_catalog c on c.name = v.card_name;

  -- ---------------------------------------------------------
  -- 2. Legendary Ocean
  -- ---------------------------------------------------------
  select id into strict v_route from public.boss_routes where code = 's2_atlantean_ocean';

  if exists (select 1 from public.player_boss_paths where route_id = v_route) then
    raise exception 'Boss path change aborted: a player already holds Legendary Ocean. Nothing changed - ask Claude.';
  end if;

  update public.boss_routes
  set
    how_it_plays = 'Play around the Umi field spell: your sea serpents get stronger, your Atlanteans pop cards whenever they are used as a cost, and the old fisherman returns one last time to sweep the sea clean of enemies.',
    star_profile = '{"startStrength":4,"growth":4,"bossPower":5,"synergy":4,"flexibility":3}'::jsonb
  where id = v_route;

  -- One stage at a time, in this order, so no two stages ever hold the
  -- same monster (the unique key is checked per row in production).
  update public.boss_route_stages
  set evolution_card_catalog_id = (select id from public.card_catalog where name = 'The Legendary Fisherman III')
  where route_id = v_route
    and stage_number = 4;

  update public.boss_route_stages
  set evolution_card_catalog_id = (select id from public.card_catalog where name = 'Levia-Dragon - Daedalus')
  where route_id = v_route
    and stage_number = 3;

  update public.boss_route_stages
  set evolution_card_catalog_id = (select id from public.card_catalog where name = 'Poseidra, the Atlantean Dragon')
  where route_id = v_route
    and stage_number = 2;

  update public.boss_route_stages
  set evolution_card_catalog_id = (select id from public.card_catalog where name = 'The Legendary Fisherman II')
  where route_id = v_route
    and stage_number = 1;

  delete from public.boss_route_stage_grants g
  using public.boss_route_stages s
  where s.id = g.stage_id
    and s.route_id = v_route;

  insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
  select s.id, c.id, v.is_route_exclusive, 1
  from (
    values
    (1, 'A Legendary Ocean', false),
    (1, 'Atlantean Heavy Infantry', false),
    (1, 'Mother Grizzly', false),
    (2, 'Umi', false),
    (2, 'Codarus', false),
    (2, 'Atlantean Marksman', false),
    (3, 'Sea Stealth Attack', true),
    (3, 'Big Wave Small Wave', false),
    (3, 'Torpedo Fish', false),
    (4, 'Salvage', false),
    (4, 'Atlantean Attack Squad', false)
  ) as v(stage_number, card_name, is_route_exclusive)
  join public.boss_route_stages s on s.route_id = v_route and s.stage_number = v.stage_number
  join public.card_catalog c on c.name = v.card_name;
end;
$routes$;

commit;

-- =========================================================
-- THE PLAYERS (production only, not in the migration)
--
--   faro  keeps every card and his DP. Only the 4 cards of his old
--         Volcanic Inferno path go; he gets Stage 1 of Earthbound
--         Immortals.
--   sam   back to the very start (owner decision): draft, pack, shop
--   bossg and route cards, DP, trades that were never sent, welcome
--         packs. The welcome packs come back automatically on their next
--         page. They get their chosen route right away, so the app sends
--         them straight to the Initial Draft (no wheel):
--         sam -> Ancient Gear, bossg -> Legendary Ocean.
--
-- It refuses to run if something exists that this file does not cover
-- (a duel, a competition, a card of theirs in someone else's deck,
-- trade, draft or pack history, or a Volcanic route card of faro's in a
-- deck, trade or wager). Then nothing changes.
-- =========================================================

begin;

do $players$
declare
  v_faro uuid;
  v_sam uuid;
  v_bossg uuid;
  v_league uuid;
  v_player uuid;
  v_route text;
  v_blockers text;
begin
  select id into strict v_faro from public.profiles where username = 'faro';
  select id into strict v_sam from public.profiles where username = 'sam';
  select id into strict v_bossg from public.profiles where username = 'bossg';
  select league_id into strict v_league from public.league_members where profile_id = v_faro;

  create temp table reset_players on commit drop as
  select v_sam as profile_id, 's2_ancient_gear'::text as route_code
  union all
  select v_bossg, 's2_atlantean_ocean';

  create temp table reset_cards on commit drop as
  select ci.id
  from public.card_instances ci
  where ci.current_owner_id in (select profile_id from reset_players);

  create temp table faro_old_cards on commit drop as
  select ci.id
  from public.card_instances ci
  join public.player_boss_paths p on p.id = ci.original_source_id
  where p.profile_id = v_faro
    and ci.current_owner_id = v_faro;

  select string_agg(blocker, ', ')
  into v_blockers
  from (
    select 'a duel' as blocker where exists (
      select 1 from public.matches
      where player_one_id in (select profile_id from reset_players)
         or player_two_id in (select profile_id from reset_players)
    )
    union all
    select 'a competition' where exists (
      select 1 from public.competition_players where profile_id in (select profile_id from reset_players)
    )
    union all
    select 'a card in someone else''s deck' where exists (
      select 1 from public.deck_cards dc join public.decks d on d.id = dc.deck_id
      where dc.card_instance_id in (select id from reset_cards)
        and d.owner_id not in (select profile_id from reset_players)
    )
    union all
    select 'a card in someone else''s trade' where exists (
      select 1 from public.trade_items ti join public.trades t on t.id = ti.trade_id
      where ti.card_instance_id in (select id from reset_cards)
        and t.sender_id not in (select profile_id from reset_players)
        and t.receiver_id not in (select profile_id from reset_players)
    )
    union all
    select 'a card in someone else''s draft' where exists (
      select 1 from public.draft_picks dp join public.draft_players pl on pl.id = dp.draft_player_id
      where dp.card_instance_id in (select id from reset_cards)
        and pl.profile_id not in (select profile_id from reset_players)
    )
    union all
    select 'a card from someone else''s pack' where exists (
      select 1 from public.shop_pack_pulls pp join public.shop_pack_openings o on o.id = pp.opening_id
      where pp.card_instance_id in (select id from reset_cards)
        and o.profile_id not in (select profile_id from reset_players)
    )
    union all
    select 'a wager card' where exists (
      select 1 from public.match_wager_cards where card_instance_id in (select id from reset_cards)
    )
    union all
    select 'a faro Volcanic card in a deck, trade or wager' where exists (
      select 1 from public.deck_cards where card_instance_id in (select id from faro_old_cards)
      union all
      select 1 from public.trade_items where card_instance_id in (select id from faro_old_cards)
      union all
      select 1 from public.match_wager_cards where card_instance_id in (select id from faro_old_cards)
    )
    union all
    select 'faro has no Volcanic Inferno path' where not exists (
      select 1 from public.player_boss_paths p join public.boss_routes r on r.id = p.route_id
      where p.profile_id = v_faro and r.code = 's2_volcanic'
    )
  ) blockers;

  if v_blockers is not null then
    raise exception 'Reset aborted: found %. Nothing changed - ask Claude.', v_blockers;
  end if;

  -- -------------------------------------------------------
  -- sam and bossg: back to the start
  -- -------------------------------------------------------
  delete from public.trades
  where sender_id in (select profile_id from reset_players)
     or receiver_id in (select profile_id from reset_players)
     or created_by in (select profile_id from reset_players);

  delete from public.decks
  where owner_id in (select profile_id from reset_players);

  delete from public.draft_picks
  where draft_player_id in (select id from public.draft_players where profile_id in (select profile_id from reset_players));

  delete from public.draft_offer_cards
  where offer_id in (
    select o.id from public.draft_offers o
    join public.draft_players pl on pl.id = o.draft_player_id
    where pl.profile_id in (select profile_id from reset_players)
  );

  delete from public.draft_offers
  where draft_player_id in (select id from public.draft_players where profile_id in (select profile_id from reset_players));

  create temp table reset_drafts on commit drop as
  select draft_id from public.draft_players where profile_id in (select profile_id from reset_players);

  delete from public.draft_players
  where profile_id in (select profile_id from reset_players);

  delete from public.drafts d
  where (d.id in (select draft_id from reset_drafts) or d.created_by in (select profile_id from reset_players))
    and not exists (select 1 from public.draft_players pl where pl.draft_id = d.id);

  -- Pack openings (their pulls go with them) and shop purchases. A single
  -- they bought goes back on sale in its rotation, its card is deleted.
  delete from public.shop_pack_openings
  where profile_id in (select profile_id from reset_players);

  delete from public.shop_purchases
  where profile_id in (select profile_id from reset_players);

  update public.shop_rotation_cards
  set sold_to_profile_id = null,
      sold_at = null
  where sold_to_profile_id in (select profile_id from reset_players);

  delete from public.weekly_goal_bonus_grants where profile_id in (select profile_id from reset_players);
  delete from public.weekly_goal_progress where profile_id in (select profile_id from reset_players);
  delete from public.season_path_tier_grants where profile_id in (select profile_id from reset_players);
  delete from public.season_path_xp_events where profile_id in (select profile_id from reset_players);
  delete from public.season_bonus_grants where profile_id in (select profile_id from reset_players);
  delete from public.mini_game_reward_grants where profile_id in (select profile_id from reset_players);
  delete from public.player_pack_luck where profile_id in (select profile_id from reset_players);
  delete from public.shop_pack_pity where profile_id in (select profile_id from reset_players);
  delete from public.dashboard_coach_insights where profile_id in (select profile_id from reset_players);

  delete from public.duel_point_transactions where profile_id in (select profile_id from reset_players);

  -- The wallet follows profiles.duel_points (profiles_sync_wallet_balance).
  update public.profiles
  set duel_points = 0,
      updated_at = now()
  where id in (select profile_id from reset_players);

  delete from public.reward_vouchers where profile_id in (select profile_id from reset_players);
  delete from public.season1_welcome_bonus_claims where profile_id in (select profile_id from reset_players);

  -- Their cards. The delete guard on card_instances is the deliberate
  -- scarcity rule, so it is switched off only here, inside this
  -- transaction (also for faro's 4 Volcanic route cards below).
  delete from public.ownership_history
  where card_instance_id in (select id from reset_cards)
     or card_instance_id in (select id from faro_old_cards);

  alter table public.card_instances disable trigger prevent_card_instance_delete_trigger;

  delete from public.card_instances where id in (select id from reset_cards);
  delete from public.card_instances where id in (select id from faro_old_cards);

  alter table public.card_instances enable trigger prevent_card_instance_delete_trigger;

  -- Old Boss Paths (their unlocks and achievement events cascade).
  delete from public.player_boss_paths
  where profile_id in (select profile_id from reset_players)
     or profile_id = v_faro;

  -- -------------------------------------------------------
  -- The chosen routes, Stage 1 granted like the wheel does it
  -- -------------------------------------------------------
  perform public._boss_path_start(
    v_faro,
    v_league,
    1,
    (select id from public.boss_routes where code = 's2_earthbound' and is_active),
    0
  );

  for v_player, v_route in
    select profile_id, route_code from reset_players
  loop
    perform public._boss_path_start(
      v_player,
      v_league,
      1,
      (select id from public.boss_routes where code = v_route and is_active),
      0
    );
  end loop;
end;
$players$;

commit;

-- =========================================================
-- VERIFICATION (reads only)
-- =========================================================

with players as (
  select
    pr.username,
    r.code as route,
    (select count(*) from public.card_instances ci where ci.current_owner_id = pr.id) as cards,
    (select count(*) from public.card_instances ci where ci.original_source_id = p.id) as route_cards,
    pr.duel_points,
    (select w.duel_points from public.wallets w where w.profile_id = pr.id) as wallet,
    (select count(*) from public.draft_players d where d.profile_id = pr.id) as drafts,
    (select count(*) from public.reward_vouchers v where v.profile_id = pr.id) as vouchers
  from public.profiles pr
  join public.player_boss_paths p on p.profile_id = pr.id and p.route_slot = 1
  join public.boss_routes r on r.id = p.route_id
  where pr.username in ('bossg', 'sam', 'faro')
)
select
  (select string_agg(username || ': ' || route || ', ' || cards || ' cards, ' || duel_points || ' DP', ' | ' order by username) from players) as players,
  (
    (select count(*) from players) = 3
    and exists (select 1 from players where username = 'faro' and route = 's2_earthbound' and route_cards = 4)
    and exists (select 1 from players where username = 'sam' and route = 's2_ancient_gear' and cards = route_cards and route_cards = 4 and duel_points = 0 and wallet = 0 and drafts = 0 and vouchers = 0)
    and exists (select 1 from players where username = 'bossg' and route = 's2_atlantean_ocean' and cards = route_cards and route_cards = 4 and duel_points = 0 and wallet = 0 and drafts = 0 and vouchers = 0)
    and not exists (
      select 1 from public.card_instances ci
      join public.card_catalog c on c.id = ci.card_catalog_id
      where ci.current_owner_id = (select id from public.profiles where username = 'faro')
        and ci.original_acquisition_type = 'achievement'
        and c.name in ('Volcanic Rocket', 'Blaze Accelerator', 'Volcanic Shell', 'Volcanic Scattershot')
        and ci.original_source_id not in (select id from public.player_boss_paths)
    )
    and (select string_agg(c.name, ', ' order by s.stage_number) from public.boss_route_stages s join public.card_catalog c on c.id = s.evolution_card_catalog_id join public.boss_routes r on r.id = s.route_id where r.code = 's2_atlantean_ocean')
      = 'The Legendary Fisherman II, Poseidra, the Atlantean Dragon, Levia-Dragon - Daedalus, The Legendary Fisherman III'
    and (select count(*) from public.boss_route_stage_grants g join public.boss_route_stages s on s.id = g.stage_id join public.boss_routes r on r.id = s.route_id where r.code in ('s2_atlantean_ocean', 's2_earthbound')) = 22
    and (select tgenabled from pg_trigger where tgname = 'prevent_card_instance_delete_trigger') = 'O'
  ) as checks_passed;
