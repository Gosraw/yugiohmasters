begin;

-- =========================================================
-- DUELIST CIRCLE - MASTER DUEL COMPATIBILITY LAYER
-- (2026-08-22, V1.2 update)
--
-- Adds a Master Duel eligibility dimension to card_catalog,
-- separate from format_eligible (Duelist Circle's own house
-- format). Everything below is additive / idempotent - no
-- existing table, column, row, or function signature is
-- removed or renamed, and no card_instances are touched.
--
-- HONESTY NOTE (per explicit instruction not to invent Master
-- Duel data): this migration ships the DATA MODEL and the
-- INFRASTRUCTURE only. It does NOT populate real per-card
-- Master Duel status - every card starts at 'unknown' until
-- someone actually runs scripts/audit-master-duel.mjs (which
-- calls the real YGOPRODeck API, exactly like the existing
-- scripts/sync-cards.mjs already does for the base catalog).
-- A general "is this card in Master Duel at all" check was
-- verified this session via YGOPRODeck's documented
-- ?format=master%20duel parameter on the same endpoint
-- card_catalog already sources from. The finer-grained
-- Forbidden/Limited/Semi-Limited Master Duel BANLIST
-- sub-status could NOT be reliably confirmed via a stable,
-- inspectable API field this session (YGOPRODeck's own
-- Master Duel banlist page renders its list client-side in
-- JavaScript, which the research tooling available this
-- session cannot execute) - so audit-master-duel.mjs only
-- ever writes 'unlimited' vs 'not_available' with confidence;
-- 'semi_limited'/'limited'/'forbidden' are real, valid,
-- storable statuses in this schema, but populating them
-- correctly needs a data source the owner should confirm
-- before that part of the script is trusted. This is exactly
-- the "Unknown must never be treated as reliable" requirement
-- - see the audit script's own comments for the current state
-- of that gap.
--
-- CONSERVATIVE ELIGIBILITY (revised 2026-08-22, hardening pass):
-- is_master_duel_offerable() below is CONSERVATIVE. Only
-- 'unlimited', 'semi_limited', and 'limited' are offerable.
-- 'forbidden', 'not_available', 'unknown', null, and any
-- unrecognized value are all NOT offerable.
--
-- This supersedes an earlier draft of this same (still
-- undeployed) migration, which treated 'unknown' as offerable
-- to avoid an empty pool on day one. That permissive default
-- was deliberately reversed on explicit instruction: it is
-- safer for Draft/Shop to offer nothing than to offer a card
-- nobody has actually confirmed is legal in Master Duel.
--
-- CONSEQUENCE - READ BEFORE DEPLOYING:
-- Every existing card starts at 'unknown' (see column default
-- below), so immediately after this migration runs, the
-- Master Duel-aware Draft and Shop candidate pools WILL BE
-- EMPTY (create_next_draft_offer/pick_shop_pack_card will raise
-- their "no eligible cards"/"no rarity has enough available
-- cards" exceptions). This is INTENTIONAL, not a bug - see the
-- mandatory deployment order below.
--
-- MANDATORY DEPLOYMENT ORDER:
--   A. Run this migration.
--   B. Immediately run `npm run audit:master-duel:apply`
--      (scripts/audit-master-duel.mjs --apply) so real
--      unlimited/not_available statuses replace 'unknown' for
--      every card with a valid external_card_id.
--   C. Check the status counts (the script's own dry-run output,
--      or select * from get_master_duel_status_counts()) and
--      confirm the numbers look sane before trusting the pool.
--   D. Only after B and C should Draft or Shop be used again -
--      until then, offering cards is expected to fail loudly
--      rather than silently offer an unverified card.
-- Steps A-C should happen back-to-back, in one maintenance
-- window; do not leave the app usable by real players between
-- A and B.
-- =========================================================


-- ---------------------------------------------------------
-- 1. CARD_CATALOG COLUMNS
-- ---------------------------------------------------------

alter table public.card_catalog
  add column if not exists master_duel_status text
    not null
    default 'unknown';

alter table public.card_catalog
  drop constraint if exists card_catalog_master_duel_status_check;

alter table public.card_catalog
  add constraint card_catalog_master_duel_status_check
  check (
    master_duel_status in (
      'unlimited',
      'semi_limited',
      'limited',
      'forbidden',
      'not_available',
      'unknown'
    )
  );

alter table public.card_catalog
  add column if not exists master_duel_card_id bigint;

alter table public.card_catalog
  add column if not exists master_duel_checked_at timestamptz;

comment on column public.card_catalog.master_duel_status is
  'Master Duel legality: unlimited (in MD, no restriction), semi_limited (max 2), limited (max 1), forbidden (banned), not_available (not in MD at all), unknown (never checked - NOT the same as unlimited, never treat as reliable).';

comment on column public.card_catalog.master_duel_card_id is
  'Master Duel-specific card id, if it ever diverges from external_card_id (the YGOPRODeck/TCG passcode). Null until confirmed otherwise - YGOPRODeck uses the same id space for both as far as this session could verify.';

comment on column public.card_catalog.master_duel_checked_at is
  'When master_duel_status was last set by a real check (audit-master-duel.mjs or an admin override). Null = never checked, i.e. still the default unknown.';

create index if not exists card_catalog_master_duel_status_idx
  on public.card_catalog (master_duel_status);


-- ---------------------------------------------------------
-- 2. ELIGIBILITY HELPER
--
-- Single source of truth for "should this card be offerable
-- via Master Duel-aware flows by default", shared by Draft and
-- Shop below (mirrors how format_eligible is already a shared
-- hard filter across both) so the two can never quietly
-- diverge on this question.
-- ---------------------------------------------------------

create or replace function public.is_master_duel_offerable(
  target_status text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    coalesce(target_status, '') = any (
      array['unlimited', 'semi_limited', 'limited']
    );
$$;

comment on function public.is_master_duel_offerable(text) is
  'CONSERVATIVE: true only for unlimited/semi_limited/limited. forbidden/not_available/unknown/null/anything unrecognized are all false - see the migration header for the mandatory deployment order this requires.';

revoke all
  on function public.is_master_duel_offerable(text)
  from public;

grant execute
  on function public.is_master_duel_offerable(text)
  to authenticated;


-- ---------------------------------------------------------
-- 3. STATUS COUNTS (read-only, re-runnable audit report)
-- ---------------------------------------------------------

create or replace function public.get_master_duel_status_counts()
returns table (
  master_duel_status text,
  card_count bigint
)
language sql
stable
set search_path = ''
as $$
  select
    c.master_duel_status,
    count(*) as card_count
  from public.card_catalog c
  group by c.master_duel_status
  order by c.master_duel_status;
$$;

revoke all
  on function public.get_master_duel_status_counts()
  from public;

grant execute
  on function public.get_master_duel_status_counts()
  to authenticated;


-- ---------------------------------------------------------
-- 4. ADMIN SINGLE-CARD OVERRIDE
--
-- The audited, RLS-safe write path for a human admin to set
-- one card's status from the app (e.g. a future admin UI, or
-- the compensation tool). Bulk sync (audit-master-duel.mjs)
-- uses the service-role key directly instead, same as the
-- existing scripts/sync-cards.mjs does for the base catalog -
-- this function is for the one-card-at-a-time, audited path.
-- ---------------------------------------------------------

create or replace function public.set_card_master_duel_status(
  target_card_catalog_id uuid,
  target_status text,
  target_master_duel_card_id bigint default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  is_admin boolean;
begin

  current_user_id := (select auth.uid());

  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1
    from public.league_members lm
    where lm.profile_id = current_user_id
      and lm.role = 'admin'
  )
  into is_admin;

  if not is_admin then
    raise exception 'Only a league admin may update Master Duel status.';
  end if;

  if target_status not in (
    'unlimited',
    'semi_limited',
    'limited',
    'forbidden',
    'not_available',
    'unknown'
  ) then
    raise exception 'Invalid Master Duel status.';
  end if;

  update public.card_catalog
  set
    master_duel_status = target_status,
    master_duel_card_id = coalesce(
      target_master_duel_card_id,
      master_duel_card_id
    ),
    master_duel_checked_at = now(),
    updated_at = now()
  where id = target_card_catalog_id;

  if not found then
    raise exception 'Card not found.';
  end if;
end;
$$;

revoke all
  on function public.set_card_master_duel_status(uuid, text, bigint)
  from public;

grant execute
  on function public.set_card_master_duel_status(uuid, text, bigint)
  to authenticated;


-- ---------------------------------------------------------
-- 5. DRAFT INTEGRATION
--
-- create_next_draft_offer(), re-issued with one additive
-- predicate at every candidate-selection point (the same 7
-- places format_eligible = true already appears) - nothing
-- else in this function changed. Weights, pity, and the
-- rarity-roll logic are byte-for-byte identical to the
-- 2026-08-21/22 rarity balance pass in
-- 202608210018_rarity_balance_definitive.sql.
-- ---------------------------------------------------------

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


-- ---------------------------------------------------------
-- 6. SHOP INTEGRATION
--
-- pick_shop_pack_card(), re-issued with one additive
-- predicate at every candidate-selection point (the same 4
-- places card.format_eligible = true already appears) -
-- nothing else in this function changed. Rarity tables, pity
-- thresholds, and the fallback cascade are byte-for-byte
-- identical to 202608210016_purchase_shop_pack.sql.
-- ---------------------------------------------------------

create or replace function public.pick_shop_pack_card(
  target_profile_id uuid,
  target_rarity text,
  target_rotation_id uuid default null::uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  theme_type text;
  theme_value text;
  chosen_card_id uuid;
begin
  -- =======================================================
  -- SPECIAL THEME
  -- =======================================================
  if target_rotation_id is not null then
    select
      special_pack_theme_type,
      special_pack_theme_value
    into
      theme_type,
      theme_value
    from public.shop_rotations
    where id = target_rotation_id;
  end if;

  -- =======================================================
  -- TRY EXACT RARITY + THEME
  -- =======================================================
  select
    card.id
  into chosen_card_id
  from public.card_catalog card
  where
    card.format_eligible = true
    and public.is_master_duel_offerable(card.master_duel_status)
    and card.game_rarity = target_rarity
    and (
      select count(*)
      from public.card_instances instance
      where
        instance.current_owner_id = target_profile_id
        and instance.card_catalog_id = card.id
    ) < public.shop_card_copy_limit(card.game_rarity)
    and (
      theme_type is null
      or theme_value is null
      or case theme_type
        when 'archetype'
          then coalesce(card.archetype, '') ilike '%' || theme_value || '%'
        when 'attribute'
          then coalesce(card.attribute, '') ilike '%' || theme_value || '%'
        when 'monster_type'
          then coalesce(card.monster_type, '') ilike '%' || theme_value || '%'
        when 'card_type'
          then coalesce(card.card_type, '') ilike '%' || theme_value || '%'
        when 'frame_type'
          then coalesce(card.frame_type, '') ilike '%' || theme_value || '%'
        when 'custom'
          then true
        else true
      end
    )
  order by random()
  limit 1;

  if chosen_card_id is not null then
    return chosen_card_id;
  end if;

  -- =======================================================
  -- FALLBACK:
  -- EXACT RARITY WITHOUT THEME
  -- =======================================================
  select
    card.id
  into chosen_card_id
  from public.card_catalog card
  where
    card.format_eligible = true
    and public.is_master_duel_offerable(card.master_duel_status)
    and card.game_rarity = target_rarity
    and (
      select count(*)
      from public.card_instances instance
      where
        instance.current_owner_id = target_profile_id
        and instance.card_catalog_id = card.id
    ) < public.shop_card_copy_limit(card.game_rarity)
  order by random()
  limit 1;

  if chosen_card_id is not null then
    return chosen_card_id;
  end if;

  -- =======================================================
  -- FALLBACK:
  -- THEMED CARD OF ANY RARITY
  -- =======================================================
  if theme_type is not null and theme_value is not null then
    select
      card.id
    into chosen_card_id
    from public.card_catalog card
    where
      card.format_eligible = true
      and public.is_master_duel_offerable(card.master_duel_status)
      and (
        select count(*)
        from public.card_instances instance
        where
          instance.current_owner_id = target_profile_id
          and instance.card_catalog_id = card.id
      ) < public.shop_card_copy_limit(card.game_rarity)
      and case theme_type
        when 'archetype'
          then coalesce(card.archetype, '') ilike '%' || theme_value || '%'
        when 'attribute'
          then coalesce(card.attribute, '') ilike '%' || theme_value || '%'
        when 'monster_type'
          then coalesce(card.monster_type, '') ilike '%' || theme_value || '%'
        when 'card_type'
          then coalesce(card.card_type, '') ilike '%' || theme_value || '%'
        when 'frame_type'
          then coalesce(card.frame_type, '') ilike '%' || theme_value || '%'
        when 'custom'
          then true
        else true
      end
    order by random()
    limit 1;
  end if;

  if chosen_card_id is not null then
    return chosen_card_id;
  end if;

  -- =======================================================
  -- FINAL FALLBACK:
  -- ANY CARD BELOW OWNERSHIP CAP
  -- =======================================================
  select
    card.id
  into chosen_card_id
  from public.card_catalog card
  where
    card.format_eligible = true
    and public.is_master_duel_offerable(card.master_duel_status)
    and (
      select count(*)
      from public.card_instances instance
      where
        instance.current_owner_id = target_profile_id
        and instance.card_catalog_id = card.id
    ) < public.shop_card_copy_limit(card.game_rarity)
  order by random()
  limit 1;

  if chosen_card_id is null then
    raise exception 'No eligible cards remain for this player.';
  end if;

  return chosen_card_id;
end;
$function$;


commit;
