-- 2.0 card pool, part 3 (generated 202610121030): the inactive
-- 'duelist_circle_classic_v2' format = exactly the 6,136 playable
-- cards of data/cardpool/classic-v2-pool.json, proposed rarities kept
-- apart from live game_rarity, Boss-route exemption behind a flag.

do $$
declare
  v2 public.duelist_circle_formats;
  eligible_count integer;
  exempt_extra integer;
  not_copied integer;
begin
  select * into v2 from public.duelist_circle_formats where code = 'duelist_circle_classic_v2';

  perform pg_temp.assert_true(v2.id is not null, 'Classic v2 format row exists');
  perform pg_temp.assert_eq(v2.is_active, false, 'Classic v2 is NOT active (launch night activates it)');
  perform pg_temp.assert_eq(v2.curated_pool_only, true, 'Classic v2 is a curated pool');
  perform pg_temp.assert_eq(v2.boss_route_exempt, true, 'Boss-route exemption defaults to on');
  perform pg_temp.assert_eq(v2.release_cutoff, '2014-12-31'::date, 'cutoff 2014-12-31');
  perform pg_temp.assert_true(v2.allow_fusion and v2.allow_xyz and not v2.allow_synchro and not v2.allow_link and not v2.allow_pendulum,
    'Extra Deck: Fusion + Xyz only');

  perform pg_temp.assert_eq(
    (select count(*)::integer from public.format_card_overrides where format_id = v2.id and override_type = 'include'),
    6136, '6,136 curated includes');

  -- OCG-only Master Duel cards were added to the catalog, inactive.
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.card_catalog
     where format_exclusion_reason like 'Classic v2 catalog addition%'),
    151, '151 OCG-only pool cards added to card_catalog');
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.card_catalog
     where format_exclusion_reason like 'Classic v2 catalog addition%' and (format_eligible or master_duel_status <> 'unknown')),
    0, 'additions start format_eligible = false with master_duel_status unknown');

  -- Proposed rarities: complete, matching ranking-v2, NOT live.
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.duelist_circle_proposed_rarities where format_code = v2.code),
    6136, '6,136 proposed rarities');
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.duelist_circle_proposed_rarities where format_code = v2.code and proposed_rarity = 'Legendary'),
    45, '45 proposed Legendaries (ranking-v2)');
  perform pg_temp.assert_eq(
    (select proposed_rarity from public.duelist_circle_proposed_rarities p
     join public.card_catalog c on c.id = p.card_catalog_id
     where p.format_code = v2.code and c.name = 'Raigeki'),
    'Legendary', 'Raigeki proposed Legendary (board wipe)');

  select count(*) into not_copied
  from public.duelist_circle_proposed_rarities p
  join public.card_catalog c on c.id = p.card_catalog_id
  where p.format_code = v2.code
    and c.game_rarity is distinct from p.proposed_rarity;
  perform pg_temp.assert_true(not_copied > 0, format('live game_rarity untouched (%s cards still differ from the proposal)', not_copied));

  -- Eligibility (= what draft/shop may offer): exactly the pool,
  -- whatever the Boss-route flag says.
  select count(*) into eligible_count
  from public.card_catalog c
  where public.is_duelist_circle_format_eligible(c.id, v2.id);

  perform pg_temp.assert_eq(eligible_count, 6136, 'format eligibility = exactly the 6,136 playable pool cards');

  perform pg_temp.assert_eq(public.is_duelist_circle_format_eligible(
    (select id from public.card_catalog where name = 'Chaos Emperor Dragon - Envoy of the End'), v2.id),
    false, 'Chaos Emperor Dragon (proposal forbidden) is out');

  -- Deck legality (needs the active format): the exemption lets a
  -- route owner deck their post-2014 / forbidden route cards...
  update public.duelist_circle_formats set is_active = false where is_active;
  update public.duelist_circle_formats set is_active = true where id = v2.id;
  update public.card_catalog c
  set format_eligible = public.is_duelist_circle_format_eligible(c.id, v2.id);

  select count(*) into exempt_extra
  from public.card_catalog c
  where public.is_duelist_circle_deck_legal(c.id) and not c.format_eligible;
  perform pg_temp.assert_true(exempt_extra > 0,
    format('exemption on: %s Boss-route cards outside the pool are deck-legal (never offered: format_eligible stays false)', exempt_extra));

  perform pg_temp.assert_eq(public.is_duelist_circle_deck_legal(
    (select id from public.card_catalog where name = 'Crimson Nova the Dark Cubic Lord')),
    true, 'exemption on: Crimson Nova (post-2014 Cubic route boss) is deck-legal');
  perform pg_temp.assert_eq(
    (select format_eligible from public.card_catalog where name = 'Souleating Oviraptor'),
    false, 'exemption on: Souleating Oviraptor (post-2014 route evolution) is still never offered by draft/shop');

  -- ... and OFF: deck legality = the pool.
  update public.duelist_circle_formats set boss_route_exempt = false where id = v2.id;

  perform pg_temp.assert_eq(
    (select count(*)::integer from public.card_catalog c where public.is_duelist_circle_deck_legal(c.id)),
    6136, 'exemption off: exactly the 6,136 pool cards are deck-legal');
  perform pg_temp.assert_eq(public.is_duelist_circle_deck_legal(
    (select id from public.card_catalog where name = 'Crimson Nova the Dark Cubic Lord')),
    false, 'exemption off: Crimson Nova is not deck-legal');

  -- Synchro leak closed, unknown-status pool card in.
  perform pg_temp.assert_eq(public.is_duelist_circle_format_eligible(
    (select id from public.card_catalog where name = 'Junk Synchron'), v2.id),
    false, 'Junk Synchron is not eligible (Synchro leak)');
  perform pg_temp.assert_eq(public.is_duelist_circle_format_eligible(
    (select id from public.card_catalog where name = 'Synchro Barrier'), v2.id),
    false, 'Synchro Barrier is not eligible');
  perform pg_temp.assert_eq(public.is_duelist_circle_format_eligible(
    (select id from public.card_catalog where name = '30,000-Year White Turtle'), v2.id),
    true, 'unknown-MD-status pool card (30,000-Year White Turtle) is eligible');
end;
$$;
