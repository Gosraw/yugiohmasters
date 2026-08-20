-- ============================================================
-- DUEL POINTS + PRACTICE WAGERS
--
-- League Points:
--   Used only for competitive league standings.
--
-- Duel Points (DP):
--   Player currency / reward system.
--
-- Match types:
--   league   = competitive match
--   practice = friendly match
--
-- Practice wagers:
--   none
--   dp
--   card
--
-- Card wagers use real physical card_instances.
-- ============================================================


-- ============================================================
-- 1. PLAYER DUEL POINT BALANCE
-- ============================================================

alter table public.profiles
  add column if not exists duel_points integer
    not null
    default 0;

alter table public.profiles
  drop constraint if exists profiles_duel_points_check;

alter table public.profiles
  add constraint profiles_duel_points_check
  check (duel_points >= 0);


comment on column public.profiles.duel_points is
  'Current Duel Point balance. All mutations should also be written to duel_point_transactions.';


-- ============================================================
-- 2. MATCH TYPE
-- ============================================================

alter table public.matches
  add column if not exists match_type text
    not null
    default 'league';

alter table public.matches
  drop constraint if exists matches_match_type_check;

alter table public.matches
  add constraint matches_match_type_check
  check (
    match_type in (
      'league',
      'practice'
    )
  );


-- Existing matches were competition matches.
update public.matches
set match_type = 'league'
where match_type is null;


-- ============================================================
-- 3. WAGER CONFIG
-- ============================================================

alter table public.matches
  add column if not exists wager_type text
    not null
    default 'none',

  add column if not exists wager_dp_amount integer
    not null
    default 0,

  add column if not exists wager_status text
    not null
    default 'none';


alter table public.matches
  drop constraint if exists matches_wager_type_check;

alter table public.matches
  add constraint matches_wager_type_check
  check (
    wager_type in (
      'none',
      'dp',
      'card'
    )
  );


alter table public.matches
  drop constraint if exists matches_wager_dp_amount_check;

alter table public.matches
  add constraint matches_wager_dp_amount_check
  check (
    wager_dp_amount >= 0
  );


alter table public.matches
  drop constraint if exists matches_wager_status_check;

alter table public.matches
  add constraint matches_wager_status_check
  check (
    wager_status in (
      'none',
      'proposed',
      'funded',
      'settled',
      'released'
    )
  );


-- League matches may never contain wagers.
alter table public.matches
  drop constraint if exists matches_league_no_wager_check;

alter table public.matches
  add constraint matches_league_no_wager_check
  check (
    match_type = 'practice'
    or (
      wager_type = 'none'
      and wager_dp_amount = 0
    )
  );


comment on column public.matches.match_type is
  'league = competition, practice = friendly duel.';

comment on column public.matches.wager_type is
  'Optional practice duel wager: none, dp or card.';

comment on column public.matches.wager_dp_amount is
  'DP stake PER PLAYER when wager_type = dp.';


-- ============================================================
-- 4. DUEL POINT LEDGER
-- ============================================================

create table if not exists public.duel_point_transactions (
  id uuid primary key default gen_random_uuid(),

  profile_id uuid not null
    references public.profiles(id)
    on delete cascade,

  match_id uuid
    references public.matches(id)
    on delete set null,

  amount integer not null,

  balance_after integer not null,

  reason text not null,

  note text,

  metadata jsonb not null
    default '{}'::jsonb,

  created_at timestamptz not null
    default now()
);


alter table public.duel_point_transactions
  add constraint duel_point_transactions_balance_check
  check (
    balance_after >= 0
  );


-- Prevent duplicate automatic match rewards.
create unique index if not exists
  duel_point_transactions_match_reason_unique
on public.duel_point_transactions (
  match_id,
  profile_id,
  reason
)
where match_id is not null;


create index if not exists
  duel_point_transactions_profile_created_idx
on public.duel_point_transactions (
  profile_id,
  created_at desc
);


-- ============================================================
-- 5. DP WAGER ESCROW
-- ============================================================

create table if not exists public.match_dp_escrows (
  id uuid primary key default gen_random_uuid(),

  match_id uuid not null
    references public.matches(id)
    on delete cascade,

  profile_id uuid not null
    references public.profiles(id)
    on delete cascade,

  amount integer not null,

  status text not null
    default 'funded',

  created_at timestamptz not null
    default now(),

  settled_at timestamptz,

  unique (
    match_id,
    profile_id
  ),

  check (
    amount > 0
  ),

  check (
    status in (
      'funded',
      'won',
      'refunded'
    )
  )
);


-- ============================================================
-- 6. CARD WAGERS
-- ============================================================

create table if not exists public.match_wager_cards (
  id uuid primary key default gen_random_uuid(),

  match_id uuid not null
    references public.matches(id)
    on delete cascade,

  owner_id uuid not null
    references public.profiles(id)
    on delete cascade,

  card_instance_id uuid not null
    references public.card_instances(id)
    on delete restrict,

  status text not null
    default 'locked',

  created_at timestamptz not null
    default now(),

  settled_at timestamptz,

  unique (
    match_id,
    card_instance_id
  ),

  unique (
    card_instance_id
  ),

  check (
    status in (
      'locked',
      'won',
      'returned'
    )
  )
);


create index if not exists
  match_wager_cards_match_idx
on public.match_wager_cards (
  match_id
);


-- ============================================================
-- 7. RLS
-- ============================================================

alter table public.duel_point_transactions
  enable row level security;

alter table public.match_dp_escrows
  enable row level security;

alter table public.match_wager_cards
  enable row level security;


drop policy if exists
  "players view own duel point transactions"
on public.duel_point_transactions;

create policy
  "players view own duel point transactions"
on public.duel_point_transactions
for select
to authenticated
using (
  profile_id = auth.uid()
);


drop policy if exists
  "match players view dp escrow"
on public.match_dp_escrows;

create policy
  "match players view dp escrow"
on public.match_dp_escrows
for select
to authenticated
using (
  exists (
    select 1
    from public.matches m
    where m.id = match_dp_escrows.match_id
      and (
        m.player_one_id = auth.uid()
        or
        m.player_two_id = auth.uid()
      )
  )
);


drop policy if exists
  "match players view card wagers"
on public.match_wager_cards;

create policy
  "match players view card wagers"
on public.match_wager_cards
for select
to authenticated
using (
  exists (
    select 1
    from public.matches m
    where m.id = match_wager_cards.match_id
      and (
        m.player_one_id = auth.uid()
        or
        m.player_two_id = auth.uid()
      )
  )
);


-- ============================================================
-- 8. INTERNAL DP CREDIT HELPER
--
-- Not exposed to authenticated users directly.
-- ============================================================

create or replace function public._credit_duel_points(
  target_profile_id uuid,
  target_amount integer,
  target_reason text,
  target_match_id uuid default null,
  target_note text default null,
  target_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
begin
  if target_amount <= 0 then
    raise exception 'Credit amount must be positive.';
  end if;

  update public.profiles
  set duel_points =
    duel_points + target_amount
  where id =
    target_profile_id
  returning duel_points
  into new_balance;

  if new_balance is null then
    raise exception 'Profile not found.';
  end if;

  insert into public.duel_point_transactions (
    profile_id,
    match_id,
    amount,
    balance_after,
    reason,
    note,
    metadata
  )
  values (
    target_profile_id,
    target_match_id,
    target_amount,
    new_balance,
    target_reason,
    target_note,
    target_metadata
  );
end;
$$;


revoke all
on function public._credit_duel_points(
  uuid,
  integer,
  text,
  uuid,
  text,
  jsonb
)
from public;

revoke all
on function public._credit_duel_points(
  uuid,
  integer,
  text,
  uuid,
  text,
  jsonb
)
from authenticated;


-- ============================================================
-- 9. FUND DP WAGER
-- ============================================================

create or replace function public.fund_match_dp_wager(
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
  current_balance integer;
  new_balance integer;
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

  if target_match.wager_type <> 'dp' then
    raise exception 'This match does not use a DP wager.';
  end if;

  if target_match.wager_dp_amount <= 0 then
    raise exception 'Invalid DP wager amount.';
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
    raise exception 'This wager can no longer be funded.';
  end if;

  if exists (
    select 1
    from public.match_dp_escrows
    where match_id =
      target_match_id
      and profile_id =
        caller_id
  ) then
    raise exception 'Your DP wager is already funded.';
  end if;

  select duel_points
  into current_balance
  from public.profiles
  where id =
    caller_id
  for update;

  if current_balance <
    target_match.wager_dp_amount
  then
    raise exception 'Not enough Duel Points.';
  end if;

  update public.profiles
  set duel_points =
    duel_points -
    target_match.wager_dp_amount
  where id =
    caller_id
  returning duel_points
  into new_balance;

  insert into public.match_dp_escrows (
    match_id,
    profile_id,
    amount
  )
  values (
    target_match_id,
    caller_id,
    target_match.wager_dp_amount
  );

  insert into public.duel_point_transactions (
    profile_id,
    match_id,
    amount,
    balance_after,
    reason,
    note
  )
  values (
    caller_id,
    target_match_id,
    -target_match.wager_dp_amount,
    new_balance,
    'practice_wager_stake',
    'DP moved into practice duel wager escrow.'
  );

  if (
    select count(*)
    from public.match_dp_escrows
    where match_id =
      target_match_id
      and status =
        'funded'
  ) >= 2 then

    update public.matches
    set wager_status =
      'funded'
    where id =
      target_match_id;

  else

    update public.matches
    set wager_status =
      'proposed'
    where id =
      target_match_id;

  end if;
end;
$$;


grant execute
on function public.fund_match_dp_wager(uuid)
to authenticated;


-- ============================================================
-- 10. ADD CARD TO PRACTICE WAGER
-- ============================================================

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
    lock_type = 'match_wager'
  where id =
    target_card_instance_id;

  update public.matches
  set wager_status =
    'proposed'
  where id =
    target_match_id;
end;
$$;


grant execute
on function public.add_match_wager_card(
  uuid,
  uuid
)
to authenticated;


-- ============================================================
-- 11. REMOVE CARD FROM WAGER
-- ============================================================

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
    lock_type = null
  where id =
    target_card_instance_id
    and current_owner_id =
      caller_id;
end;
$$;


grant execute
on function public.remove_match_wager_card(
  uuid,
  uuid
)
to authenticated;


-- ============================================================
-- 12. SETTLE PRACTICE WAGERS
--
-- Only works after the match has status = completed.
--
-- Winner:
--   receives entire DP escrow
--   receives all wagered card copies
--
-- Draw:
--   DP returned
--   cards returned
-- ============================================================

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
          lock_type = null
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
          lock_type = null
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


grant execute
on function public.settle_match_wagers(uuid)
to authenticated;


-- ============================================================
-- 13. RELEASE WAGERS AFTER CANCEL / DECLINE
-- ============================================================

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
      lock_type = null
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


grant execute
on function public.release_match_wagers(uuid)
to authenticated;


-- ============================================================
-- 14. AUTOMATIC MATCH DP REWARDS
--
-- LEAGUE:
--   win  = 100 DP
--   draw = 50 DP
--   loss = 25 DP
--
-- PRACTICE:
--   win  = 25 DP
--   draw = 10 DP
--   loss = 5 DP
--
-- This is separate from any wager.
-- ============================================================

create or replace function public.award_match_duel_points(
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

  player_one_reward integer;
  player_two_reward integer;

  inserted_id uuid;
  new_balance integer;
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

  if target_match.status <> 'completed' then
    raise exception 'Match is not completed.';
  end if;


  -- ========================================================
  -- DETERMINE REWARDS
  -- ========================================================

  if target_match.match_type = 'league' then

    if target_match.winner_id is null then
      player_one_reward := 50;
      player_two_reward := 50;

    elsif target_match.winner_id =
      target_match.player_one_id
    then
      player_one_reward := 100;
      player_two_reward := 25;

    else
      player_one_reward := 25;
      player_two_reward := 100;
    end if;

  else

    if target_match.winner_id is null then
      player_one_reward := 10;
      player_two_reward := 10;

    elsif target_match.winner_id =
      target_match.player_one_id
    then
      player_one_reward := 25;
      player_two_reward := 5;

    else
      player_one_reward := 5;
      player_two_reward := 25;
    end if;

  end if;


  -- ========================================================
  -- PLAYER ONE
  -- ========================================================

  inserted_id := null;

  insert into public.duel_point_transactions (
    profile_id,
    match_id,
    amount,
    balance_after,
    reason,
    note,
    metadata
  )
  select
    target_match.player_one_id,
    target_match_id,
    player_one_reward,
    p.duel_points +
      player_one_reward,
    'match_reward',
    case
      when target_match.match_type =
        'league'
      then 'League duel reward.'
      else 'Practice duel reward.'
    end,
    jsonb_build_object(
      'match_type',
      target_match.match_type
    )
  from public.profiles p
  where p.id =
    target_match.player_one_id
  on conflict (
    match_id,
    profile_id,
    reason
  )
  where match_id is not null
  do nothing
  returning id
  into inserted_id;

  if inserted_id is not null then
    update public.profiles
    set duel_points =
      duel_points +
      player_one_reward
    where id =
      target_match.player_one_id;
  end if;


  -- ========================================================
  -- PLAYER TWO
  -- ========================================================

  inserted_id := null;

  insert into public.duel_point_transactions (
    profile_id,
    match_id,
    amount,
    balance_after,
    reason,
    note,
    metadata
  )
  select
    target_match.player_two_id,
    target_match_id,
    player_two_reward,
    p.duel_points +
      player_two_reward,
    'match_reward',
    case
      when target_match.match_type =
        'league'
      then 'League duel reward.'
      else 'Practice duel reward.'
    end,
    jsonb_build_object(
      'match_type',
      target_match.match_type
    )
  from public.profiles p
  where p.id =
    target_match.player_two_id
  on conflict (
    match_id,
    profile_id,
    reason
  )
  where match_id is not null
  do nothing
  returning id
  into inserted_id;

  if inserted_id is not null then
    update public.profiles
    set duel_points =
      duel_points +
      player_two_reward
    where id =
      target_match.player_two_id;
  end if;

end;
$$;


grant execute
on function public.award_match_duel_points(uuid)
to authenticated;