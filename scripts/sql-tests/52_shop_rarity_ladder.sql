-- Shop rarity ladder fallback (202610152000, owner decision A):
--  * a Legendary slot with every Legendary taken gives a Secret Rare
--  * with Secret Rares gone too: an Ultra Rare, and so on down
--  * a guaranteed-Legendary pack (luck >= 100) with no Legendary left
--    gets a Secret Rare as its best card and keeps its luck
--  * a rolled rarity that still has free copies is unchanged

select pg_temp.reset_players();

-- Every Legendary in the league is taken (1 copy each). Bulk setup
-- skips triggers; they are back on for the purchases below.
set local session_replication_role = replica;

insert into public.card_instances (
  league_id, card_catalog_id, copy_number, current_owner_id,
  original_owner_id, original_acquisition_type
)
select lm.league_id, card.id, 1, lm.profile_id, lm.profile_id, 'shop'
from public.card_catalog card
join public.league_members lm on lm.profile_id = pg_temp.uid_of('samo')
where card.game_rarity = 'Legendary'
  and not exists (
    select 1 from public.card_instances ci
    where ci.league_id = lm.league_id and ci.card_catalog_id = card.id
  );

set local session_replication_role = origin;

do $$
declare
  i integer;
  picked uuid;
  picked_rarity text;
  fardin uuid := pg_temp.uid_of('fardin');
begin
  -- No Legendary left: always the next rung, Secret Rare.
  for i in 1..10 loop
    picked := public.pick_shop_pack_card(fardin, 'Legendary', null);
    select game_rarity into picked_rarity from public.card_catalog where id = picked;
    perform pg_temp.assert_eq(picked_rarity, 'Secret Rare', 'Legendary slot falls back to Secret Rare (pick ' || i || ')');
  end loop;

  -- Secret Rares "gone" too (made ineligible inside the test
  -- transaction): the next rung is Ultra Rare.
  update public.card_catalog set format_eligible = false where game_rarity = 'Secret Rare';

  for i in 1..5 loop
    picked := public.pick_shop_pack_card(fardin, 'Legendary', null);
    select game_rarity into picked_rarity from public.card_catalog where id = picked;
    perform pg_temp.assert_eq(picked_rarity, 'Ultra Rare', 'then Ultra Rare (pick ' || i || ')');
  end loop;

  -- A Secret Rare slot with no Secret Rare left: Ultra Rare too.
  picked := public.pick_shop_pack_card(fardin, 'Secret Rare', null);
  select game_rarity into picked_rarity from public.card_catalog where id = picked;
  perform pg_temp.assert_eq(picked_rarity, 'Ultra Rare', 'a Secret Rare slot also walks down the ladder');

  update public.card_catalog set format_eligible = false where game_rarity = 'Ultra Rare';

  picked := public.pick_shop_pack_card(fardin, 'Legendary', null);
  select game_rarity into picked_rarity from public.card_catalog where id = picked;
  perform pg_temp.assert_eq(picked_rarity, 'Super Rare', 'then Super Rare');

  -- A rarity with free copies is untouched.
  picked := public.pick_shop_pack_card(fardin, 'Rare', null);
  select game_rarity into picked_rarity from public.card_catalog where id = picked;
  perform pg_temp.assert_eq(picked_rarity, 'Rare', 'an available rolled rarity is picked as rolled');

  -- A Normal slot never goes UP while Normals are left.
  picked := public.pick_shop_pack_card(fardin, 'Normal', null);
  select game_rarity into picked_rarity from public.card_catalog where id = picked;
  perform pg_temp.assert_eq(picked_rarity, 'Normal', 'a Normal slot stays Normal');

  update public.card_catalog set format_eligible = true where game_rarity in ('Secret Rare', 'Ultra Rare');
end;
$$;

-- Guaranteed Legendary (luck 100) with no Legendary left: the pack's
-- best card is a Secret Rare and luck is kept (+0.25 for a Standard
-- pack), exactly the 202610121600 luck rule.
do $$
declare
  opening uuid;
  best_rank integer;
  luck_after numeric;
begin
  update public.profiles set duel_points = 100000 where id = pg_temp.uid_of('fardin');

  insert into public.player_pack_luck (profile_id, luck_points)
  values (pg_temp.uid_of('fardin'), 100)
  on conflict (profile_id) do update set luck_points = 100;

  perform pg_temp.act_as('fardin');
  opening := public.purchase_shop_pack('normal');

  select max(public.shop_rarity_rank(pulled_rarity))
  into best_rank
  from public.shop_pack_pulls
  where opening_id = opening;

  perform pg_temp.assert_eq(best_rank, public.shop_rarity_rank('Secret Rare'), 'guaranteed slot delivered a Secret Rare');

  perform pg_temp.assert_eq(
    (select count(*)::integer from public.shop_pack_pulls where opening_id = opening and pulled_rarity = 'Legendary'),
    0,
    'no Legendary was created past the league limit'
  );

  select luck_points into luck_after from public.player_pack_luck where profile_id = pg_temp.uid_of('fardin');
  perform pg_temp.assert_eq(luck_after, 100.25::numeric, 'luck kept when the Legendary fell back');
end;
$$;
