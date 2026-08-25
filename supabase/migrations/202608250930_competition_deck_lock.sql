begin;

-- =========================================================
-- COMPETITION DECK LOCK (gameplay integrity)
--
-- INVESTIGATION FIRST (per the directive: "first determine the
-- exact existing competition lifecycle"):
--   - competition_players(competition_id, profile_id) exists but has
--     NO deck column at all (202608231045_competition_schema_recovery.sql).
--   - matches.player_one_deck_id / player_two_deck_id capture
--     whichever deck is that PLAYER'S is_active=true deck at the
--     moment each individual match is created/accepted
--     (202608190010_matches.sql) - there is no single "the deck I
--     registered for this competition" concept anywhere in the repo
--     or the app (grepped src/app/actions/competitions.ts and every
--     competitions/**/*.tsx - zero mentions of "deck").
--   - deck_cards can already only be mutated while the owning deck's
--     status = 'draft' (enforced in the app layer today - see
--     addCardToDeck/removeCardFromDeck in src/app/actions/decks.ts)
--     and a deck can only become is_active while status = 'ready'
--     (setActiveDeck), and an is_active deck can never be sent back
--     to 'draft' (markDeckDraft blocks this while is_active is
--     true) - so a deck's cards ARE already effectively frozen while
--     it stays active. The real gap is that a player can freely
--     *deactivate* their competition deck (activate a different
--     ready deck instead - set_active_deck is not blocked from doing
--     this), which flips the formerly-active deck's is_active to
--     false, at which point markDeckDraft's guard no longer applies
--     and its cards become editable again - exactly the "switching
--     the registered deck after the lock boundary" loophole this
--     task calls out.
--   - The 8 competition RPC bodies (create_competition,
--     start_competition, add_competition_player, ...) are NOT in
--     this repo - 202608231045_competition_schema_recovery.sql
--     explicitly documents they exist only live in Supabase and were
--     deliberately NOT guessed at. This migration therefore does NOT
--     call CREATE OR REPLACE FUNCTION on any of them - doing so
--     without seeing their real bodies would risk silently deleting
--     unknown, currently-working production logic. Everything below
--     is NEW, additive, and hooks the known, schema-recovered
--     `competitions.status` column directly via a table-level
--     trigger, so it applies correctly no matter what SQL is
--     actually inside start_competition/add_competition_player today
--     - the trigger fires on the underlying UPDATE/INSERT regardless
--     of which function performed it.
--
-- DESIGN: SNAPSHOT/REGISTRATION MODEL (as the task explicitly
-- prefers, "so historical competitions remain reproducible even if
-- the player's normal deck changes later")
--   1. competition_deck_locks - one permanent row per
--      (competition, player), capturing exactly which deck_id was
--      that player's active deck at the moment the competition left
--      'draft' status. Once written, a row is NEVER updated or
--      deleted by any trigger here - it is the permanent historical
--      record of which deck was played.
--   2. A trigger on competitions (AFTER UPDATE OF status, only when
--      status actually leaves 'draft') snapshots every current
--      competition_players row's active deck. This is the "use the
--      existing competition-starts state/time as the lock boundary"
--      requirement, driven purely by the known status column.
--   3. A trigger on competition_players (AFTER INSERT) additionally
--      snapshots a late joiner's active deck immediately, in case a
--      player can join after the competition already left 'draft' -
--      defensive, since add_competition_player's real validation is
--      unknown.
--   4. A trigger on deck_cards (BEFORE INSERT OR UPDATE OR DELETE)
--      blocks any mutation to a deck that has a
--      competition_deck_locks row - covers "removing cards, adding
--      cards, changing quantities" from EVERY caller (server action,
--      stale tab, direct RPC/API call), not just the app-layer
--      status==draft check that already existed.
--   5. A trigger on decks (BEFORE UPDATE) blocks:
--       a. deactivating (is_active true -> false) or changing
--          `status` on a deck that has a competition_deck_locks row
--          - closes the "deactivate then markDeckDraft then edit"
--          loophole at the database layer, permanently.
--       b. activating (is_active false -> true) a DIFFERENT deck
--          while the player has a competition_deck_locks row whose
--          competition is still status = 'active' - closes
--          "switching the registered deck after the lock boundary"
--          in the other direction (you cannot walk away from your
--          locked deck to a fresh one mid-competition either). This
--          restriction is lifted once the competition's status
--          becomes 'completed'/'cancelled' - the LOCKED deck's cards
--          stay frozen forever either way (for historical
--          reproducibility), but the player is free to use other
--          decks again once the competition itself is over.
--      Decks have no hard-delete path in this app at all
--      ("archiveDeck... We verwijderen decks bewust niet hard" - see
--      src/app/actions/decks.ts) so blocking a status change to
--      'archived' on a locked deck (covered by 5a, since archived is
--      a status change) is the correct equivalent of "deleting the
--      deck" for this app's actual data model.
--
-- WHAT IS DELIBERATELY NOT CHANGED
--   - Non-competition deck editing is completely unaffected: a deck
--     with no competition_deck_locks row behaves exactly as before
--     (every new trigger's first check is `exists (select 1 from
--     competition_deck_locks where deck_id = ...)`, a single indexed
--     lookup, so ordinary deck building has no new failure mode and
--     negligible added cost).
--   - No existing table's existing columns, no existing trigger, and
--     no existing RPC signature or body is touched.
-- =========================================================

-- ---------------------------------------------------------
-- 1. competition_deck_locks
-- ---------------------------------------------------------

create table if not exists public.competition_deck_locks (
  id uuid primary key default gen_random_uuid(),

  competition_id uuid not null
    references public.competitions(id)
    on delete cascade,

  profile_id uuid not null
    references public.profiles(id)
    on delete cascade,

  deck_id uuid not null
    references public.decks(id)
    on delete restrict,

  locked_at timestamptz not null default now(),

  unique (competition_id, profile_id)
);

create index if not exists competition_deck_locks_deck_idx
  on public.competition_deck_locks(deck_id);

create index if not exists competition_deck_locks_profile_idx
  on public.competition_deck_locks(profile_id);

alter table public.competition_deck_locks enable row level security;

drop policy if exists competition_deck_locks_read_authenticated
  on public.competition_deck_locks;

-- Public within the app the same way competition_players/
-- competition_results already are (no existing RLS narrows those to
-- "your own league only" either - competitions are league-visible by
-- convention in this codebase, not per-row-owner-private). Writes are
-- NEVER granted to `authenticated` - only the SECURITY DEFINER
-- trigger functions below (which bypass RLS as their own privilege)
-- ever insert into this table.
create policy competition_deck_locks_read_authenticated
  on public.competition_deck_locks
  for select
  to authenticated
  using (true);

revoke insert, update, delete on public.competition_deck_locks from authenticated;


-- ---------------------------------------------------------
-- 2. Snapshot helper - locks ONE player's current active deck for
--    ONE competition, if they have one and aren't already locked.
--    Silent no-op (not an error) when the player has no active deck
--    yet - they simply won't be able to play until they have one,
--    same as the existing challenge/accept match flow already
--    requires elsewhere.
-- ---------------------------------------------------------

create or replace function public.lock_competition_player_deck(
  target_competition_id uuid,
  target_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_league_id uuid;
  active_deck_id uuid;
begin
  select league_id
  into target_league_id
  from public.competitions
  where id = target_competition_id;

  if target_league_id is null then
    return;
  end if;

  select id
  into active_deck_id
  from public.decks
  where owner_id = target_profile_id
    and league_id = target_league_id
    and is_active = true
  limit 1;

  if active_deck_id is null then
    return;
  end if;

  insert into public.competition_deck_locks (
    competition_id,
    profile_id,
    deck_id
  )
  values (
    target_competition_id,
    target_profile_id,
    active_deck_id
  )
  on conflict (competition_id, profile_id) do nothing;
end;
$$;

revoke all on function public.lock_competition_player_deck(uuid, uuid) from public;


-- ---------------------------------------------------------
-- 3. Trigger: competitions leaves 'draft' -> snapshot every current
--    participant's active deck.
-- ---------------------------------------------------------

create or replace function public.snapshot_competition_decks_on_start()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  participant record;
begin
  if old.status = 'draft' and new.status <> 'draft' then
    for participant in
      select profile_id
      from public.competition_players
      where competition_id = new.id
    loop
      perform public.lock_competition_player_deck(new.id, participant.profile_id);
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists snapshot_competition_decks_on_start on public.competitions;

create trigger snapshot_competition_decks_on_start
after update of status
on public.competitions
for each row
execute function public.snapshot_competition_decks_on_start();


-- ---------------------------------------------------------
-- 4. Trigger: a player joins a competition that has already left
--    'draft' (late joiner - defensive, in case add_competition_player
--    allows this) -> snapshot immediately.
-- ---------------------------------------------------------

create or replace function public.snapshot_competition_deck_on_join()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  competition_status text;
begin
  select status
  into competition_status
  from public.competitions
  where id = new.competition_id;

  if competition_status is not null and competition_status <> 'draft' then
    perform public.lock_competition_player_deck(new.competition_id, new.profile_id);
  end if;

  return new;
end;
$$;

drop trigger if exists snapshot_competition_deck_on_join on public.competition_players;

create trigger snapshot_competition_deck_on_join
after insert
on public.competition_players
for each row
execute function public.snapshot_competition_deck_on_join();


-- ---------------------------------------------------------
-- 5. Trigger: block deck_cards mutation for a locked deck. Applies
--    to insert/update/delete alike, from ANY caller.
-- ---------------------------------------------------------

create or replace function public.enforce_competition_deck_cards_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_deck_id uuid;
begin
  affected_deck_id := coalesce(new.deck_id, old.deck_id);

  if exists (
    select 1
    from public.competition_deck_locks
    where deck_id = affected_deck_id
  ) then
    raise exception
      'This deck is locked for a competition and cannot be modified.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_competition_deck_cards_lock on public.deck_cards;

create trigger enforce_competition_deck_cards_lock
before insert or update or delete
on public.deck_cards
for each row
execute function public.enforce_competition_deck_cards_lock();


-- ---------------------------------------------------------
-- 6. Trigger: block deactivating/status-changing a locked deck, and
--    block activating a DIFFERENT deck while locked into a still-
--    active competition.
-- ---------------------------------------------------------

create or replace function public.enforce_competition_deck_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- (a) This exact deck is locked - its is_active/status can never
  -- change again (permanent, for historical reproducibility).
  if exists (
    select 1
    from public.competition_deck_locks
    where deck_id = old.id
  ) then
    if new.is_active is distinct from old.is_active
      or new.status is distinct from old.status
    then
      raise exception
        'This deck is locked for a competition and its status cannot change.';
    end if;
  end if;

  -- (b) Activating a DIFFERENT deck while this owner has a deck
  -- locked to a still-ACTIVE competition is blocked - once that
  -- competition completes/cancels, switching is allowed again (the
  -- locked deck's own row stays frozen forever via check (a) above).
  if new.is_active = true and old.is_active = false then
    if exists (
      select 1
      from public.competition_deck_locks cdl
      join public.competitions c
        on c.id = cdl.competition_id
      where cdl.profile_id = new.owner_id
        and cdl.deck_id <> new.id
        and c.status = 'active'
    ) then
      raise exception
        'You have a deck locked for an active competition. You cannot switch your active deck until that competition ends.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_competition_deck_lock on public.decks;

create trigger enforce_competition_deck_lock
before update
on public.decks
for each row
execute function public.enforce_competition_deck_lock();

commit;
