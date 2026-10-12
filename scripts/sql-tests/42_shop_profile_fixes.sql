-- Shop pack scarcity + profile title fixes (2026-10-12 bug hunt):
--  * 202610121600: pack pickers count copies LEAGUE-WIDE like the
--    validate_new_card_instance() trigger, so a card the league
--    already has 3 copies of is skipped instead of aborting the whole
--    purchase ("Card scarcity limit reached. Maximum copies: 3").
--  * DP / voucher charged exactly once per successful pack.
--  * Legendary luck is kept when no Legendary was left to give.
--  * 202610121610: private_league_has_room() for the signup check.
--  * 202610121620: profiles.custom_title is not client-writable.

select pg_temp.reset_players();

-- Fill the league: samo holds 3 copies of every other card (by id
-- hash), so roughly half of every rarity and every Special Pack pool
-- is full while fardin owns none of them - exactly the situation the
-- old per-buyer count got wrong. Bulk setup skips triggers (fast);
-- they are back on for the purchases below.
set local session_replication_role = replica;

insert into public.card_instances (
  league_id, card_catalog_id, copy_number, current_owner_id,
  original_owner_id, original_acquisition_type
)
select
  lm.league_id, card.id, copy_no, lm.profile_id, lm.profile_id, 'shop'
from public.card_catalog card
cross join generate_series(1, 3) copy_no
join public.league_members lm on lm.profile_id = pg_temp.uid_of('samo')
where card.format_eligible = true
  and card.game_rarity <> 'Legendary'
  and abs(hashtext(card.id::text)) % 2 = 0
  and not exists (
    select 1 from public.card_instances ci
    where ci.league_id = lm.league_id and ci.card_catalog_id = card.id
  );

-- Every Legendary is taken (1 copy each) - for the luck check.
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

update public.profiles set duel_points = 1000000 where id = pg_temp.uid_of('fardin');

select public.ensure_shop_rotations_current();

do $$
declare
  pack text;
  i integer;
  failures integer := 0;
  successes integer := 0;
  expected_spend integer := 0;
  price integer;
  start_dp integer := pg_temp.balance('fardin');
  first_error text;
  special_codes text[] := array[]::text[];
begin
  perform pg_temp.act_as('fardin');

  if public.get_active_special_pack_rotation('attribute') is not null then
    special_codes := array_append(special_codes, 'special_attribute');
  end if;

  if public.get_active_special_pack_rotation('monster_type') is not null then
    special_codes := array_append(special_codes, 'special_monster_type');
  end if;

  perform pg_temp.assert_true(
    cardinality(special_codes) > 0,
    'an active Special Pack rotation exists'
  );

  foreach pack in array array['normal', 'deluxe'] || special_codes loop
    for i in 1..(case when pack like 'special%' then 6 else 12 end) loop
      if pack like 'special%' then
        select r.price_dp into price
        from public.shop_special_pack_rotations r
        where r.id = public.get_active_special_pack_rotation(
          case pack when 'special_attribute' then 'attribute' else 'monster_type' end
        );
      else
        select t.price_dp into price from public.shop_pack_types t where t.code = pack;
      end if;

      begin
        perform public.purchase_shop_pack(pack);
        successes := successes + 1;
        expected_spend := expected_spend + price;
      exception when others then
        failures := failures + 1;
        first_error := coalesce(first_error, pack || ': ' || sqlerrm);
      end;
    end loop;
  end loop;

  perform pg_temp.assert_eq(failures, 0, 'no pack purchase failed (' || coalesce(first_error, 'none') || ')');
  perform pg_temp.assert_true(successes >= 30, '30+ packs opened');
  perform pg_temp.assert_eq(
    pg_temp.balance('fardin'),
    start_dp - expected_spend,
    'DP charged exactly once per pack'
  );
end;
$$;

-- No card ever exceeds its league-wide copy limit.
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

-- Voucher purchase: voucher consumed once, no DP spent.
do $$
declare
  voucher_id uuid;
  dp_before integer;
begin
  insert into public.reward_vouchers (profile_id, voucher_type, quantity)
  values (pg_temp.uid_of('fardin'), 'deluxe_pack', 2)
  returning id into voucher_id;

  dp_before := pg_temp.balance('fardin');
  perform pg_temp.act_as('fardin');
  perform public.purchase_shop_pack('deluxe', voucher_id);

  perform pg_temp.assert_eq(pg_temp.balance('fardin'), dp_before, 'voucher pack costs no DP');
  perform pg_temp.assert_eq(
    (select quantity from public.reward_vouchers where id = voucher_id),
    1,
    'voucher quantity drops by exactly 1'
  );
end;
$$;

-- Legendary luck: at 100 luck the pack is guaranteed a Legendary, but
-- every Legendary is taken - luck must NOT reset to 0.
do $$
begin
  insert into public.player_pack_luck (profile_id, luck_points)
  values (pg_temp.uid_of('fardin'), 100)
  on conflict (profile_id) do update set luck_points = 100;

  perform pg_temp.act_as('fardin');
  perform public.purchase_shop_pack('normal');

  perform pg_temp.assert_eq(
    (select luck_points from public.player_pack_luck where profile_id = pg_temp.uid_of('fardin')),
    100.25::numeric,
    'luck kept (+0.25) when no Legendary was available'
  );
end;
$$;

-- Signup capacity check: anon may ask, and the 3-player league is full.
select pg_temp.assert_true(
  has_function_privilege('anon', 'public.private_league_has_room()', 'execute'),
  'anon can call private_league_has_room()'
);

select pg_temp.assert_eq(public.private_league_has_room(), false, 'full 3-player league has no room');

delete from public.league_members where profile_id = pg_temp.uid_of('fardin');

select pg_temp.assert_eq(public.private_league_has_room(), true, 'league with 2 players has room');

-- custom_title: no client write, only the service-role RPC.
select pg_temp.assert_true(
  not has_column_privilege('authenticated', 'public.profiles', 'custom_title', 'update'),
  'authenticated cannot update profiles.custom_title'
);

select pg_temp.assert_true(
  has_column_privilege('authenticated', 'public.profiles', 'catchphrase', 'update'),
  'other profile columns stay editable'
);

select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.set_profile_custom_title(uuid, text)', 'execute'),
  'set_profile_custom_title is not callable by players'
);

select public.set_profile_custom_title(pg_temp.uid_of('samo'), 'First Blood');

select pg_temp.assert_eq(
  (select custom_title from public.profiles where id = pg_temp.uid_of('samo')),
  'First Blood',
  'service role sets the title'
);

-- /admin config editor (202610121630): admin only, whitelisted keys.
do $$
declare
  refused boolean := false;
begin
  perform pg_temp.act_as('bossg');
  perform public.admin_set_config_value('economy.match_win_dp', 120);
  perform public.admin_set_config_value('boss.stage_3_dp', 1500);
  perform public.admin_set_config_value('perk.weekly_dp_cap', null);
  perform public.admin_set_config_value('mini_game.auto_battler.week.1', 160);

  perform pg_temp.assert_eq((select match_win_dp from public.league_economy_defaults), 120, 'admin sets match win DP');
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.boss_route_stages where stage_number = 3 and dp_cost_to_reach <> 1500),
    0,
    'admin sets the stage 3 price on every route'
  );
  perform pg_temp.assert_eq((select weekly_dp_cap from public.perk_config), null::integer, 'perk cap can be cleared');
  perform pg_temp.assert_eq(
    (select dp from public.mini_game_reward_config where game = 'auto_battler' and period = 'week' and place = 1),
    160,
    'admin sets a mini game reward'
  );

  begin
    perform public.admin_set_config_value('economy.match_win_dp; drop table x', 1);
  exception when others then
    refused := true;
  end;
  perform pg_temp.assert_true(refused, 'unknown key refused');

  refused := false;
  perform pg_temp.act_as('fardin');
  begin
    perform public.admin_set_config_value('economy.match_win_dp', 999);
  exception when others then
    refused := true;
  end;
  perform pg_temp.assert_true(refused, 'non-admin refused');
end;
$$;
