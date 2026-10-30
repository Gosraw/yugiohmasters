-- Card wagers vs competition-locked decks (202610301300, launch
-- rehearsal 2026-10-30): a card in a deck that is locked for a
-- competition can never change owner, so it can't be wagered either
-- (it used to be accepted and then the wager could never settle).

select pg_temp.reset_players();

-- Ready, active decks for samo and fardin, and one card copy in
-- samo's deck plus one loose copy (setup only: triggers skipped).
set local session_replication_role = replica;

update public.decks set is_active = false where is_active;

insert into public.decks (league_id, owner_id, name, status, is_active)
select lm.league_id, lm.profile_id, 'SQL test deck', 'ready', true
from public.league_members lm
where lm.profile_id in (pg_temp.uid_of('bossg'), pg_temp.uid_of('samo'), pg_temp.uid_of('fardin'));

create temp table wager_test_cards on commit drop as
with card as (
  select c.id
  from public.card_catalog c
  where c.game_rarity = 'Normal'
    and not exists (select 1 from public.card_instances ci where ci.card_catalog_id = c.id)
  order by c.name
  limit 2
),
numbered as (
  select id, row_number() over (order by id) as n from card
)
select gen_random_uuid() as instance_id, n.id as card_id, n.n
from numbered n;

insert into public.card_instances (
  id, league_id, card_catalog_id, copy_number, current_owner_id,
  original_owner_id, original_acquisition_type
)
select w.instance_id, lm.league_id, w.card_id, 1, lm.profile_id, lm.profile_id, 'development'
from wager_test_cards w
join public.league_members lm on lm.profile_id = pg_temp.uid_of('samo');

insert into public.deck_cards (deck_id, card_instance_id, section, position)
select d.id, w.instance_id, 'main', 1
from wager_test_cards w
join public.decks d on d.owner_id = pg_temp.uid_of('samo') and d.is_active
where w.n = 1;

set local session_replication_role = origin;

do $$
declare
  comp_id uuid;
  league uuid;
  challenge uuid;
  in_deck uuid := (select instance_id from wager_test_cards where n = 1);
  loose uuid := (select instance_id from wager_test_cards where n = 2);
  raised text;
begin
  -- Joining the season locks every player's active deck.
  comp_id := pg_temp.new_competition(1);

  perform pg_temp.assert_true(
    exists (
      select 1 from public.competition_deck_locks l
      join public.deck_cards dc on dc.deck_id = l.deck_id
      where l.competition_id = comp_id and dc.card_instance_id = in_deck
    ),
    'setup: samo''s active deck (with the card) is locked for the season'
  );

  select league_id into league from public.competitions where id = comp_id;

  perform pg_temp.act_as('samo');
  challenge := public.create_match_challenge(league, pg_temp.uid_of('fardin'));
  perform public.configure_practice_challenge(challenge, 'card', 0);

  raised := null;
  begin
    perform public.add_match_wager_card(challenge, in_deck);
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_eq(
    raised,
    'This card is in a deck that is locked for a competition and cannot be wagered.',
    'a card in a competition-locked deck cannot be wagered'
  );
  perform pg_temp.assert_eq(
    (select locked from public.card_instances where id = in_deck), false,
    'the refused card stays unlocked'
  );

  perform public.add_match_wager_card(challenge, loose);
  perform pg_temp.assert_eq(
    (select lock_type from public.card_instances where id = loose), 'match_wager',
    'a card outside a locked deck can still be wagered'
  );
end;
$$;
