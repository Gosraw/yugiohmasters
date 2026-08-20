begin;

-- =========================================================
-- DUELIST CIRCLE - DECK BUILDER
--
-- Regels:
--
-- MAIN DECK
-- - minimum 40 kaarten
-- - maximum 60 kaarten
--
-- EXTRA DECK
-- - maximum 15 kaarten
-- - alleen Fusion + XYZ
--
-- OWNERSHIP
-- - je kunt alleen fysieke card_instances gebruiken
--   die je zelf bezit
-- - locked kaarten mogen niet worden gebruikt
-- - één fysieke kaart kan binnen één deck maar één keer
--   voorkomen
--
-- Een speler kan meerdere decks maken.
-- =========================================================


-- =========================================================
-- 1. DECK STATUS
-- =========================================================

do $$
begin
  create type public.deck_status as enum (
    'draft',
    'ready',
    'archived'
  );
exception
  when duplicate_object then null;
end $$;


-- =========================================================
-- 2. DECK SECTION
-- =========================================================

do $$
begin
  create type public.deck_section as enum (
    'main',
    'extra'
  );
exception
  when duplicate_object then null;
end $$;


-- =========================================================
-- 3. DECKS
-- =========================================================

create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),

  league_id uuid not null
    references public.leagues(id)
    on delete restrict,

  owner_id uuid not null
    references public.profiles(id)
    on delete restrict,

  name text not null,

  description text,

  status public.deck_status
    not null default 'draft',

  is_active boolean
    not null default false,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  constraint decks_name_not_blank
    check (
      length(trim(name)) > 0
    )
);


create index if not exists decks_owner_idx
  on public.decks(
    owner_id,
    created_at desc
  );


create index if not exists decks_league_idx
  on public.decks(
    league_id,
    created_at desc
  );


-- Per speler maximaal één actief deck tegelijk.
create unique index if not exists decks_one_active_per_owner
  on public.decks(
    league_id,
    owner_id
  )
  where is_active = true;


-- =========================================================
-- 4. DECK CARDS
--
-- Iedere rij verwijst naar één echte fysieke card_instance.
-- =========================================================

create table if not exists public.deck_cards (
  id uuid primary key default gen_random_uuid(),

  deck_id uuid not null
    references public.decks(id)
    on delete cascade,

  card_instance_id uuid not null
    references public.card_instances(id)
    on delete restrict,

  section public.deck_section
    not null,

  position integer,

  added_at timestamptz
    not null default now(),

  unique (
    deck_id,
    card_instance_id
  ),

  constraint deck_cards_position_positive
    check (
      position is null
      or position > 0
    )
);


create index if not exists deck_cards_deck_idx
  on public.deck_cards(
    deck_id,
    section,
    position
  );


create index if not exists deck_cards_instance_idx
  on public.deck_cards(
    card_instance_id
  );


-- =========================================================
-- 5. DEFAULT SETTINGS
-- =========================================================

insert into public.settings (
  league_id,
  key,
  value,
  description
)
select
  l.id,
  'deck.main_min',
  '40'::jsonb,
  'Minimum number of cards in a Main Deck'
from public.leagues l
on conflict (
  league_id,
  key
)
do nothing;


insert into public.settings (
  league_id,
  key,
  value,
  description
)
select
  l.id,
  'deck.main_max',
  '60'::jsonb,
  'Maximum number of cards in a Main Deck'
from public.leagues l
on conflict (
  league_id,
  key
)
do nothing;


insert into public.settings (
  league_id,
  key,
  value,
  description
)
select
  l.id,
  'deck.extra_max',
  '15'::jsonb,
  'Maximum number of cards in the Extra Deck'
from public.leagues l
on conflict (
  league_id,
  key
)
do nothing;


-- =========================================================
-- 6. HELPER: GET DECK LIMIT
-- =========================================================

create or replace function public.get_deck_setting(
  target_league_id uuid,
  setting_key text,
  fallback_value integer
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select
        (s.value #>> '{}')::integer
      from public.settings s
      where s.league_id =
          target_league_id
        and s.key =
          setting_key
      limit 1
    ),
    fallback_value
  );
$$;


-- =========================================================
-- 7. VALIDATE DECK OWNER
-- =========================================================

create or replace function public.validate_deck_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_member boolean;
begin

  select exists (
    select 1
    from public.league_members lm
    where lm.league_id =
        new.league_id
      and lm.profile_id =
        new.owner_id
  )
  into is_member;


  if not is_member then
    raise exception
      'Deck owner is not a member of this league';
  end if;


  new.updated_at := now();

  return new;
end;
$$;


drop trigger if exists validate_deck_owner_before_write
  on public.decks;


create trigger validate_deck_owner_before_write
before insert or update
on public.decks
for each row
execute function public.validate_deck_owner();


-- =========================================================
-- 8. PROTECT DECK OWNERSHIP
--
-- Een bestaand deck mag niet ineens van eigenaar
-- of league veranderen.
-- =========================================================

create or replace function public.protect_deck_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin

  if new.league_id <>
     old.league_id
  then
    raise exception
      'Deck league cannot be changed';
  end if;


  if new.owner_id <>
     old.owner_id
  then
    raise exception
      'Deck owner cannot be changed';
  end if;


  new.updated_at :=
    now();

  return new;
end;
$$;


drop trigger if exists protect_deck_identity_before_update
  on public.decks;


create trigger protect_deck_identity_before_update
before update
on public.decks
for each row
execute function public.protect_deck_identity();


-- =========================================================
-- 9. VALIDATE CARD ADDED TO DECK
--
-- Controleert:
--
-- - deck bestaat
-- - card instance bestaat
-- - speler bezit de kaart
-- - kaart zit in dezelfde league
-- - kaart is niet locked
-- - juiste Main / Extra section
-- - Main max 60
-- - Extra max 15
-- =========================================================

create or replace function public.validate_deck_card()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_owner_id uuid;
  target_league_id uuid;

  instance_owner_id uuid;
  instance_league_id uuid;
  instance_locked boolean;

  target_card_type text;
  target_format_eligible boolean;

  current_main_count integer;
  current_extra_count integer;

  main_max integer;
  extra_max integer;
begin

  -- -------------------------------------------------------
  -- Deck ophalen
  -- -------------------------------------------------------

  select
    d.owner_id,
    d.league_id
  into
    target_owner_id,
    target_league_id
  from public.decks d
  where d.id =
    new.deck_id;


  if not found then
    raise exception
      'Deck does not exist';
  end if;


  -- -------------------------------------------------------
  -- Card instance + catalog info ophalen
  -- -------------------------------------------------------

  select
    ci.current_owner_id,
    ci.league_id,
    ci.locked,
    cc.card_type,
    cc.format_eligible
  into
    instance_owner_id,
    instance_league_id,
    instance_locked,
    target_card_type,
    target_format_eligible
  from public.card_instances ci

  join public.card_catalog cc
    on cc.id =
      ci.card_catalog_id

  where ci.id =
    new.card_instance_id;


  if not found then
    raise exception
      'Card instance does not exist';
  end if;


  -- -------------------------------------------------------
  -- Ownership
  -- -------------------------------------------------------

  if instance_owner_id <>
     target_owner_id
  then
    raise exception
      'You do not own this card instance';
  end if;


  if instance_league_id <>
     target_league_id
  then
    raise exception
      'Card instance belongs to another league';
  end if;


  -- -------------------------------------------------------
  -- Locked kaart
  -- -------------------------------------------------------

  if instance_locked = true then
    raise exception
      'Locked cards cannot be added to a deck';
  end if;


  -- -------------------------------------------------------
  -- Format eligibility
  -- -------------------------------------------------------

  if target_format_eligible = false then
    raise exception
      'This card is not legal in the Duelist Circle format';
  end if;


  -- -------------------------------------------------------
  -- Main / Extra classification
  --
  -- Fusion + XYZ moeten naar Extra.
  -- Alles anders moet naar Main.
  -- -------------------------------------------------------

  if (
    lower(target_card_type)
      like '%fusion%monster%'
    or
    lower(target_card_type)
      like '%xyz%monster%'
  )
  then

    if new.section <>
       'extra'
    then
      raise exception
        'Fusion and XYZ Monsters must be placed in the Extra Deck';
    end if;

  else

    if new.section <>
       'main'
    then
      raise exception
        'Only Fusion and XYZ Monsters may be placed in the Extra Deck';
    end if;

  end if;


  -- -------------------------------------------------------
  -- Settings
  -- -------------------------------------------------------

  main_max :=
    public.get_deck_setting(
      target_league_id,
      'deck.main_max',
      60
    );


  extra_max :=
    public.get_deck_setting(
      target_league_id,
      'deck.extra_max',
      15
    );


  -- -------------------------------------------------------
  -- Current counts
  --
  -- Bij update moet huidige rij niet dubbel tellen.
  -- -------------------------------------------------------

  select count(*)
  into current_main_count
  from public.deck_cards dc
  where dc.deck_id =
      new.deck_id
    and dc.section =
      'main'
    and (
      tg_op = 'INSERT'
      or dc.id <> new.id
    );


  select count(*)
  into current_extra_count
  from public.deck_cards dc
  where dc.deck_id =
      new.deck_id
    and dc.section =
      'extra'
    and (
      tg_op = 'INSERT'
      or dc.id <> new.id
    );


  -- -------------------------------------------------------
  -- Max limits
  -- -------------------------------------------------------

  if new.section =
     'main'
     and current_main_count >=
       main_max
  then
    raise exception
      'Main Deck is full. Maximum: %',
      main_max;
  end if;


  if new.section =
     'extra'
     and current_extra_count >=
       extra_max
  then
    raise exception
      'Extra Deck is full. Maximum: %',
      extra_max;
  end if;


  return new;
end;
$$;


drop trigger if exists validate_deck_card_before_write
  on public.deck_cards;


create trigger validate_deck_card_before_write
before insert or update
on public.deck_cards
for each row
execute function public.validate_deck_card();


-- =========================================================
-- 10. VALIDATE READY DECK
--
-- Als status naar READY gaat:
--
-- Main moet minimaal 40 kaarten hebben.
-- Main maximaal 60.
-- Extra maximaal 15.
-- =========================================================

create or replace function public.validate_ready_deck()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  main_count integer;
  extra_count integer;

  main_min integer;
  main_max integer;
  extra_max integer;
begin

  if new.status <>
     'ready'
  then
    return new;
  end if;


  select count(*)
  into main_count
  from public.deck_cards dc
  where dc.deck_id =
      new.id
    and dc.section =
      'main';


  select count(*)
  into extra_count
  from public.deck_cards dc
  where dc.deck_id =
      new.id
    and dc.section =
      'extra';


  main_min :=
    public.get_deck_setting(
      new.league_id,
      'deck.main_min',
      40
    );


  main_max :=
    public.get_deck_setting(
      new.league_id,
      'deck.main_max',
      60
    );


  extra_max :=
    public.get_deck_setting(
      new.league_id,
      'deck.extra_max',
      15
    );


  if main_count <
     main_min
  then
    raise exception
      'Main Deck needs at least % cards. Current: %',
      main_min,
      main_count;
  end if;


  if main_count >
     main_max
  then
    raise exception
      'Main Deck may contain maximum % cards. Current: %',
      main_max,
      main_count;
  end if;


  if extra_count >
     extra_max
  then
    raise exception
      'Extra Deck may contain maximum % cards. Current: %',
      extra_max,
      extra_count;
  end if;


  return new;
end;
$$;


drop trigger if exists validate_ready_deck_before_update
  on public.decks;


create trigger validate_ready_deck_before_update
before update of status
on public.decks
for each row
execute function public.validate_ready_deck();


-- =========================================================
-- 11. CREATE DECK FUNCTION
-- =========================================================

create or replace function public.create_deck(
  target_league_id uuid,
  deck_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_deck_id uuid;
begin

  if not public.is_league_member(
    target_league_id
  )
  then
    raise exception
      'You are not a member of this league';
  end if;


  if deck_name is null
     or length(
       trim(deck_name)
     ) = 0
  then
    raise exception
      'Deck name is required';
  end if;


  insert into public.decks (
    league_id,
    owner_id,
    name,
    status
  )
  values (
    target_league_id,
    (select auth.uid()),
    trim(deck_name),
    'draft'
  )
  returning id
  into new_deck_id;


  return new_deck_id;
end;
$$;


-- =========================================================
-- 12. ADD CARD TO DECK FUNCTION
-- =========================================================

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


-- =========================================================
-- 13. REMOVE CARD FROM DECK FUNCTION
-- =========================================================

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


  delete from public.deck_cards
  where id =
    target_deck_card_id;
end;
$$;


-- =========================================================
-- 14. SET ACTIVE DECK
-- =========================================================

create or replace function public.set_active_deck(
  target_deck_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_owner_id uuid;
  target_league_id uuid;
  target_status public.deck_status;
begin

  select
    d.owner_id,
    d.league_id,
    d.status

  into
    target_owner_id,
    target_league_id,
    target_status

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


  if target_status <>
     'ready'
  then
    raise exception
      'Only a ready deck can be activated';
  end if;


  update public.decks
  set
    is_active = false,
    updated_at = now()

  where league_id =
      target_league_id

    and owner_id =
      target_owner_id

    and is_active =
      true;


  update public.decks
  set
    is_active = true,
    updated_at = now()

  where id =
    target_deck_id;
end;
$$;


-- =========================================================
-- 15. RLS
-- =========================================================

alter table public.decks
  enable row level security;

alter table public.deck_cards
  enable row level security;


-- ---------------------------------------------------------
-- Decks:
-- league members mogen decks binnen dezelfde league zien.
-- ---------------------------------------------------------

drop policy if exists decks_read_league
  on public.decks;


create policy decks_read_league
on public.decks
for select
to authenticated
using (
  public.is_league_member(
    league_id
  )
);


-- ---------------------------------------------------------
-- Deck cards:
-- league members mogen kaarten in league-decks zien.
-- ---------------------------------------------------------

drop policy if exists deck_cards_read_league
  on public.deck_cards;


create policy deck_cards_read_league
on public.deck_cards
for select
to authenticated
using (
  exists (
    select 1
    from public.decks d
    where d.id =
        deck_id
      and public.is_league_member(
        d.league_id
      )
  )
);


-- =========================================================
-- 16. DIRECT MUTATIONS BLOKKEREN
--
-- Alle wijzigingen lopen via gecontroleerde functies.
-- =========================================================

revoke insert, update, delete
on public.decks
from authenticated;


revoke insert, update, delete
on public.deck_cards
from authenticated;


grant select
on public.decks
to authenticated;


grant select
on public.deck_cards
to authenticated;


grant execute
on function public.create_deck(
  uuid,
  text
)
to authenticated;


grant execute
on function public.add_card_to_deck(
  uuid,
  uuid
)
to authenticated;


grant execute
on function public.remove_card_from_deck(
  uuid
)
to authenticated;


grant execute
on function public.set_active_deck(
  uuid
)
to authenticated;


commit;