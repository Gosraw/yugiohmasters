-- 2026-10-12 bug hunt (migration 202610121400_trade_deck_guards):
-- 1. accept_trade / submit_trade / add_trade_item refuse LOCKED
--    cards (e.g. a practice-match wager).
-- 8. ...and cards in a competition-locked deck, up front.
-- 7. add_card_to_deck / remove_card_from_deck only on Draft decks.

create function pg_temp.give(target_username text, target_name text)
returns uuid
language plpgsql
as $$
declare
  owner uuid := pg_temp.uid_of(target_username);
  league uuid;
  new_id uuid;
begin
  select league_id into league from public.league_members where profile_id = owner;

  insert into public.card_instances (league_id, card_catalog_id, copy_number,
    current_owner_id, original_owner_id, original_acquisition_type)
  values (league, (select id from public.card_catalog where name = target_name), 0, owner, owner, 'development')
  returning id into new_id;

  return new_id;
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
  league uuid := (select league_id from public.league_members where profile_id = pg_temp.uid_of('samo'));
  fardin uuid := pg_temp.uid_of('fardin');
  samo uuid := pg_temp.uid_of('samo');
  card_a uuid;
  card_b uuid;
  card_c uuid;
  card_d uuid;
  t1 uuid;
  t2 uuid;
  t3 uuid;
  t_ok uuid;
  v_deck uuid;
  v_ready_deck uuid;
  v_ready_deck_card uuid;
  v_competition uuid;
begin
  update public.card_catalog
  set format_eligible = true, game_rarity = 'Normal'
  where name in ('30,000-Year White Turtle', '7 Colored Fish', 'Abyss Flower', 'Acid Crawler');

  card_a := pg_temp.give('samo', '30,000-Year White Turtle');
  card_b := pg_temp.give('samo', '7 Colored Fish');
  card_c := pg_temp.give('samo', 'Abyss Flower');
  card_d := pg_temp.give('samo', 'Acid Crawler');

  -- ---------------------------------------------------------
  -- 1. Wager-locked card in a pending trade.
  -- ---------------------------------------------------------
  perform pg_temp.act_as('samo');
  t1 := public.create_trade(league, fardin);
  perform public.add_trade_item(t1, card_a, 'offered');
  perform public.submit_trade(t1, null);

  update public.card_instances
  set locked = true, lock_type = 'match_wager', lock_reference_id = gen_random_uuid(), locked_at = now()
  where id = card_a;

  perform pg_temp.act_as('fardin');
  perform pg_temp.expect_error(
    format('select public.accept_trade(%L)', t1),
    'locked (for example as a match wager)',
    'accept_trade refuses a card that is locked as a match wager');
  perform pg_temp.assert_eq(
    (select current_owner_id from public.card_instances where id = card_a), samo,
    'wagered card stays with its owner');

  perform pg_temp.act_as('samo');
  t2 := public.create_trade(league, fardin);
  perform pg_temp.expect_error(
    format('select public.add_trade_item(%L, %L, %L)', t2, card_a, 'offered'),
    'This card is locked',
    'add_trade_item refuses a locked card with a clear message');

  -- Added while unlocked, locked before submit.
  perform public.add_trade_item(t2, card_b, 'offered');
  update public.card_instances set locked = true, lock_type = 'match_wager', lock_reference_id = gen_random_uuid(), locked_at = now() where id = card_b;
  perform pg_temp.act_as('samo');
  perform pg_temp.expect_error(
    format('select public.submit_trade(%L, null)', t2),
    'locked (for example as a match wager)',
    'submit_trade refuses a trade with a card locked after it was added');
  update public.card_instances set locked = false, lock_type = null, lock_reference_id = null, locked_at = null where id in (card_a, card_b);

  -- ---------------------------------------------------------
  -- 8. Card in a competition-locked deck.
  -- ---------------------------------------------------------
  perform pg_temp.act_as('samo');
  v_deck := public.create_deck(league, 'SQL test locked deck');
  perform public.add_card_to_deck(v_deck, card_a);

  v_competition := pg_temp.new_competition();
  insert into public.competition_deck_locks (competition_id, profile_id, deck_id)
  values (v_competition, samo, v_deck)
  on conflict (competition_id, profile_id) do update set deck_id = excluded.deck_id;

  perform pg_temp.act_as('samo');
  t3 := public.create_trade(league, fardin);
  perform pg_temp.expect_error(
    format('select public.add_trade_item(%L, %L, %L)', t3, card_a, 'offered'),
    'locked for a competition',
    'add_trade_item refuses a card in a competition-locked deck');

  perform pg_temp.act_as('fardin');
  perform pg_temp.expect_error(
    format('select public.accept_trade(%L)', t1),
    'locked for a competition, so it cannot be accepted',
    'accept_trade refuses a card in a competition-locked deck with a clear message');

  -- ---------------------------------------------------------
  -- Positive control: a normal card still trades.
  -- ---------------------------------------------------------
  perform pg_temp.act_as('samo');
  t_ok := public.create_trade(league, fardin);
  perform public.add_trade_item(t_ok, card_c, 'offered');
  perform public.submit_trade(t_ok, null);
  perform pg_temp.act_as('fardin');
  perform public.accept_trade(t_ok);
  perform pg_temp.assert_eq(
    (select current_owner_id from public.card_instances where id = card_c), fardin,
    'an unlocked card still trades normally');

  -- ---------------------------------------------------------
  -- 7. Deck RPCs only on Draft decks.
  -- ---------------------------------------------------------
  perform pg_temp.act_as('samo');
  v_ready_deck := public.create_deck(league, 'SQL test ready deck');
  v_ready_deck_card := public.add_card_to_deck(v_ready_deck, card_b);

  -- Flip to ready without the 40-card rule (rolled back).
  set local session_replication_role = replica;
  update public.decks set status = 'ready' where id = v_ready_deck;
  set local session_replication_role = origin;

  perform pg_temp.expect_error(
    format('select public.add_card_to_deck(%L, %L)', v_ready_deck, card_d),
    'Only a Draft deck can be edited',
    'add_card_to_deck refuses a Ready deck');
  perform pg_temp.expect_error(
    format('select public.remove_card_from_deck(%L)', v_ready_deck_card),
    'Only a Draft deck can be edited',
    'remove_card_from_deck refuses a Ready deck');

  update public.decks set status = 'draft' where id = v_ready_deck;
  perform public.remove_card_from_deck(v_ready_deck_card);
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.deck_cards where deck_id = v_ready_deck), 0,
    'remove_card_from_deck still works on a Draft deck');
end;
$$;
