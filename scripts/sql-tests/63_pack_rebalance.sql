-- Pack rebalance (202611021000, owner decisions 2026-11-02):
--  * prices and sizes of all pack types, active rotations, generator
--  * peak and filler rolls only give the allowed rarities
--  * a Special Pack has at most 2 cards per archetype when the pool
--    allows it; null and empty archetypes don't count
--  * a tiny pool relaxes the cap instead of failing the purchase
--  * no second copy of a card in one pack while the pool has others
--  * DP charged once, vouchers, Legendary guarantee, rarity ladder

select pg_temp.reset_players();

update public.profiles set duel_points = 1000000 where username = 'fardin';

insert into public.player_pack_luck (profile_id, luck_points)
values (pg_temp.uid_of('fardin'), 0)
on conflict (profile_id) do update set luck_points = 0;

-- The active 'archetype' rotation now sells the given curated pack.
create function pg_temp.sell_pack(target_code text)
returns void
language sql
as $$
  update public.shop_special_pack_rotations
  set pack_definition_id = (select id from public.shop_special_pack_definitions where code = target_code)
  where theme_category = 'archetype' and status = 'active';
$$;

-- Replaces a curated pack's pool. The cards must be real catalog rows.
create function pg_temp.set_pool(target_code text, target_cards uuid[])
returns void
language sql
as $$
  delete from public.shop_special_pack_pool_cards
  where pack_definition_id = (select id from public.shop_special_pack_definitions where code = target_code);

  insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
  select d.id, card_id
  from public.shop_special_pack_definitions d
  cross join unnest(target_cards) as card_id
  where d.code = target_code;
$$;

-- N sellable cards of a rarity that nobody in the league owns yet.
create function pg_temp.free_cards(target_rarity text, how_many integer)
returns uuid[]
language sql
as $$
  select array_agg(id)
  from (
    select card.id
    from public.card_catalog card
    where card.format_eligible
      and card.game_rarity = target_rarity
      and public.is_master_duel_offerable(card.master_duel_status)
      and not exists (select 1 from public.card_instances ci where ci.card_catalog_id = card.id)
      and not exists (select 1 from public.boss_route_stages b where b.evolution_card_catalog_id = card.id and b.stage_number = 4)
      and not exists (select 1 from public.boss_route_stage_grants g where g.card_catalog_id = card.id and g.is_route_exclusive)
    order by card.id
    limit how_many
  ) picked;
$$;

-- The highest number of cards with the same archetype in one opening.
create function pg_temp.max_per_archetype(target_opening uuid)
returns integer
language sql
as $$
  select coalesce(max(n), 0)::integer
  from (
    select count(*) as n
    from public.shop_pack_pulls p
    join public.card_catalog c on c.id = p.card_catalog_id
    where p.opening_id = target_opening
      and nullif(btrim(c.archetype), '') is not null
    group by lower(btrim(c.archetype))
  ) counts;
$$;

create function pg_temp.pull_count(target_opening uuid)
returns integer
language sql
as $$
  select count(*)::integer from public.shop_pack_pulls where opening_id = target_opening;
$$;

create function pg_temp.distinct_cards(target_opening uuid)
returns integer
language sql
as $$
  select count(distinct card_catalog_id)::integer from public.shop_pack_pulls where opening_id = target_opening;
$$;

-- ---------------------------------------------------------
-- Prices and sizes
-- ---------------------------------------------------------

do $$
declare
  rotation record;
begin
  perform pg_temp.assert_eq(
    (select jsonb_object_agg(code, jsonb_build_array(price_dp, cards_per_pack)) from public.shop_pack_types),
    '{"normal": [400, 5], "premium": [900, 10], "deluxe": [1500, 14]}'::jsonb,
    'Standard 400/5, Premium 900/10, Deluxe 1500/14'
  );

  perform pg_temp.assert_true(
    (select count(*) from public.shop_special_pack_rotations where status = 'active') > 0,
    'an active special rotation exists'
  );

  for rotation in
    select theme_category, price_dp, cards_per_pack
    from public.shop_special_pack_rotations
    where status = 'active'
  loop
    perform pg_temp.assert_eq(rotation.price_dp, 1000, rotation.theme_category || ' rotation costs 1000');
    perform pg_temp.assert_eq(rotation.cards_per_pack, 10, rotation.theme_category || ' rotation has 10 cards');
  end loop;
end;
$$;

-- The generator: when a rotation ends, the next one is 1000 DP / 10.
do $$
declare
  old_id uuid;
  new_row public.shop_special_pack_rotations%rowtype;
begin
  update public.shop_special_pack_rotations
  set starts_at = now() - interval '3 days', ends_at = now() - interval '1 day'
  where theme_category = 'monster_type' and status = 'active'
  returning id into old_id;

  perform public.refresh_shop_special_pack_rotation_if_needed('monster_type');

  select * into new_row
  from public.shop_special_pack_rotations
  where theme_category = 'monster_type' and status = 'active';

  perform pg_temp.assert_true(new_row.id is distinct from old_id, 'the generator made a new rotation');
  perform pg_temp.assert_eq(new_row.price_dp, 1000, 'a new rotation costs 1000');
  perform pg_temp.assert_eq(new_row.cards_per_pack, 10, 'a new rotation has 10 cards');
end;
$$;

-- ---------------------------------------------------------
-- Signatures and rights
-- ---------------------------------------------------------

select pg_temp.assert_eq(
  pg_get_function_arguments('public.purchase_shop_pack(text, uuid)'::regprocedure),
  'target_pack_code text, target_voucher_id uuid DEFAULT NULL::uuid',
  'purchase_shop_pack keeps target_voucher_id default null'
);

select pg_temp.assert_eq(
  pg_get_function_arguments('public.pick_shop_pack_card(uuid, text, uuid)'::regprocedure),
  'target_profile_id uuid, target_rarity text, target_rotation_id uuid DEFAULT NULL::uuid',
  'pick_shop_pack_card keeps its signature'
);

select pg_temp.assert_eq(
  (select count(*)::integer from pg_proc where pronamespace = 'public'::regnamespace and proname = 'pick_shop_pack_card'),
  1,
  'pick_shop_pack_card has no second overload'
);

select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public._pick_shop_pack_card_constrained(uuid, text, uuid, text[], uuid[])', 'execute'),
  'players cannot call the internal pick'
);

-- ---------------------------------------------------------
-- Peak and filler rolls only give the allowed rarities
-- ---------------------------------------------------------

do $$
declare
  pack text;
  allowed text[];
  seen text[];
  i integer;
  peak text;
begin
  foreach pack in array array['normal', 'premium', 'deluxe', 'special_attribute', 'special_archetype', 'special_monster_type'] loop
    seen := '{}';

    for i in 1..3000 loop
      peak := public.roll_shop_pack_peak_rarity(pack);

      if peak is null then
        seen := array_append(seen, 'none');
      elsif not peak = any (seen) then
        seen := array_append(seen, peak);
      end if;
    end loop;

    perform pg_temp.assert_true(
      seen <@ array['Legendary', 'Secret Rare', 'Ultra Rare', 'Super Rare', 'none'],
      pack || ' peak only rolls Legendary, Secret, Ultra, Super or nothing'
    );

    if pack = 'deluxe' then
      perform pg_temp.assert_true(not 'none' = any (seen), 'a Deluxe pack always has a peak');
    else
      perform pg_temp.assert_true('none' = any (seen), pack || ' can have no peak');
    end if;

    allowed := case pack
      when 'normal' then array['Normal', 'Rare']
      when 'deluxe' then array['Normal', 'Rare', 'Super Rare', 'Ultra Rare']
      else array['Normal', 'Rare', 'Super Rare']
    end;

    select array_agg(distinct public.roll_shop_pack_filler_rarity(pack))
    into seen
    from generate_series(1, 3000);

    perform pg_temp.assert_true(
      seen <@ allowed and seen @> allowed,
      pack || ' filler rolls exactly ' || allowed::text || ', got ' || seen::text
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------
-- DP is charged once, and the sizes are real
-- ---------------------------------------------------------

do $$
declare
  buyer uuid := pg_temp.act_as('fardin');
  pack record;
  opening uuid;
  dp_before integer;
  ledger_before integer;
begin
  for pack in
    select *
    from (
      values
        ('normal', 400, 5),
        ('premium', 900, 10),
        ('deluxe', 1500, 14),
        ('special_archetype', 1000, 10),
        ('special_attribute', 1000, 10)
    ) as v(code, price, cards)
  loop
    dp_before := pg_temp.balance('fardin');

    select count(*) into ledger_before
    from public.duel_point_transactions
    where profile_id = buyer and reason = 'shop_purchase';

    opening := public.purchase_shop_pack(pack.code);

    perform pg_temp.assert_eq(pg_temp.pull_count(opening), pack.cards, pack.code || ' has ' || pack.cards || ' cards');
    perform pg_temp.assert_eq(pg_temp.distinct_cards(opening), pack.cards, pack.code || ' has no card twice');
    perform pg_temp.assert_eq(dp_before - pg_temp.balance('fardin'), pack.price, pack.code || ' charges ' || pack.price || ' DP');
    perform pg_temp.assert_eq(
      (
        select count(*)::integer
        from public.duel_point_transactions
        where profile_id = buyer and reason = 'shop_purchase'
      ) - ledger_before,
      1,
      pack.code || ' writes one ledger row'
    );
    perform pg_temp.assert_eq(
      (
        select sp.dp_spent
        from public.shop_purchases sp
        join public.shop_pack_openings o on o.purchase_id = sp.id
        where o.id = opening
      ),
      pack.price,
      pack.code || ' records the DP spent'
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------
-- The cap, on the real curated pools
-- ---------------------------------------------------------

do $$
declare
  pool text;
  opening uuid;
  i integer;
  worst integer;
begin
  perform pg_temp.act_as('fardin');

  foreach pool in array array['six_samurai_warlords', 'elemental_vanguard', 'chaos_shadows'] loop
    perform pg_temp.sell_pack(pool);
    worst := 0;

    for i in 1..12 loop
      opening := public.purchase_shop_pack('special_archetype');
      worst := greatest(worst, pg_temp.max_per_archetype(opening));

      perform pg_temp.assert_eq(pg_temp.distinct_cards(opening), 10, pool || ' pack ' || i || ': 10 different cards');
    end loop;

    perform pg_temp.assert_true(worst <= 2, pool || ': never more than 2 per archetype (worst: ' || worst || ')');
  end loop;
end;
$$;

-- Standard, Premium and Deluxe have no cap: the pick is not told about
-- archetypes. Shown on a deliberately narrow catalog: all Normals share
-- one archetype.
do $$
declare
  opening uuid;
begin
  update public.card_catalog set archetype = 'Only One' where game_rarity = 'Normal';

  -- A Standard pack of mostly Normals: 3+ of the archetype is normal here.
  for i in 1..6 loop
    opening := public.purchase_shop_pack('normal');
    exit when pg_temp.max_per_archetype(opening) > 2;
  end loop;

  perform pg_temp.assert_true(pg_temp.max_per_archetype(opening) > 2, 'Standard packs are not capped');
end;
$$;

-- Null and empty archetypes don't count, so a pool of only those fills
-- a pack without any relaxing.
do $$
declare
  cards uuid[] := pg_temp.free_cards('Normal', 12);
  opening uuid;
begin
  update public.card_catalog set archetype = null where id = any (cards[1:6]);
  update public.card_catalog set archetype = '  ' where id = any (cards[7:12]);

  perform pg_temp.set_pool('stone_age', cards);
  perform pg_temp.sell_pack('stone_age');

  opening := public.purchase_shop_pack('special_archetype');

  perform pg_temp.assert_eq(pg_temp.pull_count(opening), 10, 'a pool without archetypes fills the pack');
  perform pg_temp.assert_eq(pg_temp.distinct_cards(opening), 10, 'with 10 different cards');
  perform pg_temp.assert_eq(pg_temp.max_per_archetype(opening), 0, 'null and empty archetypes are not counted');
end;
$$;

-- Same archetype with different spelling counts as one.
do $$
declare
  cards uuid[] := pg_temp.free_cards('Normal', 22);
  opening uuid;
begin
  update public.card_catalog set archetype = 'Twins' where id = any (cards[1:3]);
  update public.card_catalog set archetype = ' twins ' where id = any (cards[4:6]);
  update public.card_catalog set archetype = null where id = any (cards[7:22]);

  perform pg_temp.set_pool('stone_age', cards);
  perform pg_temp.sell_pack('stone_age');

  opening := public.purchase_shop_pack('special_archetype');

  perform pg_temp.assert_true(
    (
      select count(*) <= 2
      from public.shop_pack_pulls p
      join public.card_catalog c on c.id = p.card_catalog_id
      where p.opening_id = opening and c.id = any (cards[1:6])
    ),
    'archetype spelling differences do not get around the cap'
  );
end;
$$;

-- ---------------------------------------------------------
-- Tiny pools: the cap gives way, the purchase doesn't fail
-- ---------------------------------------------------------

do $$
declare
  cards uuid[] := pg_temp.free_cards('Normal', 4);
  opening uuid;
  dp_before integer;
  failed boolean := false;
begin
  -- 4 cards x 3 copies = 12 copies, all the same archetype. 10 fit.
  update public.card_catalog set archetype = 'Tiny' where id = any (cards);

  perform pg_temp.set_pool('stone_age', cards);
  perform pg_temp.sell_pack('stone_age');

  dp_before := pg_temp.balance('fardin');
  opening := public.purchase_shop_pack('special_archetype');

  perform pg_temp.assert_eq(pg_temp.pull_count(opening), 10, 'tiny pool: the pack is complete');
  perform pg_temp.assert_eq(dp_before - pg_temp.balance('fardin'), 1000, 'tiny pool: charged once');
  perform pg_temp.assert_eq(pg_temp.max_per_archetype(opening), 10, 'tiny pool: the cap gave way for this pack');
  perform pg_temp.assert_eq(pg_temp.distinct_cards(opening), 4, 'tiny pool: every card is used before any repeats');

  -- Now only 2 copies are left. This is a pool with no free copy at
  -- all, the one failure that remains, and it charges nothing.
  dp_before := pg_temp.balance('fardin');

  begin
    perform public.purchase_shop_pack('special_archetype');
  exception when others then
    failed := true;
    perform pg_temp.assert_eq(sqlerrm, 'No eligible cards remain for this player.', 'an empty pool gives the old message');
  end;

  perform pg_temp.assert_true(failed, 'an empty pool still refuses');
  perform pg_temp.assert_eq(pg_temp.balance('fardin'), dp_before, 'a refused pack costs nothing');
  perform pg_temp.assert_true(
    (
      select max(n) <= 3
      from (
        select count(*) as n
        from public.card_instances
        where card_catalog_id = any (cards)
        group by card_catalog_id
      ) per_card
    ),
    'tiny pool: the league-wide copy limit held'
  );
end;
$$;

-- The cap comes before "no repeats": 3 cards of one archetype and 1
-- without, in a 5-card pack. Two of the archetype, then the free card
-- three times. A third of the archetype would be a new card, but the
-- cap goes first.
do $$
declare
  cards uuid[] := pg_temp.free_cards('Normal', 4);
  opening uuid;
begin
  update public.card_catalog set archetype = 'Capped' where id = any (cards[1:3]);
  update public.card_catalog set archetype = null where id = cards[4];

  perform pg_temp.set_pool('stone_age', cards);
  perform pg_temp.sell_pack('stone_age');

  update public.shop_special_pack_rotations
  set cards_per_pack = 5
  where theme_category = 'archetype' and status = 'active';

  opening := public.purchase_shop_pack('special_archetype');

  update public.shop_special_pack_rotations
  set cards_per_pack = 10
  where theme_category = 'archetype' and status = 'active';

  perform pg_temp.assert_eq(pg_temp.pull_count(opening), 5, 'mixed tiny pool: the pack is complete');
  perform pg_temp.assert_eq(pg_temp.max_per_archetype(opening), 2, 'mixed tiny pool: within the cap');
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.shop_pack_pulls where opening_id = opening and card_catalog_id = cards[4]),
    3,
    'mixed tiny pool: the free card repeats before the cap gives way'
  );
end;
$$;

-- A pool that is only one archetype plus a wider rarity spread: the
-- cap gives way per slot, never failing, also on the peak's archetype.
do $$
declare
  cards uuid[] := pg_temp.free_cards('Rare', 3) || pg_temp.free_cards('Super Rare', 3) || pg_temp.free_cards('Ultra Rare', 3);
  opening uuid;
begin
  update public.card_catalog set archetype = 'Solo' where id = any (cards);

  perform pg_temp.set_pool('stone_age', cards);
  perform pg_temp.sell_pack('stone_age');

  opening := public.purchase_shop_pack('special_archetype');

  perform pg_temp.assert_eq(pg_temp.pull_count(opening), 10, 'one-archetype pool: the pack is complete');
  perform pg_temp.assert_eq(pg_temp.distinct_cards(opening), 9, 'one-archetype pool: all 9 cards before a repeat');
end;
$$;

-- ---------------------------------------------------------
-- Legendary guarantee and ladder
-- ---------------------------------------------------------

-- A guaranteed Legendary is delivered even when the Legendary shares
-- its archetype with half of the pool (the peak goes first), and that
-- archetype still counts for the other slots.
do $$
declare
  buyer uuid := pg_temp.uid_of('fardin');
  legendaries uuid[] := pg_temp.free_cards('Legendary', 6);
  crown uuid[] := pg_temp.free_cards('Normal', 20) || pg_temp.free_cards('Rare', 20) || pg_temp.free_cards('Super Rare', 20);
  plain uuid[];
  opening uuid;
  i integer;
begin
  update public.card_catalog set archetype = 'Crown' where id = any (legendaries || crown);

  select array_agg(id)
  into plain
  from (
    select card.id
    from public.card_catalog card
    where card.format_eligible
      and card.game_rarity in ('Normal', 'Rare', 'Super Rare')
      and public.is_master_duel_offerable(card.master_duel_status)
      and card.id <> all (crown)
      and not exists (select 1 from public.card_instances ci where ci.card_catalog_id = card.id)
      and not exists (select 1 from public.boss_route_stages b where b.evolution_card_catalog_id = card.id and b.stage_number = 4)
      and not exists (select 1 from public.boss_route_stage_grants g where g.card_catalog_id = card.id and g.is_route_exclusive)
    limit 60
  ) picked;

  update public.card_catalog set archetype = null where id = any (plain);

  perform pg_temp.set_pool('stone_age', legendaries || crown || plain);
  perform pg_temp.sell_pack('stone_age');

  for i in 1..6 loop
    update public.player_pack_luck set luck_points = 100 where profile_id = buyer;

    opening := public.purchase_shop_pack('special_archetype');

    perform pg_temp.assert_eq(
      (select count(*)::integer from public.shop_pack_pulls where opening_id = opening and pulled_rarity = 'Legendary'),
      1,
      'luck 100: the guaranteed Legendary is there (pack ' || i || ')'
    );
    perform pg_temp.assert_eq(
      (select luck_points from public.player_pack_luck where profile_id = buyer),
      0::numeric,
      'luck resets after the real Legendary (pack ' || i || ')'
    );
    perform pg_temp.assert_true(pg_temp.max_per_archetype(opening) <= 2, 'the peak''s archetype counts for the cap (pack ' || i || ')');
  end loop;
end;
$$;

-- Luck 100 in a pool without a Legendary: the ladder gives its best
-- card and luck is kept (+1.25 for a Special Pack).
do $$
declare
  buyer uuid := pg_temp.uid_of('fardin');
  secret uuid[] := pg_temp.free_cards('Secret Rare', 2);
  rest uuid[] := pg_temp.free_cards('Rare', 15);
  opening uuid;
begin
  update public.card_catalog set archetype = null where id = any (secret || rest);

  perform pg_temp.set_pool('stone_age', secret || rest);
  perform pg_temp.sell_pack('stone_age');

  update public.player_pack_luck set luck_points = 100 where profile_id = buyer;

  opening := public.purchase_shop_pack('special_archetype');

  perform pg_temp.assert_eq(
    (select max(public.shop_rarity_rank(pulled_rarity)) from public.shop_pack_pulls where opening_id = opening),
    public.shop_rarity_rank('Secret Rare'),
    'no Legendary in the pool: the slot gives the Secret Rare'
  );
  perform pg_temp.assert_eq(
    (select luck_points from public.player_pack_luck where profile_id = buyer),
    101.25::numeric,
    'luck kept when the Legendary fell back'
  );

  update public.player_pack_luck set luck_points = 0 where profile_id = buyer;
end;
$$;

-- The last resort goes to the NEAREST rarity above the rolled one: a
-- Normal slot in a pool without Normals never jumps to a Legendary.
do $$
declare
  fardin uuid := pg_temp.uid_of('fardin');
  ultra uuid[] := pg_temp.free_cards('Ultra Rare', 3);
  legendary uuid[] := pg_temp.free_cards('Legendary', 3);
  rotation uuid;
  picked uuid;
  picked_rarity text;
  i integer;
begin
  perform pg_temp.set_pool('stone_age', ultra || legendary);
  perform pg_temp.sell_pack('stone_age');
  rotation := public.get_active_special_pack_rotation('archetype');

  for i in 1..15 loop
    picked := public.pick_shop_pack_card(fardin, 'Normal', rotation);
    select game_rarity into picked_rarity from public.card_catalog where id = picked;
    perform pg_temp.assert_eq(picked_rarity, 'Ultra Rare', 'a Normal slot goes to the nearest rarity (' || i || ')');
  end loop;

  -- A Legendary slot with a Legendary left: exactly as rolled.
  picked := public.pick_shop_pack_card(fardin, 'Legendary', rotation);
  select game_rarity into picked_rarity from public.card_catalog where id = picked;
  perform pg_temp.assert_eq(picked_rarity, 'Legendary', 'an available rolled rarity is picked as rolled');
end;
$$;

-- ---------------------------------------------------------
-- As a real player: the purchase works although the internal pick is
-- off limits to the authenticated role
-- ---------------------------------------------------------

select pg_temp.act_as('fardin');

set local role authenticated;

select public.purchase_shop_pack('normal');

do $$
begin
  perform public._pick_shop_pack_card_constrained(auth.uid(), 'Rare');
  raise exception 'FAILED: a player reached the internal pick';
exception when insufficient_privilege then
  raise notice 'ok: a player cannot call the internal pick';
end;
$$;

reset role;

-- ---------------------------------------------------------
-- Vouchers
-- ---------------------------------------------------------

do $$
declare
  buyer uuid := pg_temp.uid_of('fardin');
  voucher_id uuid;
  opening uuid;
  dp_before integer;
  pack record;
begin
  perform pg_temp.sell_pack('six_samurai_warlords');

  for pack in
    select *
    from (
      values
        ('normal', 'normal_pack', 5),
        ('premium', 'premium_pack', 10),
        ('deluxe', 'deluxe_pack', 14),
        ('special_archetype', 'special_pack', 10)
    ) as v(code, voucher, cards)
  loop
    insert into public.reward_vouchers (profile_id, voucher_type, quantity)
    values (buyer, pack.voucher, 1)
    returning id into voucher_id;

    dp_before := pg_temp.balance('fardin');
    opening := public.purchase_shop_pack(pack.code, voucher_id);

    perform pg_temp.assert_eq(pg_temp.pull_count(opening), pack.cards, pack.voucher || ' gives ' || pack.cards || ' cards');
    perform pg_temp.assert_eq(pg_temp.balance('fardin'), dp_before, pack.voucher || ' costs no DP');
    perform pg_temp.assert_true(
      not exists (select 1 from public.reward_vouchers where id = voucher_id),
      pack.voucher || ' is used up'
    );
  end loop;

  perform pg_temp.assert_true(pg_temp.max_per_archetype(opening) <= 2, 'a voucher Special Pack is capped too');
end;
$$;

-- No card anywhere above its league-wide copy limit after all of this.
select pg_temp.assert_eq(
  (
    select count(*)::integer
    from (
      select ci.card_catalog_id
      from public.card_instances ci
      group by ci.league_id, ci.card_catalog_id
      having count(*) > public.card_copy_limit(ci.card_catalog_id)
    ) over_limit
  ),
  0,
  'no card above its league-wide copy limit'
);
