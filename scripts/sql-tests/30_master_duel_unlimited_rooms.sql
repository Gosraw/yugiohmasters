-- 2.0 card pool, part 1 (202610121000): the group plays Master Duel
-- Unlimited rooms, so only 'not_available' blocks a card. 'unknown'
-- is allowed only inside a curated pool (include override).

do $$
declare
  fmt_id uuid;
  c_unknown_curated uuid;
  c_unknown_free uuid;
  c_na_curated uuid;
  c_forbidden_curated uuid;
  c_forbidden_rules uuid;
  picked uuid;
  bossg uuid := pg_temp.uid_of('bossg');
begin
  -- 1. The shared helper.
  perform pg_temp.assert_eq(public.is_master_duel_offerable('unlimited'), true, 'unlimited is offerable');
  perform pg_temp.assert_eq(public.is_master_duel_offerable('semi_limited'), true, 'semi_limited is offerable');
  perform pg_temp.assert_eq(public.is_master_duel_offerable('limited'), true, 'limited is offerable');
  perform pg_temp.assert_eq(public.is_master_duel_offerable('forbidden'), true, 'MD-forbidden is offerable (Unlimited rooms)');
  perform pg_temp.assert_eq(public.is_master_duel_offerable('unknown'), true, 'unknown passes the helper (format_eligible is the curation gate)');
  perform pg_temp.assert_eq(public.is_master_duel_offerable('not_available'), false, 'not_available is blocked');
  perform pg_temp.assert_eq(public.is_master_duel_offerable(null), false, 'null is blocked');

  -- 2. The format engine, against a throwaway inactive format with
  --    the old Classic rules (no Synchro/Link/Pendulum, cutoff 2014).
  insert into public.duelist_circle_formats (code, name, version, release_cutoff,
    allow_illusion, allow_synchro, allow_xyz, allow_link, allow_pendulum, allow_fusion,
    current_release_stage, is_active)
  values ('sql_test_md', 'SQL test', 1, '2014-12-31', false, false, true, false, false, true, 1, false)
  returning id into fmt_id;

  -- Five plain Normal Monsters released before the cutoff.
  select id into c_unknown_curated from public.card_catalog where card_type = 'Normal Monster' order by name offset 0 limit 1;
  select id into c_unknown_free from public.card_catalog where card_type = 'Normal Monster' order by name offset 1 limit 1;
  select id into c_na_curated from public.card_catalog where card_type = 'Normal Monster' order by name offset 2 limit 1;
  select id into c_forbidden_curated from public.card_catalog where card_type = 'Normal Monster' order by name offset 3 limit 1;
  select id into c_forbidden_rules from public.card_catalog where card_type = 'Normal Monster' order by name offset 4 limit 1;

  update public.card_catalog
  set release_date = '2002-03-08', release_stage = 1
  where id in (c_unknown_curated, c_unknown_free, c_na_curated, c_forbidden_curated, c_forbidden_rules);

  update public.card_catalog set master_duel_status = 'unknown' where id in (c_unknown_curated, c_unknown_free);
  update public.card_catalog set master_duel_status = 'not_available' where id = c_na_curated;
  update public.card_catalog set master_duel_status = 'forbidden' where id in (c_forbidden_curated, c_forbidden_rules);

  insert into public.format_card_overrides (format_id, card_catalog_id, override_type, reason)
  select fmt_id, x, 'include', 'sql test curated pool'
  from unnest(array[c_unknown_curated, c_na_curated, c_forbidden_curated]) as x;

  perform pg_temp.assert_eq(public.is_duelist_circle_format_eligible(c_unknown_curated, fmt_id), true,
    'engine: unknown + curated include -> eligible');
  perform pg_temp.assert_eq(public.is_duelist_circle_format_eligible(c_unknown_free, fmt_id), false,
    'engine: unknown outside the curated pool -> not eligible');
  perform pg_temp.assert_eq(public.is_duelist_circle_format_eligible(c_na_curated, fmt_id), false,
    'engine: not_available beats a curated include');
  perform pg_temp.assert_eq(public.is_duelist_circle_format_eligible(c_forbidden_curated, fmt_id), true,
    'engine: MD-forbidden + curated include -> eligible');
  perform pg_temp.assert_eq(public.is_duelist_circle_format_eligible(c_forbidden_rules, fmt_id), true,
    'engine: MD-forbidden, eligible by the format rules alone -> eligible');

  -- 3. A caller: the shop pack picker now offers an MD-forbidden card.
  --    Make it the only eligible Rare card left (rolled back).
  update public.card_catalog set format_eligible = false where format_eligible and id <> c_forbidden_rules;
  update public.card_catalog set format_eligible = true, game_rarity = 'Rare' where id = c_forbidden_rules;

  picked := public.pick_shop_pack_card(bossg, 'Rare', null);
  perform pg_temp.assert_eq(picked, c_forbidden_rules, 'pick_shop_pack_card offers an MD-forbidden card');

  -- ... and never a not_available one.
  update public.card_catalog set master_duel_status = 'not_available' where id = c_forbidden_rules;
  begin
    picked := public.pick_shop_pack_card(bossg, 'Rare', null);
    raise exception 'FAILED: picker offered a not_available card (%)', picked;
  exception
    when raise_exception then
      if sqlerrm like 'FAILED:%' then
        raise;
      end if;
      raise notice 'ok: pick_shop_pack_card never offers a not_available card';
  end;
end;
$$;
