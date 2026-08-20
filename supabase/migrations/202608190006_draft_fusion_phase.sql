-- =========================================================
-- DUELIST CIRCLE
-- ADD GUARANTEED FUSION PHASE TO INITIAL DRAFT
--
-- Nieuwe startdraft:
--
-- 60 Main Pool picks
-- 2 Fusion Monster picks
-- 2 XYZ Monster picks
--
-- Iedere pick = keuze uit 3 kaarten.
--
-- Main Pool bevat GEEN Fusion en GEEN XYZ.
-- =========================================================


-- ---------------------------------------------------------
-- 1. NIEUWE DRAFT PHASE
--
-- Dit staat bewust buiten de transaction.
-- PostgreSQL moet de nieuwe enumwaarde eerst committen
-- voordat functies hem kunnen gebruiken.
-- ---------------------------------------------------------

alter type public.draft_phase
add value if not exists 'fusion';


begin;


-- =========================================================
-- 2. DRAFT CONFIGURATION
-- =========================================================

alter table public.drafts
add column if not exists fusion_picks_per_player integer
not null
default 2;


alter table public.drafts
drop constraint if exists draft_fusion_picks_nonnegative;


alter table public.drafts
add constraint draft_fusion_picks_nonnegative
check (
  fusion_picks_per_player >= 0
);


-- =========================================================
-- 3. PLAYER PROGRESS
-- =========================================================

alter table public.draft_players
add column if not exists fusion_picks_completed integer
not null
default 0;


alter table public.draft_players
drop constraint if exists draft_player_fusion_picks_nonnegative;


alter table public.draft_players
add constraint draft_player_fusion_picks_nonnegative
check (
  fusion_picks_completed >= 0
);


-- =========================================================
-- 4. SETTING
-- =========================================================

insert into public.settings (
  league_id,
  key,
  value,
  description
)
select
  l.id,
  'draft.initial_fusion_picks',
  '2'::jsonb,
  'Guaranteed Fusion Monster picks per player'
from public.leagues l
on conflict (
  league_id,
  key
)
do nothing;


-- =========================================================
-- 5. START INITIAL DRAFT
--
-- 60 Main
-- 2 Fusion
-- 2 XYZ
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
  configured_fusion integer := 2;
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
    (value #>> '{}')::integer
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
    (value #>> '{}')::integer
  into configured_fusion
  from public.settings
  where league_id =
      target_league_id
    and key =
      'draft.initial_fusion_picks';


  configured_fusion :=
    coalesce(
      configured_fusion,
      2
    );


  select
    (value #>> '{}')::integer
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
    (value #>> '{}')::integer
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
    fusion_picks_per_player,
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
    configured_fusion,
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
-- 6. CREATE NEXT OFFER
--
-- VOLGORDE:
--
-- Picks  1 - 60 = Main
-- Picks 61 - 62 = Fusion
-- Picks 63 - 64 = XYZ
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
  completed_fusion integer;
  completed_xyz integer;

  required_main integer;
  required_fusion integer;
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

  select
    dp.profile_id,
    dp.draft_id,
    dp.main_picks_completed,
    dp.fusion_picks_completed,
    dp.xyz_picks_completed,

    d.league_id,
    d.main_picks_per_player,
    d.fusion_picks_per_player,
    d.xyz_picks_per_player,
    d.options_per_pick

  into
    player_profile_id,
    target_draft_id,
    completed_main,
    completed_fusion,
    completed_xyz,

    target_league_id,
    required_main,
    required_fusion,
    required_xyz,
    option_count

  from public.draft_players dp

  join public.drafts d
    on d.id = dp.draft_id

  where dp.id =
      target_draft_player_id

    and d.status =
      'active'

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


  -- Refresh van de pagina geeft dezelfde
  -- drie kaarten terug.
  select id
  into existing_offer_id
  from public.draft_offers
  where draft_player_id =
      target_draft_player_id
    and status =
      'active'
  limit 1;


  if existing_offer_id is not null then
    return existing_offer_id;
  end if;


  -- =====================================================
  -- MAIN
  -- =====================================================

  if completed_main <
     required_main
  then

    current_phase :=
      'main';

    phase_pick :=
      completed_main + 1;

    absolute_pick :=
      phase_pick;


  -- =====================================================
  -- FUSION
  -- =====================================================

  elsif completed_fusion <
        required_fusion
  then

    current_phase :=
      'fusion';

    phase_pick :=
      completed_fusion + 1;

    absolute_pick :=
      required_main
      + phase_pick;


  -- =====================================================
  -- XYZ
  -- =====================================================

  elsif completed_xyz <
        required_xyz
  then

    current_phase :=
      'xyz';

    phase_pick :=
      completed_xyz + 1;

    absolute_pick :=
      required_main
      + required_fusion
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
  -- MAAK 3 VERSCHILLENDE KAARTOPTIES
  -- =====================================================

  for option_index
    in 1..option_count
  loop

    chosen_card_id := null;


    select c.id
    into chosen_card_id
    from public.card_catalog c

    where
      c.format_eligible = true


      -- ================================================
      -- MAIN POOL
      --
      -- Geen Fusion.
      -- Geen XYZ.
      -- ================================================

      and (
        (
          current_phase = 'main'

          and lower(c.card_type)
            not like '%fusion%'

          and lower(c.card_type)
            not like '%xyz%'
        )


        -- ================================================
        -- FUSION POOL
        -- ================================================

        or

        (
          current_phase = 'fusion'

          and lower(c.card_type)
            like '%fusion%monster%'
        )


        -- ================================================
        -- XYZ POOL
        -- ================================================

        or

        (
          current_phase = 'xyz'

          and lower(c.card_type)
            like '%xyz%monster%'
        )
      )


      -- Niet dezelfde kaart twee keer
      -- binnen dezelfde keuze.
      and not exists (
        select 1
        from public.draft_offer_cards same_offer

        where same_offer.offer_id =
            new_offer_id

          and same_offer.card_catalog_id =
            c.id
      )


      -- ================================================
      -- SCARCITY
      --
      -- Bestaande copies
      -- +
      -- kaarten die al in actieve offers gereserveerd zijn
      --
      -- moeten onder de maximale voorraad blijven.
      -- ================================================

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

      ) < public.card_copy_limit(
        c.id
      )


    -- ================================================
    -- WEIGHTED RANDOM
    -- ================================================

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
-- 7. PICK CARD
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
  required_fusion integer;
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


  -- Lock player progress.
  select
    dp.profile_id,
    dp.draft_id,

    d.league_id,
    d.main_picks_per_player,
    d.fusion_picks_per_player,
    d.xyz_picks_per_player

  into
    player_profile_id,
    target_draft_id,

    target_league_id,
    required_main,
    required_fusion,
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


  -- Check selected card.
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


  -- Serialize card scarcity.
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


  -- Selected = gekozen.
  -- Andere twee = vrijgegeven.
  update public.draft_offer_cards

  set status =
    case
      when id =
        target_option_id

      then
        'selected'::public.draft_option_status

      else
        'released'::public.draft_option_status
    end

  where offer_id =
    target_offer_id;


  update public.draft_offers

  set
    status =
      'picked',

    picked_at =
      now()

  where id =
    target_offer_id;


  -- Maak de echte collectible kaart.
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


  -- =====================================================
  -- PROGRESS
  -- =====================================================

  if current_phase =
     'main'
  then

    update public.draft_players

    set main_picks_completed =
      main_picks_completed + 1

    where id =
      target_draft_player_id;


  elsif current_phase =
        'fusion'
  then

    update public.draft_players

    set fusion_picks_completed =
      fusion_picks_completed + 1

    where id =
      target_draft_player_id;


  elsif current_phase =
        'xyz'
  then

    update public.draft_players

    set xyz_picks_completed =
      xyz_picks_completed + 1

    where id =
      target_draft_player_id;

  end if;


  -- =====================================================
  -- PLAYER COMPLETED?
  -- =====================================================

  update public.draft_players

  set
    status =
      'completed',

    completed_at =
      now()

  where id =
      target_draft_player_id

    and main_picks_completed >=
      required_main

    and fusion_picks_completed >=
      required_fusion

    and xyz_picks_completed >=
      required_xyz;


  -- =====================================================
  -- WHOLE DRAFT COMPLETED?
  -- =====================================================

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
      status =
        'completed',

      completed_at =
        now()

    where id =
      target_draft_id;

  end if;


  return created_instance_id;
end;
$$;


commit;