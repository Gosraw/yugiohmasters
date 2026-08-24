-- Serialize draft offer generation per league to prevent concurrent scarce-card reservation races.

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

  selected_rarity text;

  total_weight numeric;
  rarity_roll numeric;
  running_weight numeric;

  normal_available integer;
  rare_available integer;
  super_available integer;
  ultra_available integer;
  secret_available integer;
  legendary_available integer;

  normal_weight numeric;
  rare_weight numeric;
  super_weight numeric;
  ultra_weight numeric;
  secret_weight numeric;
  legendary_weight numeric;
begin

  -- =====================================================
  -- PLAYER + DRAFT OPHALEN EN LOCKEN
  -- =====================================================

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


  -- Alleen speler zelf of league-admin mag
  -- een offer laten genereren.
  if player_profile_id <>
     (select auth.uid())

     and not public.is_league_admin(
       target_league_id
     )
  then
    raise exception
      'Unauthorized draft access';
  end if;


  -- =====================================================
  -- LEAGUE-WIDE DRAFT OFFER LOCK
  --
  -- Multiple players may draft at the same time, but offer
  -- generation for the shared league card pool is serialized
  -- for the duration of this transaction. This prevents two
  -- concurrent players from observing the same scarce card as
  -- available before either reservation becomes visible.
  -- =====================================================

  perform pg_advisory_xact_lock(
    hashtext('draft_offer_pool_' || target_league_id::text)
  );


  -- =====================================================
  -- BESTAAND ACTIEF OFFER?
  --
  -- Refresh mag nooit opnieuw rollen.
  -- =====================================================

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
  -- FASE BEPALEN
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
      status =
        'completed',

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


  -- =====================================================
  -- RARITY WEIGHTS OPHALEN
  -- =====================================================

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
        "Normal": 56.0,
        "Rare": 28.0,
        "Super Rare": 11.0,
        "Ultra Rare": 3.5,
        "Secret Rare": 1.0,
        "Legendary": 0.5
      }'::jsonb
    );


  normal_weight :=
    coalesce(
      (rarity_weights ->> 'Normal')::numeric,
      56.0
    );

  rare_weight :=
    coalesce(
      (rarity_weights ->> 'Rare')::numeric,
      28.0
    );

  super_weight :=
    coalesce(
      (rarity_weights ->> 'Super Rare')::numeric,
      11.0
    );

  ultra_weight :=
    coalesce(
      (rarity_weights ->> 'Ultra Rare')::numeric,
      3.5
    );

  secret_weight :=
    coalesce(
      (rarity_weights ->> 'Secret Rare')::numeric,
      1.0
    );

  legendary_weight :=
    coalesce(
      (rarity_weights ->> 'Legendary')::numeric,
      0.5
    );


  -- =====================================================
  -- HOEVEEL KAARTEN ZIJN PER RARITY BESCHIKBAAR?
  --
  -- We tellen alleen kaarten mee die:
  --
  -- - in het Duelist Circle format zitten
  -- - bij de juiste fase horen
  -- - nog niet scarcity-capped zijn
  --
  -- Actieve draftoffers tellen als reservering.
  -- =====================================================


  -- ---------------- NORMAL ----------------

  select count(*)
  into normal_available

  from public.card_catalog c

  where
    c.format_eligible = true

    and public.is_master_duel_offerable(c.master_duel_status)

    and c.game_rarity =
      'Normal'

    and (
      (
        current_phase =
          'main'

        and lower(c.card_type)
          not like '%fusion%'

        and lower(c.card_type)
          not like '%xyz%'
      )

      or

      (
        current_phase =
          'fusion'

        and lower(c.card_type)
          like '%fusion%monster%'
      )

      or

      (
        current_phase =
          'xyz'

        and lower(c.card_type)
          like '%xyz%monster%'
      )
    )

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
    );


  -- ---------------- RARE ----------------

  select count(*)
  into rare_available

  from public.card_catalog c

  where
    c.format_eligible = true

    and public.is_master_duel_offerable(c.master_duel_status)

    and c.game_rarity =
      'Rare'

    and (
      (
        current_phase =
          'main'

        and lower(c.card_type)
          not like '%fusion%'

        and lower(c.card_type)
          not like '%xyz%'
      )

      or

      (
        current_phase =
          'fusion'

        and lower(c.card_type)
          like '%fusion%monster%'
      )

      or

      (
        current_phase =
          'xyz'

        and lower(c.card_type)
          like '%xyz%monster%'
      )
    )

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
    );


  -- ---------------- SUPER RARE ----------------

  select count(*)
  into super_available

  from public.card_catalog c

  where
    c.format_eligible = true

    and public.is_master_duel_offerable(c.master_duel_status)

    and c.game_rarity =
      'Super Rare'

    and (
      (
        current_phase =
          'main'

        and lower(c.card_type)
          not like '%fusion%'

        and lower(c.card_type)
          not like '%xyz%'
      )

      or

      (
        current_phase =
          'fusion'

        and lower(c.card_type)
          like '%fusion%monster%'
      )

      or

      (
        current_phase =
          'xyz'

        and lower(c.card_type)
          like '%xyz%monster%'
      )
    )

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
    );


  -- ---------------- ULTRA RARE ----------------

  select count(*)
  into ultra_available

  from public.card_catalog c

  where
    c.format_eligible = true

    and public.is_master_duel_offerable(c.master_duel_status)

    and c.game_rarity =
      'Ultra Rare'

    and (
      (
        current_phase =
          'main'

        and lower(c.card_type)
          not like '%fusion%'

        and lower(c.card_type)
          not like '%xyz%'
      )

      or

      (
        current_phase =
          'fusion'

        and lower(c.card_type)
          like '%fusion%monster%'
      )

      or

      (
        current_phase =
          'xyz'

        and lower(c.card_type)
          like '%xyz%monster%'
      )
    )

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
    );


  -- ---------------- SECRET RARE ----------------

  select count(*)
  into secret_available

  from public.card_catalog c

  where
    c.format_eligible = true

    and public.is_master_duel_offerable(c.master_duel_status)

    and c.game_rarity =
      'Secret Rare'

    and (
      (
        current_phase =
          'main'

        and lower(c.card_type)
          not like '%fusion%'

        and lower(c.card_type)
          not like '%xyz%'
      )

      or

      (
        current_phase =
          'fusion'

        and lower(c.card_type)
          like '%fusion%monster%'
      )

      or

      (
        current_phase =
          'xyz'

        and lower(c.card_type)
          like '%xyz%monster%'
      )
    )

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
    );


  -- ---------------- LEGENDARY ----------------

  select count(*)
  into legendary_available

  from public.card_catalog c

  where
    c.format_eligible = true

    and public.is_master_duel_offerable(c.master_duel_status)

    and c.game_rarity =
      'Legendary'

    and (
      (
        current_phase =
          'main'

        and lower(c.card_type)
          not like '%fusion%'

        and lower(c.card_type)
          not like '%xyz%'
      )

      or

      (
        current_phase =
          'fusion'

        and lower(c.card_type)
          like '%fusion%monster%'
      )

      or

      (
        current_phase =
          'xyz'

        and lower(c.card_type)
          like '%xyz%monster%'
      )
    )

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
    );


  -- =====================================================
  -- RARITIES ZONDER MINIMAAL 3 KAARTEN UITZETTEN
  --
  -- Als options_per_pick ooit via admin verandert,
  -- gebruiken we automatisch dat aantal.
  -- =====================================================

  if normal_available <
     option_count
  then
    normal_weight := 0;
  end if;


  if rare_available <
     option_count
  then
    rare_weight := 0;
  end if;


  if super_available <
     option_count
  then
    super_weight := 0;
  end if;


  if ultra_available <
     option_count
  then
    ultra_weight := 0;
  end if;


  if secret_available <
     option_count
  then
    secret_weight := 0;
  end if;


  if legendary_available <
     option_count
  then
    legendary_weight := 0;
  end if;


  -- =====================================================
  -- TEMPORARY BOSSG TEST OVERRIDE
  --
  -- BossG picks 11-15: minimum Rare.
  -- Only removes Normal from the rarity roll for this exact
  -- player and these exact five picks. All other players and
  -- all other picks use the normal league rarity weights.
  -- =====================================================

  if player_profile_id = 'f70f60ca-85cc-4cfc-8dee-86672b296775'::uuid
     and current_phase = 'main'
     and absolute_pick between 11 and 15
  then
    normal_weight := 0;
  end if;


  total_weight :=
      normal_weight
    + rare_weight
    + super_weight
    + ultra_weight
    + secret_weight
    + legendary_weight;


  if total_weight <= 0 then
    raise exception
      'No rarity has enough available cards for this draft phase';
  end if;


  -- =====================================================
  -- ÉÉN RARITY ROLL
  -- =====================================================

  rarity_roll :=
    random()
    * total_weight;

  running_weight := 0;


  running_weight :=
    running_weight
    + normal_weight;

  if selected_rarity is null
     and rarity_roll <
         running_weight
  then
    selected_rarity :=
      'Normal';
  end if;


  running_weight :=
    running_weight
    + rare_weight;

  if selected_rarity is null
     and rarity_roll <
         running_weight
  then
    selected_rarity :=
      'Rare';
  end if;


  running_weight :=
    running_weight
    + super_weight;

  if selected_rarity is null
     and rarity_roll <
         running_weight
  then
    selected_rarity :=
      'Super Rare';
  end if;


  running_weight :=
    running_weight
    + ultra_weight;

  if selected_rarity is null
     and rarity_roll <
         running_weight
  then
    selected_rarity :=
      'Ultra Rare';
  end if;


  running_weight :=
    running_weight
    + secret_weight;

  if selected_rarity is null
     and rarity_roll <
         running_weight
  then
    selected_rarity :=
      'Secret Rare';
  end if;


  if selected_rarity is null then
    selected_rarity :=
      'Legendary';
  end if;


  -- =====================================================
  -- OFFER OPSLAAN
  -- =====================================================

  insert into public.draft_offers (
    draft_player_id,
    pick_number,
    phase_pick_number,
    phase,
    status,
    rolled_rarity
  )
  values (
    target_draft_player_id,
    absolute_pick,
    phase_pick,
    current_phase,
    'active',
    selected_rarity
  )
  returning id
  into new_offer_id;


  -- =====================================================
  -- 3 KAARTEN VAN EXACT DEZELFDE RARITY
  -- =====================================================

  for option_index
    in 1..option_count
  loop

    chosen_card_id :=
      null;


    select c.id
    into chosen_card_id

    from public.card_catalog c

    where
      c.format_eligible =
        true

      and public.is_master_duel_offerable(c.master_duel_status)

      and c.game_rarity =
        selected_rarity


      -- ================================================
      -- JUISTE FASE
      -- ================================================

      and (
        (
          current_phase =
            'main'

          and lower(c.card_type)
            not like '%fusion%'

          and lower(c.card_type)
            not like '%xyz%'
        )

        or

        (
          current_phase =
            'fusion'

          and lower(c.card_type)
            like '%fusion%monster%'
        )

        or

        (
          current_phase =
            'xyz'

          and lower(c.card_type)
            like '%xyz%monster%'
        )
      )


      -- ================================================
      -- GEEN DUPLICATE BINNEN DEZELFDE 3
      -- ================================================

      and not exists (
        select 1

        from public.draft_offer_cards same_offer

        where same_offer.offer_id =
            new_offer_id

          and same_offer.card_catalog_id =
            c.id
      )


      -- ================================================
      -- SCARCITY + ACTIEVE RESERVERINGEN
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


    -- Binnen de gekozen rarity gewoon random.
    order by random()

    limit 1;


    if chosen_card_id is null then
      raise exception
        'Unable to create % offer with enough available cards',
        selected_rarity;
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

revoke all on function public.create_next_draft_offer(uuid) from public;
grant execute on function public.create_next_draft_offer(uuid) to authenticated;
