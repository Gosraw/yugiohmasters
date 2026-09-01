begin;

-- =========================================================
-- DUELIST CIRCLE - WISHLIST (P0E)
--
-- A simple "interest signal" table, deliberately modeled on the
-- existing card_instances.for_trade pattern (Part 2 of
-- 202608220019_collection_deck_trading_pass.sql): pure signalling,
-- no reservation, no scarcity interaction.
--
-- A player can WISH any catalog card (not a specific physical
-- copy - copy_number doesn't matter for "I want one of these").
-- One wish per player per card, enforced by a unique constraint.
--
-- Surfaces:
-- - Card detail page: WANTED BY (who in the league wishes for
--   this card).
-- - Collection page: WANTED FROM YOU (cards the viewer owns that
--   someone else in the league wishes for).
-- =========================================================

create table if not exists public.card_wishlist_items (
  id uuid primary key default gen_random_uuid(),

  profile_id uuid not null
    references public.profiles(id)
    on delete cascade,

  card_catalog_id uuid not null
    references public.card_catalog(id)
    on delete cascade,

  -- Scoped to the league the player was in when they wished the
  -- card, exactly like card_instances is scoped - keeps this
  -- consistent if a second league ever exists.
  league_id uuid not null
    references public.leagues(id)
    on delete cascade,

  created_at timestamptz not null default now(),

  unique (
    profile_id,
    card_catalog_id
  )
);

create index if not exists card_wishlist_items_card_idx
  on public.card_wishlist_items(card_catalog_id);

create index if not exists card_wishlist_items_league_idx
  on public.card_wishlist_items(league_id);

create index if not exists card_wishlist_items_profile_idx
  on public.card_wishlist_items(profile_id);


-- ---------------------------------------------------------
-- RLS
--
-- Read: any league member can see who wants what (this is a low
-- stakes, 3 player league - visibility is the whole point of the
-- feature, same call as League Ownership in P0D).
--
-- Write: never directly from the browser. Always through
-- toggle_card_wishlist() below, exactly like set_card_for_trade,
-- so the league_id is always derived server-side and the unique
-- constraint can't be raced around.
-- ---------------------------------------------------------

alter table public.card_wishlist_items
  enable row level security;

drop policy if exists card_wishlist_items_read_league
  on public.card_wishlist_items;

create policy card_wishlist_items_read_league
on public.card_wishlist_items
for select
to authenticated
using (
  public.is_league_member(league_id)
);

revoke insert, update, delete
on public.card_wishlist_items
from authenticated;

grant select
on public.card_wishlist_items
to authenticated;


-- ---------------------------------------------------------
-- TOGGLE
--
-- Idempotent-ish by nature (it's a toggle): wishing an
-- already-wished card un-wishes it. Returns the new state so the
-- caller doesn't need a second round trip.
-- ---------------------------------------------------------

create or replace function public.toggle_card_wishlist(
  target_card_catalog_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  caller_league_id uuid;
  already_wished boolean;
begin

  current_user_id :=
    (select auth.uid());

  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select league_id
  into caller_league_id
  from public.league_members
  where profile_id = current_user_id
  limit 1;

  if caller_league_id is null then
    raise exception 'You are not a member of any league';
  end if;

  if not exists (
    select 1
    from public.card_catalog
    where id = target_card_catalog_id
  ) then
    raise exception 'Card does not exist';
  end if;

  select exists (
    select 1
    from public.card_wishlist_items
    where profile_id = current_user_id
      and card_catalog_id = target_card_catalog_id
  )
  into already_wished;

  if already_wished then

    delete from public.card_wishlist_items
    where profile_id = current_user_id
      and card_catalog_id = target_card_catalog_id;

    return false;

  else

    insert into public.card_wishlist_items (
      profile_id,
      card_catalog_id,
      league_id
    )
    values (
      current_user_id,
      target_card_catalog_id,
      caller_league_id
    )
    on conflict (profile_id, card_catalog_id) do nothing;

    return true;

  end if;
end;
$$;

revoke all
on function public.toggle_card_wishlist(uuid)
from public;

grant execute
on function public.toggle_card_wishlist(uuid)
to authenticated;

commit;
