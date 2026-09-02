begin;

-- =========================================================
-- FIX-FORWARD: DRAFT BOSS-ROUTE EXCLUSION - STAGE 4 ONLY
--
-- WHY
-- 202609011700_draft_boss_route_exclusion.sql (already deployed)
-- added a Boss-Route exclusion clause to create_next_draft_offer(),
-- but that clause excluded a card if it was the evolution monster
-- for ANY stage of ANY Boss Route (stage 1, 2, 3, or 4). The Season
-- 1 audit correction pass (2026-09-02) established the final
-- authoritative rule:
--
--   Normal Draft + Normal/Premium/Deluxe/Special Packs exclude:
--     A. every Stage 4 evolution monster
--     B. every boss_route_stage_grant where is_route_exclusive = true
--   Stage 1-3 evolution monsters are NOT automatically excluded -
--   they remain ordinary eligible cards for normal drafts/packs.
--
-- This over-excluded content: an eligible Stage 1-3 route card (for
-- example Berry Magician Girl, Dark Magician Girl, D.D. Warrior,
-- Blue-Eyes White Dragon, etc.) was being silently removed from
-- every Draft offer even though the final rule only requires
-- excluding Stage 4 bosses and explicitly-flagged route-exclusive
-- support cards.
--
-- This migration is a fix-forward, not an edit to the deployed
-- 202609011700 file: it CREATE OR REPLACEs create_next_draft_offer
-- with the same body, with `and brs.stage_number = 4` added to each
-- of the 7 boss-route-exclusion checks (6 per-rarity availability
-- counts + 1 final card-pick query), matching the same corrected
-- exclusion shape already applied to the Shop RPCs in
-- 202609020930_fix_shop_pack_boss_route_exclusion.sql and
-- 202609020950_special_pack_curated_pools_functions.sql. No other
-- logic in the function changes.
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

  -- Draft fairness tracking (go-live spec section 12).
  v_secret_or_better_exposure integer;
  v_recent_offered_card_ids uuid[];
  v_min_exposure integer;
  v_max_exposure integer;
  v_offer_card_ids uuid[] := array[]::uuid[];
  v_combined_recent uuid[];
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
    dp.secret_or_better_exposure,
    dp.recent_offered_card_ids,

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
    v_secret_or_better_exposure,
    v_recent_offered_card_ids,

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

    -- Boss-Route exclusion (Season 1 audit correction,
    -- 2026-09-02): only the Stage 4 (final Boss) evolution monster
    -- of any route is automatically excluded from the normal draft
    -- pool - a Stage 1-3 evolution monster is an ordinary card once
    -- support can unlock at Stage 2/3 too (go-live spec section 11
    -- as corrected) and must stay draftable. Explicitly flagged
    -- is_route_exclusive support grants remain excluded at every
    -- stage. The original version of this clause (this same file,
    -- pre-correction) excluded EVERY stage's evolution monster,
    -- which was over-broad and has never been deployed against a
    -- seeded route in that broken form - see the audit report for
    -- the analysis.
    and not exists (
      select 1
      from public.boss_route_stages brs
      where brs.evolution_card_catalog_id = c.id
        and brs.stage_number = 4
    )

    and not exists (
      select 1
      from public.boss_route_stage_grants brg
      where brg.card_catalog_id = c.id
        and brg.is_route_exclusive = true
    )

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

    -- Boss-Route exclusion (Season 1 audit correction,
    -- 2026-09-02): only the Stage 4 (final Boss) evolution monster
    -- of any route is automatically excluded from the normal draft
    -- pool - a Stage 1-3 evolution monster is an ordinary card once
    -- support can unlock at Stage 2/3 too (go-live spec section 11
    -- as corrected) and must stay draftable. Explicitly flagged
    -- is_route_exclusive support grants remain excluded at every
    -- stage. The original version of this clause (this same file,
    -- pre-correction) excluded EVERY stage's evolution monster,
    -- which was over-broad and has never been deployed against a
    -- seeded route in that broken form - see the audit report for
    -- the analysis.
    and not exists (
      select 1
      from public.boss_route_stages brs
      where brs.evolution_card_catalog_id = c.id
        and brs.stage_number = 4
    )

    and not exists (
      select 1
      from public.boss_route_stage_grants brg
      where brg.card_catalog_id = c.id
        and brg.is_route_exclusive = true
    )

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

    -- Boss-Route exclusion (Season 1 audit correction,
    -- 2026-09-02): only the Stage 4 (final Boss) evolution monster
    -- of any route is automatically excluded from the normal draft
    -- pool - a Stage 1-3 evolution monster is an ordinary card once
    -- support can unlock at Stage 2/3 too (go-live spec section 11
    -- as corrected) and must stay draftable. Explicitly flagged
    -- is_route_exclusive support grants remain excluded at every
    -- stage. The original version of this clause (this same file,
    -- pre-correction) excluded EVERY stage's evolution monster,
    -- which was over-broad and has never been deployed against a
    -- seeded route in that broken form - see the audit report for
    -- the analysis.
    and not exists (
      select 1
      from public.boss_route_stages brs
      where brs.evolution_card_catalog_id = c.id
        and brs.stage_number = 4
    )

    and not exists (
      select 1
      from public.boss_route_stage_grants brg
      where brg.card_catalog_id = c.id
        and brg.is_route_exclusive = true
    )

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

    -- Boss-Route exclusion (Season 1 audit correction,
    -- 2026-09-02): only the Stage 4 (final Boss) evolution monster
    -- of any route is automatically excluded from the normal draft
    -- pool - a Stage 1-3 evolution monster is an ordinary card once
    -- support can unlock at Stage 2/3 too (go-live spec section 11
    -- as corrected) and must stay draftable. Explicitly flagged
    -- is_route_exclusive support grants remain excluded at every
    -- stage. The original version of this clause (this same file,
    -- pre-correction) excluded EVERY stage's evolution monster,
    -- which was over-broad and has never been deployed against a
    -- seeded route in that broken form - see the audit report for
    -- the analysis.
    and not exists (
      select 1
      from public.boss_route_stages brs
      where brs.evolution_card_catalog_id = c.id
        and brs.stage_number = 4
    )

    and not exists (
      select 1
      from public.boss_route_stage_grants brg
      where brg.card_catalog_id = c.id
        and brg.is_route_exclusive = true
    )

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

    -- Boss-Route exclusion (Season 1 audit correction,
    -- 2026-09-02): only the Stage 4 (final Boss) evolution monster
    -- of any route is automatically excluded from the normal draft
    -- pool - a Stage 1-3 evolution monster is an ordinary card once
    -- support can unlock at Stage 2/3 too (go-live spec section 11
    -- as corrected) and must stay draftable. Explicitly flagged
    -- is_route_exclusive support grants remain excluded at every
    -- stage. The original version of this clause (this same file,
    -- pre-correction) excluded EVERY stage's evolution monster,
    -- which was over-broad and has never been deployed against a
    -- seeded route in that broken form - see the audit report for
    -- the analysis.
    and not exists (
      select 1
      from public.boss_route_stages brs
      where brs.evolution_card_catalog_id = c.id
        and brs.stage_number = 4
    )

    and not exists (
      select 1
      from public.boss_route_stage_grants brg
      where brg.card_catalog_id = c.id
        and brg.is_route_exclusive = true
    )

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

    -- Boss-Route exclusion (Season 1 audit correction,
    -- 2026-09-02): only the Stage 4 (final Boss) evolution monster
    -- of any route is automatically excluded from the normal draft
    -- pool - a Stage 1-3 evolution monster is an ordinary card once
    -- support can unlock at Stage 2/3 too (go-live spec section 11
    -- as corrected) and must stay draftable. Explicitly flagged
    -- is_route_exclusive support grants remain excluded at every
    -- stage. The original version of this clause (this same file,
    -- pre-correction) excluded EVERY stage's evolution monster,
    -- which was over-broad and has never been deployed against a
    -- seeded route in that broken form - see the audit report for
    -- the analysis.
    and not exists (
      select 1
      from public.boss_route_stages brs
      where brs.evolution_card_catalog_id = c.id
        and brs.stage_number = 4
    )

    and not exists (
      select 1
      from public.boss_route_stage_grants brg
      where brg.card_catalog_id = c.id
        and brg.is_route_exclusive = true
    )

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
  -- LEGENDARY IS NEVER OFFERED IN THE DRAFT
  --
  -- Go-live spec section 11: "NO Legendary in initial draft."
  -- Legendary cards are earned through packs/Luck and Boss Routes
  -- only. This overrides the availability-based weight entirely,
  -- not just when supply is short.
  -- =====================================================

  legendary_weight := 0;


  -- =====================================================
  -- DRAFT FAIRNESS: SOFT OUTLIER CORRECTION (main phase only)
  --
  -- Go-live spec section 12: limit extremes, don't identical-ify
  -- players. We track each player's cumulative count of Secret/
  -- Ultra offers this draft (secret_or_better_exposure) and only
  -- nudge weights for a player sitting at the exact low or high
  -- end of a genuinely wide spread (>= 2 offers apart) across the
  -- draft's players. A normal 1/2/2 or 2/2/3 spread never triggers
  -- this - it only catches a real 1/1/4-style extreme.
  -- =====================================================

  if current_phase = 'main' then

    select
      min(dp2.secret_or_better_exposure),
      max(dp2.secret_or_better_exposure)
    into
      v_min_exposure,
      v_max_exposure
    from public.draft_players dp2
    where dp2.draft_id = target_draft_id;

    if v_max_exposure - v_min_exposure >= 2 then

      if v_secret_or_better_exposure <= v_min_exposure then
        secret_weight := secret_weight * 1.6;
        ultra_weight := ultra_weight * 1.3;
      elsif v_secret_or_better_exposure >= v_max_exposure then
        secret_weight := secret_weight * 0.5;
        ultra_weight := ultra_weight * 0.7;
      end if;

    end if;

  end if;


  -- =====================================================
  -- EXTRA DECK TARGETING: 1 SUPER + 1 ULTRA OPPORTUNITY
  --
  -- Go-live spec section 13: each 2-pick Fusion/Xyz mini-phase
  -- should give the player one Super Rare-tier opportunity and one
  -- Ultra Rare-tier opportunity, and never a mechanically dead
  -- trio. Rather than leave this to the weighted roll, pick 1
  -- targets Super Rare and pick 2 targets Ultra Rare directly,
  -- cascading through the other non-Normal, non-Legendary tiers
  -- only if the target tier doesn't have enough cards this phase.
  -- Setting selected_rarity here makes every check in the general
  -- weighted roll below a no-op (they all guard on
  -- "selected_rarity is null"), so the main-phase roll logic is
  -- untouched.
  -- =====================================================

  if current_phase in ('fusion', 'xyz') then

    if phase_pick = 1 then

      if super_available >= option_count then
        selected_rarity := 'Super Rare';
      elsif ultra_available >= option_count then
        selected_rarity := 'Ultra Rare';
      elsif secret_available >= option_count then
        selected_rarity := 'Secret Rare';
      elsif rare_available >= option_count then
        selected_rarity := 'Rare';
      end if;

    else

      if ultra_available >= option_count then
        selected_rarity := 'Ultra Rare';
      elsif secret_available >= option_count then
        selected_rarity := 'Secret Rare';
      elsif super_available >= option_count then
        selected_rarity := 'Super Rare';
      elsif rare_available >= option_count then
        selected_rarity := 'Rare';
      end if;

    end if;

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


  -- Draft fairness: count this offer toward the player's cumulative
  -- Secret/Ultra exposure (main phase only - Extra Deck targeting
  -- above is already deterministic, not something to correct).
  if current_phase = 'main'
     and selected_rarity in ('Ultra Rare', 'Secret Rare')
  then
    update public.draft_players
    set secret_or_better_exposure = secret_or_better_exposure + 1
    where id = target_draft_player_id;
  end if;


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

    -- Boss-Route exclusion (Season 1 audit correction,
    -- 2026-09-02): only the Stage 4 (final Boss) evolution monster
    -- of any route is automatically excluded from the normal draft
    -- pool - a Stage 1-3 evolution monster is an ordinary card once
    -- support can unlock at Stage 2/3 too (go-live spec section 11
    -- as corrected) and must stay draftable. Explicitly flagged
    -- is_route_exclusive support grants remain excluded at every
    -- stage. The original version of this clause (this same file,
    -- pre-correction) excluded EVERY stage's evolution monster,
    -- which was over-broad and has never been deployed against a
    -- seeded route in that broken form - see the audit report for
    -- the analysis.
    and not exists (
      select 1
      from public.boss_route_stages brs
      where brs.evolution_card_catalog_id = c.id
        and brs.stage_number = 4
    )

    and not exists (
      select 1
      from public.boss_route_stage_grants brg
      where brg.card_catalog_id = c.id
        and brg.is_route_exclusive = true
    )

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


    -- Light recent-offer penalty (spec section 12): a card shown
    -- in this player's last few trios sorts last, so it is only
    -- offered again when nothing fresher clears every other filter
    -- above. This is a soft ordering preference, not an exclusion.
    order by
      (
        v_recent_offered_card_ids is not null
        and c.id = any(v_recent_offered_card_ids)
      ) asc,
      random()

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

    v_offer_card_ids := v_offer_card_ids || chosen_card_id;

  end loop;


  -- Draft fairness: remember this trio in a short trailing window
  -- (last 9 offered card ids = last 3 trios) so future offers can
  -- softly avoid repeating them.
  v_combined_recent :=
    coalesce(v_recent_offered_card_ids, array[]::uuid[])
    || v_offer_card_ids;

  update public.draft_players
  set recent_offered_card_ids =
    v_combined_recent[
      greatest(1, array_length(v_combined_recent, 1) - 8)
      : array_length(v_combined_recent, 1)
    ]
  where id = target_draft_player_id;


  return new_offer_id;
end;
$$;

revoke all on function public.create_next_draft_offer(uuid) from public;
grant execute on function public.create_next_draft_offer(uuid) to authenticated;

-- =========================================================
-- POST-MIGRATION STRUCTURAL ASSERTION
-- =========================================================

do $verify$
declare
  v_src text;
  v_stage4_count int;
begin

  select p.prosrc into v_src
  from pg_proc p
  where p.proname = 'create_next_draft_offer'
  limit 1;

  if v_src is null then
    raise exception
      'DRAFT STAGE-4-ONLY EXCLUSION FIX ABORTED: create_next_draft_offer not found.';
  end if;

  if v_src not ilike '%boss_route_stages%' then
    raise exception
      'DRAFT STAGE-4-ONLY EXCLUSION FIX ABORTED: create_next_draft_offer no longer excludes route evolution monsters at all.';
  end if;

  if v_src not ilike '%boss_route_stage_grants%' then
    raise exception
      'DRAFT STAGE-4-ONLY EXCLUSION FIX ABORTED: create_next_draft_offer no longer excludes route-exclusive support grants.';
  end if;

  select count(*) into v_stage4_count
  from regexp_matches(v_src, 'brs\.stage_number\s*=\s*4', 'g');

  if v_stage4_count <> 7 then
    raise exception
      'DRAFT STAGE-4-ONLY EXCLUSION FIX ABORTED: expected exactly 7 occurrences of the stage_number = 4 restriction, found %.', v_stage4_count;
  end if;

  raise notice 'DRAFT STAGE-4-ONLY EXCLUSION FIX: create_next_draft_offer now excludes only Stage 4 boss evolution monsters (plus route-exclusive grants), matching the Shop RPCs.';
end $verify$;

commit;
