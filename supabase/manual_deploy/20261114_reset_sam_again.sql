-- =========================================================
-- PASTE INTO THE SUPABASE SQL EDITOR (production), 2026-11-14
--
-- sam back to the very start of Season 2 again (owner decision): draft,
-- pack, shop and route cards, DP, trades that were never sent, welcome
-- packs. The welcome packs come back automatically on his next page.
-- He keeps his route: Ancient Gear Stage 1 is granted again right away,
-- so the app sends him straight to the Initial Draft (no wheel).
--
-- It refuses to run if something exists that this file does not cover
-- (a duel, a competition, a card of his in someone else's deck, trade,
-- draft or pack history). Then nothing changes.
--
-- Run it once. The last result row must say checks_passed = true.
-- =========================================================

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
  select v_sam as profile_id, 's2_ancient_gear'::text as route_code;

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
  -- Ancient Gear, Stage 1 granted like the wheel does it
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
    and exists (select 1 from players where route = 's2_ancient_gear' and cards = route_cards and route_cards = 4 and duel_points = 0 and wallet = 0 and drafts = 0 and vouchers = 0)
    and (select count(*) from public.boss_routes where is_active) = 15
    and (select tgenabled from pg_trigger where tgname = 'prevent_card_instance_delete_trigger') = 'O'
  ) as checks_passed;
