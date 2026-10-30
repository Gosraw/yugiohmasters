-- =========================================================
-- DUELIST CIRCLE 2.0 - card wager guard (launch rehearsal 2026-10-30)
--
-- Bug: add_match_wager_card accepted a card that sits in a deck
-- locked for a competition (competition_deck_locks - every player's
-- active deck is locked as soon as the season starts). The duel could
-- be played and confirmed, but settle_match_wagers then has to move
-- that card to the winner, which the deck lock trigger refuses
-- ("This deck is locked for a competition and cannot be modified.").
-- Result: the duel is completed, the wager stays 'proposed' and BOTH
-- staked cards stay locked for good.
--
-- Fix: refuse such a card up front, exactly like trades already do
-- (202610121400_trade_deck_guards.sql). accept_practice_challenge
-- calls add_match_wager_card, so the accept step gets the same check.
--
-- Same patch technique as 202610152030_practice_challenge_guards.sql:
-- the live definition gets one extra line after its first "begin".
-- Same signature and grants. Idempotent (a marker comment prevents a
-- second patch). Backwards compatible with the live main app: only a
-- new refusal in a case that could never settle.
-- =========================================================

begin;

do $$
declare
  def text;
  patched text;
  marker constant text := 'wager card competition deck guard (202610301300)';
  guard constant text :=
    'if exists (select 1 from public.deck_cards dc join public.competition_deck_locks cdl on cdl.deck_id = dc.deck_id where dc.card_instance_id = target_card_instance_id) then raise exception ''This card is in a deck that is locked for a competition and cannot be wagered.''; end if;';
begin
  def := pg_get_functiondef('public.add_match_wager_card(uuid,uuid)'::regprocedure);

  if position(marker in def) > 0 then
    return;
  end if;

  patched := regexp_replace(
    def,
    E'\\nbegin\\n',
    E'\nbegin\n  -- ' || marker || E'\n  ' || guard || E'\n'
  );

  if patched = def then
    raise exception 'wager card guard: could not patch add_match_wager_card';
  end if;

  execute patched;
end;
$$;

commit;
