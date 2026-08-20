begin;

-- =========================================================
-- DUELIST CIRCLE - TRADING
--
-- Flow:
--
-- draft
--   -> pending
--   -> accepted
--        of
--   -> declined
--   -> cancelled
--
-- Elke trade bevat fysieke card_instances.
-- Zodra een trade pending is:
-- - aangeboden kaarten worden locked
-- - dezelfde kaart kan niet in een andere trade worden gebruikt
--
-- Bij accept:
-- - ownership van beide kanten wordt atomair gewisseld
-- - locks worden verwijderd
--
-- Bij decline/cancel:
-- - locks worden verwijderd
-- =========================================================


-- =========================================================
-- 1. TRADE STATUS
-- =========================================================

do $$
begin
  create type public.trade_status as enum (
    'draft',
    'pending',
    'accepted',
    'declined',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;


-- =========================================================
-- 2. TRADE SIDE
-- =========================================================

do $$
begin
  create type public.trade_side as enum (
    'offered',
    'requested'
  );
exception
  when duplicate_object then null;
end $$;


-- =========================================================
-- 3. TRADES
-- =========================================================

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),

  league_id uuid not null
    references public.leagues(id)
    on delete restrict,

  created_by uuid not null
    references public.profiles(id)
    on delete restrict,

  sender_id uuid not null
    references public.profiles(id)
    on delete restrict,

  receiver_id uuid not null
    references public.profiles(id)
    on delete restrict,

  status public.trade_status
    not null default 'draft',

  message text,

  created_at timestamptz
    not null default now(),

  submitted_at timestamptz,

  completed_at timestamptz,

  updated_at timestamptz
    not null default now(),

  constraint trades_different_players
    check (
      sender_id <> receiver_id
    )
);


create index if not exists trades_league_idx
  on public.trades(
    league_id,
    created_at desc
  );


create index if not exists trades_sender_idx
  on public.trades(
    sender_id,
    created_at desc
  );


create index if not exists trades_receiver_idx
  on public.trades(
    receiver_id,
    created_at desc
  );


create index if not exists trades_status_idx
  on public.trades(
    status,
    created_at desc
  );


-- =========================================================
-- 4. TRADE ITEMS
--
-- Elke rij = één fysieke kaartinstance
-- =========================================================

create table if not exists public.trade_items (
  id uuid primary key default gen_random_uuid(),

  trade_id uuid not null
    references public.trades(id)
    on delete cascade,

  card_instance_id uuid not null
    references public.card_instances(id)
    on delete restrict,

  side public.trade_side
    not null,

  added_by uuid not null
    references public.profiles(id)
    on delete restrict,

  created_at timestamptz
    not null default now(),

  unique (
    trade_id,
    card_instance_id
  )
);


create index if not exists trade_items_trade_idx
  on public.trade_items(
    trade_id,
    side
  );


create index if not exists trade_items_instance_idx
  on public.trade_items(
    card_instance_id
  );


-- =========================================================
-- 5. VALIDATE TRADE PARTICIPANTS
-- =========================================================

create or replace function public.validate_trade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender_member boolean;
  receiver_member boolean;
begin

  select exists (
    select 1
    from public.league_members lm
    where lm.league_id = new.league_id
      and lm.profile_id = new.sender_id
  )
  into sender_member;


  select exists (
    select 1
    from public.league_members lm
    where lm.league_id = new.league_id
      and lm.profile_id = new.receiver_id
  )
  into receiver_member;


  if not sender_member then
    raise exception
      'Sender is not a member of this league';
  end if;


  if not receiver_member then
    raise exception
      'Receiver is not a member of this league';
  end if;


  new.updated_at := now();

  return new;
end;
$$;


drop trigger if exists validate_trade_before_write
  on public.trades;


create trigger validate_trade_before_write
before insert or update
on public.trades
for each row
execute function public.validate_trade();


-- =========================================================
-- 6. VALIDATE TRADE ITEM
-- =========================================================

create or replace function public.validate_trade_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  trade_sender_id uuid;
  trade_receiver_id uuid;
  trade_status public.trade_status;

  instance_owner_id uuid;
  instance_locked boolean;
begin

  select
    t.sender_id,
    t.receiver_id,
    t.status
  into
    trade_sender_id,
    trade_receiver_id,
    trade_status
  from public.trades t
  where t.id = new.trade_id;


  if not found then
    raise exception
      'Trade not found';
  end if;


  if trade_status <> 'draft'
  then
    raise exception
      'Trade items can only be changed while trade is Draft';
  end if;


  select
    ci.current_owner_id,
    ci.locked
  into
    instance_owner_id,
    instance_locked
  from public.card_instances ci
  where ci.id = new.card_instance_id;


  if not found then
    raise exception
      'Card instance not found';
  end if;


  if instance_locked = true
  then
    raise exception
      'Locked cards cannot be added to a trade';
  end if;


  if new.side = 'offered'
     and instance_owner_id <> trade_sender_id
  then
    raise exception
      'Offered card must be owned by sender';
  end if;


  if new.side = 'requested'
     and instance_owner_id <> trade_receiver_id
  then
    raise exception
      'Requested card must be owned by receiver';
  end if;


  return new;
end;
$$;


drop trigger if exists validate_trade_item_before_write
  on public.trade_items;


create trigger validate_trade_item_before_write
before insert or update
on public.trade_items
for each row
execute function public.validate_trade_item();


-- =========================================================
-- 7. CREATE TRADE
-- =========================================================

create or replace function public.create_trade(
  target_league_id uuid,
  target_receiver_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  new_trade_id uuid;
begin

  current_user_id :=
    (select auth.uid());


  if current_user_id is null then
    raise exception
      'Not authenticated';
  end if;


  if current_user_id = target_receiver_id then
    raise exception
      'You cannot trade with yourself';
  end if;


  if not public.is_league_member(
    target_league_id
  )
  then
    raise exception
      'You are not a member of this league';
  end if;


  if not exists (
    select 1
    from public.league_members lm
    where lm.league_id = target_league_id
      and lm.profile_id = target_receiver_id
  )
  then
    raise exception
      'Receiver is not a member of this league';
  end if;


  insert into public.trades (
    league_id,
    created_by,
    sender_id,
    receiver_id,
    status
  )
  values (
    target_league_id,
    current_user_id,
    current_user_id,
    target_receiver_id,
    'draft'
  )
  returning id
  into new_trade_id;


  return new_trade_id;
end;
$$;


-- =========================================================
-- 8. ADD ITEM TO TRADE
-- =========================================================

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


-- =========================================================
-- 9. REMOVE ITEM FROM TRADE
-- =========================================================

create or replace function public.remove_trade_item(
  target_trade_item_id uuid
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
  from public.trade_items ti

  join public.trades t
    on t.id = ti.trade_id

  where ti.id = target_trade_item_id;


  if not found then
    raise exception
      'Trade item not found';
  end if;


  if current_user_id <> trade_sender_id
  then
    raise exception
      'Only the sender may edit this trade';
  end if;


  if trade_status <> 'draft'
  then
    raise exception
      'Trade can only be edited while Draft';
  end if;


  delete from public.trade_items
  where id = target_trade_item_id;
end;
$$;


-- =========================================================
-- 10. SUBMIT TRADE
--
-- Locks alle betrokken kaarten.
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

  offered_count integer;
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
  then
    raise exception
      'Trade must contain at least one offered card';
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
    lock_type = 'trade'
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


-- =========================================================
-- 11. ACCEPT TRADE
--
-- Atomair:
-- - ownership controleren
-- - owners omwisselen
-- - unlock
-- - trade accepted
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

  trade_sender_id uuid;
  trade_receiver_id uuid;
  trade_status public.trade_status;
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
  -- Offered cards -> receiver
  -- -------------------------------------------------------

  update public.card_instances ci
  set
    current_owner_id = trade_receiver_id,
    locked = false,
    lock_type = null
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
    lock_type = null
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
-- 12. DECLINE TRADE
-- =========================================================

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
  where t.id = target_trade_id;


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
    lock_type = null
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


-- =========================================================
-- 13. CANCEL TRADE
--
-- Draft of Pending kan door sender gecancelled worden.
-- =========================================================

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
  where t.id = target_trade_id;


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
      lock_type = null
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
-- 14. RLS
-- =========================================================

alter table public.trades
  enable row level security;

alter table public.trade_items
  enable row level security;


drop policy if exists trades_read_participants
  on public.trades;


create policy trades_read_participants
on public.trades
for select
to authenticated
using (
  sender_id = auth.uid()
  or receiver_id = auth.uid()
);


drop policy if exists trade_items_read_participants
  on public.trade_items;


create policy trade_items_read_participants
on public.trade_items
for select
to authenticated
using (
  exists (
    select 1
    from public.trades t
    where t.id = trade_id
      and (
        t.sender_id = auth.uid()
        or t.receiver_id = auth.uid()
      )
  )
);


-- Alle mutaties via RPC
revoke insert, update, delete
on public.trades
from authenticated;

revoke insert, update, delete
on public.trade_items
from authenticated;


grant select
on public.trades
to authenticated;

grant select
on public.trade_items
to authenticated;


-- =========================================================
-- 15. RPC PERMISSIONS
-- =========================================================

revoke all
on function public.create_trade(
  uuid,
  uuid
)
from public;

revoke all
on function public.add_trade_item(
  uuid,
  uuid,
  public.trade_side
)
from public;

revoke all
on function public.remove_trade_item(
  uuid
)
from public;

revoke all
on function public.submit_trade(
  uuid,
  text
)
from public;

revoke all
on function public.accept_trade(
  uuid
)
from public;

revoke all
on function public.decline_trade(
  uuid
)
from public;

revoke all
on function public.cancel_trade(
  uuid
)
from public;


grant execute
on function public.create_trade(
  uuid,
  uuid
)
to authenticated;

grant execute
on function public.add_trade_item(
  uuid,
  uuid,
  public.trade_side
)
to authenticated;

grant execute
on function public.remove_trade_item(
  uuid
)
to authenticated;

grant execute
on function public.submit_trade(
  uuid,
  text
)
to authenticated;

grant execute
on function public.accept_trade(
  uuid
)
to authenticated;

grant execute
on function public.decline_trade(
  uuid
)
to authenticated;

grant execute
on function public.cancel_trade(
  uuid
)
to authenticated;


commit;