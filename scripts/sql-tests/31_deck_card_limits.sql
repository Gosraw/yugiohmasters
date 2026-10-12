-- 2.0 card pool, part 2 (202610121010 + generated 202610121030): our
-- own banlist (duelist_circle_card_limits) is enforced in decks for
-- the ACTIVE format - add_card_to_deck (deck_cards trigger) and
-- set_deck_status -> ready (decks trigger). No active format = no
-- limits (the live app today).

create function pg_temp.card(target_name text)
returns uuid
language sql
stable
as $$
  select id from public.card_catalog where name = target_name;
$$;

-- Give a player n fresh copies (rolled back). Returns the new ids.
create function pg_temp.give(target_username text, target_card uuid, n integer)
returns uuid[]
language plpgsql
as $$
declare
  owner uuid := pg_temp.uid_of(target_username);
  league uuid;
  ids uuid[] := '{}';
  new_id uuid;
begin
  select league_id into league from public.league_members where profile_id = owner;

  for i in 1..n loop
    insert into public.card_instances (league_id, card_catalog_id, copy_number,
      current_owner_id, original_owner_id, original_acquisition_type)
    values (league, target_card, 0, owner, owner, 'development')
    returning id into new_id;
    ids := ids || new_id;
  end loop;

  return ids;
end;
$$;

create function pg_temp.expect_error(statement text, expected_fragment text, label text)
returns void
language plpgsql
as $$
begin
  begin
    execute statement;
  exception
    when others then
      if position(expected_fragment in sqlerrm) = 0 then
        raise exception 'FAILED: % (wrong error: %)', label, sqlerrm;
      end if;
      raise notice 'ok: %', label;
      return;
  end;
  raise exception 'FAILED: % (no error raised)', label;
end;
$$;

do $$
declare
  limited_card uuid := pg_temp.card('Foolish Burial');        -- 2014 limited
  semi_card uuid := pg_temp.card('Reasoning');           -- 2014 semi-limited
  forbidden_card uuid := pg_temp.card('Yata-Garasu');         -- proposal forbidden
  proposal_one uuid := pg_temp.card('Skill Drain');           -- proposal 1 per deck
  legendary_card uuid := pg_temp.card('Raigeki');             -- legendary_unique: no deck limit
  harpie uuid := pg_temp.card('Harpie''s Feather Duster');    -- 2014 forbidden, proposal legendary
  dmoc uuid := pg_temp.card('Dark Magician of Chaos');        -- 2014 forbidden, DM route stage-4 boss
  copies uuid[];
  v_deck uuid;
  filler uuid;
  filler_copies uuid[];
  i integer;
begin
  -- Banlist data (generated seed).
  perform pg_temp.assert_eq(
    (select max_copies from public.duelist_circle_card_limits where format_code = 'duelist_circle_classic_v2' and card_catalog_id = limited_card),
    1, 'Foolish Burial: limited (1) from the 2014 list');
  perform pg_temp.assert_eq(
    (select source from public.duelist_circle_card_limits where format_code = 'duelist_circle_classic_v2' and card_catalog_id = forbidden_card),
    'proposal', 'Yata-Garasu: forbidden by the proposal');
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.duelist_circle_card_limits where format_code = 'duelist_circle_classic_v2' and card_catalog_id in (legendary_card, harpie)),
    0, 'legendary_unique (Raigeki, Harpie''s Feather Duster) is not a deck limit, and overrides 2014');

  -- No active format: no limits (live app unchanged).
  perform pg_temp.assert_eq(public.duelist_circle_deck_copy_limit(limited_card), null::integer,
    'no active format -> no deck limit');

  -- Activate Classic v2 for the rest of this (rolled back) test.
  update public.duelist_circle_formats set is_active = false where is_active;
  update public.duelist_circle_formats set is_active = true where code = 'duelist_circle_classic_v2';

  perform pg_temp.assert_eq(public.duelist_circle_deck_copy_limit(limited_card), 1, 'active Classic v2: Foolish Burial limit 1');
  perform pg_temp.assert_eq(public.duelist_circle_deck_copy_limit(semi_card), 2, 'active Classic v2: Reasoning limit 2');
  perform pg_temp.assert_eq(public.duelist_circle_deck_copy_limit(forbidden_card), 0, 'active Classic v2: Yata-Garasu limit 0');
  perform pg_temp.assert_eq(public.duelist_circle_deck_copy_limit(proposal_one), 1, 'active Classic v2: Skill Drain limit 1');
  perform pg_temp.assert_eq(public.duelist_circle_deck_copy_limit(legendary_card), null::integer, 'Raigeki: no deck limit');

  -- Boss-route exemption (flag on by default): DMoC is the DM route
  -- boss, so its 2014 "forbidden" does not apply...
  perform pg_temp.assert_eq(public.duelist_circle_deck_copy_limit(dmoc), null::integer,
    'boss_route_exempt: Dark Magician of Chaos (route boss) has no deck limit');
  -- ...and with the flag off it is forbidden again.
  update public.duelist_circle_formats set boss_route_exempt = false where code = 'duelist_circle_classic_v2';
  perform pg_temp.assert_eq(public.duelist_circle_deck_copy_limit(dmoc), 0,
    'boss_route_exempt off: Dark Magician of Chaos forbidden (0)');
  update public.duelist_circle_formats set boss_route_exempt = true where code = 'duelist_circle_classic_v2';

  -- Test cards: legal in the deck builder, plain rarity (rolled back).
  update public.card_catalog
  set format_eligible = true, game_rarity = 'Normal'
  where id in (limited_card, semi_card, forbidden_card);

  perform pg_temp.act_as('bossg');
  v_deck := public.create_deck(
    (select league_id from public.league_members where profile_id = pg_temp.uid_of('bossg')),
    'SQL test limits deck');

  -- add_card_to_deck: limited = 1.
  copies := pg_temp.give('bossg', limited_card, 2);
  perform public.add_card_to_deck(v_deck, copies[1]);
  raise notice 'ok: first Foolish Burial is accepted';
  perform pg_temp.expect_error(
    format('select public.add_card_to_deck(%L, %L)', v_deck, copies[2]),
    'limited to 1 per deck',
    'second Foolish Burial is refused by add_card_to_deck');

  -- semi-limited = 2.
  copies := pg_temp.give('bossg', semi_card, 3);
  perform public.add_card_to_deck(v_deck, copies[1]);
  perform public.add_card_to_deck(v_deck, copies[2]);
  raise notice 'ok: two Reasoning are accepted';
  perform pg_temp.expect_error(
    format('select public.add_card_to_deck(%L, %L)', v_deck, copies[3]),
    'limited to 2 per deck',
    'third Reasoning is refused');

  -- forbidden = 0.
  copies := pg_temp.give('bossg', forbidden_card, 1);
  perform pg_temp.expect_error(
    format('select public.add_card_to_deck(%L, %L)', v_deck, copies[1]),
    'is Forbidden',
    'Yata-Garasu cannot be added at all');

  -- Fill the Main Deck to 40 with plain Normal Monsters nobody owns.
  for filler in
    select c.id
    from public.card_catalog c
    where c.card_type = 'Normal Monster'
      and c.format_eligible
      and not exists (select 1 from public.card_instances ci where ci.card_catalog_id = c.id)
      and not exists (select 1 from public.duelist_circle_card_limits l where l.card_catalog_id = c.id)
    order by c.name
    limit 13
  loop
    update public.card_catalog set game_rarity = 'Normal' where id = filler;
    filler_copies := pg_temp.give('bossg', filler, 3);
    for i in 1..3 loop
      perform public.add_card_to_deck(v_deck, filler_copies[i]);
    end loop;
  end loop;

  perform pg_temp.assert_eq(
    (select count(*)::integer from public.deck_cards where deck_id = v_deck and section = 'main'),
    42, 'deck has 42 Main Deck cards (1 Foolish Burial + 2 Reasoning + 39 fillers)');

  -- set_deck_status: a legal deck becomes ready...
  perform public.set_deck_status(v_deck, 'ready');
  perform pg_temp.assert_eq((select status::text from public.decks where id = v_deck), 'ready',
    'a deck within the limits can be set ready');
  perform public.set_deck_status(v_deck, 'draft');

  -- ...but after the vote tightens Reasoning to forbidden, the
  -- deck that holds two can no longer be set ready.
  update public.duelist_circle_card_limits
  set max_copies = 0
  where format_code = 'duelist_circle_classic_v2' and card_catalog_id = semi_card;

  perform pg_temp.expect_error(
    format('select public.set_deck_status(%L, %L)', v_deck, 'ready'),
    'Reasoning is Forbidden',
    'set_deck_status(ready) refuses a deck with a now-forbidden card');

  update public.duelist_circle_card_limits
  set max_copies = 1
  where format_code = 'duelist_circle_classic_v2' and card_catalog_id = semi_card;

  perform pg_temp.expect_error(
    format('select public.set_deck_status(%L, %L)', v_deck, 'ready'),
    'limited to 1 per deck in the Duelist Circle format (deck has 2)',
    'set_deck_status(ready) refuses a deck over a tightened limit');
end;
$$;
