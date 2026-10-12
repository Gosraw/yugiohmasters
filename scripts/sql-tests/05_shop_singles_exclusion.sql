-- Fix 5: shop singles never offer a Boss Route Stage-4 evolution
-- monster or an is_route_exclusive support card (same rule as packs
-- and draft), and the purchase RPC refuses one if it is ever listed.
-- Plus (fix 8): every DP shop purchase now has a ledger row with a
-- readable description.

select pg_temp.reset_players();

do $$
declare
  balance_before integer;
  tx public.duel_point_transactions%rowtype;
begin
  -- A DP-paid pack purchase (purchase_shop_pack itself is unchanged)
  -- also shows up in the ledger.
  perform public._credit_duel_points(pg_temp.uid_of('samo'), 300, 'test_setup');
  perform pg_temp.act_as('samo');
  balance_before := pg_temp.balance('samo');

  perform public.purchase_shop_pack('normal', null);

  select * into tx
  from public.duel_point_transactions
  where profile_id = pg_temp.uid_of('samo')
    and reason = 'shop_purchase'
    and metadata ->> 'purchase_type' = 'pack';

  perform pg_temp.assert_eq(tx.amount, -300, 'Normal Pack purchase logged as -300');
  perform pg_temp.assert_eq(tx.description, 'Bought a Standard Pack', 'pack purchase ledger description');
  perform pg_temp.assert_eq(pg_temp.balance('samo'), balance_before - 300, 'pack purchase debited exactly once');
end;
$$;

do $$
declare
  kept_cards uuid[];
  reserved_card uuid;
  rotation uuid;
  offered integer;
  offered_reserved integer;
  slot_id uuid;
  bought_card uuid;
  tx public.duel_point_transactions%rowtype;
begin
  -- Shrink the eligible pool to: every reserved card + 3 normal cards.
  -- Before the fix the generator would have picked mostly reserved
  -- cards from this pool.
  select array_agg(id) into kept_cards
  from (
    select cc.id
    from public.card_catalog cc
    where cc.format_eligible
      and public.is_master_duel_offerable(cc.master_duel_status)
      and not public.is_boss_route_reserved_card(cc.id)
      and cc.game_rarity in ('Normal', 'Rare', 'Super Rare')
    order by cc.name
    limit 3
  ) k;

  update public.card_catalog cc
  set format_eligible = false
  where cc.format_eligible
    and not public.is_boss_route_reserved_card(cc.id)
    and cc.id <> all(kept_cards);

  perform pg_temp.assert_true(
    (select count(*) from public.card_catalog cc
     where cc.format_eligible and public.is_master_duel_offerable(cc.master_duel_status)
       and public.is_boss_route_reserved_card(cc.id)) > 10,
    'test pool contains many reserved Boss Route cards'
  );

  -- Force a fresh rotation.
  update public.shop_rotations
  set starts_at = now() - interval '2 days', ends_at = now() - interval '1 second'
  where status = 'active';

  perform public.refresh_shop_singles_rotation_if_needed();

  select id into rotation
  from public.shop_rotations
  where status = 'active' and starts_at <= now() and ends_at > now();

  select count(*), count(*) filter (where public.is_boss_route_reserved_card(card_catalog_id))
  into offered, offered_reserved
  from public.shop_rotation_cards
  where rotation_id = rotation;

  perform pg_temp.assert_eq(offered, 3, 'the new rotation offers only the 3 non-reserved cards');
  perform pg_temp.assert_eq(offered_reserved, 0, 'no Stage-4 / route-exclusive card is offered');

  -- A reserved card slipped into a rotation (e.g. generated before
  -- the fix): the purchase is refused.
  select cc.id into reserved_card
  from public.card_catalog cc
  where public.is_boss_route_reserved_card(cc.id)
  order by cc.name
  limit 1;

  insert into public.shop_rotation_cards (rotation_id, slot_number, card_catalog_id, price_dp, slot_tier)
  values (rotation, 6, reserved_card, 40, 'wildcard')
  returning id into slot_id;

  perform public._credit_duel_points(pg_temp.uid_of('samo'), 5000, 'test_setup');
  perform pg_temp.act_as('samo');

  begin
    perform public.purchase_shop_rotation_card(slot_id);
    raise exception 'FAILED: a reserved Boss Route card was sold';
  exception
    when raise_exception then
      if sqlerrm not like 'This card belongs to a Boss Route%' then
        raise;
      end if;
      raise notice 'ok: buying a reserved Boss Route card is refused';
  end;

  -- Buying a normal single: DP debited once, ledger row explains it.
  select id, card_catalog_id into slot_id, bought_card
  from public.shop_rotation_cards
  where rotation_id = rotation and slot_number <> 6
  order by slot_number
  limit 1;

  perform public.purchase_shop_rotation_card(slot_id);

  select * into tx
  from public.duel_point_transactions
  where profile_id = pg_temp.uid_of('samo')
    and reason = 'shop_purchase'
    and metadata ->> 'purchase_type' = 'single_card';

  perform pg_temp.assert_eq(tx.amount, -(select price_dp from public.shop_rotation_cards where id = slot_id), 'single purchase ledger amount = price');
  perform pg_temp.assert_eq(tx.balance_after, pg_temp.balance('samo'), 'ledger balance_after = real balance');
  perform pg_temp.assert_eq(
    tx.description,
    'Bought ' || (select name from public.card_catalog where id = bought_card) || ' from the shop',
    'single purchase ledger row names the card'
  );
end;
$$;
