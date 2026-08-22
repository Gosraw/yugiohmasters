begin;

-- =========================================================
-- DUELIST CIRCLE - COLLECTION / DECKBUILDING / TRADING PASS
-- (2026-08-22, revised same day - see PART 1a/2/4/5/6 below)
--
-- This migration is purely additive and safe to re-run
-- (all statements are CREATE OR REPLACE / IF NOT EXISTS /
-- DROP+CREATE on functions, triggers and constraints only).
-- It has not been applied to production yet - the version
-- below already reflects the "no card locks for trading"
-- architecture change, so it can be applied directly without
-- needing an older locking version first.
--
-- ---------------------------------------------------------
-- ARCHITECTURE: CURRENT OWNERSHIP IS THE HARD TRUTH
-- ---------------------------------------------------------
--
-- card_instances.locked / lock_type / lock_reference_id /
-- locked_at are NO LONGER used by trading, deck membership,
-- or "For Trade" marking. A physical card may simultaneously:
--   - sit in a deck
--   - be marked For Trade
--   - be offered in several different pending trades
--   - be requested by several different players
-- current_owner_id is the only thing that ever actually
-- reserves anything. Whoever's accept_trade() call sees a
-- card still owned by the right person wins; every other
-- pending trade touching that same card simply fails its
-- next accept attempt with a friendly "no longer available"
-- error. First valid accept wins, no partial transfers.
--
-- Practice Duel card wagers are the one system that keeps
-- using the locked/lock_type mechanism (a wagered card is
-- genuinely reserved for the duration of that duel) - see the
-- audit note above PART 1b.
--
-- Part 1a: TRADING, REWRITTEN FOR NO CARD LOCKS.
--   submit_trade / accept_trade / decline_trade / cancel_trade
--   / counter_trade no longer touch locked/lock_type/
--   lock_reference_id/locked_at at all. Ownership is checked
--   live at submit (friendly, non-authoritative) and again at
--   accept (authoritative, atomic, "first valid accept wins").
--   DP is likewise never reserved at submit - only checked and
--   moved atomically at accept.
--
-- Part 1b: LOCK-CONSISTENCY BUG FIX, MATCH WAGERS ONLY.
--   card_instances_lock_consistency requires lock_reference_id
--   + locked_at whenever locked = true. The original
--   add_match_wager_card() only ever set locked + lock_type,
--   never the other two columns, so every UPDATE that locked a
--   wagered card violated this CHECK constraint and failed at
--   runtime. Fixed by setting/clearing all four lock columns
--   consistently. (submit_trade had the same bug, but Part 1a
--   removes card locking from trading entirely, which fixes it
--   a different way - by no longer needing the lock at all.)
--
-- Part 2: "For Trade" flag on card_instances (additive column)
--   plus set_card_for_trade() RPC. Purely an interest signal -
--   reserves nothing, can be set regardless of deck usage or
--   pending offers.
--
-- Part 3: DP support in trades (additive columns on trades)
--   plus set_trade_dp() RPC. DP is never reserved at submit -
--   only checked against the live balance and moved atomically
--   inside accept_trade().
--
-- Part 4: Counter offers, without altering the trade_status
--   enum (avoids ALTER TYPE ... ADD VALUE transaction-safety
--   edge cases). Uses two new nullable columns on trades
--   (parent_trade_id, superseded_by) plus counter_trade() RPC.
--
-- Part 5: OWNERSHIP-CHANGE SIDE EFFECTS (new).
--   A trigger on card_instances that fires whenever
--   current_owner_id actually changes - for ANY reason (an
--   accepted trade, a settled card wager, or anything else
--   built later) - and: removes that specific card_instance
--   from every deck it was sitting in, drops a Ready/Active
--   deck back to Draft if that removal broke its Main/Extra
--   requirements, and resets For Trade to false (an interest
--   signal tied to whoever set it, not something that survives
--   a change of owner).
--
-- Part 6: STALE LOCK CLEANUP (new).
--   A one-time, additive safety cleanup that clears any
--   leftover lock_type = 'trade' state from before this
--   rewrite. Only touches the four lock/for_trade metadata
--   columns - current_owner_id and every other ownership fact
--   is left completely untouched.
-- =========================================================


-- =========================================================
-- PART 1a. TRADING - REWRITTEN, NO CARD LOCKS
-- =========================================================

create or replace function public.submit_trade(
  target_trade_id uuid,
  trade_message text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;

  trade_sender_id uuid;
  trade_receiver_id uuid;
  trade_status public.trade_status;
  trade_dp_offered integer;

  offered_count integer;
  sender_balance integer;
begin

  current_user_id :=
    (select auth.uid());


  select
    t.sender_id,
    t.receiver_id,
    t.status,
    t.dp_offered
  into
    trade_sender_id,
    trade_receiver_id,
    trade_status,
    trade_dp_offered
  from public.trades t
  where t.id = target_trade_id;


  if not found then
    raise exception
      'Trade not found';
  end if;


  if current_user_id <> trade_sender_id
  then
    raise exception
      'Only the sender may submit this trade';
  end if;


  if trade_status <> 'draft'
  then
    raise exception
      'Only Draft trades can be submitted';
  end if;


  select count(*)
  into offered_count
  from public.trade_items ti
  where ti.trade_id = target_trade_id
    and ti.side = 'offered';


  if offered_count = 0
    and coalesce(trade_dp_offered, 0) <= 0
  then
    raise exception
      'Trade must contain at least one offered card or Duel Points';
  end if;


  -- -------------------------------------------------------
  -- Sanity-check the sender can currently afford their own
  -- DP offer. NOT the authoritative check - DP is never
  -- reserved here. accept_trade() re-validates against the
  -- live balance at accept time; this is just an early,
  -- friendlier failure.
  -- -------------------------------------------------------

  if coalesce(trade_dp_offered, 0) > 0 then

    select duel_points
    into sender_balance
    from public.profiles
    where id = trade_sender_id;

    if sender_balance < trade_dp_offered then
      raise exception
        'You do not have enough Duel Points for this offer';
    end if;

  end if;


  -- -------------------------------------------------------
  -- Ownership sanity-check, RIGHT NOW - not authoritative
  -- (accept_trade re-checks live at accept time, which is
  -- what actually matters), just a friendly early failure so
  -- an obviously stale draft can't even be sent. No locking:
  -- the same physical card is allowed to be offered in
  -- several pending trades at once.
  -- -------------------------------------------------------

  if exists (
    select 1
    from public.trade_items ti

    join public.card_instances ci
      on ci.id = ti.card_instance_id

    where ti.trade_id = target_trade_id

      and (
        (
          ti.side = 'offered'
          and ci.current_owner_id <> trade_sender_id
        )
        or
        (
          ti.side = 'requested'
          and ci.current_owner_id <> trade_receiver_id
        )
      )
  )
  then
    raise exception
      'One or more cards in this trade have changed owner. Remove them and try again.';
  end if;


  update public.trades
  set
    status = 'pending',
    message = nullif(
      trim(trade_message),
      ''
    ),
    submitted_at = now(),
    updated_at = now()
  where id = target_trade_id;
end;
$$;


create or replace function public.accept_trade(
  target_trade_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;

  trade_league_id uuid;
  trade_sender_id uuid;
  trade_receiver_id uuid;
  trade_status public.trade_status;
  trade_dp_offered integer;
  trade_dp_requested integer;

  sender_still_member boolean;
  receiver_still_member boolean;

  sender_new_balance integer;
  receiver_new_balance integer;
begin

  current_user_id :=
    (select auth.uid());


  -- Lock the TRADE ROW, not any card. Two concurrent accept
  -- attempts on the SAME trade serialize here. Concurrent
  -- accepts of DIFFERENT trades that happen to share a card
  -- are allowed to race - whichever gets past the live
  -- ownership check below first wins; the loser fails
  -- cleanly instead of doing a partial transfer.

  select
    t.league_id,
    t.sender_id,
    t.receiver_id,
    t.status,
    t.dp_offered,
    t.dp_requested
  into
    trade_league_id,
    trade_sender_id,
    trade_receiver_id,
    trade_status,
    trade_dp_offered,
    trade_dp_requested
  from public.trades t
  where t.id = target_trade_id
  for update;


  if not found then
    raise exception
      'Trade not found';
  end if;


  if current_user_id <> trade_receiver_id
  then
    raise exception
      'Only the receiver may accept this trade';
  end if;


  if trade_status <> 'pending'
  then
    raise exception
      'Only pending trades can be accepted';
  end if;


  -- -------------------------------------------------------
  -- Both players must still actually be league members.
  -- -------------------------------------------------------

  select exists (
    select 1
    from public.league_members lm
    where lm.league_id = trade_league_id
      and lm.profile_id = trade_sender_id
  )
  into sender_still_member;

  select exists (
    select 1
    from public.league_members lm
    where lm.league_id = trade_league_id
      and lm.profile_id = trade_receiver_id
  )
  into receiver_still_member;

  if not sender_still_member
    or not receiver_still_member
  then
    raise exception
      'One or both players are no longer members of this league.';
  end if;


  -- -------------------------------------------------------
  -- LIVE ownership - the one authoritative check. A card can
  -- be offered in several pending trades at once; whichever
  -- accept reaches here first while ownership still matches
  -- wins. Every later accept for a trade touching the same
  -- card fails right here instead of doing a partial
  -- transfer - first valid accept wins.
  -- -------------------------------------------------------

  if exists (
    select 1
    from public.trade_items ti

    join public.card_instances ci
      on ci.id = ti.card_instance_id

    where ti.trade_id = target_trade_id

      and (
        (
          ti.side = 'offered'
          and ci.current_owner_id <> trade_sender_id
        )
        or
        (
          ti.side = 'requested'
          and ci.current_owner_id <> trade_receiver_id
        )
      )
  )
  then
    raise exception
      'One or more cards in this trade are no longer available.';
  end if;


  -- -------------------------------------------------------
  -- DP: re-validate against LIVE balances and move it
  -- atomically. Never trusted as reserved at submit time -
  -- re-checked now, right before the transfer actually
  -- happens. A player may have several pending DP offers
  -- that together exceed their current balance; only the
  -- accepts for which they can still afford it at THIS
  -- moment succeed.
  -- -------------------------------------------------------

  if coalesce(trade_dp_offered, 0) > 0 then

    update public.profiles
    set duel_points = duel_points - trade_dp_offered
    where id = trade_sender_id
      and duel_points >= trade_dp_offered
    returning duel_points
    into sender_new_balance;

    if sender_new_balance is null then
      raise exception
        'Sender no longer has enough Duel Points for this trade.';
    end if;

    insert into public.duel_point_transactions (
      profile_id,
      amount,
      balance_after,
      reason,
      note
    )
    values (
      trade_sender_id,
      -trade_dp_offered,
      sender_new_balance,
      'trade',
      'Duel Points sent in trade ' || target_trade_id::text
    );

    perform public._credit_duel_points(
      trade_receiver_id,
      trade_dp_offered,
      'trade',
      null,
      'Duel Points received in trade ' || target_trade_id::text,
      '{}'::jsonb
    );

  end if;


  if coalesce(trade_dp_requested, 0) > 0 then

    update public.profiles
    set duel_points = duel_points - trade_dp_requested
    where id = trade_receiver_id
      and duel_points >= trade_dp_requested
    returning duel_points
    into receiver_new_balance;

    if receiver_new_balance is null then
      raise exception
        'You no longer have enough Duel Points for this trade.';
    end if;

    insert into public.duel_point_transactions (
      profile_id,
      amount,
      balance_after,
      reason,
      note
    )
    values (
      trade_receiver_id,
      -trade_dp_requested,
      receiver_new_balance,
      'trade',
      'Duel Points sent in trade ' || target_trade_id::text
    );

    perform public._credit_duel_points(
      trade_sender_id,
      trade_dp_requested,
      'trade',
      null,
      'Duel Points received in trade ' || target_trade_id::text,
      '{}'::jsonb
    );

  end if;


  -- -------------------------------------------------------
  -- Ownership transfer. No lock columns to touch - they were
  -- never set for trading in the first place. The
  -- card_instance_ownership_change trigger (Part 5) takes
  -- care of pulling these instances out of any decks, and
  -- resetting For Trade, automatically as a side effect of
  -- this UPDATE.
  -- -------------------------------------------------------

  update public.card_instances ci
  set
    current_owner_id = trade_receiver_id
  where ci.id in (
    select ti.card_instance_id
    from public.trade_items ti
    where ti.trade_id = target_trade_id
      and ti.side = 'offered'
  );


  update public.card_instances ci
  set
    current_owner_id = trade_sender_id
  where ci.id in (
    select ti.card_instance_id
    from public.trade_items ti
    where ti.trade_id = target_trade_id
      and ti.side = 'requested'
  );


  update public.trades
  set
    status = 'accepted',
    completed_at = now(),
    updated_at = now()
  where id = target_trade_id;
end;
$$;


create or replace function public.decline_trade(
  target_trade_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;

  trade_receiver_id uuid;
  trade_status public.trade_status;
begin

  current_user_id :=
    (select auth.uid());


  select
    t.receiver_id,
    t.status
  into
    trade_receiver_id,
    trade_status
  from public.trades t
  where t.id = target_trade_id
  for update;


  if not found then
    raise exception
      'Trade not found';
  end if;


  if current_user_id <> trade_receiver_id
  then
    raise exception
      'Only the receiver may decline this trade';
  end if;


  if trade_status <> 'pending'
  then
    raise exception
      'Only pending trades can be declined';
  end if;


  -- No card locks to release - trading never locks cards.

  update public.trades
  set
    status = 'declined',
    completed_at = now(),
    updated_at = now()
  where id = target_trade_id;
end;
$$;


create or replace function public.cancel_trade(
  target_trade_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;

  trade_sender_id uuid;
  trade_status public.trade_status;
begin

  current_user_id :=
    (select auth.uid());


  select
    t.sender_id,
    t.status
  into
    trade_sender_id,
    trade_status
  from public.trades t
  where t.id = target_trade_id
  for update;


  if not found then
    raise exception
      'Trade not found';
  end if;


  if current_user_id <> trade_sender_id
  then
    raise exception
      'Only the sender may cancel this trade';
  end if;


  if trade_status not in (
    'draft',
    'pending'
  )
  then
    raise exception
      'This trade can no longer be cancelled';
  end if;


  -- No card locks to release - trading never locks cards.

  update public.trades
  set
    status = 'cancelled',
    completed_at = now(),
    updated_at = now()
  where id = target_trade_id;
end;
$$;


-- =========================================================
-- PART 1b. LOCK-CONSISTENCY FIX: MATCH WAGER RPCS ONLY
--
-- Practice Duel card wagers are the one remaining system that
-- still uses card_instances.locked - a wagered card is
-- genuinely, exclusively reserved for the duration of that
-- duel, which is a different situation from a trade offer
-- (which is just interest, not a reservation). Same historical
-- bug, same fix, as Part 1a used to need before it stopped
-- needing locks at all: card_instances_lock_consistency
-- requires lock_reference_id + locked_at whenever locked =
-- true, and the original add_match_wager_card() only ever set
-- locked + lock_type.
-- =========================================================

create or replace function public.add_match_wager_card(
  target_match_id uuid,
  target_card_instance_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid;
  target_match public.matches%rowtype;
  target_owner uuid;
  target_locked boolean;
begin
  caller_id :=
    auth.uid();

  if caller_id is null then
    raise exception 'Not authenticated.';
  end if;

  select *
  into target_match
  from public.matches
  where id =
    target_match_id
  for update;

  if not found then
    raise exception 'Match not found.';
  end if;

  if target_match.match_type <> 'practice' then
    raise exception 'Only practice matches can use wagers.';
  end if;

  if target_match.wager_type <> 'card' then
    raise exception 'This match does not use a card wager.';
  end if;

  if caller_id not in (
    target_match.player_one_id,
    target_match.player_two_id
  ) then
    raise exception 'You are not part of this match.';
  end if;

  if target_match.status not in (
    'pending',
    'accepted'
  ) then
    raise exception 'This wager can no longer be changed.';
  end if;

  select
    current_owner_id,
    locked
  into
    target_owner,
    target_locked
  from public.card_instances
  where id =
    target_card_instance_id
  for update;

  if target_owner is null then
    raise exception 'Card copy not found.';
  end if;

  if target_owner <> caller_id then
    raise exception 'You do not own this card copy.';
  end if;

  if target_locked then
    raise exception 'This card copy is already locked.';
  end if;

  insert into public.match_wager_cards (
    match_id,
    owner_id,
    card_instance_id
  )
  values (
    target_match_id,
    caller_id,
    target_card_instance_id
  );

  update public.card_instances
  set
    locked = true,
    lock_type = 'match_wager',
    lock_reference_id = target_match_id,
    locked_at = now()
  where id =
    target_card_instance_id;

  update public.matches
  set wager_status =
    'proposed'
  where id =
    target_match_id;
end;
$$;


create or replace function public.remove_match_wager_card(
  target_match_id uuid,
  target_card_instance_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid;
  target_match public.matches%rowtype;
begin
  caller_id :=
    auth.uid();

  if caller_id is null then
    raise exception 'Not authenticated.';
  end if;

  select *
  into target_match
  from public.matches
  where id =
    target_match_id;

  if not found then
    raise exception 'Match not found.';
  end if;

  if target_match.status not in (
    'pending',
    'accepted'
  ) then
    raise exception 'This wager can no longer be changed.';
  end if;

  if not exists (
    select 1
    from public.match_wager_cards
    where match_id =
      target_match_id
      and card_instance_id =
        target_card_instance_id
      and owner_id =
        caller_id
      and status =
        'locked'
  ) then
    raise exception 'Wager card not found.';
  end if;

  delete from public.match_wager_cards
  where match_id =
    target_match_id
    and card_instance_id =
      target_card_instance_id
    and owner_id =
      caller_id;

  update public.card_instances
  set
    locked = false,
    lock_type = null,
    lock_reference_id = null,
    locked_at = null
  where id =
    target_card_instance_id
    and current_owner_id =
      caller_id;
end;
$$;


create or replace function public.settle_match_wagers(
  target_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid;
  target_match public.matches%rowtype;

  escrow_row record;
  card_row record;

  total_dp integer := 0;
  winner_balance integer;
begin
  caller_id :=
    auth.uid();

  if caller_id is null then
    raise exception 'Not authenticated.';
  end if;

  select *
  into target_match
  from public.matches
  where id =
    target_match_id
  for update;

  if not found then
    raise exception 'Match not found.';
  end if;

  if caller_id not in (
    target_match.player_one_id,
    target_match.player_two_id
  ) then
    raise exception 'You are not part of this match.';
  end if;

  if target_match.match_type <> 'practice' then
    return;
  end if;

  if target_match.status <> 'completed' then
    raise exception 'Match is not completed.';
  end if;

  if target_match.wager_status = 'settled' then
    return;
  end if;


  -- ========================================================
  -- DP WAGER
  -- ========================================================

  if target_match.wager_type = 'dp' then

    if target_match.winner_id is null then

      for escrow_row in
        select *
        from public.match_dp_escrows
        where match_id =
          target_match_id
          and status =
            'funded'
        for update
      loop

        perform public._credit_duel_points(
          escrow_row.profile_id,
          escrow_row.amount,
          'practice_wager_refund',
          target_match_id,
          'Practice duel ended in a draw. Wager refunded.',
          '{}'::jsonb
        );

        update public.match_dp_escrows
        set
          status = 'refunded',
          settled_at = now()
        where id =
          escrow_row.id;

      end loop;

    else

      select coalesce(
        sum(amount),
        0
      )
      into total_dp
      from public.match_dp_escrows
      where match_id =
        target_match_id
        and status =
          'funded';

      if total_dp > 0 then

        perform public._credit_duel_points(
          target_match.winner_id,
          total_dp,
          'practice_wager_win',
          target_match_id,
          'Practice duel wager winnings.',
          jsonb_build_object(
            'pool',
            total_dp
          )
        );

      end if;

      update public.match_dp_escrows
      set
        status = case
          when profile_id =
            target_match.winner_id
          then 'won'
          else 'won'
        end,
        settled_at = now()
      where match_id =
        target_match_id
        and status =
          'funded';

    end if;
  end if;


  -- ========================================================
  -- CARD WAGER
  -- ========================================================

  if target_match.wager_type = 'card' then

    if target_match.winner_id is null then

      for card_row in
        select *
        from public.match_wager_cards
        where match_id =
          target_match_id
          and status =
            'locked'
        for update
      loop

        update public.card_instances
        set
          locked = false,
          lock_type = null,
          lock_reference_id = null,
          locked_at = null
        where id =
          card_row.card_instance_id;

        update public.match_wager_cards
        set
          status = 'returned',
          settled_at = now()
        where id =
          card_row.id;

      end loop;

    else

      for card_row in
        select *
        from public.match_wager_cards
        where match_id =
          target_match_id
          and status =
            'locked'
        for update
      loop

        update public.card_instances
        set
          current_owner_id =
            target_match.winner_id,
          locked = false,
          lock_type = null,
          lock_reference_id = null,
          locked_at = null
        where id =
          card_row.card_instance_id;

        update public.match_wager_cards
        set
          status = 'won',
          settled_at = now()
        where id =
          card_row.id;

      end loop;

    end if;
  end if;


  update public.matches
  set wager_status =
    'settled'
  where id =
    target_match_id;

end;
$$;


create or replace function public.release_match_wagers(
  target_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid;
  target_match public.matches%rowtype;
  escrow_row record;
  card_row record;
begin
  caller_id :=
    auth.uid();

  if caller_id is null then
    raise exception 'Not authenticated.';
  end if;

  select *
  into target_match
  from public.matches
  where id =
    target_match_id
  for update;

  if not found then
    raise exception 'Match not found.';
  end if;

  if caller_id not in (
    target_match.player_one_id,
    target_match.player_two_id
  ) then
    raise exception 'You are not part of this match.';
  end if;

  if target_match.status not in (
    'cancelled',
    'declined'
  ) then
    raise exception 'Match is not cancelled or declined.';
  end if;


  -- DP refunds

  for escrow_row in
    select *
    from public.match_dp_escrows
    where match_id =
      target_match_id
      and status =
        'funded'
    for update
  loop

    perform public._credit_duel_points(
      escrow_row.profile_id,
      escrow_row.amount,
      'practice_wager_refund',
      target_match_id,
      'Practice duel cancelled or declined. Wager refunded.',
      '{}'::jsonb
    );

    update public.match_dp_escrows
    set
      status = 'refunded',
      settled_at = now()
    where id =
      escrow_row.id;

  end loop;


  -- Card unlocks

  for card_row in
    select *
    from public.match_wager_cards
    where match_id =
      target_match_id
      and status =
        'locked'
    for update
  loop

    update public.card_instances
    set
      locked = false,
      lock_type = null,
      lock_reference_id = null,
      locked_at = null
    where id =
      card_row.card_instance_id;

    update public.match_wager_cards
    set
      status = 'returned',
      settled_at = now()
    where id =
      card_row.id;

  end loop;


  update public.matches
  set wager_status =
    'released'
  where id =
    target_match_id;

end;
$$;


-- =========================================================
-- PART 2. "FOR TRADE" FLAG
--
-- Purely an interest signal. Reserves nothing: a card can be
-- marked For Trade while sitting in a deck, while it's being
-- offered or requested in any number of pending trades, or
-- even while it's locked by an active Practice Duel wager
-- (marking interest in trading it later doesn't touch the
-- wager). Only the current owner can set it.
-- =========================================================

alter table public.card_instances
  add column if not exists for_trade boolean not null default false;

comment on column public.card_instances.for_trade is
  'Player has signalled openness to trading this specific physical copy. A pure interest signal - reserves nothing, does not block deck use or other trades, and is reset automatically whenever the card changes owner (see card_instance_ownership_change in Part 5).';

create index if not exists card_instances_for_trade_idx
  on public.card_instances(league_id, for_trade)
  where for_trade = true;


create or replace function public.set_card_for_trade(
  target_card_instance_id uuid,
  target_for_trade boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  instance_owner_id uuid;
begin

  current_user_id :=
    (select auth.uid());

  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select current_owner_id
  into instance_owner_id
  from public.card_instances
  where id = target_card_instance_id
  for update;

  if not found then
    raise exception 'Card instance not found';
  end if;

  if instance_owner_id <> current_user_id then
    raise exception 'You do not own this card';
  end if;

  -- No lock check: For Trade reserves nothing, so it can be
  -- set regardless of deck usage, pending trade offers, or
  -- (yes, even) an active wager lock on this exact copy.

  update public.card_instances
  set for_trade = target_for_trade
  where id = target_card_instance_id;
end;
$$;


revoke all
on function public.set_card_for_trade(uuid, boolean)
from public;

grant execute
on function public.set_card_for_trade(uuid, boolean)
to authenticated;


-- =========================================================
-- PART 3. DP IN TRADES
-- =========================================================

alter table public.trades
  add column if not exists dp_offered integer not null default 0,
  add column if not exists dp_requested integer not null default 0;

alter table public.trades
  drop constraint if exists trades_dp_offered_check;

alter table public.trades
  add constraint trades_dp_offered_check
  check (dp_offered >= 0);

alter table public.trades
  drop constraint if exists trades_dp_requested_check;

alter table public.trades
  add constraint trades_dp_requested_check
  check (dp_requested >= 0);

comment on column public.trades.dp_offered is
  'Duel Points the sender is offering. Never reserved - only checked against the live balance and moved atomically inside accept_trade().';

comment on column public.trades.dp_requested is
  'Duel Points the sender is requesting from the receiver. Never reserved - only checked against the live balance and moved atomically inside accept_trade().';


create or replace function public.set_trade_dp(
  target_trade_id uuid,
  target_dp_offered integer,
  target_dp_requested integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  trade_sender_id uuid;
  trade_status public.trade_status;
begin

  current_user_id :=
    (select auth.uid());

  select sender_id, status
  into trade_sender_id, trade_status
  from public.trades
  where id = target_trade_id;

  if not found then
    raise exception 'Trade not found';
  end if;

  if current_user_id <> trade_sender_id then
    raise exception 'Only the sender may edit this trade';
  end if;

  if trade_status <> 'draft' then
    raise exception 'Trade can only be edited while Draft';
  end if;

  if target_dp_offered < 0 or target_dp_requested < 0 then
    raise exception 'Duel Point amount cannot be negative';
  end if;

  update public.trades
  set
    dp_offered = target_dp_offered,
    dp_requested = target_dp_requested,
    updated_at = now()
  where id = target_trade_id;
end;
$$;


revoke all
on function public.set_trade_dp(uuid, integer, integer)
from public;

grant execute
on function public.set_trade_dp(uuid, integer, integer)
to authenticated;


-- =========================================================
-- PART 4. COUNTER OFFERS
--
-- No enum change. Original trade keeps status = 'declined'
-- (an existing, valid value) but gets superseded_by pointed
-- at the new draft trade so the UI can render it as
-- "Countered" instead of a plain decline.
-- =========================================================

alter table public.trades
  add column if not exists parent_trade_id uuid
    references public.trades(id)
    on delete set null;

alter table public.trades
  add column if not exists superseded_by uuid
    references public.trades(id)
    on delete set null;

comment on column public.trades.parent_trade_id is
  'Set when this trade was created as a counter-offer to another trade.';

comment on column public.trades.superseded_by is
  'Set on the original trade when it was declined in favor of a counter-offer.';

create index if not exists trades_parent_idx
  on public.trades(parent_trade_id);


create or replace function public.counter_trade(
  target_trade_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;

  original_league_id uuid;
  original_sender_id uuid;
  original_receiver_id uuid;
  original_status public.trade_status;
  original_dp_offered integer;
  original_dp_requested integer;

  new_trade_id uuid;
begin

  current_user_id :=
    (select auth.uid());

  select
    league_id,
    sender_id,
    receiver_id,
    status,
    dp_offered,
    dp_requested
  into
    original_league_id,
    original_sender_id,
    original_receiver_id,
    original_status,
    original_dp_offered,
    original_dp_requested
  from public.trades
  where id = target_trade_id
  for update;

  if not found then
    raise exception 'Trade not found';
  end if;

  if current_user_id <> original_receiver_id then
    raise exception 'Only the receiver may counter this trade';
  end if;

  if original_status <> 'pending' then
    raise exception 'Only pending trades can be countered';
  end if;

  -- No card locks to release - trading never locks cards.

  -- Create the counter-offer as a new draft trade, roles reversed.
  insert into public.trades (
    league_id,
    created_by,
    sender_id,
    receiver_id,
    status,
    dp_offered,
    dp_requested,
    parent_trade_id
  )
  values (
    original_league_id,
    current_user_id,
    original_receiver_id,
    original_sender_id,
    'draft',
    coalesce(original_dp_requested, 0),
    coalesce(original_dp_offered, 0),
    target_trade_id
  )
  returning id
  into new_trade_id;

  -- Pre-fill with the original items, sides swapped (mirrors the
  -- original ask/offer from the new sender's point of view). The
  -- new sender can still add/remove cards before submitting -
  -- and since nothing was ever locked, the original cards may
  -- well have moved on by then; add_trade_item / submit_trade
  -- will catch that the normal way.
  insert into public.trade_items (
    trade_id,
    card_instance_id,
    side,
    added_by
  )
  select
    new_trade_id,
    ti.card_instance_id,
    case ti.side
      when 'offered' then 'requested'::public.trade_side
      else 'offered'::public.trade_side
    end,
    current_user_id
  from public.trade_items ti
  where ti.trade_id = target_trade_id;

  update public.trades
  set
    status = 'declined',
    completed_at = now(),
    updated_at = now(),
    superseded_by = new_trade_id
  where id = target_trade_id;

  return new_trade_id;
end;
$$;


revoke all
on function public.counter_trade(uuid)
from public;

grant execute
on function public.counter_trade(uuid)
to authenticated;


-- =========================================================
-- PART 5. OWNERSHIP-CHANGE SIDE EFFECTS
--
-- Current ownership is the single source of truth for what a
-- card can be used for. The trade-off for no longer locking
-- cards is that whenever a card's current_owner_id actually
-- changes - an accepted trade, a settled card wager, or
-- anything else that ever moves ownership - three things must
-- happen automatically, no matter which code path caused the
-- change:
--
--  1. The card instance is removed from every deck it was
--     sitting in (deck_cards references specific
--     card_instance_id rows, not just the catalog card - see
--     202608190009_deck_management.sql / deck_cards).
--  2. If that pulled a deck below (or above) its Ready
--     requirements, the deck drops back to Draft - and, if it
--     was the player's Active deck, is deactivated - rather
--     than silently staying "Ready" while actually invalid.
--     Readiness itself is otherwise computed live by the app
--     from current deck_cards on every render, so this only
--     needs to correct the *stored* decks.status/is_active.
--  3. For Trade is reset to false - an interest signal tied to
--     whoever set it, not something that should carry over to
--     someone else's new copy.
--
-- Deliberately implemented as a trigger on card_instances
-- itself (not inlined into accept_trade) so it applies
-- uniformly to every ownership-changing path, present and
-- future - trades, wager settlement, or anything built later -
-- instead of needing to be duplicated into each one.
-- =========================================================

create or replace function public.handle_card_instance_ownership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_deck record;
  remaining_main_count integer;
  remaining_extra_count integer;
  deck_main_min integer;
  deck_main_max integer;
  deck_extra_max integer;
begin

  for affected_deck in
    select distinct dc.deck_id
    from public.deck_cards dc
    where dc.card_instance_id = new.id
  loop

    delete from public.deck_cards
    where card_instance_id = new.id
      and deck_id = affected_deck.deck_id;

    select
      count(*) filter (where dc.section = 'main'),
      count(*) filter (where dc.section = 'extra')
    into
      remaining_main_count,
      remaining_extra_count
    from public.deck_cards dc
    where dc.deck_id = affected_deck.deck_id;

    select
      public.get_deck_setting(d.league_id, 'deck.main_min', 40),
      public.get_deck_setting(d.league_id, 'deck.main_max', 60),
      public.get_deck_setting(d.league_id, 'deck.extra_max', 15)
    into
      deck_main_min,
      deck_main_max,
      deck_extra_max
    from public.decks d
    where d.id = affected_deck.deck_id;

    update public.decks
    set
      status = 'draft',
      is_active = false,
      updated_at = now()
    where id = affected_deck.deck_id
      and status = 'ready'
      and (
        remaining_main_count < deck_main_min
        or remaining_main_count > deck_main_max
        or remaining_extra_count > deck_extra_max
      );

  end loop;

  new.for_trade := false;

  return new;
end;
$$;


drop trigger if exists card_instance_ownership_change
  on public.card_instances;

create trigger card_instance_ownership_change
before update of current_owner_id
on public.card_instances
for each row
when (
  new.current_owner_id is distinct from old.current_owner_id
)
execute function public.handle_card_instance_ownership_change();


-- =========================================================
-- PART 6. STALE LOCK CLEANUP
--
-- One-time, additive safety cleanup: clear any leftover
-- lock_type = 'trade' state. Trading has never successfully
-- locked a card in production (the CHECK constraint bug in
-- Part 1b made every attempt fail before this migration), and
-- as of Part 1a trading no longer locks cards at all going
-- forward - so this should affect zero rows in the common
-- case. It exists purely as a safety net for any leftover test
-- state, and only ever touches the four lock/for_trade
-- metadata columns. current_owner_id and every other ownership
-- fact for every player - including gossie, fardin and
-- samochamo - is left completely untouched.
-- =========================================================

update public.card_instances
set
  locked = false,
  lock_type = null,
  lock_reference_id = null,
  locked_at = null
where lock_type = 'trade';


commit;
