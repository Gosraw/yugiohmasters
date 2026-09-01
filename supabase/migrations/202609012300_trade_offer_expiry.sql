begin;

-- =========================================================
-- DUELIST CIRCLE - TRADE OFFER 24H EXPIRY (P1A)
--
-- Trade offers now die on their own: 24h after submit_trade()
-- moves a trade to 'pending', it can no longer be accepted.
--
-- Deliberately does NOT touch the trade_status enum (the
-- codebase already made this call once - see the Part 4 comment
-- in 202608220019_collection_deck_trading_pass.sql about
-- avoiding ALTER TYPE ... ADD VALUE transaction-safety edge
-- cases). Instead: a plain expires_at timestamptz stamped at
-- submit time, plus an auto_expired boolean so an expired trade
-- can still show as "Expired" (not "Declined") in history, while
-- reusing the existing, already-everywhere 'declined' status for
-- every "this offer is dead" list/filter to key off.
--
-- There is nothing to "release" on expiry beyond the status flip
-- itself - see the Part 1a comment in
-- 202608220019_collection_deck_trading_pass.sql: this codebase
-- already removed card_instance locking for trades entirely.
-- The same physical card can sit in any number of pending trades
-- at once; only accept_trade()'s live ownership check ever
-- actually reserves anything, at the moment of accept. So the
-- only "resource" a stale pending trade holds onto is its own
-- 'pending' status blocking it from ever showing as resolved -
-- and that's exactly what this migration releases.
--
-- Enforcement is server-side in two places:
-- 1. accept_trade() rejects (and auto-declines) a still-'pending'
--    row whose expires_at has passed - so even without the sweep
--    below ever running, an expired trade can never be accepted.
-- 2. expire_stale_trades() is a cheap idempotent sweep any
--    authenticated user can call (called lazily from the trades
--    list page load) that bulk-transitions every stale pending
--    trade in one query, so the trades list reflects "expired"
--    promptly rather than waiting for someone to try to accept.
-- =========================================================

alter table public.trades
  add column if not exists expires_at timestamptz;

alter table public.trades
  add column if not exists auto_expired boolean not null default false;

comment on column public.trades.expires_at is
  'Set by submit_trade() to submitted_at + 24h. Null for draft trades. Once past, accept_trade() refuses and auto-declines instead of accepting.';

comment on column public.trades.auto_expired is
  'True only when this trade was auto-transitioned to declined by hitting its 24h expiry (via accept_trade()''s guard or expire_stale_trades()), never by a player choice. Lets history show "Expired" instead of "Declined".';


-- =========================================================
-- SUBMIT_TRADE (re-created: now stamps expires_at)
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



-- =========================================================
-- ACCEPT_TRADE (re-created: now enforces the 24h expiry)
-- =========================================================

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



-- =========================================================
-- EXPIRE_STALE_TRADES
--
-- Bulk sweep: every 'pending' trade past its expires_at becomes
-- 'declined' + auto_expired = true. Idempotent (a trade already
-- moved out of 'pending' is simply not matched again). Callable
-- by any authenticated user - it only ever affects trades already
-- objectively past their own stored expiry, nothing player- or
-- league-specific to gate here, exactly like set_card_for_trade's
-- and toggle_card_wishlist's "no reason to restrict who can run
-- this" reasoning.
-- =========================================================

create or replace function public.expire_stale_trades()
returns integer
language sql
security definer
set search_path = ''
as $$
  with expired as (
    update public.trades
    set
      status = 'declined',
      auto_expired = true,
      updated_at = now()
    where status = 'pending'
      and expires_at is not null
      and expires_at < now()
    returning id
  )
  select count(*)::integer from expired;
$$;

revoke all
on function public.expire_stale_trades()
from public;

grant execute
on function public.expire_stale_trades()
to authenticated;

commit;
