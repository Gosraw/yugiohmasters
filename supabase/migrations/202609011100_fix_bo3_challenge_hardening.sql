-- =========================================================
-- BO3 CHALLENGE HARDENING (audit fixes, no redesign)
--
-- Three narrowly-scoped correctness fixes found while auditing the
-- existing BO3/practice challenge system end-to-end. None of these
-- change the challenge model itself - each closes a gap in the
-- existing validate-then-mutate RPCs.
--
-- 1. add_match_wager_card(): had no league-scoping check (a caller
--    could technically stake a card_instance from a different
--    league than the match, since card_instances.league_id was
--    never compared to matches.league_id) and no cap on cards per
--    side. The match detail page's own wager UI
--    (src/app/.../matches/[id]/page.tsx) models exactly ONE staked
--    card per player per match (`wagerRows.find(row => row.owner_id
--    === ...)`, and its own copy: "The winner receives both wagered
--    physical card copies" - i.e. exactly two cards total, one per
--    side) - so a second card staked by the same player under the
--    old code was accepted by the database, silently invisible in
--    the UI (`.find` only ever surfaces the first row), and would
--    still be correctly transferred by settle_match_wagers() (which
--    loops over every locked row, not just one) - meaning a player
--    could lose an extra card they never saw represented anywhere.
--    Fixed by rejecting a second locked wager card for the same
--    (match, owner) pair, and by requiring the staked card's
--    league_id to match the match's league_id.
--
-- 2. accept_match_challenge() / decline_match_challenge() /
--    cancel_match_challenge(): each read the match row with a plain
--    SELECT (no `for update`), unlike every other match-mutation RPC
--    in this system (fund_match_dp_wager, add_match_wager_card,
--    settle_match_wagers all lock the row). Without the lock, two
--    concurrent calls - e.g. the challenger cancelling at the same
--    moment the opponent accepts - can both read the same
--    pre-mutation status and both proceed, leaving the match in an
--    inconsistent combination of side effects (already-funded DP or
--    a locked wager card attached to a match that also got
--    cancelled). Fixed by adding `for update` to each function's
--    initial SELECT, matching the existing lock-then-check-then-
--    mutate pattern used everywhere else in this file's function
--    family.
-- =========================================================

begin;

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
  target_card_league_id uuid;
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

  if exists (
    select 1
    from public.match_wager_cards
    where match_id = target_match_id
      and owner_id = caller_id
      and status = 'locked'
  ) then
    raise exception 'You have already staked a card for this match.';
  end if;

  select
    current_owner_id,
    locked,
    league_id
  into
    target_owner,
    target_locked,
    target_card_league_id
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

  if target_card_league_id <> target_match.league_id then
    raise exception 'This card copy does not belong to this match''s league.';
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
  where m.id = target_match_id
  for update;


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
  where m.id = target_match_id
  for update;


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
  where m.id = target_match_id
  for update;


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

-- ---------------------------------------------------------
-- POST-MIGRATION STRUCTURAL ASSERTIONS
-- ---------------------------------------------------------

do $$
declare
  v_src text;
begin
  select p.prosrc into v_src from pg_proc p where p.proname = 'add_match_wager_card' limit 1;
  if v_src is null
     or v_src not ilike '%already staked a card%'
     or v_src not ilike '%target_card_league_id%'
  then
    raise exception 'MIGRATION ABORTED: add_match_wager_card does not contain the new per-side-limit / league-scoping checks.';
  end if;

  select p.prosrc into v_src from pg_proc p where p.proname = 'accept_match_challenge' limit 1;
  if v_src is null or v_src not ilike '%for update%' then
    raise exception 'MIGRATION ABORTED: accept_match_challenge is missing its row lock.';
  end if;

  select p.prosrc into v_src from pg_proc p where p.proname = 'decline_match_challenge' limit 1;
  if v_src is null or v_src not ilike '%for update%' then
    raise exception 'MIGRATION ABORTED: decline_match_challenge is missing its row lock.';
  end if;

  select p.prosrc into v_src from pg_proc p where p.proname = 'cancel_match_challenge' limit 1;
  if v_src is null or v_src not ilike '%for update%' then
    raise exception 'MIGRATION ABORTED: cancel_match_challenge is missing its row lock.';
  end if;

  raise notice 'BO3 CHALLENGE HARDENING: all structural assertions passed.';
end $$;

commit;
