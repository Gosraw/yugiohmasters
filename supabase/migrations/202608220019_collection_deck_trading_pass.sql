begin;

-- =========================================================
-- DUELIST CIRCLE - COLLECTION / DECKBUILDING / TRADING PASS
-- (2026-08-22)
--
-- This migration is purely additive and safe to re-run
-- (all statements are CREATE OR REPLACE / IF NOT EXISTS /
-- DROP+CREATE on functions and constraints only).
--
-- Part 1: CRITICAL BUG FIX
--   card_instances_lock_consistency requires
--   lock_reference_id + locked_at whenever locked = true.
--   submit_trade() and add_match_wager_card() only ever set
--   locked + lock_type, never the other two columns — every
--   UPDATE that locks a card instance therefore violates this
--   CHECK constraint and fails at runtime. This is very likely
--   why trading (and card wagers) did not actually work in
--   production. Fixed by having every lock/unlock statement in
--   both trading.sql and duel_points_and_wagers.sql set/clear
--   all four lock columns consistently.
--
-- Part 2: "For Trade" flag on card_instances (additive column)
--   plus set_card_for_trade() RPC.
--
-- Part 3: DP support in trades (additive columns on trades)
--   plus set_trade_dp() RPC, and submit_trade()/accept_trade()
--   updated to validate + atomically move DP at accept time
--   (never client-trusted, re-checked against live balances).
--
-- Part 4: Counter offers, without altering the trade_status
--   enum (avoids ALTER TYPE ... ADD VALUE transaction-safety
--   edge cases). Uses two new nullable columns on trades
--   (parent_trade_id, superseded_by) plus counter_trade() RPC.
--   The original trade's status stays 'declined' (a value that
--   already exists) but superseded_by lets the UI show
--   "Countered -> view new offer" instead of a plain decline.
-- =========================================================


-- =========================================================
-- PART 1a. LOCK-CONSISTENCY FIX: TRADING RPCS
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
  trade_status public.trade_status;
  trade_dp_offered integer;

  offered_count integer;
  sender_balance integer;
begin

  current_user_id :=
    (select auth.uid());


  select
    t.sender_id,
    t.status,
    t.dp_offered
  into
    trade_sender_id,
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
  -- DP offer. This is NOT the authoritative check (accept_trade
  -- re-validates against the live balance at accept time), just
  -- an early, friendlier failure.
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
  -- Nogmaals controleren of alle kaarten unlocked zijn
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
      'One or more trade cards are already locked';
  end if;


  -- -------------------------------------------------------
  -- Alle kaarten locken
  -- -------------------------------------------------------

  update public.card_instances ci
  set
    locked = true,
    lock_type = 'trade',
    lock_reference_id = target_trade_id,
    locked_at = now()
  where ci.id in (
    select ti.card_instance_id
    from public.trade_items ti
    where ti.trade_id = target_trade_id
  );


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

  trade_sender_id uuid;
  trade_receiver_id uuid;
  trade_status public.trade_status;
  trade_dp_offered integer;
  trade_dp_requested integer;

  sender_new_balance integer;
  receiver_new_balance integer;
begin

  current_user_id :=
    (select auth.uid());


  select
    t.sender_id,
    t.receiver_id,
    t.status,
    t.dp_offered,
    t.dp_requested
  into
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
  -- Ownership nogmaals controleren
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
      'Trade card ownership changed';
  end if;


  -- -------------------------------------------------------
  -- Alle kaarten moeten nog trade-locked zijn
  -- -------------------------------------------------------

  if exists (
    select 1
    from public.trade_items ti

    join public.card_instances ci
      on ci.id = ti.card_instance_id

    where ti.trade_id = target_trade_id
      and (
        ci.locked = false
        or ci.lock_type <> 'trade'
      )
  )
  then
    raise exception
      'One or more trade cards are no longer locked for trade';
  end if;


  -- -------------------------------------------------------
  -- DP: re-validate against LIVE balances and move it
  -- atomically. Never trust the trade record's own numbers
  -- as proof of current affordability - re-check now.
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
        'Sender no longer has enough Duel Points for this trade';
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
        'You no longer have enough Duel Points for this trade';
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
  -- Offered cards -> receiver
  -- -------------------------------------------------------

  update public.card_instances ci
  set
    current_owner_id = trade_receiver_id,
    locked = false,
    lock_type = null,
    lock_reference_id = null,
    locked_at = null
  where ci.id in (
    select ti.card_instance_id
    from public.trade_items ti
    where ti.trade_id = target_trade_id
      and ti.side = 'offered'
  );


  -- -------------------------------------------------------
  -- Requested cards -> sender
  -- -------------------------------------------------------

  update public.card_instances ci
  set
    current_owner_id = trade_sender_id,
    locked = false,
    lock_type = null,
    lock_reference_id = null,
    locked_at = null
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


  update public.card_instances ci
  set
    locked = false,
    lock_type = null,
    lock_reference_id = null,
    locked_at = null
  where ci.id in (
    select ti.card_instance_id
    from public.trade_items ti
    where ti.trade_id = target_trade_id
  );


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


  if trade_status = 'pending'
  then
    update public.card_instances ci
    set
      locked = false,
      lock_type = null,
      lock_reference_id = null,
      locked_at = null
    where ci.id in (
      select ti.card_instance_id
      from public.trade_items ti
      where ti.trade_id = target_trade_id
    );
  end if;


  update public.trades
  set
    status = 'cancelled',
    completed_at = now(),
    updated_at = now()
  where id = target_trade_id;
end;
$$;


-- =========================================================
-- PART 1b. LOCK-CONSISTENCY FIX: MATCH WAGER RPCS
--
-- Same bug, same fix, in the practice-match wager flow
-- (card_instances.locked is a single shared mechanism used
-- by both trading and match wagers - see card_instances.sql).
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
-- =========================================================

alter table public.card_instances
  add column if not exists for_trade boolean not null default false;

comment on column public.card_instances.for_trade is
  'Player has signalled openness to trading this specific physical copy. Advisory only - other players may still offer on cards that are not marked.';

create index if not exists card_instances_for_trade_idx
  on public.card_instances(league_id, for_trade)
  where for_trade = true and locked = false;


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
  instance_locked boolean;
begin

  current_user_id :=
    (select auth.uid());

  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select current_owner_id, locked
  into instance_owner_id, instance_locked
  from public.card_instances
  where id = target_card_instance_id
  for update;

  if not found then
    raise exception 'Card instance not found';
  end if;

  if instance_owner_id <> current_user_id then
    raise exception 'You do not own this card';
  end if;

  if target_for_trade = true and instance_locked = true then
    raise exception 'Locked cards cannot be marked for trade';
  end if;

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
  'Duel Points the sender is offering, moved atomically at accept_trade().';

comment on column public.trades.dp_requested is
  'Duel Points the sender is requesting from the receiver, moved atomically at accept_trade().';


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

  -- Release the original trade's card locks, same as a decline.
  update public.card_instances ci
  set
    locked = false,
    lock_type = null,
    lock_reference_id = null,
    locked_at = null
  where ci.id in (
    select ti.card_instance_id
    from public.trade_items ti
    where ti.trade_id = target_trade_id
  );

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
  -- new sender can still add/remove cards before submitting.
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


commit;
