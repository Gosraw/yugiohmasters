begin;

-- =========================================================
-- DUELIST CIRCLE 2.0 - TRADE + DECK GUARDS (2026-10-12 bug hunt)
--
-- Re-creates five existing RPCs with their latest bodies kept
-- EXACTLY as they were, plus only these added checks:
--
-- 1. accept_trade / submit_trade / add_trade_item refuse cards
--    that are LOCKED (card_instances.locked - e.g. a practice-
--    match wager). Before this, a wagered card could change owner
--    via a trade and then be moved AGAIN by settle_match_wagers.
-- 2. The same three refuse cards that sit in a competition-locked
--    deck (competition_deck_locks) up front with a clear message,
--    instead of accept failing on the deck_cards lock trigger.
-- 3. add_card_to_deck / remove_card_from_deck only work on a
--    Draft deck (the app already checked this; the API did not).
--
-- Backwards compatible with the live main app: same signatures,
-- same grants (create or replace keeps them), only new refusals
-- in cases the app never intends to allow.
--
-- Sources of the kept bodies:
--   submit_trade, accept_trade : 202609012300_trade_offer_expiry.sql
--   add_trade_item             : 202608190012_trading.sql
--   add_card_to_deck,
--   remove_card_from_deck      : 202608190008_deck_builder.sql
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

  trade_league_id uuid;
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
    t.league_id,
    t.sender_id,
    t.receiver_id,
    t.status,
    t.dp_offered
  into
    trade_league_id,
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
  -- Cross-league safety, RIGHT NOW - not authoritative (see the
  -- matching check in accept_trade, which is what actually
  -- matters). A card_instance belongs to exactly one league and
  -- must never be tradeable into a different league's trade -
  -- this is a friendly early failure for an obviously invalid
  -- draft.
  -- -------------------------------------------------------

  if exists (
    select 1
    from public.trade_items ti

    join public.card_instances ci
      on ci.id = ti.card_instance_id

    where ti.trade_id = target_trade_id
      and ci.league_id <> trade_league_id
  )
  then
    raise exception
      'One or more cards do not belong to this league.';
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


  -- -------------------------------------------------------
  -- 2026-10-12 bug hunt: a card that is LOCKED (for example as
  -- a practice-match wager - settle_match_wagers moves it later)
  -- or sitting in a competition-locked deck must never change
  -- owner through a trade.
  -- -------------------------------------------------------

  if exists (
    select 1
    from public.trade_items ti

    join public.card_instances ci
      on ci.id = ti.card_instance_id

    where ti.trade_id = target_trade_id
      and ci.locked = true
  )
  then
    raise exception
      'One or more cards in this trade are locked (for example as a match wager). Remove them and try again.';
  end if;


  if exists (
    select 1
    from public.trade_items ti

    join public.deck_cards dc
      on dc.card_instance_id = ti.card_instance_id

    join public.competition_deck_locks cdl
      on cdl.deck_id = dc.deck_id

    where ti.trade_id = target_trade_id
  )
  then
    raise exception
      'One or more cards in this trade are in a deck that is locked for a competition. Remove them and try again.';
  end if;


  update public.trades
  set
    status = 'pending',
    message = nullif(
      trim(trade_message),
      ''
    ),
    submitted_at = now(),
    -- P1A: trade offers expire 24h after submission, enforced
    -- server-side (see the expiry check in accept_trade below
    -- and the expire_stale_trades() sweep) - not just a
    -- frontend countdown.
    expires_at = now() + interval '24 hours',
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
  trade_expires_at timestamptz;

  sender_still_member boolean;
  receiver_still_member boolean;

  sender_new_balance integer;
  receiver_new_balance integer;
begin

  current_user_id :=
    (select auth.uid());


  -- Lock the TRADE ROW first. Two concurrent accept attempts on
  -- the SAME trade serialize here. This alone does NOT protect
  -- against two DIFFERENT pending trades that happen to share a
  -- physical card - that race is closed below, right after the
  -- status checks, by additionally locking every involved
  -- card_instance in a deterministic order.

  select
    t.league_id,
    t.sender_id,
    t.receiver_id,
    t.status,
    t.dp_offered,
    t.dp_requested,
    t.expires_at
  into
    trade_league_id,
    trade_sender_id,
    trade_receiver_id,
    trade_status,
    trade_dp_offered,
    trade_dp_requested,
    trade_expires_at
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
  -- P1A: 24h server-enforced expiry. A trade that is still
  -- technically 'pending' in the row but past its expires_at
  -- is auto-declined right here (never silently accepted) -
  -- the same terminal transition expire_stale_trades() makes
  -- in bulk for trades nobody has tried to touch since they
  -- went stale. auto_expired is what lets the UI show
  -- "Expired" instead of "Declined" for these in history.
  -- -------------------------------------------------------

  if trade_expires_at is not null
    and trade_expires_at < now()
  then

    update public.trades
    set
      status = 'declined',
      auto_expired = true,
      updated_at = now()
    where id = target_trade_id;

    raise exception
      'This trade offer expired 24 hours after it was sent.';

  end if;


  -- -------------------------------------------------------
  -- Lock every card_instance involved in this trade, in a
  -- deterministic order (by id), BEFORE checking or touching
  -- anything else below. The trade-row lock above only
  -- serializes two accept attempts on the SAME trade; it does
  -- nothing for two DIFFERENT pending trades that happen to
  -- share a physical card. Without this, both accepts could
  -- read the live ownership check as passing before either
  -- one's ownership UPDATE commits. Locking here, by id, means:
  -- whichever accept gets these row locks first proceeds to the
  -- ownership check and transfer while the other one blocks
  -- until the first commits (or rolls back) - true "first valid
  -- accept wins" instead of a race. Locking in a fixed id order
  -- (rather than whatever order the join happens to return
  -- rows) also means two trades that share several overlapping
  -- cards always attempt to acquire those locks in the same
  -- order, which avoids a deadlock between them.
  -- -------------------------------------------------------

  perform ci.id
  from public.card_instances ci
  join public.trade_items ti
    on ti.card_instance_id = ci.id
  where ti.trade_id = target_trade_id
  order by ci.id
  for update of ci;


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
  -- Cross-league safety - the one authoritative check. A
  -- card_instance's league_id never changes, so this doesn't
  -- strictly need the row lock above to be race-safe, but it
  -- runs after it anyway for consistency with the ownership
  -- check right below. Guards against a card_instance that
  -- somehow ended up referenced by a trade_items row for a
  -- trade in a different league (e.g. stale/bad data) ever
  -- being tradeable across league boundaries.
  -- -------------------------------------------------------

  if exists (
    select 1
    from public.trade_items ti

    join public.card_instances ci
      on ci.id = ti.card_instance_id

    where ti.trade_id = target_trade_id
      and ci.league_id <> trade_league_id
  )
  then
    raise exception
      'One or more cards do not belong to this league.';
  end if;


  -- -------------------------------------------------------
  -- LIVE ownership - the one authoritative check. Because the
  -- card_instance rows above are now locked, this read is safe
  -- from the concurrent-accept race: a second accept on a
  -- different trade touching the same card cannot reach this
  -- point until the first accept's row locks are released
  -- (i.e. that transaction has committed or rolled back), so
  -- whichever accept gets here first while ownership still
  -- matches wins, and every later accept for a trade touching
  -- the same card reliably sees the updated owner and fails
  -- right here instead of racing into a partial transfer -
  -- first valid accept wins, for real.
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
  -- 2026-10-12 bug hunt: a card that is LOCKED (for example as
  -- a practice-match wager - settle_match_wagers moves it later)
  -- or sitting in a competition-locked deck must never change
  -- owner through a trade.
  -- -------------------------------------------------------

  if exists (
    select 1
    from public.trade_items ti

    join public.card_instances ci
      on ci.id = ti.card_instance_id

    where ti.trade_id = target_trade_id
      and ci.locked = true
  )
  then
    raise exception
      'One or more cards in this trade are locked (for example as a match wager), so it cannot be accepted right now.';
  end if;


  if exists (
    select 1
    from public.trade_items ti

    join public.deck_cards dc
      on dc.card_instance_id = ti.card_instance_id

    join public.competition_deck_locks cdl
      on cdl.deck_id = dc.deck_id

    where ti.trade_id = target_trade_id
  )
  then
    raise exception
      'One or more cards in this trade are in a deck that is locked for a competition, so it cannot be accepted.';
  end if;


  -- -------------------------------------------------------
  -- DP: re-validate against LIVE balances and move it
  -- atomically. Never trusted as reserved at submit time -
  -- re-checked now, right before the transfer actually
  -- happens. A player may have several pending DP offers
  -- that together exceed their current balance; only the
  -- accepts for which they can still afford it at THIS
  -- moment succeed.
  --
  -- Before touching either balance, lock BOTH profile rows
  -- (sender and receiver) FOR UPDATE, in a deterministic order
  -- by id - not "sender then receiver", which would let two
  -- opposite-direction concurrent trades (A->B and B->A) each
  -- lock the two rows in reverse order and deadlock each other.
  -- Ordering strictly by id means every accept trying to lock
  -- this same pair of profiles always requests them in the same
  -- order, so the second one simply waits instead of
  -- deadlocking. This is a plain transaction-scoped row lock -
  -- no new persistent lock state, released automatically on
  -- commit or rollback.
  -- -------------------------------------------------------

  if coalesce(trade_dp_offered, 0) > 0
    or coalesce(trade_dp_requested, 0) > 0
  then

    perform p.id
    from public.profiles p
    where p.id in (trade_sender_id, trade_receiver_id)
    order by p.id
    for update;

  end if;


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


create or replace function public.add_trade_item(
  target_trade_id uuid,
  target_card_instance_id uuid,
  target_side public.trade_side
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  trade_sender_id uuid;
  trade_receiver_id uuid;
  trade_status public.trade_status;

  new_item_id uuid;
begin

  current_user_id :=
    (select auth.uid());


  select
    t.sender_id,
    t.receiver_id,
    t.status
  into
    trade_sender_id,
    trade_receiver_id,
    trade_status
  from public.trades t
  where t.id = target_trade_id;


  if not found then
    raise exception
      'Trade not found';
  end if;


  if trade_status <> 'draft'
  then
    raise exception
      'Trade can only be edited while Draft';
  end if;


  if current_user_id <> trade_sender_id
  then
    raise exception
      'Only the sender may edit this trade';
  end if;


  -- 2026-10-12 bug hunt: refuse locked / competition-locked
  -- cards up front with a clear message.

  if exists (
    select 1
    from public.card_instances ci
    where ci.id = target_card_instance_id
      and ci.locked = true
  )
  then
    raise exception
      'This card is locked (for example as a match wager) and cannot be traded right now.';
  end if;


  if exists (
    select 1
    from public.deck_cards dc

    join public.competition_deck_locks cdl
      on cdl.deck_id = dc.deck_id

    where dc.card_instance_id = target_card_instance_id
  )
  then
    raise exception
      'This card is in a deck that is locked for a competition and cannot be traded.';
  end if;


  insert into public.trade_items (
    trade_id,
    card_instance_id,
    side,
    added_by
  )
  values (
    target_trade_id,
    target_card_instance_id,
    target_side,
    current_user_id
  )
  returning id
  into new_item_id;


  return new_item_id;
end;
$$;


create or replace function public.add_card_to_deck(
  target_deck_id uuid,
  target_card_instance_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_owner_id uuid;
  target_card_type text;

  target_section public.deck_section;

  new_deck_card_id uuid;
begin

  select d.owner_id
  into target_owner_id
  from public.decks d
  where d.id =
      target_deck_id;


  if not found then
    raise exception
      'Deck not found';
  end if;


  if target_owner_id <>
     (select auth.uid())
  then
    raise exception
      'You do not own this deck';
  end if;


  -- 2026-10-12 bug hunt: only a Draft deck can be edited (the
  -- app already checks this; now the database does too).

  if exists (
    select 1
    from public.decks d
    where d.id = target_deck_id
      and d.status <> 'draft'
  )
  then
    raise exception
      'Only a Draft deck can be edited.';
  end if;


  select cc.card_type
  into target_card_type
  from public.card_instances ci

  join public.card_catalog cc
    on cc.id =
      ci.card_catalog_id

  where ci.id =
    target_card_instance_id;


  if not found then
    raise exception
      'Card instance not found';
  end if;


  if (
    lower(target_card_type)
      like '%fusion%monster%'
    or
    lower(target_card_type)
      like '%xyz%monster%'
  )
  then
    target_section :=
      'extra';
  else
    target_section :=
      'main';
  end if;


  insert into public.deck_cards (
    deck_id,
    card_instance_id,
    section
  )
  values (
    target_deck_id,
    target_card_instance_id,
    target_section
  )
  returning id
  into new_deck_card_id;


  return new_deck_card_id;
end;
$$;


create or replace function public.remove_card_from_deck(
  target_deck_card_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_owner_id uuid;
begin

  select d.owner_id
  into target_owner_id

  from public.deck_cards dc

  join public.decks d
    on d.id =
      dc.deck_id

  where dc.id =
      target_deck_card_id;


  if not found then
    raise exception
      'Deck card not found';
  end if;


  if target_owner_id <>
     (select auth.uid())
  then
    raise exception
      'You do not own this deck';
  end if;


  -- 2026-10-12 bug hunt: only a Draft deck can be edited.

  if exists (
    select 1
    from public.deck_cards dc

    join public.decks d
      on d.id = dc.deck_id

    where dc.id = target_deck_card_id
      and d.status <> 'draft'
  )
  then
    raise exception
      'Only a Draft deck can be edited.';
  end if;


  delete from public.deck_cards
  where id =
    target_deck_card_id;
end;
$$;

commit;
