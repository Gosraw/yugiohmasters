begin;

-- =========================================================
-- DUELIST CIRCLE - CARD INSTANCES
--
-- Iedere kaart die echt in bezit is, krijgt een eigen record.
--
-- Scarcity:
-- Normal t/m Secret Rare = maximaal 3 exemplaren per league.
-- Legendary             = maximaal 1 exemplaar per league.
--
-- Voorbeeld:
-- Jinzo #1
-- Jinzo #2
-- Jinzo #3
--
-- Een vierde Jinzo kan niet worden aangemaakt.
--
-- Legendary:
-- Pot of Greed #1
--
-- Als Pot of Greed Legendary is, bestaat er maximaal één.
-- =========================================================


-- ---------------------------------------------------------
-- ACQUISITION TYPE
-- ---------------------------------------------------------

do $$
begin
  create type public.card_acquisition_type as enum (
    'draft',
    'shop',
    'trade',
    'tournament',
    'achievement',
    'reward',
    'wager',
    'admin',
    'development',
    'other'
  );
exception
  when duplicate_object then null;
end $$;


-- ---------------------------------------------------------
-- CARD INSTANCE
-- ---------------------------------------------------------

create table if not exists public.card_instances (
  id uuid primary key default gen_random_uuid(),

  league_id uuid not null
    references public.leagues(id)
    on delete restrict,

  card_catalog_id uuid not null
    references public.card_catalog(id)
    on delete restrict,

  -- 1, 2 of 3.
  -- Legendary mag alleen nummer 1 hebben.
  copy_number smallint not null,

  current_owner_id uuid not null
    references public.profiles(id)
    on delete restrict,

  original_owner_id uuid not null
    references public.profiles(id)
    on delete restrict,

  original_acquisition_type public.card_acquisition_type not null,

  -- ID van bijvoorbeeld draft, purchase, tournament, etc.
  -- Mag voorlopig null zijn omdat die systemen later gebouwd worden.
  original_source_id uuid,

  acquired_at timestamptz not null default now(),

  -- Voor toekomstige trade/wager asset locking.
  locked boolean not null default false,
  lock_type text,
  lock_reference_id uuid,
  locked_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint card_instances_copy_number_valid
    check (
      copy_number >= 1
      and copy_number <= 3
    ),

  constraint card_instances_lock_consistency
    check (
      (
        locked = false
        and lock_type is null
        and lock_reference_id is null
        and locked_at is null
      )
      or
      (
        locked = true
        and lock_type is not null
        and lock_reference_id is not null
        and locked_at is not null
      )
    ),

  unique (
    league_id,
    card_catalog_id,
    copy_number
  )
);


create index if not exists card_instances_owner_idx
  on public.card_instances(current_owner_id);

create index if not exists card_instances_league_idx
  on public.card_instances(league_id);

create index if not exists card_instances_catalog_idx
  on public.card_instances(card_catalog_id);

create index if not exists card_instances_locked_idx
  on public.card_instances(league_id, locked)
  where locked = true;


-- ---------------------------------------------------------
-- OWNERSHIP HISTORY
--
-- Hierdoor kunnen we later bijvoorbeeld tonen:
--
-- Jinzo #2
-- Draft → Player A
-- Trade → Player B
-- Wager → Player C
-- ---------------------------------------------------------

create table if not exists public.ownership_history (
  id bigint generated always as identity primary key,

  card_instance_id uuid not null
    references public.card_instances(id)
    on delete restrict,

  league_id uuid not null
    references public.leagues(id)
    on delete restrict,

  from_owner_id uuid
    references public.profiles(id)
    on delete restrict,

  to_owner_id uuid not null
    references public.profiles(id)
    on delete restrict,

  event_type text not null,

  source_id uuid,

  created_at timestamptz not null default now(),

  constraint ownership_history_event_not_blank
    check (
      length(trim(event_type)) > 0
    )
);


create index if not exists ownership_history_card_idx
  on public.ownership_history(
    card_instance_id,
    created_at
  );

create index if not exists ownership_history_owner_idx
  on public.ownership_history(
    to_owner_id,
    created_at
  );


-- ---------------------------------------------------------
-- SCARCITY + OWNERSHIP VALIDATION
--
-- Deze trigger is belangrijk.
--
-- Hij voorkomt ook bij twee gelijktijdige acties:
-- - een 4e normale kaart
-- - een 2e Legendary
--
-- De database lockt hiervoor tijdelijk de cataloguskaart.
-- ---------------------------------------------------------

create or replace function public.validate_new_card_instance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  card_rarity text;
  allowed_copies integer;
  existing_copies integer;
  owner_is_member boolean;
begin

  -- Lock de specifieke cataloguskaart.
  -- Daardoor kunnen twee transacties niet tegelijk
  -- per ongeluk dezelfde scarcity-slot gebruiken.
  perform 1
  from public.card_catalog
  where id = new.card_catalog_id
  for update;

  if not found then
    raise exception 'Card catalog entry does not exist';
  end if;


  select game_rarity
  into card_rarity
  from public.card_catalog
  where id = new.card_catalog_id;


  -- Legendary bestaat maar één keer.
  if card_rarity = 'Legendary' then
    allowed_copies := 1;
  else
    allowed_copies := 3;
  end if;


  select count(*)
  into existing_copies
  from public.card_instances
  where league_id = new.league_id
    and card_catalog_id = new.card_catalog_id;


  if existing_copies >= allowed_copies then
    raise exception
      'Card scarcity limit reached. Rarity: %, maximum copies: %',
      coalesce(card_rarity, 'Not Rated'),
      allowed_copies;
  end if;


  -- Automatisch het eerstvolgende kaartnummer kiezen.
  --
  -- Normaal:
  -- #1 → #2 → #3
  --
  -- Legendary:
  -- alleen #1
  if new.copy_number is null or new.copy_number <= 0 then
    select coalesce(max(copy_number), 0) + 1
    into new.copy_number
    from public.card_instances
    where league_id = new.league_id
      and card_catalog_id = new.card_catalog_id;
  end if;


  if new.copy_number > allowed_copies then
    raise exception
      'Invalid copy number. Rarity % allows maximum copy number %',
      coalesce(card_rarity, 'Not Rated'),
      allowed_copies;
  end if;


  -- Huidige eigenaar moet lid zijn van deze league.
  select exists (
    select 1
    from public.league_members
    where league_id = new.league_id
      and profile_id = new.current_owner_id
  )
  into owner_is_member;

  if not owner_is_member then
    raise exception
      'Current owner is not a member of this league';
  end if;


  -- Originele eigenaar moet ook league member zijn.
  select exists (
    select 1
    from public.league_members
    where league_id = new.league_id
      and profile_id = new.original_owner_id
  )
  into owner_is_member;

  if not owner_is_member then
    raise exception
      'Original owner is not a member of this league';
  end if;


  new.updated_at := now();

  return new;
end;
$$;


drop trigger if exists validate_card_instance_before_insert
  on public.card_instances;

create trigger validate_card_instance_before_insert
before insert on public.card_instances
for each row
execute function public.validate_new_card_instance();


-- ---------------------------------------------------------
-- IMMUTABLE IDENTITY
--
-- Een eenmaal bestaande kaart mag nooit veranderen van:
--
-- Jinzo #2
--
-- naar:
--
-- Raigeki #1
--
-- Alleen de eigenaar en lock-status mogen later veranderen.
-- ---------------------------------------------------------

create or replace function public.protect_card_instance_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin

  if new.league_id <> old.league_id then
    raise exception
      'Card instance league cannot be changed';
  end if;

  if new.card_catalog_id <> old.card_catalog_id then
    raise exception
      'Card instance card identity cannot be changed';
  end if;

  if new.copy_number <> old.copy_number then
    raise exception
      'Card instance copy number cannot be changed';
  end if;

  if new.original_owner_id <> old.original_owner_id then
    raise exception
      'Original owner cannot be changed';
  end if;

  if new.original_acquisition_type <> old.original_acquisition_type then
    raise exception
      'Original acquisition type cannot be changed';
  end if;

  new.updated_at := now();

  return new;
end;
$$;


drop trigger if exists protect_card_instance_before_update
  on public.card_instances;

create trigger protect_card_instance_before_update
before update on public.card_instances
for each row
execute function public.protect_card_instance_identity();


-- ---------------------------------------------------------
-- AUTOMATIC OWNERSHIP HISTORY
-- ---------------------------------------------------------

create or replace function public.record_card_ownership_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin

  if tg_op = 'INSERT' then

    insert into public.ownership_history (
      card_instance_id,
      league_id,
      from_owner_id,
      to_owner_id,
      event_type,
      source_id
    )
    values (
      new.id,
      new.league_id,
      null,
      new.current_owner_id,
      'acquired:' || new.original_acquisition_type::text,
      new.original_source_id
    );

  elsif tg_op = 'UPDATE'
    and new.current_owner_id is distinct from old.current_owner_id
  then

    insert into public.ownership_history (
      card_instance_id,
      league_id,
      from_owner_id,
      to_owner_id,
      event_type,
      source_id
    )
    values (
      new.id,
      new.league_id,
      old.current_owner_id,
      new.current_owner_id,
      'ownership_transfer',
      null
    );

  end if;

  return new;
end;
$$;


drop trigger if exists card_instance_history_after_insert
  on public.card_instances;

create trigger card_instance_history_after_insert
after insert on public.card_instances
for each row
execute function public.record_card_ownership_history();


drop trigger if exists card_instance_history_after_owner_change
  on public.card_instances;

create trigger card_instance_history_after_owner_change
after update of current_owner_id
on public.card_instances
for each row
when (
  old.current_owner_id is distinct from new.current_owner_id
)
execute function public.record_card_ownership_history();


-- ---------------------------------------------------------
-- GEEN DELETE
--
-- Een bestaande kaart verdwijnt niet zomaar uit de wereld.
--
-- Trading = owner wijzigen.
-- Wager   = owner wijzigen.
--
-- Daardoor blijft de schaarste betrouwbaar.
-- ---------------------------------------------------------

create or replace function public.prevent_card_instance_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception
    'Card instances cannot be deleted. Transfer ownership instead.';
end;
$$;


drop trigger if exists prevent_card_instance_delete_trigger
  on public.card_instances;

create trigger prevent_card_instance_delete_trigger
before delete on public.card_instances
for each row
execute function public.prevent_card_instance_delete();


-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------

alter table public.card_instances
  enable row level security;

alter table public.ownership_history
  enable row level security;


-- League members mogen card instances bekijken.
-- Dit is later nodig voor collections/trading.

drop policy if exists card_instances_read_league
  on public.card_instances;

create policy card_instances_read_league
on public.card_instances
for select
to authenticated
using (
  public.is_league_member(league_id)
);


-- Ownership history is ook zichtbaar voor league members.

drop policy if exists ownership_history_read_league
  on public.ownership_history;

create policy ownership_history_read_league
on public.ownership_history
for select
to authenticated
using (
  public.is_league_member(league_id)
);


-- ---------------------------------------------------------
-- KRITIEKE MUTATIES NIET VANUIT DE BROWSER
--
-- Draft / Shop / Rewards / Trading gaan later via
-- gecontroleerde server-side transacties.
--
-- Een speler kan dus niet vanuit de browser zeggen:
-- "geef mij 3 Legendary kaarten".
-- ---------------------------------------------------------

revoke insert, update, delete
on public.card_instances
from authenticated;

revoke insert, update, delete
on public.ownership_history
from authenticated;


grant select
on public.card_instances
to authenticated;

grant select
on public.ownership_history
to authenticated;


commit;