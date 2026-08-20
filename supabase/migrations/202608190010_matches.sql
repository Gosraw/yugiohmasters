begin;

-- =========================================================
-- DUELIST CIRCLE - MATCHES
--
-- Basis voor:
-- - challenges tussen spelers
-- - gebruik van Active Decks
-- - matchresultaten
-- - standings / history
-- =========================================================


-- =========================================================
-- 1. MATCH STATUS
-- =========================================================

do $$
begin
  create type public.match_status as enum (
    'pending',
    'accepted',
    'completed',
    'cancelled',
    'declined'
  );
exception
  when duplicate_object then null;
end $$;


-- =========================================================
-- 2. MATCH RESULT TYPE
-- =========================================================

do $$
begin
  create type public.match_result_type as enum (
    'player_one_win',
    'player_two_win',
    'draw'
  );
exception
  when duplicate_object then null;
end $$;


-- =========================================================
-- 3. MATCHES TABLE
-- =========================================================

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),

  league_id uuid not null
    references public.leagues(id)
    on delete restrict,

  created_by uuid not null
    references public.profiles(id)
    on delete restrict,

  player_one_id uuid not null
    references public.profiles(id)
    on delete restrict,

  player_two_id uuid not null
    references public.profiles(id)
    on delete restrict,

  player_one_deck_id uuid
    references public.decks(id)
    on delete restrict,

  player_two_deck_id uuid
    references public.decks(id)
    on delete restrict,

  status public.match_status
    not null default 'pending',

  result public.match_result_type,

  winner_id uuid
    references public.profiles(id)
    on delete restrict,

  notes text,

  created_at timestamptz
    not null default now(),

  accepted_at timestamptz,

  completed_at timestamptz,

  updated_at timestamptz
    not null default now(),

  constraint matches_different_players
    check (
      player_one_id <> player_two_id
    ),

  constraint matches_winner_is_participant
    check (
      winner_id is null
      or winner_id = player_one_id
      or winner_id = player_two_id
    )
);


create index if not exists matches_league_idx
  on public.matches(
    league_id,
    created_at desc
  );


create index if not exists matches_player_one_idx
  on public.matches(
    player_one_id,
    created_at desc
  );


create index if not exists matches_player_two_idx
  on public.matches(
    player_two_id,
    created_at desc
  );


create index if not exists matches_status_idx
  on public.matches(
    status,
    created_at desc
  );


-- =========================================================
-- 4. VALIDATE MATCH PARTICIPANTS + DECKS
-- =========================================================

create or replace function public.validate_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p1_member boolean;
  p2_member boolean;

  p1_deck_owner uuid;
  p1_deck_league uuid;
  p1_deck_status public.deck_status;
  p1_deck_active boolean;

  p2_deck_owner uuid;
  p2_deck_league uuid;
  p2_deck_status public.deck_status;
  p2_deck_active boolean;
begin

  -- -------------------------------------------------------
  -- Beide spelers moeten league member zijn
  -- -------------------------------------------------------

  select exists (
    select 1
    from public.league_members lm
    where lm.league_id = new.league_id
      and lm.profile_id = new.player_one_id
  )
  into p1_member;

  select exists (
    select 1
    from public.league_members lm
    where lm.league_id = new.league_id
      and lm.profile_id = new.player_two_id
  )
  into p2_member;

  if not p1_member then
    raise exception
      'Player one is not a member of this league';
  end if;

  if not p2_member then
    raise exception
      'Player two is not a member of this league';
  end if;


  -- -------------------------------------------------------
  -- Player One deck
  -- -------------------------------------------------------

  if new.player_one_deck_id is not null then
    select
      d.owner_id,
      d.league_id,
      d.status,
      d.is_active
    into
      p1_deck_owner,
      p1_deck_league,
      p1_deck_status,
      p1_deck_active
    from public.decks d
    where d.id = new.player_one_deck_id;

    if not found then
      raise exception
        'Player one deck not found';
    end if;

    if p1_deck_owner <> new.player_one_id then
      raise exception
        'Player one does not own this deck';
    end if;

    if p1_deck_league <> new.league_id then
      raise exception
        'Player one deck belongs to another league';
    end if;

    if p1_deck_status <> 'ready' then
      raise exception
        'Player one deck must be Ready';
    end if;

    if p1_deck_active = false then
      raise exception
        'Player one deck must be Active';
    end if;
  end if;


  -- -------------------------------------------------------
  -- Player Two deck
  -- -------------------------------------------------------

  if new.player_two_deck_id is not null then
    select
      d.owner_id,
      d.league_id,
      d.status,
      d.is_active
    into
      p2_deck_owner,
      p2_deck_league,
      p2_deck_status,
      p2_deck_active
    from public.decks d
    where d.id = new.player_two_deck_id;

    if not found then
      raise exception
        'Player two deck not found';
    end if;

    if p2_deck_owner <> new.player_two_id then
      raise exception
        'Player two does not own this deck';
    end if;

    if p2_deck_league <> new.league_id then
      raise exception
        'Player two deck belongs to another league';
    end if;

    if p2_deck_status <> 'ready' then
      raise exception
        'Player two deck must be Ready';
    end if;

    if p2_deck_active = false then
      raise exception
        'Player two deck must be Active';
    end if;
  end if;


  new.updated_at := now();

  return new;
end;
$$;


drop trigger if exists validate_match_before_write
  on public.matches;


create trigger validate_match_before_write
before insert or update
on public.matches
for each row
execute function public.validate_match();


-- =========================================================
-- 5. CREATE CHALLENGE
-- =========================================================

create or replace function public.create_match_challenge(
  target_league_id uuid,
  target_opponent_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  current_user_deck_id uuid;
  new_match_id uuid;
begin

  current_user_id :=
    (select auth.uid());


  if current_user_id is null then
    raise exception
      'Not authenticated';
  end if;


  if current_user_id = target_opponent_id then
    raise exception
      'You cannot challenge yourself';
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
      and lm.profile_id = target_opponent_id
  )
  then
    raise exception
      'Opponent is not a member of this league';
  end if;


  -- -------------------------------------------------------
  -- Challenger moet Active Ready deck hebben
  -- -------------------------------------------------------

  select d.id
  into current_user_deck_id
  from public.decks d
  where d.league_id = target_league_id
    and d.owner_id = current_user_id
    and d.status = 'ready'
    and d.is_active = true
  limit 1;


  if current_user_deck_id is null then
    raise exception
      'You need an Active Ready deck before challenging another player';
  end if;


  -- -------------------------------------------------------
  -- Dubbele pending challenge voorkomen
  -- -------------------------------------------------------

  if exists (
    select 1
    from public.matches m
    where m.league_id = target_league_id
      and m.status = 'pending'
      and (
        (
          m.player_one_id = current_user_id
          and m.player_two_id = target_opponent_id
        )
        or
        (
          m.player_one_id = target_opponent_id
          and m.player_two_id = current_user_id
        )
      )
  )
  then
    raise exception
      'There is already a pending challenge between these players';
  end if;


  insert into public.matches (
    league_id,
    created_by,
    player_one_id,
    player_two_id,
    player_one_deck_id,
    status
  )
  values (
    target_league_id,
    current_user_id,
    current_user_id,
    target_opponent_id,
    current_user_deck_id,
    'pending'
  )
  returning id
  into new_match_id;


  return new_match_id;
end;
$$;


-- =========================================================
-- 6. ACCEPT CHALLENGE
-- =========================================================

create or replace function public.accept_match_challenge(
  target_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  target_player_two_id uuid;
  target_league_id uuid;
  current_status public.match_status;
  active_deck_id uuid;
begin

  current_user_id :=
    (select auth.uid());


  select
    m.player_two_id,
    m.league_id,
    m.status
  into
    target_player_two_id,
    target_league_id,
    current_status
  from public.matches m
  where m.id = target_match_id;


  if not found then
    raise exception
      'Match not found';
  end if;


  if target_player_two_id <> current_user_id then
    raise exception
      'Only the challenged player may accept this match';
  end if;


  if current_status <> 'pending' then
    raise exception
      'This challenge is no longer pending';
  end if;


  select d.id
  into active_deck_id
  from public.decks d
  where d.league_id = target_league_id
    and d.owner_id = current_user_id
    and d.status = 'ready'
    and d.is_active = true
  limit 1;


  if active_deck_id is null then
    raise exception
      'You need an Active Ready deck before accepting this challenge';
  end if;


  update public.matches
  set
    player_two_deck_id = active_deck_id,
    status = 'accepted',
    accepted_at = now(),
    updated_at = now()
  where id = target_match_id;
end;
$$;


-- =========================================================
-- 7. DECLINE CHALLENGE
-- =========================================================

create or replace function public.decline_match_challenge(
  target_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  target_player_two_id uuid;
  current_status public.match_status;
begin

  current_user_id :=
    (select auth.uid());


  select
    m.player_two_id,
    m.status
  into
    target_player_two_id,
    current_status
  from public.matches m
  where m.id = target_match_id;


  if not found then
    raise exception
      'Match not found';
  end if;


  if target_player_two_id <> current_user_id then
    raise exception
      'Only the challenged player may decline this match';
  end if;


  if current_status <> 'pending' then
    raise exception
      'This challenge is no longer pending';
  end if;


  update public.matches
  set
    status = 'declined',
    updated_at = now()
  where id = target_match_id;
end;
$$;


-- =========================================================
-- 8. CANCEL CHALLENGE
-- =========================================================

create or replace function public.cancel_match_challenge(
  target_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  target_player_one_id uuid;
  current_status public.match_status;
begin

  current_user_id :=
    (select auth.uid());


  select
    m.player_one_id,
    m.status
  into
    target_player_one_id,
    current_status
  from public.matches m
  where m.id = target_match_id;


  if not found then
    raise exception
      'Match not found';
  end if;


  if target_player_one_id <> current_user_id then
    raise exception
      'Only the challenger may cancel this match';
  end if;


  if current_status <> 'pending' then
    raise exception
      'This challenge is no longer pending';
  end if;


  update public.matches
  set
    status = 'cancelled',
    updated_at = now()
  where id = target_match_id;
end;
$$;


-- =========================================================
-- 9. COMPLETE MATCH
--
-- Voor nu mag één van beide spelers het resultaat
-- registreren. Later kunnen we confirmation toevoegen.
-- =========================================================

create or replace function public.complete_match(
  target_match_id uuid,
  target_result public.match_result_type,
  match_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;

  target_player_one_id uuid;
  target_player_two_id uuid;
  current_status public.match_status;

  resolved_winner_id uuid;
begin

  current_user_id :=
    (select auth.uid());


  select
    m.player_one_id,
    m.player_two_id,
    m.status
  into
    target_player_one_id,
    target_player_two_id,
    current_status
  from public.matches m
  where m.id = target_match_id;


  if not found then
    raise exception
      'Match not found';
  end if;


  if current_user_id <> target_player_one_id
     and current_user_id <> target_player_two_id
  then
    raise exception
      'You are not a participant in this match';
  end if;


  if current_status <> 'accepted' then
    raise exception
      'Only accepted matches can be completed';
  end if;


  if target_result = 'player_one_win' then
    resolved_winner_id :=
      target_player_one_id;

  elsif target_result = 'player_two_win' then
    resolved_winner_id :=
      target_player_two_id;

  elsif target_result = 'draw' then
    resolved_winner_id :=
      null;

  else
    raise exception
      'Invalid match result';
  end if;


  update public.matches
  set
    status = 'completed',
    result = target_result,
    winner_id = resolved_winner_id,
    notes = nullif(
      trim(match_notes),
      ''
    ),
    completed_at = now(),
    updated_at = now()
  where id = target_match_id;
end;
$$;


-- =========================================================
-- 10. RLS
-- =========================================================

alter table public.matches
  enable row level security;


drop policy if exists matches_read_league
  on public.matches;


create policy matches_read_league
on public.matches
for select
to authenticated
using (
  public.is_league_member(
    league_id
  )
);


-- Alle mutations via RPC.
revoke insert, update, delete
on public.matches
from authenticated;


grant select
on public.matches
to authenticated;


-- =========================================================
-- 11. RPC PERMISSIONS
-- =========================================================

revoke all
on function public.create_match_challenge(
  uuid,
  uuid
)
from public;

revoke all
on function public.accept_match_challenge(
  uuid
)
from public;

revoke all
on function public.decline_match_challenge(
  uuid
)
from public;

revoke all
on function public.cancel_match_challenge(
  uuid
)
from public;

revoke all
on function public.complete_match(
  uuid,
  public.match_result_type,
  text
)
from public;


grant execute
on function public.create_match_challenge(
  uuid,
  uuid
)
to authenticated;

grant execute
on function public.accept_match_challenge(
  uuid
)
to authenticated;

grant execute
on function public.decline_match_challenge(
  uuid
)
to authenticated;

grant execute
on function public.cancel_match_challenge(
  uuid
)
to authenticated;

grant execute
on function public.complete_match(
  uuid,
  public.match_result_type,
  text
)
to authenticated;


commit;