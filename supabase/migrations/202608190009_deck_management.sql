begin;

-- =========================================================
-- DUELIST CIRCLE - DECK MANAGEMENT
--
-- Voegt gecontroleerde RPC-functies toe voor:
-- - deck status wijzigen
-- - deck hernoemen
-- - deck archiveren
--
-- Directe UPDATE-rechten op decks blijven ingetrokken.
-- =========================================================


-- =========================================================
-- 1. SET DECK STATUS
--
-- Toegestane transitions:
-- draft -> ready
-- ready -> draft
--
-- Ready-validatie blijft door bestaande trigger:
-- validate_ready_deck_before_update
-- =========================================================

create or replace function public.set_deck_status(
  target_deck_id uuid,
  target_status public.deck_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner_id uuid;
  current_status public.deck_status;
  current_is_active boolean;
begin

  select
    d.owner_id,
    d.status,
    d.is_active
  into
    current_owner_id,
    current_status,
    current_is_active
  from public.decks d
  where d.id = target_deck_id;

  if not found then
    raise exception
      'Deck not found';
  end if;


  if current_owner_id <>
     (select auth.uid())
  then
    raise exception
      'You do not own this deck';
  end if;


  if current_status = 'archived'
  then
    raise exception
      'Archived decks cannot change status';
  end if;


  if target_status = 'archived'
  then
    raise exception
      'Use archive_deck to archive a deck';
  end if;


  if current_status = target_status
  then
    return;
  end if;


  -- Ready -> Draft mag niet als dit het actieve deck is.
  if current_status = 'ready'
     and target_status = 'draft'
     and current_is_active = true
  then
    raise exception
      'Active deck cannot be returned to Draft';
  end if;


  -- Alleen expliciete transitions toestaan.
  if not (
    (
      current_status = 'draft'
      and target_status = 'ready'
    )
    or
    (
      current_status = 'ready'
      and target_status = 'draft'
    )
  )
  then
    raise exception
      'Invalid deck status transition: % -> %',
      current_status,
      target_status;
  end if;


  update public.decks
  set
    status = target_status,
    updated_at = now()
  where id = target_deck_id;

  -- Bij draft -> ready vuurt hier automatisch
  -- validate_ready_deck_before_update.
end;
$$;


-- =========================================================
-- 2. RENAME DECK
-- =========================================================

create or replace function public.rename_deck(
  target_deck_id uuid,
  new_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner_id uuid;
  current_status public.deck_status;
  cleaned_name text;
begin

  cleaned_name :=
    trim(new_name);


  if cleaned_name is null
     or length(cleaned_name) = 0
  then
    raise exception
      'Deck name is required';
  end if;


  if length(cleaned_name) > 80
  then
    raise exception
      'Deck name may contain maximum 80 characters';
  end if;


  select
    d.owner_id,
    d.status
  into
    current_owner_id,
    current_status
  from public.decks d
  where d.id = target_deck_id;


  if not found then
    raise exception
      'Deck not found';
  end if;


  if current_owner_id <>
     (select auth.uid())
  then
    raise exception
      'You do not own this deck';
  end if;


  if current_status = 'archived'
  then
    raise exception
      'Archived decks cannot be renamed';
  end if;


  update public.decks
  set
    name = cleaned_name,
    updated_at = now()
  where id = target_deck_id;
end;
$$;


-- =========================================================
-- 3. ARCHIVE DECK
--
-- Active decks mogen niet gearchiveerd worden.
-- Deck cards blijven bestaan voor toekomstige history.
-- =========================================================

create or replace function public.archive_deck(
  target_deck_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner_id uuid;
  current_status public.deck_status;
  current_is_active boolean;
begin

  select
    d.owner_id,
    d.status,
    d.is_active
  into
    current_owner_id,
    current_status,
    current_is_active
  from public.decks d
  where d.id = target_deck_id;


  if not found then
    raise exception
      'Deck not found';
  end if;


  if current_owner_id <>
     (select auth.uid())
  then
    raise exception
      'You do not own this deck';
  end if;


  if current_is_active = true
  then
    raise exception
      'Active deck cannot be archived';
  end if;


  if current_status = 'archived'
  then
    return;
  end if;


  update public.decks
  set
    status = 'archived',
    is_active = false,
    updated_at = now()
  where id = target_deck_id;
end;
$$;


-- =========================================================
-- 4. PERMISSIONS
-- =========================================================

revoke all
on function public.set_deck_status(
  uuid,
  public.deck_status
)
from public;


revoke all
on function public.rename_deck(
  uuid,
  text
)
from public;


revoke all
on function public.archive_deck(
  uuid
)
from public;


grant execute
on function public.set_deck_status(
  uuid,
  public.deck_status
)
to authenticated;


grant execute
on function public.rename_deck(
  uuid,
  text
)
to authenticated;


grant execute
on function public.archive_deck(
  uuid
)
to authenticated;


commit;