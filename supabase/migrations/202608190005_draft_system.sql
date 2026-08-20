begin;

-- =========================================================
-- DUELIST CIRCLE - INITIAL DRAFT SYSTEM
--
-- Regels:
--
-- 60 Main Pool picks per speler
-- 2 XYZ picks per speler
-- Iedere pick = keuze uit 3 kaarten
--
-- Main Pool:
-- - Monster
-- - Fusion
-- - Ritual
-- - Spell
-- - Trap
-- - GEEN XYZ
--
-- XYZ Pool:
-- - uitsluitend XYZ Monsters
--
-- Volledig uitgesloten:
-- - Synchro
-- - Pendulum
-- - Link
-- - Skill Cards
-- - Tokens
--
-- Scarcity:
-- Normal t/m Secret Rare = max 3 per league
-- Legendary = max 1 per league
--
-- Rarity default weights:
-- Normal       42%
-- Rare         28%
-- Super Rare   17%
-- Ultra Rare    8%
-- Secret Rare   4%
-- Legendary     1%
--
-- Alles wordt database-side gecontroleerd.
-- =========================================================


-- =========================================================
-- 1. FORMAT ELIGIBILITY
-- =========================================================

alter table public.card_catalog
  add column if not exists format_eligible boolean
    not null default true,
  add column if not exists format_exclusion_reason text;


-- Eerst alles opnieuw toestaan.
update public.card_catalog
set
  format_eligible = true,
  format_exclusion_reason = null;


-- Synchro volledig uitsluiten.
update public.card_catalog
set
  format_eligible = false,
  format_exclusion_reason = 'Synchro is disabled in Duelist Circle'
where lower(card_type) like '%synchro%';


-- Pendulum volledig uitsluiten.
update public.card_catalog
set
  format_eligible = false,
  format_exclusion_reason = 'Pendulum is disabled in Duelist Circle'
where lower(card_type) like '%pendulum%';


-- Link volledig uitsluiten.
update public.card_catalog
set
  format_eligible = false,
  format_exclusion_reason = 'Link is disabled in Duelist Circle'
where lower(card_type) like '%link%';


-- Skill Cards zijn geen normale speelkaarten.
update public.card_catalog
set
  format_eligible = false,
  format_exclusion_reason = 'Skill Cards are disabled in Duelist Circle'
where lower(card_type) like '%skill%';


-- Tokens worden niet als bezit gedraft.
update public.card_catalog
set
  format_eligible = false,
  format_exclusion_reason = 'Tokens are not collectible draft cards'
where lower(card_type) like '%token%';


create index if not exists card_catalog_format_eligible_idx
  on public.card_catalog(format_eligible)
  where format_eligible = true;


-- =========================================================
-- 2. CENTRALISEER SCARCITY
-- =========================================================

create or replace function public.card_copy_limit(
  target_card_id uuid
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when c.game_rarity = 'Legendary'
        then 1
      else 3
    end
  from public.card_catalog c
  where c.id = target_card_id;
$$;


-- Bestaande card-instance validator vervangen zodat
-- alle systemen dezelfde scarcity-regel gebruiken.

create or replace function public.validate_new_card_instance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed_copies integer;
  existing_copies integer;
  owner_is_member boolean;
begin

  -- Serialize creatie van dezelfde kaart.
  perform 1
  from public.card_catalog
  where id = new.card_catalog_id
  for update;

  if not found then
    raise exception 'Card catalog entry does not exist';
  end if;


  allowed_copies :=
    public.card_copy_limit(
      new.card_catalog_id
    );


  if allowed_copies is null then
    raise exception 'Unable to determine card copy limit';
  end if;


  select count(*)
  into existing_copies
  from public.card_instances
  where league_id = new.league_id
    and card_catalog_id = new.card_catalog_id;


  if existing_copies >= allowed_copies then
    raise exception
      'Card scarcity limit reached. Maximum copies: %',
      allowed_copies;
  end if;


  -- Automatisch eerstvolgende copy number.
  if new.copy_number is null
     or new.copy_number <= 0
  then

    select
      coalesce(max(copy_number), 0) + 1
    into new.copy_number
    from public.card_instances
    where league_id = new.league_id
      and card_catalog_id = new.card_catalog_id;

  end if;


  if new.copy_number > allowed_copies then
    raise exception
      'Invalid copy number. Maximum is %',
      allowed_copies;
  end if;


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


-- =========================================================
-- 3. DRAFT ENUMS
-- =========================================================

do $$
begin
  create type public.draft_status as enum (
    'setup',
    'active',
    'completed',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;


do $$
begin
  create type public.draft_player_status as enum (
    'waiting',
    'drafting',
    'completed'
  );
exception
  when duplicate_object then null;
end $$;


do $$
begin
  create type public.draft_phase as enum (
    'main',
    'xyz'
  );
exception
  when duplicate_object then null;
end $$;


do $$
begin
  create type public.draft_offer_status as enum (
    'active',
    'picked',
    'expired'
  );
exception
  when duplicate_object then null;
end $$;


do $$
begin
  create type public.draft_option_status as enum (
    'available',
    'selected',
    'released'
  );
exception
  when duplicate_object then null;
end $$;


-- =========================================================
-- 4. DRAFT SESSION
-- =========================================================

create table if not exists public.drafts (
  id uuid primary key default gen_random_uuid(),

  league_id uuid not null
    references public.leagues(id)
    on delete restrict,

  name text not null,

  status public.draft_status
    not null default 'setup',

  created_by uuid not null
    references public.profiles(id)
    on delete restrict,

  main_picks_per_player integer
    not null default 60,

  xyz_picks_per_player integer
    not null default 2,

  options_per_pick integer
    not null default 3,

  created_at timestamptz
    not null default now(),

  started_at timestamptz,

  completed_at timestamptz,

  constraint draft_main_picks_positive
    check (
      main_picks_per_player > 0
    ),

  constraint draft_xyz_picks_nonnegative
    check (
      xyz_picks_per_player >= 0
    ),

  constraint draft_options_valid
    check (
      options_per_pick >= 2
      and options_per_pick <= 5
    )
);


create index if not exists drafts_league_idx
  on public.drafts(
    league_id,
    created_at desc
  );


-- =========================================================
-- 5. DRAFT PLAYERS
-- =========================================================

create table if not exists public.draft_players (
  id uuid primary key default gen_random_uuid(),

  draft_id uuid not null
    references public.drafts(id)
    on delete restrict,

  profile_id uuid not null
    references public.profiles(id)
    on delete restrict,

  status public.draft_player_status
    not null default 'waiting',

  main_picks_completed integer
    not null default 0,

  xyz_picks_completed integer
    not null default 0,

  joined_at timestamptz
    not null default now(),

  completed_at timestamptz,

  unique (
    draft_id,
    profile_id
  ),

  constraint draft_player_main_picks_nonnegative
    check (
      main_picks_completed >= 0
    ),

  constraint draft_player_xyz_picks_nonnegative
    check (
      xyz_picks_completed >= 0
    )
);


create index if not exists draft_players_profile_idx
  on public.draft_players(profile_id);


-- =========================================================
-- 6. DRAFT OFFERS
--
-- Iedere pick krijgt één offer.
-- Een offer bevat standaard 3 kaartopties.
-- =========================================================

create table if not exists public.draft_offers (
  id uuid primary key default gen_random_uuid(),

  draft_player_id uuid not null
    references public.draft_players(id)
    on delete restrict,

  pick_number integer not null,

  phase_pick_number integer not null,

  phase public.draft_phase not null,

  status public.draft_offer_status
    not null default 'active',

  created_at timestamptz
    not null default now(),

  picked_at timestamptz,

  unique (
    draft_player_id,
    pick_number
  ),

  constraint draft_offer_pick_positive
    check (
      pick_number > 0
      and phase_pick_number > 0
    )
);


-- Per speler maximaal één actieve keuze tegelijk.
create unique index if not exists
  draft_one_active_offer_per_player
on public.draft_offers(draft_player_id)
where status = 'active';


-- =========================================================
-- 7. DE 3 KAARTEN BINNEN EEN OFFER
-- =========================================================

create table if not exists public.draft_offer_cards (
  id uuid primary key default gen_random_uuid(),

  offer_id uuid not null
    references public.draft_offers(id)
    on delete restrict,

  card_catalog_id uuid not null
    references public.card_catalog(id)
    on delete restrict,

  display_order smallint not null,

  status public.draft_option_status
    not null default 'available',

  created_at timestamptz
    not null default now(),

  unique (
    offer_id,
    card_catalog_id
  ),

  unique (
    offer_id,
    display_order
  ),

  constraint draft_option_display_order_positive
    check (
      display_order > 0
    )
);


create index if not exists
  draft_offer_cards_card_idx
on public.draft_offer_cards(card_catalog_id);


-- =========================================================
-- 8. DEFINITIEVE PICKS
-- =========================================================

create table if not exists public.draft_picks (
  id uuid primary key default gen_random_uuid(),

  draft_id uuid not null
    references public.drafts(id)
    on delete restrict,

  draft_player_id uuid not null
    references public.draft_players(id)
    on delete restrict,

  offer_id uuid not null unique
    references public.draft_offers(id)
    on delete restrict,

  card_catalog_id uuid not null
    references public.card_catalog(id)
    on delete restrict,

  card_instance_id uuid not null unique
    references public.card_instances(id)
    on delete restrict,

  phase public.draft_phase not null,

  pick_number integer not null,

  phase_pick_number integer not null,

  created_at timestamptz
    not null default now(),

  unique (
    draft_player_id,
    pick_number
  )
);


create index if not exists draft_picks_draft_idx
  on public.draft_picks(
    draft_id,
    created_at
  );


-- =========================================================
-- 9. DEFAULT DRAFT SETTINGS
-- =========================================================

insert into public.settings (
  league_id,
  key,
  value,
  description
)
select
  l.id,
  'draft.initial_main_picks',
  '60'::jsonb,
  'Initial draft Main Pool picks per player'
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
  'draft.initial_xyz_picks',
  '2'::jsonb,
  'Initial XYZ-only picks per player'
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
  'draft.options_per_pick',
  '3'::jsonb,
  'Number of card choices shown per pick'
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
  'draft.rarity_weights',
  '{
    "Normal": 42,
    "Rare": 28,
    "Super Rare": 17,
    "Ultra Rare": 8,
    "Secret Rare": 4,
    "Legendary": 1
  }'::jsonb,
  'Weighted rarity distribution for Draft'
from public.leagues l
on conflict (
  league_id,
  key
)
do nothing;


-- =========================================================
-- 10. DRAFT ACCESS HELPER
-- =========================================================

create or replace function public.can_access_draft_player(
  target_draft_player_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (

    select 1
    from public.draft_players dp

    join public.drafts d
      on d.id = dp.draft_id

    where dp.id =
      target_draft_player_id

      and (
        dp.profile_id =
          (select auth.uid())

        or public.is_league_admin(
          d.league_id
        )
      )

  );
$$;


-- =========================================================
-- 11. START INITIAL DRAFT
--
-- Admin maakt draft aan en kiest deelnemers.
-- =========================================================

create or replace function public.start_initial_draft(
  target_league_id uuid,
  draft_name text,
  participant_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_draft_id uuid;
  participant_id uuid;

  configured_main integer := 60;
  configured_xyz integer := 2;
  configured_options integer := 3;
begin

  if not public.is_league_admin(
    target_league_id
  ) then
    raise exception
      'Only league admins can start a draft';
  end if;


  if participant_ids is null
     or array_length(
       participant_ids,
       1
     ) is null
  then
    raise exception
      'At least one participant is required';
  end if;


  if array_length(
    participant_ids,
    1
  ) > 3
  then
    raise exception
      'This private league supports maximum 3 draft players';
  end if;


  select
    coalesce(
      (value #>> '{}')::integer,
      60
    )
  into configured_main
  from public.settings
  where league_id =
      target_league_id
    and key =
      'draft.initial_main_picks';


  configured_main :=
    coalesce(
      configured_main,
      60
    );


  select
    coalesce(
      (value #>> '{}')::integer,
      2
    )
  into configured_xyz
  from public.settings
  where league_id =
      target_league_id
    and key =
      'draft.initial_xyz_picks';


  configured_xyz :=
    coalesce(
      configured_xyz,
      2
    );


  select
    coalesce(
      (value #>> '{}')::integer,
      3
    )
  into configured_options
  from public.settings
  where league_id =
      target_league_id
    and key =
      'draft.options_per_pick';


  configured_options :=
    coalesce(
      configured_options,
      3
    );


  insert into public.drafts (
    league_id,
    name,
    status,
    created_by,
    main_picks_per_player,
    xyz_picks_per_player,
    options_per_pick,
    started_at
  )
  values (
    target_league_id,
    draft_name,
    'active',
    (select auth.uid()),
    configured_main,
    configured_xyz,
    configured_options,
    now()
  )
  returning id
  into new_draft_id;


  foreach participant_id
    in array participant_ids
  loop

    if not exists (
      select 1
      from public.league_members
      where league_id =
          target_league_id
        and profile_id =
          participant_id
    )
    then
      raise exception
        'Draft participant is not a league member';
    end if;


    insert into public.draft_players (
      draft_id,
      profile_id,
      status
    )
    values (
      new_draft_id,
      participant_id,
      'drafting'
    );

  end loop;


  return new_draft_id;
end;
$$;


-- =========================================================
-- 12. CREATE NEXT 3-CARD OFFER
-- =========================================================

create or replace function public.create_next_draft_offer(
  target_draft_player_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_profile_id uuid;
  target_draft_id uuid;
  target_league_id uuid;

  completed_main integer;
  completed_xyz integer;

  required_main integer;
  required_xyz integer;
  option_count integer;

  current_phase public.draft_phase;

  absolute_pick integer;
  phase_pick integer;

  new_offer_id uuid;
  existing_offer_id uuid;

  chosen_card_id uuid;
  option_index integer;

  rarity_weights jsonb;
begin

  -- Lock draft-player progress.
  select
    dp.profile_id,
    dp.draft_id,
    dp.main_picks_completed,
    dp.xyz_picks_completed,
    d.league_id,
    d.main_picks_per_player,
    d.xyz_picks_per_player,
    d.options_per_pick
  into
    player_profile_id,
    target_draft_id,
    completed_main,
    completed_xyz,
    target_league_id,
    required_main,
    required_xyz,
    option_count
  from public.draft_players dp
  join public.drafts d
    on d.id = dp.draft_id
  where dp.id =
    target_draft_player_id
    and d.status = 'active'
  for update of dp;


  if not found then
    raise exception
      'Active draft player not found';
  end if;


  if player_profile_id <>
     (select auth.uid())
     and not public.is_league_admin(
       target_league_id
     )
  then
    raise exception
      'Unauthorized draft access';
  end if;


  -- Refresh geeft dezelfde actieve keuze terug.
  select id
  into existing_offer_id
  from public.draft_offers
  where draft_player_id =
      target_draft_player_id
    and status = 'active'
  limit 1;


  if existing_offer_id is not null then
    return existing_offer_id;
  end if;


  -- Eerst 60 Main picks.
  if completed_main < required_main then

    current_phase := 'main';

    phase_pick :=
      completed_main + 1;

    absolute_pick :=
      phase_pick;


  -- Daarna 2 XYZ picks.
  elsif completed_xyz < required_xyz then

    current_phase := 'xyz';

    phase_pick :=
      completed_xyz + 1;

    absolute_pick :=
      required_main
      + phase_pick;


  else

    update public.draft_players
    set
      status = 'completed',
      completed_at =
        coalesce(
          completed_at,
          now()
        )
    where id =
      target_draft_player_id;


    raise exception
      'Draft already completed';

  end if;


  select value
  into rarity_weights
  from public.settings
  where league_id =
      target_league_id
    and key =
      'draft.rarity_weights';


  rarity_weights :=
    coalesce(
      rarity_weights,
      '{
        "Normal": 42,
        "Rare": 28,
        "Super Rare": 17,
        "Ultra Rare": 8,
        "Secret Rare": 4,
        "Legendary": 1
      }'::jsonb
    );


  insert into public.draft_offers (
    draft_player_id,
    pick_number,
    phase_pick_number,
    phase,
    status
  )
  values (
    target_draft_player_id,
    absolute_pick,
    phase_pick,
    current_phase,
    'active'
  )
  returning id
  into new_offer_id;


  -- =====================================================
  -- Maak standaard 3 verschillende opties.
  --
  -- Actieve offers tellen als reservering.
  -- Daardoor kan bijvoorbeeld één Legendary niet
  -- tegelijkertijd aan twee spelers worden aangeboden.
  -- =====================================================

  for option_index
    in 1..option_count
  loop

    chosen_card_id := null;


    select c.id
    into chosen_card_id
    from public.card_catalog c

    where c.format_eligible = true

      -- Main draft heeft GEEN XYZ.
      and (
        (
          current_phase = 'main'
          and lower(c.card_type)
            not like '%xyz%'
        )

        or

        (
          current_phase = 'xyz'
          and lower(c.card_type)
            like '%xyz%'
        )
      )

      -- Niet twee keer dezelfde kaart
      -- binnen dezelfde keuze.
      and not exists (
        select 1
        from public.draft_offer_cards same_offer
        where same_offer.offer_id =
            new_offer_id
          and same_offer.card_catalog_id =
            c.id
      )

      -- Scarcity + actieve reserveringen.
      and (
        (
          select count(*)
          from public.card_instances ci
          where ci.league_id =
              target_league_id
            and ci.card_catalog_id =
              c.id
        )

        +

        (
          select count(*)
          from public.draft_offer_cards reserved

          join public.draft_offers reserved_offer
            on reserved_offer.id =
              reserved.offer_id

          join public.draft_players reserved_player
            on reserved_player.id =
              reserved_offer.draft_player_id

          join public.drafts reserved_draft
            on reserved_draft.id =
              reserved_player.draft_id

          where reserved.card_catalog_id =
              c.id

            and reserved_offer.status =
              'active'

            and reserved.status =
              'available'

            and reserved_draft.league_id =
              target_league_id
        )

      ) < public.card_copy_limit(c.id)


    -- Weighted random selection.
    --
    -- Hogere rarity weight =
    -- grotere kans om gekozen te worden.
    order by

      (
        -ln(
          greatest(
            random(),
            0.000000001
          )
        )

        /

        greatest(
          coalesce(
            (
              rarity_weights
              ->>
              coalesce(
                c.game_rarity,
                'Normal'
              )
            )::numeric,
            1
          ),
          0.01
        )
      )

    limit 1;


    if chosen_card_id is null then
      raise exception
        'Not enough eligible cards remain for this draft offer';
    end if;


    insert into public.draft_offer_cards (
      offer_id,
      card_catalog_id,
      display_order,
      status
    )
    values (
      new_offer_id,
      chosen_card_id,
      option_index,
      'available'
    );

  end loop;


  return new_offer_id;
end;
$$;


-- =========================================================
-- 13. PICK ONE OF THE 3 CARDS
-- =========================================================

create or replace function public.pick_draft_card(
  target_offer_id uuid,
  target_option_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_draft_player_id uuid;
  player_profile_id uuid;

  target_draft_id uuid;
  target_league_id uuid;

  selected_card_id uuid;
  created_instance_id uuid;

  current_phase public.draft_phase;
  current_pick integer;
  current_phase_pick integer;

  required_main integer;
  required_xyz integer;

  allowed_copies integer;
  existing_copies integer;

  remaining_players integer;
begin

  -- Lock offer.
  select
    o.draft_player_id,
    o.phase,
    o.pick_number,
    o.phase_pick_number
  into
    target_draft_player_id,
    current_phase,
    current_pick,
    current_phase_pick
  from public.draft_offers o
  where o.id =
      target_offer_id
    and o.status =
      'active'
  for update;


  if not found then
    raise exception
      'Draft offer is not active';
  end if;


  -- Lock speler/progress.
  select
    dp.profile_id,
    dp.draft_id,
    d.league_id,
    d.main_picks_per_player,
    d.xyz_picks_per_player
  into
    player_profile_id,
    target_draft_id,
    target_league_id,
    required_main,
    required_xyz
  from public.draft_players dp

  join public.drafts d
    on d.id =
      dp.draft_id

  where dp.id =
      target_draft_player_id
    and d.status =
      'active'

  for update of dp;


  if not found then
    raise exception
      'Draft player is unavailable';
  end if;


  if player_profile_id <>
     (select auth.uid())
  then
    raise exception
      'You cannot make another player''s draft pick';
  end if;


  -- Gekozen optie controleren.
  select card_catalog_id
  into selected_card_id
  from public.draft_offer_cards
  where id =
      target_option_id
    and offer_id =
      target_offer_id
    and status =
      'available'
  for update;


  if not found then
    raise exception
      'Selected draft option is unavailable';
  end if;


  -- Serialize de gekozen kaart.
  perform 1
  from public.card_catalog
  where id =
    selected_card_id
  for update;


  allowed_copies :=
    public.card_copy_limit(
      selected_card_id
    );


  select count(*)
  into existing_copies
  from public.card_instances
  where league_id =
      target_league_id
    and card_catalog_id =
      selected_card_id;


  if existing_copies >=
     allowed_copies
  then
    raise exception
      'Selected card is no longer available';
  end if;


  -- Offer resolven.
  update public.draft_offer_cards

  set status =
    case
      when id =
        target_option_id
      then 'selected'::public.draft_option_status

      else 'released'::public.draft_option_status
    end

  where offer_id =
    target_offer_id;


  update public.draft_offers
  set
    status = 'picked',
    picked_at = now()
  where id =
    target_offer_id;


  -- Echte kaart creëren.
  insert into public.card_instances (
    league_id,
    card_catalog_id,
    copy_number,
    current_owner_id,
    original_owner_id,
    original_acquisition_type,
    original_source_id
  )
  values (
    target_league_id,
    selected_card_id,
    0,
    player_profile_id,
    player_profile_id,
    'draft',
    target_draft_id
  )
  returning id
  into created_instance_id;


  -- Permanente draft history.
  insert into public.draft_picks (
    draft_id,
    draft_player_id,
    offer_id,
    card_catalog_id,
    card_instance_id,
    phase,
    pick_number,
    phase_pick_number
  )
  values (
    target_draft_id,
    target_draft_player_id,
    target_offer_id,
    selected_card_id,
    created_instance_id,
    current_phase,
    current_pick,
    current_phase_pick
  );


  -- Progress verhogen.
  if current_phase = 'main' then

    update public.draft_players
    set main_picks_completed =
      main_picks_completed + 1
    where id =
      target_draft_player_id;

  else

    update public.draft_players
    set xyz_picks_completed =
      xyz_picks_completed + 1
    where id =
      target_draft_player_id;

  end if;


  -- Speler klaar?
  update public.draft_players
  set
    status = 'completed',
    completed_at = now()
  where id =
      target_draft_player_id

    and main_picks_completed >=
      required_main

    and xyz_picks_completed >=
      required_xyz;


  -- Is iedereen klaar?
  select count(*)
  into remaining_players
  from public.draft_players
  where draft_id =
      target_draft_id
    and status <>
      'completed';


  if remaining_players = 0 then

    update public.drafts
    set
      status = 'completed',
      completed_at = now()
    where id =
      target_draft_id;

  end if;


  return created_instance_id;
end;
$$;


-- =========================================================
-- 14. RLS
-- =========================================================

alter table public.drafts
  enable row level security;

alter table public.draft_players
  enable row level security;

alter table public.draft_offers
  enable row level security;

alter table public.draft_offer_cards
  enable row level security;

alter table public.draft_picks
  enable row level security;


-- League members mogen algemene draft-info zien.

drop policy if exists drafts_read_league
  on public.drafts;

create policy drafts_read_league
on public.drafts
for select
to authenticated
using (
  public.is_league_member(
    league_id
  )
);


-- Draft players zichtbaar binnen league.

drop policy if exists draft_players_read_league
  on public.draft_players;

create policy draft_players_read_league
on public.draft_players
for select
to authenticated
using (
  exists (
    select 1
    from public.drafts d
    where d.id =
        draft_id
      and public.is_league_member(
        d.league_id
      )
  )
);


-- Actieve offers alleen voor speler zelf of admin.

drop policy if exists draft_offers_read_allowed
  on public.draft_offers;

create policy draft_offers_read_allowed
on public.draft_offers
for select
to authenticated
using (
  public.can_access_draft_player(
    draft_player_id
  )
);


-- Kaarten binnen offer idem.

drop policy if exists draft_offer_cards_read_allowed
  on public.draft_offer_cards;

create policy draft_offer_cards_read_allowed
on public.draft_offer_cards
for select
to authenticated
using (
  exists (
    select 1
    from public.draft_offers o
    where o.id =
        offer_id
      and public.can_access_draft_player(
        o.draft_player_id
      )
  )
);


-- Permanente picks mogen league members zien.

drop policy if exists draft_picks_read_league
  on public.draft_picks;

create policy draft_picks_read_league
on public.draft_picks
for select
to authenticated
using (
  exists (
    select 1
    from public.drafts d
    where d.id =
        draft_id
      and public.is_league_member(
        d.league_id
      )
  )
);


-- =========================================================
-- 15. NO DIRECT CLIENT MUTATIONS
-- =========================================================

revoke insert, update, delete
on public.drafts
from authenticated;

revoke insert, update, delete
on public.draft_players
from authenticated;

revoke insert, update, delete
on public.draft_offers
from authenticated;

revoke insert, update, delete
on public.draft_offer_cards
from authenticated;

revoke insert, update, delete
on public.draft_picks
from authenticated;


grant select
on public.drafts
to authenticated;

grant select
on public.draft_players
to authenticated;

grant select
on public.draft_offers
to authenticated;

grant select
on public.draft_offer_cards
to authenticated;

grant select
on public.draft_picks
to authenticated;


-- Alleen gecontroleerde databasefuncties uitvoeren.

grant execute
on function public.start_initial_draft(
  uuid,
  text,
  uuid[]
)
to authenticated;


grant execute
on function public.create_next_draft_offer(
  uuid
)
to authenticated;


grant execute
on function public.pick_draft_card(
  uuid,
  uuid
)
to authenticated;


commit;