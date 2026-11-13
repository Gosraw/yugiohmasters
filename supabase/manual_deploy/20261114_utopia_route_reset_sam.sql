-- =========================================================
-- PASTE INTO THE SUPABASE SQL EDITOR (production), 2026-11-14
--
-- 1. The new Utopia Boss Path (same as
--    supabase/migrations/202611141000_utopia_route.sql).
-- 2. sam back to the very start of Season 2 (owner decision): draft,
--    pack, shop and route cards, DP, trades that were never sent,
--    welcome packs. The welcome packs come back automatically on his
--    next page. He gets Utopia Stage 1 right away, so the app sends him
--    straight to the Initial Draft (no wheel).
--
-- It refuses to run if something exists that this file does not cover
-- (a duel, a competition, a card of his in someone else's deck, trade,
-- draft or pack history). Then nothing changes.
--
-- Run it once. The last result row must say checks_passed = true.
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
    ('Halfway to Forever'),
    ('Number 39: Utopia'),
    ('Number 39: Utopia Beyond'),
    ('Number C39: Utopia Ray V'),
    ('Number S39: Utopia the Lightning'),
    ('Rank-Up-Magic Astral Force'),
    ('Rank-Up-Magic Limited Barian''s Force'),
    ('Reverse Breaker'),
    ('Rising Sun Slash'),
    ('Utopia Buster'),
    ('Xyz Change Tactics'),
    ('ZS - Armed Sage'),
    ('ZW - Lightning Blade'),
    ('ZW - Sleipnir Mail'),
    ('ZW - Tornado Bringer')
  ) as v(card_name)
  where (select count(*) from public.card_catalog c where c.name = v.card_name) <> 1;

  if v_missing is not null then
    raise exception 'Utopia route aborted: card name not found exactly once: %', v_missing;
  end if;

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
    's2_utopia',
    'Utopia',
    16,
    'A boy who never gives up, and the warrior of hope who answers when he calls. Every time it looks lost, the armour gets one piece heavier and the sword one piece brighter.',
    'Stack two Level 4 monsters into Utopia, stop attacks with it, then rank it up and strap ZW armour onto it until one warrior hits harder than anything your opponent can put in front of it.',
    '{"startStrength":3,"growth":3,"bossPower":4,"synergy":4,"flexibility":4}'::jsonb,
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

  select id into strict v_route from public.boss_routes where code = 's2_utopia';

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
    (1, 'Number 39: Utopia'),
    (2, 'Number C39: Utopia Ray V'),
    (3, 'Number 39: Utopia Beyond'),
    (4, 'Number S39: Utopia the Lightning')
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
    (1, 'ZS - Armed Sage', true),
    (1, 'ZW - Sleipnir Mail', false),
    (1, 'Xyz Change Tactics', false),
    (2, 'Rank-Up-Magic Limited Barian''s Force', false),
    (2, 'ZW - Tornado Bringer', false),
    (2, 'Utopia Buster', false),
    (3, 'Rank-Up-Magic Astral Force', false),
    (3, 'ZW - Lightning Blade', false),
    (3, 'Rising Sun Slash', false),
    (4, 'Halfway to Forever', true),
    (4, 'Reverse Breaker', false)
  ) as v(stage_number, card_name, is_route_exclusive)
  join public.boss_route_stages s on s.route_id = v_route and s.stage_number = v.stage_number
  join public.card_catalog c on c.name = v.card_name;
end;
$routes$;

commit;

begin;

do $players$
declare
  v_sam uuid;
  v_league uuid;
  v_player uuid;
  v_route text;
  v_blockers text;
begin
  select id into strict v_sam from public.profiles where username = 'sam';
  select league_id into strict v_league from public.league_members where profile_id = v_sam;

  create temp table reset_players on commit drop as
  select v_sam as profile_id, 's2_utopia'::text as route_code;

  create temp table reset_cards on commit drop as
  select ci.id
  from public.card_instances ci
  where ci.current_owner_id in (select profile_id from reset_players);

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
  ) blockers;

  if v_blockers is not null then
    raise exception 'Reset aborted: found %. Nothing changed - ask Claude.', v_blockers;
  end if;

  -- -------------------------------------------------------
  -- sam: back to the start
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
  -- transaction.
  delete from public.ownership_history
  where card_instance_id in (select id from reset_cards);

  alter table public.card_instances disable trigger prevent_card_instance_delete_trigger;

  delete from public.card_instances where id in (select id from reset_cards);

  alter table public.card_instances enable trigger prevent_card_instance_delete_trigger;

  -- Old Boss Paths (their unlocks and achievement events cascade).
  delete from public.player_boss_paths
  where profile_id in (select profile_id from reset_players);

  -- -------------------------------------------------------
  -- Utopia, Stage 1 granted like the wheel does it
  -- -------------------------------------------------------
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
  where pr.username = 'sam'
)
select
  (select string_agg(username || ': ' || route || ', ' || cards || ' cards, ' || duel_points || ' DP', ' | ') from players) as players,
  (
    (select count(*) from players) = 1
    and exists (select 1 from players where route = 's2_utopia' and cards = route_cards and route_cards = 4 and duel_points = 0 and wallet = 0 and drafts = 0 and vouchers = 0)
    and (select string_agg(c.name, ', ' order by s.stage_number) from public.boss_route_stages s join public.card_catalog c on c.id = s.evolution_card_catalog_id join public.boss_routes r on r.id = s.route_id where r.code = 's2_utopia' and r.is_active)
      = 'Number 39: Utopia, Number C39: Utopia Ray V, Number 39: Utopia Beyond, Number S39: Utopia the Lightning'
    and (select count(*) from public.boss_route_stage_grants g join public.boss_route_stages s on s.id = g.stage_id join public.boss_routes r on r.id = s.route_id where r.code = 's2_utopia') = 11
    and (select count(*) from public.boss_routes where is_active) = 16
    and (select tgenabled from pg_trigger where tgname = 'prevent_card_instance_delete_trigger') = 'O'
  ) as checks_passed;
