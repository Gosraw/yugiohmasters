-- =========================================================
-- LIVE_PHASE1_ROLLOUT_2026_08_31.sql
--
-- ONE ordered, idempotent-where-possible rollout of every Duelist
-- Circle Classic / archetype registry / round-reward / Legendary-
-- scarcity change that is NOT yet confirmed live, assembled from the
-- individual migration files already committed to
-- supabase/migrations/. Nothing here is new game-design logic - it
-- is the exact content of those files (byte-identical bodies,
-- re-verified against their source generators/diffs before this
-- file was assembled), reordered into one dependency-safe script and
-- wrapped in a single transaction so the whole rollout either fully
-- applies or fully rolls back.
--
-- CONTENTS, IN DEPENDENCY ORDER
--   1. 202608301100_seed_manual_rarity_overrides_round2.sql
--      Round-2 manual rarity overrides (6 cards). Independent.
--   2. 202608301200_seed_2015_2018_legacy_support_whitelist.sql
--      2015-2018 curated legacy-support whitelist (15 cards).
--      Depends on duelist_circle_classic_v1 existing (already
--      confirmed live per the current known-state notes - if it is
--      NOT actually live yet, this section's inserts silently no-op
--      via its own internal existence check and RAISE NOTICE, they
--      do not fail the transaction).
--   3. 202608301300_archetype_registry_schema.sql
--      archetype_registry / archetype_cards tables. Independent.
--   4. 202608301400_seed_archetype_registry.sql
--      10 archetypes, 255 card relationships. Depends on #3's
--      tables and on card_catalog. Regenerated fresh from
--      scripts/generate-archetype-registry-migration.mjs immediately
--      before this rollout was assembled and confirmed BYTE-FOR-BYTE
--      IDENTICAL to the committed file - see the rollout report for
--      the exact verification steps (this directly addresses the
--      "relation Skyscraper does not exist" incident: the generator,
--      its self-test, its regression suite, an independent quote/
--      paren-balance tokenizer, and this byte-for-byte diff all
--      agree the current file is safe).
--   5. 202608301500_round_reward_settlement_and_auto_finalize.sql
--      Round-reward tables/grants, settle_round_rewards_v2(),
--      settle_competition_if_complete_v2(), and the redeployed
--      submit_competition_match_result_v2() / submit_competition_
--      tiebreak_match_result() that call them. Depends on the
--      existing competitions/matches/competition_reward_grants
--      schema (already live).
--   6. 202608310000_round_reward_economy_correction.sql
--      Corrects install_default_round_rewards_v2()'s placeholder
--      numbers (0/850) to the human-approved participation value
--      (250 DP + 1 Premium Pack) and the closest-fitting round_winner
--      value (150 DP + 1 Standard/normal_pack) - see that file's own
--      header and the rollout report's economy-conflicts section for
--      exactly what could and could not be mapped onto the existing
--      two-role schema. Depends on #5.
--   7. 202608302335_legendary_league_wide_scarcity.sql
--      Fixes purchase_shop_pack() so a Legendary card's copy limit is
--      enforced league-wide (not per-player). Independent of 1-6;
--      depends on the existing shop schema (already live).
--   8. 202608310010_phase1_verify_introspect_helper.sql
--      One narrow, read-only, security-definer RPC used only by
--      scripts/verify-phase1-live.mjs (see step 3 of the deployment
--      procedure) to confirm the functions/indexes above actually
--      exist and contain the expected corrected values - needed
--      because Supabase's default PostgREST config does not expose
--      pg_catalog directly to a REST/JS client. Optional to keep
--      afterward; safe to drop once Phase 1 is verified.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
--   - Does not activate duelist_circle_classic_v1 (is_active stays
--     false, exactly as every source migration already sets it) -
--     activating a format is a separate, deliberate operator
--     decision, not a database-readiness task.
--   - Does not change match DP, pack prices, or the special-pack
--     rotation model - those are already-implemented, deliberately
--     configured systems (not placeholders), and changing them would
--     be an economy redesign, out of scope for Phase 1. See the
--     rollout report for the exact conflicts found against the
--     latest human-stated baseline and why they were left alone.
--   - Does not re-run anything already confirmed live by name
--     (the original 9 rarity overrides, the classic format row
--     itself) - but every statement below is written so re-running
--     it is still safe (IF NOT EXISTS / OR REPLACE / ON CONFLICT),
--     in case the live state is less far along than currently
--     believed.
--
-- SAFE TO RE-RUN: every CREATE is IF NOT EXISTS or OR REPLACE, every
-- INSERT is ON CONFLICT DO NOTHING or DO UPDATE, and the one UPDATE
-- (round-reward economy correction) only touches rows matching the
-- exact old placeholder values. Running this file twice in a row
-- produces the same end state as running it once.
-- =========================================================

begin;


-- =========================================================
-- SOURCE: supabase/migrations/202608301100_seed_manual_rarity_overrides_round2.sql
-- =========================================================

-- =========================================================
-- MANUAL RARITY OVERRIDE SEED - ROUND 2 (2026-08-30 human calibration
-- pass)
--
-- WHY
-- The human calibration brief supplied 58 new approved rarity
-- classifications alongside a detailed rarity philosophy (archetype
-- dependence, realistic archetype/nostalgia usage, effect strength,
-- summoning/activation difficulty, immediate impact, generic
-- usability - see docs/cardpool-classic-format-audit-2026-08-30.md
-- for the general, reusable scoring changes made in response:
-- material-count/specificity-aware accessibility, a tightened
-- Legendary ceiling-only escape, immediate-impact/delayed-setup,
-- randomness, single-use, and heavy-tribute-cost signals, all in
-- lib/valuation-engine.mjs).
--
-- Of the calibration cards this sandbox could verify with confident,
-- real oracle text (see lib/valuation-engine.regression.test.mjs's
-- "HUMAN CALIBRATION PASS (ROUND 2)" section), most either already
-- matched the improved engine (Light and Darkness Dragon, Ancient
-- Gear Beast) or landed within one adjacent tier (Obelisk the
-- Tormentor, Jowgen the Spiritualist - left to the engine, NOT
-- overridden, per the brief's own "for borderline ratings, either
-- adjacent rarity is acceptable" and "do not overfit" instructions).
-- Four cards missed by 2+ tiers even after the general improvements -
-- the SAME "quiet value / reactive-disruption text-only valuation
-- can't see it" gap the ORIGINAL 9-card calibration table already
-- established (this is a second confirmation of a known, accepted
-- limitation, not a new one) - and are seeded here exactly like the
-- original 9 were.
--
-- Two more (the Arcana Force EX rulers) are seeded from the brief's
-- OWN explicit named exception (section 9E: "despite randomness, the
-- HUMAN evaluation still considers both EX rulers Legendary because
-- their ultimate impact and identity are exceptional... do not
-- therefore make a blanket coin-toss-= low-rarity rule") WITHOUT a
-- matching regression fixture - this sandbox's recollection of these
-- two cards' exact oracle text is not confident enough to build a
-- reliable fixture from, and per the brief's own "if a card remains
-- difficult for text-only valuation, leave it manual" doctrine, a
-- named human exception with uncertain text is exactly what manual
-- override exists for, rather than guessing at a fixture that could
-- silently encode wrong text into the regression suite.
--
-- SAFETY (identical pattern to the original round)
-- - UPDATE ... WHERE name = '<exact name>', never a hardcoded id.
-- - Only touches these 6 named cards. Does not re-touch or alter any
--   of the original 9 (Rescue Rabbit, Tragoedia, Gorz, Battle Fader,
--   Swift Scarecrow, D.D. Crow, Effect Veiler, Maxx "C", Giant
--   Trunade), Change of Heart, Dark Hole, Monster Reborn, or
--   Premature Burial - none of those are referenced below.
-- - Obelisk the Tormentor and Jowgen the Spiritualist are
--   deliberately NOT included here - see above.
-- =========================================================

do $$
declare
  v_count integer;
begin
  -- Doomcaliber Knight = Secret Rare
  update public.card_catalog
  set game_rarity = 'Secret Rare',
      rarity_manually_overridden = true,
      rarity_needs_review = false,
      rarity_confidence = 1.0,
      rarity_reason = 'Human calibration pass round 2 (2026-08-30): strong reactive disruption (negates and banishes a Special Summoned monster''s effect), but value depends entirely on the OPPONENT Special Summoning - real-world impact is matchup/format-frequency dependent in a way text-only valuation cannot see (same known gap as the original 9-card hand-trap calibration table).',
      rarity_reviewed_at = now()
  where name = 'Doomcaliber Knight';
  get diagnostics v_count = row_count;
  if v_count = 0 then raise notice 'Manual rarity override: no card_catalog row found for "Doomcaliber Knight" - check the name.'; end if;

  -- Rainbow Dragon = Secret Rare
  update public.card_catalog
  set game_rarity = 'Secret Rare',
      rarity_manually_overridden = true,
      rarity_needs_review = false,
      rarity_confidence = 1.0,
      rarity_reason = 'Human calibration pass round 2 (2026-08-30): a genuine build-around payoff (banish 1 monster of each of 7 different Attributes from the Graveyard to Special Summon), but its ceiling comes from a hard alternate-summon CONDITION rather than an archetype tag or an optional-bonus reference - neither ceiling-bonus shape the engine currently recognizes applies, so it is undervalued despite deserving real build-around credit.',
      rarity_reviewed_at = now()
  where name = 'Rainbow Dragon';
  get diagnostics v_count = row_count;
  if v_count = 0 then raise notice 'Manual rarity override: no card_catalog row found for "Rainbow Dragon" - check the name.'; end if;

  -- Sorcerer of Dark Magic = Secret Rare
  update public.card_catalog
  set game_rarity = 'Secret Rare',
      rarity_manually_overridden = true,
      rarity_needs_review = false,
      rarity_confidence = 1.0,
      rarity_reason = 'Human calibration pass round 2 (2026-08-30): a "quiet value engine" - real long-game Spell recursion advantage with no removal/draw/protection of its own to score against, PLUS a "Dark Magician" nostalgia tag (high expected real play rate per the brief''s section 6/9G) that text-only valuation structurally cannot weigh. Same known gap as the original 9-card calibration table.',
      rarity_reviewed_at = now()
  where name = 'Sorcerer of Dark Magic';
  get diagnostics v_count = row_count;
  if v_count = 0 then raise notice 'Manual rarity override: no card_catalog row found for "Sorcerer of Dark Magic" - check the name.'; end if;

  -- Superancient Deepsea King Coelacanth = Secret Rare
  update public.card_catalog
  set game_rarity = 'Secret Rare',
      rarity_manually_overridden = true,
      rarity_needs_review = false,
      rarity_confidence = 1.0,
      rarity_reason = 'Human calibration pass round 2 (2026-08-30): a repeatable once-per-turn Special Summon engine - real, substantial long-game value with no removal/draw/protection signal for text-only valuation to score, the same "quiet value engine" gap as Sorcerer of Dark Magic above.',
      rarity_reviewed_at = now()
  where name = 'Superancient Deepsea King Coelacanth';
  get diagnostics v_count = row_count;
  if v_count = 0 then raise notice 'Manual rarity override: no card_catalog row found for "Superancient Deepsea King Coelacanth" - check the name.'; end if;

  -- Arcana Force EX - The Light Ruler = Legendary
  update public.card_catalog
  set game_rarity = 'Legendary',
      rarity_manually_overridden = true,
      rarity_needs_review = false,
      rarity_confidence = 0.85,
      rarity_reason = 'Human calibration pass round 2 (2026-08-30), brief section 9E explicit named exception: despite a coin-toss-style randomized outcome (which the engine now generally treats as a real consistency penalty), the human evaluation holds this card as Legendary because its ultimate impact and identity are exceptional - not a blanket "randomness = low rarity" case. Seeded as a manual override rather than a regression fixture: this sandbox is not confident enough in this card''s exact oracle text to build a reliable text-based fixture (see docs/cardpool-classic-format-audit-2026-08-30.md).',
      rarity_reviewed_at = now()
  where name = 'Arcana Force EX - The Light Ruler';
  get diagnostics v_count = row_count;
  if v_count = 0 then raise notice 'Manual rarity override: no card_catalog row found for "Arcana Force EX - The Light Ruler" - check the exact name/spacing/hyphenation in your catalog.'; end if;

  -- Arcana Force EX - The Dark Ruler = Legendary
  update public.card_catalog
  set game_rarity = 'Legendary',
      rarity_manually_overridden = true,
      rarity_needs_review = false,
      rarity_confidence = 0.85,
      rarity_reason = 'Human calibration pass round 2 (2026-08-30), brief section 9E explicit named exception - see Arcana Force EX - The Light Ruler above for the identical reasoning (both EX rulers are called out together in the brief).',
      rarity_reviewed_at = now()
  where name = 'Arcana Force EX - The Dark Ruler';
  get diagnostics v_count = row_count;
  if v_count = 0 then raise notice 'Manual rarity override: no card_catalog row found for "Arcana Force EX - The Dark Ruler" - check the exact name/spacing/hyphenation in your catalog.'; end if;

  raise notice 'Manual rarity override seed (round 2) complete - see rarity_manually_overridden = true rows for these 6 cards. Obelisk the Tormentor and Jowgen the Spiritualist were deliberately left un-overridden (see migration header).';
end $$;

-- =========================================================
-- SOURCE: supabase/migrations/202608301200_seed_2015_2018_legacy_support_whitelist.sql
-- =========================================================

-- =========================================================
-- 2015-2018 LEGACY SUPPORT WHITELIST (cardpool enrichment pass,
-- 2026-08-30)
--
-- WHY
-- duelist_circle_classic_v1's release-era policy treats 2015-2018 as
-- curated-only: a card in that window is excluded by default unless
-- an explicit format_card_overrides(override_type='include') row
-- whitelists it (see 202608300900_duelist_circle_classic_format.sql,
-- which seeded the brief's own model example, Chocolate Magician
-- Girl). This migration adds the next batch: HIGH-CONFIDENCE-ONLY
-- 2015-2018 support cards for the nostalgia-priority archetypes
-- already represented in the eligible <=2014 pool (Elemental HERO /
-- Masked HERO, Dark Magician, Red-Eyes, Cyber Dragon, Ancient Gear,
-- Crystal Beast, Destiny HERO), found by inspecting the real
-- per-card audit output already in this repo
-- (reports/duelist-circle-classic/2026-08-30T18-12-01-890Z/
-- per-card.json - see the cardpool enrichment audit report for the
-- exact jq queries used) since this sandbox still has no live
-- Supabase/network access.
--
-- CONFIDENCE DISCIPLINE (per the brief's own explicit instruction:
-- "if a card cannot be verified, place it in REVIEW rather than
-- pretending certainty")
-- Every card below is real (confirmed present in the live catalog's
-- 2015-2018 era-excluded pool via the report artifact) and this
-- session has HIGH or MODERATE-HIGH confidence in its actual,
-- documented oracle-text function from training knowledge - not a
-- guess at a plausible-sounding effect. Every OTHER 2015-2018
-- candidate this pass looked at (several dozen more - the "Eyes of
-- Blue" Blue-Eyes wave, the 2018 Vampire wave, most of the Destiny
-- HERO/Ancient Gear/Red-Eyes sub-rosters) is deliberately left OUT of
-- this migration and listed in the audit report's HUMAN REVIEW
-- section instead, pending either real oracle-text verification
-- against the live catalog or a human call on power level.
--
-- SAFETY (identical pattern to every prior override migration)
-- - INSERT ... SELECT ... WHERE c.name = '<exact name>', never a
--   hardcoded id. A name that doesn't exist in the real catalog
--   matches 0 rows and is reported via RAISE NOTICE, not a failure.
-- - on conflict (format_id, card_catalog_id) do nothing - safe to
--   re-run.
-- - Purely additive: only inserts new format_card_overrides rows.
--   Does not touch duelist_circle_formats, card_catalog, or any
--   rarity override from either prior round.
-- - is_active on duelist_circle_classic_v1 remains false (set by the
--   original migration) - this is still a PROPOSED format, activating
--   it is a separate deliberate operator decision.
-- =========================================================

do $$
declare
  v_format_id uuid;
  v_count integer;
  v_card text[];
  v_cards text[][] := array[
    -- [name, reason]
    array['Elemental HERO Shadow Mist', 'Elemental HERO: generic-target removal (discard 1 card, destroy any card) plus on-death recursion (searches a HERO card) - fixes the archetype''s real weakness (no removal) without becoming a repeatable engine (once per turn, real discard cost).'],
    array['Mask Change II', 'Masked HERO: the archetype''s core instant-speed Fusion Summon enabler (Special Summons a Masked HERO from the Extra Deck using a face-up HERO monster you control as material, negating its effects for the turn) - already-eligible Masked HERO Fusion Monsters (Goka, Vapor, Dian) currently have no in-format way to combo into this way.'],
    array['Elemental HERO Blazeman', 'Elemental HERO: on-summon search for any HERO card - simple, safe consistency piece, immediate impact, no Special Summon acceleration or extra materials generated.'],
    array['Eternal Soul', 'Dark Magician: Continuous Trap that protects Spellcaster monsters while you control Dark Magician and revives a destroyed Dark Magician from hand/Deck/GY - reinforces the archetype''s core identity and improves recovery exactly as the brief''s "good later support" criteria ask for, without creating a searchable engine.'],
    array['Red-Eyes Fusion', 'Red-Eyes: the archetype''s Fusion Summon enabler (Fusion Summons a "Red-Eyes" Fusion Monster using materials from hand/field, including 1 Dragon-Type monster) - directly improves Fusion access for a nostalgia-priority archetype that is currently thin on Extra Deck options.'],
    array['Red-Eyes Black Dragon Sword', 'Red-Eyes: an accessible 2-material Fusion boss (Red-Eyes B. Dragon-line + a Warrior-Type monster) that remains useful even after leaving the field (becomes a recoverable Equip Spell) - improves both Fusion access and recursion.'],
    array['The Black Stone of Legend', 'Red-Eyes: a simple on-summon searcher for Red-Eyes Black Dragon, the direct Red-Eyes counterpart to the already-eligible "The White Stone of Legend" for Blue-Eyes - low power, pure consistency fix.'],
    array['Cyber Emergency', 'Cyber Dragon: the archetype''s signature, iconic search Spell (mill 1 Cyber Dragon monster, search a different one) - simple, safe, thematic, no Special Summon acceleration.'],
    array['Cyber Dragon Herz', 'Cyber Dragon: reuses the archetype''s own established "Special Summon from hand if you control no monsters" identity mechanic - not a new modern-engine risk, a direct extension of Cyber Dragon''s own established gimmick.'],
    array['Cyber Dragon Vier', 'Cyber Dragon: same free-Special-Summon identity mechanic as Cyber Dragon Herz, conditioned on the opponent controlling more monsters - reinforces archetype identity rather than introducing new patterns.'],
    array['Chaos Ancient Gear Giant', 'Ancient Gear: the archetype''s single most iconic and requested Fusion boss (Ancient Gear Golem + 1 DARK monster; opponent cannot respond to its attacks) - archetype-defining reward, moderately accessible (the archetype''s own signature monster + any generic DARK monster, not a narrow named-material lock).'],
    array['Ancient Gear Fusion', 'Ancient Gear: a dedicated Fusion Summon enabler for the archetype''s Machine-Type monsters - directly improves Fusion access, the same role Red-Eyes Fusion plays for Red-Eyes.'],
    array['Ancient Gear Howitzer', 'Ancient Gear: a second, lower-power Fusion option (2 Machine-Type monsters) giving the archetype real Extra Deck choice rather than a single defining boss - reinforces identity without escalating past Chaos Ancient Gear Giant.'],
    array['Rainbow Overdragon', 'Crystal Beast: the archetype''s ultimate capstone Fusion, requiring all 7 named Crystal Beast monsters as material - an intentionally hard-to-assemble, narrow-named-material archetype-defining reward (per the brief''s own rarity philosophy, summon difficulty this extreme argues against Legendary regardless of raw power - see the audit report''s rarity recommendation).'],
    array['D-Fusion', 'Destiny HERO: the archetype''s surprise-Trap Fusion Summon enabler, using up to 2 Destiny HERO monsters already on the field - Destiny End Dragoon (the Fusion target) is already eligible in this format but currently has no dedicated in-format way to summon it.']
  ];
begin
  select id into v_format_id from public.duelist_circle_formats where code = 'duelist_circle_classic_v1';
  if v_format_id is null then
    raise notice '2015-2018 legacy support whitelist: no duelist_circle_classic_v1 format row found - run 202608300900_duelist_circle_classic_format.sql first. Skipping all inserts.';
  else
    foreach v_card slice 1 in array v_cards
    loop
      insert into public.format_card_overrides (format_id, card_catalog_id, override_type, reason)
      select v_format_id, c.id, 'include', v_card[2]
      from public.card_catalog c
      where c.name = v_card[1]
      on conflict (format_id, card_catalog_id) do nothing;
      get diagnostics v_count = row_count;
      if v_count = 0 then
        raise notice '2015-2018 legacy support whitelist: no card_catalog row found for "%" (or override already existed) - check the exact name.', v_card[1];
      end if;
    end loop;
  end if;
end $$;

-- =========================================================
-- SOURCE: supabase/migrations/202608301300_archetype_registry_schema.sql
-- =========================================================

-- =========================================================
-- ARCHETYPE REGISTRY - SCHEMA
--
-- WHY
-- Every prior Duelist Circle Classic pass (eligibility, valuation,
-- rarity calibration, 2015-2018 legacy support) produced either a
-- computed score or a curated whitelist, but nothing the app itself
-- can query to answer "what does the Blue-Eyes deck actually look
-- like, and what's still missing?" This is that layer: a real,
-- app-queryable classification of which eligible cards belong to
-- which archetype, what ROLE they play, which are Extra Deck bosses
-- (and how hard those are to actually summon in THIS format), which
-- curated deckbuilding package tier they fall into, and where each
-- archetype sits on the early/mid/late/signature boss progression
-- ladder this project is building toward.
--
-- Two tables, config/reference data (same class as
-- duelist_circle_formats / format_card_overrides, NOT player data -
-- no profile_id anywhere here):
--
--   archetype_registry - one row per archetype. Carries the
--     descriptive + viability-profile fields (consistency, removal,
--     defense, recovery, boss_power, summoning_speed,
--     nostalgia_relevance, overall_health, deck_reality) plus a
--     small structured `gaps` array (jsonb: [{category, description}])
--     naming EXACTLY what's missing (a searcher, a Fusion spell, a
--     Level 4 body, Xyz access, etc.) rather than a vague prose note.
--
--   archetype_cards - one row per (archetype, card) relationship.
--     card_catalog_id is a real foreign key (not a name string) -
--     every seeding migration resolves it via
--     `select c.id from card_catalog c where c.name = '<exact name>'`
--     at apply time, the same safe pattern every prior migration in
--     this repo uses, so the STORED relationship is always the real
--     id even though this sandbox never has a live connection to look
--     one up ahead of time.
--
-- APP-READY SHAPE
-- lib/archetype-registry.mjs's getArchetype() joins these two tables
-- (plus card_catalog for name/card_type/game_rarity) into the exact
-- object shape section 12 of the brief describes. This migration is
-- the storage; that module is the read API - see its own header.
--
-- VALIDATION
-- The Node-side generator/test suite (scripts/generate-archetype-
-- registry-migration.mjs, lib/archetype-registry.regression.test.mjs)
-- checks "every referenced card exists" and "no Synchro/Link/
-- Pendulum card in a BOSS/FUSION/XYZ slot" against the real catalog
-- BEFORE any SQL is generated - the cheapest place to catch a mistake
-- is before it becomes a migration. The trigger below is a second,
-- independent DB-level guard for the mechanic check specifically,
-- since that invariant is cheap to enforce declaratively and matters
-- enough to defend twice.
-- =========================================================

create table if not exists public.archetype_registry (
  id uuid primary key default gen_random_uuid(),

  code text not null unique,
  name text not null,
  description text,

  -- Position in the "nostalgia priority" review order (brief section
  -- 1/7/9). NULL = not one of the originally-named priority
  -- archetypes; still a perfectly normal registry row.
  priority_rank integer,

  nostalgia_relevance text not null
    check (nostalgia_relevance in ('LOW', 'MEDIUM', 'HIGH')),
  consistency text not null
    check (consistency in ('LOW', 'MEDIUM', 'HIGH')),
  removal text not null
    check (removal in ('LOW', 'MEDIUM', 'HIGH')),
  defense text not null
    check (defense in ('LOW', 'MEDIUM', 'HIGH')),
  recovery text not null
    check (recovery in ('LOW', 'MEDIUM', 'HIGH')),
  boss_power text not null
    check (boss_power in ('LOW', 'MEDIUM', 'HIGH')),
  summoning_speed text not null
    check (summoning_speed in ('SLOW', 'MEDIUM', 'FAST')),
  overall_health text not null
    check (overall_health in ('TOO_WEAK', 'WEAK', 'HEALTHY', 'STRONG', 'TOO_STRONG')),

  -- "Can this realistically fill a 40-card deck on its own?" (brief
  -- section 6) - deliberately NOT forced to FULL_DECK for every
  -- archetype; Jinzo is the brief's own example of a legitimate
  -- THIN_THEME.
  deck_reality text not null
    check (deck_reality in ('FULL_DECK', 'ENGINE_PLUS_GENERIC', 'THIN_THEME')),

  -- [{ "category": "searcher" | "fusion_spell" | "recovery" |
  --    "removal" | "defensive_card" | "boss" | "level_4_body" |
  --    "xyz_access" | "consistency" | "other", "description": "..." }]
  -- Specific and actionable per the brief's section 8 - never a bare
  -- "could use more support" placeholder.
  gaps jsonb not null default '[]'::jsonb,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.archetype_registry is
  'One row per Duelist Circle archetype: description, viability profile (consistency/removal/defense/recovery/boss_power/summoning_speed/nostalgia_relevance/overall_health), deck-size reality (FULL_DECK/ENGINE_PLUS_GENERIC/THIN_THEME), and a structured gaps array. Config/reference data - admin-managed, not player data.';

comment on column public.archetype_registry.gaps is
  'Array of {category, description} objects naming a SPECIFIC missing piece (a searcher, a Fusion spell, a Level 4 body, Xyz access, etc.), never a vague "needs more support" placeholder.';

create table if not exists public.archetype_cards (
  id uuid primary key default gen_random_uuid(),

  archetype_id uuid not null
    references public.archetype_registry(id)
    on delete cascade,

  card_catalog_id uuid not null
    references public.card_catalog(id)
    on delete cascade,

  role text not null
    check (role in ('CORE', 'SUPPORT', 'BOSS', 'UTILITY', 'NICHE', 'AVOID')),

  -- NULL for Main Deck cards. Synchro/Link/Pendulum are deliberately
  -- NOT valid values here - see the trigger below, which also
  -- double-checks the card's own real card_type/frame_type agrees.
  extra_deck_kind text
    check (extra_deck_kind in ('FUSION', 'XYZ')),

  -- Based on actual required materials/setup in THIS format, not the
  -- monster's stats (brief section 3) - NULL for non-boss/non-Extra-
  -- Deck cards, where the concept doesn't apply.
  summon_difficulty text
    check (summon_difficulty in ('EASY', 'MODERATE', 'HARD', 'VERY_HARD')),

  -- NULL = not part of any curated deckbuilding package (this is the
  -- normal state for SUPPORT/UTILITY/NICHE/AVOID cards not chosen for
  -- a tier; ESSENTIAL/RECOMMENDED/EXPANSION cards are always CORE or
  -- BOSS role, never AVOID).
  package_tier text
    check (package_tier in ('ESSENTIAL', 'RECOMMENDED', 'EXPANSION')),

  -- Boss progression ladder (brief section 10). NULL for the large
  -- majority of rows - only set on the small number of cards chosen
  -- as an archetype's actual progression candidates. An archetype
  -- with fewer than 4 sensible stages simply leaves some values
  -- unused rather than forcing a bad pick into every slot.
  boss_stage text
    check (boss_stage in ('EARLY', 'MID', 'LATE', 'SIGNATURE')),

  -- true = this session's classification confidence was moderate/low
  -- (per the brief's own "if a card cannot be verified, place it in
  -- REVIEW rather than pretending certainty" instruction) - a human
  -- should double-check role/tier/difficulty before treating this row
  -- as final, even though it is already stored (not omitted).
  needs_review boolean not null default false,

  notes text,

  created_at timestamptz not null default now(),

  unique (archetype_id, card_catalog_id)
);

comment on table public.archetype_cards is
  'One row per (archetype, card) classification: role (CORE/SUPPORT/BOSS/UTILITY/NICHE/AVOID), Extra Deck kind + summon difficulty for Fusion/Xyz bosses, curated package tier (ESSENTIAL/RECOMMENDED/EXPANSION), and boss-progression stage (EARLY/MID/LATE/SIGNATURE) where applicable. needs_review=true flags a classification this session was not fully confident in.';

create index if not exists archetype_cards_archetype_idx
  on public.archetype_cards(archetype_id);

create index if not exists archetype_cards_card_idx
  on public.archetype_cards(card_catalog_id);

-- ---------------------------------------------------------
-- Defense-in-depth: an archetype_cards row claiming extra_deck_kind
-- must actually match the referenced card's real card_type/frame_type
-- - and Synchro/Link/Pendulum can never be stored as a boss/Extra
-- Deck kind here at all, independent of whatever the Node-side
-- generator already checked before producing the seed migration.
-- ---------------------------------------------------------

create or replace function public.enforce_archetype_card_extra_deck_kind()
returns trigger
language plpgsql
as $fn$
declare
  v_type text;
begin
  select lower(coalesce(c.card_type, '') || ' ' || coalesce(c.frame_type, ''))
  into v_type
  from public.card_catalog c
  where c.id = new.card_catalog_id;

  if v_type is null then
    raise exception 'archetype_cards: card_catalog_id % does not exist', new.card_catalog_id;
  end if;

  if v_type like '%synchro%' or v_type like '%link%' or v_type like '%pendulum%' then
    raise exception 'archetype_cards: card_catalog_id % is Synchro/Link/Pendulum ("%") - not a legal Duelist Circle Classic mechanic, cannot be registered as a boss/Extra Deck card', new.card_catalog_id, v_type;
  end if;

  if new.extra_deck_kind = 'FUSION' and v_type not like '%fusion%' then
    raise exception 'archetype_cards: card_catalog_id % marked extra_deck_kind=FUSION but its real card_type/frame_type ("%") is not a Fusion Monster', new.card_catalog_id, v_type;
  end if;

  if new.extra_deck_kind = 'XYZ' and v_type not like '%xyz%' then
    raise exception 'archetype_cards: card_catalog_id % marked extra_deck_kind=XYZ but its real card_type/frame_type ("%") is not an Xyz Monster', new.card_catalog_id, v_type;
  end if;

  return new;
end;
$fn$;

drop trigger if exists archetype_cards_enforce_extra_deck_kind on public.archetype_cards;

create trigger archetype_cards_enforce_extra_deck_kind
  before insert or update on public.archetype_cards
  for each row
  execute function public.enforce_archetype_card_extra_deck_kind();

alter table public.archetype_registry enable row level security;
alter table public.archetype_cards enable row level security;

drop policy if exists archetype_registry_select_authenticated on public.archetype_registry;
create policy archetype_registry_select_authenticated
  on public.archetype_registry
  for select
  to authenticated
  using (true);

drop policy if exists archetype_cards_select_authenticated on public.archetype_cards;
create policy archetype_cards_select_authenticated
  on public.archetype_cards
  for select
  to authenticated
  using (true);

-- Admin-managed config, mutated only via service-role tooling/the
-- generator script below - same pattern as duelist_circle_formats
-- and format_card_overrides.
revoke insert, update, delete on public.archetype_registry from authenticated;
revoke insert, update, delete on public.archetype_cards from authenticated;

-- =========================================================
-- SOURCE: supabase/migrations/202608301400_seed_archetype_registry.sql
-- =========================================================

-- =========================================================
-- ARCHETYPE REGISTRY - SEED DATA
--
-- GENERATED FILE - do not hand-edit. Regenerate with:
--   node scripts/generate-archetype-registry-migration.mjs
-- from data/archetype-registry.mjs, the human-maintained source of
-- truth. See that file's own header for the role/tier/difficulty
-- definitions and the confidence discipline behind needsReview.
--
-- Upsert-safe: archetype_registry is keyed on `code`, archetype_cards
-- on (archetype_id, card_catalog_id) - re-running this file after
-- regenerating it from an updated data file is always safe.
-- =========================================================

-- ---- Dark Magician (dark_magician) ----
insert into public.archetype_registry (code, name, description, priority_rank, nostalgia_relevance, consistency, removal, defense, recovery, boss_power, summoning_speed, overall_health, deck_reality, gaps, notes)
values ('dark_magician', 'Dark Magician', 'Duel Monsters'' most recognizable Spellcaster lineup: Yugi''s own Dark Magician and Dark Magician Girl, their Ritual/Fusion upgrades, and the Spell/Trap support that lets the deck find, protect, and rebuild around them.', 1, 'HIGH', 'MEDIUM', 'MEDIUM', 'LOW', 'HIGH', 'HIGH', 'MEDIUM', 'HEALTHY', 'FULL_DECK', '[{"category":"searcher","description":"No generic card adds ''Dark Magician'' by name to hand outside Sage''s Stone''s Level-2-Spellcaster condition (which itself needs a specific small monster on board) - a bad opening hand has no reliable way to find the deck''s own namesake."},{"category":"defensive_card","description":"No wall or protection Spell/Trap exists in the eligible pool; the deck has no answer to being out-tempo''d before its Fusion bosses come online."}]'::jsonb, 'Eternal Soul (2015-2018 whitelist, migration 202608301200) directly fixes part of the recovery/protection gap by reviving a destroyed Dark Magician - already reflected in the recovery=HIGH rating above.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  priority_rank = excluded.priority_rank,
  nostalgia_relevance = excluded.nostalgia_relevance,
  consistency = excluded.consistency,
  removal = excluded.removal,
  defense = excluded.defense,
  recovery = excluded.recovery,
  boss_power = excluded.boss_power,
  summoning_speed = excluded.summoning_speed,
  overall_health = excluded.overall_health,
  deck_reality = excluded.deck_reality,
  gaps = excluded.gaps,
  notes = excluded.notes,
  updated_at = now();

insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Namesake Normal Monster; every build needs it.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Dark Magician'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Iconic co-lead; gains ATK per Dark Magician/Magician-named card in GY.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Dark Magician Girl'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', 'EARLY', false, 'Banishes itself from GY to return a Spell to hand; strong recursion engine, real downside cost.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Dark Magician of Chaos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Accumulates Spell Counters toward Special Summoning a follow-up threat; a real Level-4 consistency body.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Skilled Dark Magician'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Special Summons Dark Magician from hand when you control a Level 2 or lower Spellcaster - the deck''s best consistency piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Sage''s Stone'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Destroys an opponent''s monster while you control Dark Magician - the archetype''s real removal answer.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Thousand Knives'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Pays 1000 LP to Special Summon Dark Magician from Deck, then can Special Summon a listed Fusion Monster without the Fusion procedure - directly enables the Fusion bosses below.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Dark Magic Curtain'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Tributes a Dark Magician/Magician of Black Chaos to summon Dark Magician of Chaos banished-until-return; costly but real value.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Dedication through Light and Darkness'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Special Summons a Spellcaster from GY at the cost of banishing a card from GY - real recovery piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Miracle Restoring'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Gains 300 ATK per Dark Magician-named card in GY; a scaling beater.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Dark Magician Knight'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Ritual Summons Magician of Black Chaos, the deck''s Ritual Monster.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Black Magic Ritual'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Ritual Monster enabled by Black Magic Ritual; strong body with a hand-cost removal effect.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Magician of Black Chaos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, true, 'Special Summons Buster Blader or Dark Paladin under conditions - exact wording not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Knight''s Title'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, 'EXPANSION', null, false, 'GX-movie Equip Spell boosting a Spellcaster''s ATK; situational.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'The Eye of Timaeus'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Destroys a Set Trap Card while you control Dark Magician - narrow, matchup-dependent removal.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Dark Magic Attack'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'UTILITY', null, null, 'EXPANSION', null, false, 'Equip Spell granting ATK to a Spellcaster and drawing a card on destruction.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Magic Formula'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, 'EXPANSION', null, false, 'Negates an opponent''s flip effect whenever a Spell resolves - narrow disruption.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Dark Eradicator Warlock'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, 'EXPANSION', null, true, 'GY-effect tied to reviving Magician of Black Chaos; combo-specific, exact text not fully re-verified.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Dark Sage'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'RECOMMENDED', 'LATE', false, 'Fusion of 1 Spellcaster-Type + 1 Dragon-Type monster - generic-ish materials, real accessible boss.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Amulet Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'HARD', 'RECOMMENDED', 'SIGNATURE', false, 'Fusion of Dark Magician + Buster Blader - the classic named 2-card anime combo; the archetype''s signature capstone.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Dark Paladin'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'RECOMMENDED', 'MID', false, 'Fusion of Dark Magician Girl + 1 Dragon-Type monster - the first realistically accessible Fusion boss.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Dark Magician Girl the Dragon Knight'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', 'FUSION', 'HARD', null, null, true, 'Catalogued under Dark Magician but this pass could not confidently verify a real functional tie to Dark Magician synergy (its known materials involve Flame Swordsman); held for human review rather than asserted.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Dark Flare Knight'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Magician Girl-archetype beater/support; the brief''s own model whitelist example (already included via the base format''s own override seed, migration 202608300900).'
from public.archetype_registry r, public.card_catalog c
where r.code = 'dark_magician' and c.name = 'Chocolate Magician Girl'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;

-- ---- Elemental HERO (elemental_hero) ----
insert into public.archetype_registry (code, name, description, priority_rank, nostalgia_relevance, consistency, removal, defense, recovery, boss_power, summoning_speed, overall_health, deck_reality, gaps, notes)
values ('elemental_hero', 'Elemental HERO', 'Jaden Yuki''s HERO lineup: five foundational Normal Monsters that combine into one of the deepest Fusion boss lineups of any archetype in this format, backed by best-in-class searchers (Stratos, E - Emergency Call, Bubbleman) and the Skyscraper Field Spell package.', 2, 'HIGH', 'HIGH', 'MEDIUM', 'LOW', 'MEDIUM', 'HIGH', 'FAST', 'STRONG', 'FULL_DECK', '[{"category":"removal","description":"No unconditional single-card removal Spell/Trap - R - Righteous Justice and Wrath of Neos both require a specific board setup, leaving the deck without a clean answer to an opposing floodgate before its own plan comes online."},{"category":"other","description":"A long tail of 2010-2011 Fusion Monsters (Absolute Zero, Electrum, The Shining, Divine Neos, Magma Neos, Nova Master, Wildedge, Necroid Shaman, Darkbright, Plasma Vice, Tempest, Neos Knight, Steam Healer) have exact Fusion-material text this pass could not independently verify with confidence - flagged needsReview rather than asserted, and held out of ESSENTIAL/RECOMMENDED until a human confirms the real card text."}]'::jsonb, 'overallHealth is set to STRONG rather than HEALTHY on purpose: this is genuinely the best-supported archetype in the current eligible pool (best consistency, deepest Fusion lineup, fastest starts) and the brief explicitly warns not to under-report that just to flatten the archetype list - the honest read is that this is where power-level attention should focus if the format needs rebalancing later, not that individual cards need nerfing now.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  priority_rank = excluded.priority_rank,
  nostalgia_relevance = excluded.nostalgia_relevance,
  consistency = excluded.consistency,
  removal = excluded.removal,
  defense = excluded.defense,
  recovery = excluded.recovery,
  boss_power = excluded.boss_power,
  summoning_speed = excluded.summoning_speed,
  overall_health = excluded.overall_health,
  deck_reality = excluded.deck_reality,
  gaps = excluded.gaps,
  notes = excluded.notes,
  updated_at = now();

insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Foundational Normal Monster; Fusion material for Flame Wingman.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Avian'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Foundational Normal Monster; Fusion material for Flame Wingman.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Burstinatrix'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Foundational Normal Monster; Fusion material for Thunder Giant.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Sparkman'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Foundational Normal Monster; Fusion material for Thunder Giant/Gaia line.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Clayman'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Foundational Normal Monster; base of the entire Neos-Fusion sub-line.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Neos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'On-summon search for any HERO card or draw - the deck''s single best consistency card.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Stratos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Special Summonable from hand with no other cards on board, draws 2 alone - key opener/consistency piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Bubbleman'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Banishes itself to add a Fusion Monster, or fuels Fusion Summons as material fuel - strong Fusion enabler.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Prisma'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Gemini Monster; searches a HERO Spell/Trap once treated as Normal Summoned again.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Neos Alius'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Strong Main Deck beater dealing damage equal to the ATK difference in battle.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Bladedge'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Adds any Elemental HERO monster from GY or Deck to hand - one of the format''s most efficient archetype searchers.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'E - Emergency Call'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Banishes Elemental HERO materials from field/GY to Fusion Summon - the single card that makes the whole Fusion lineup function.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Miracle Fusion'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Iconic Field Spell boosting HERO ATK vs higher-ATK monsters in battle - archetype-defining.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Skyscraper'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Special Summons two HERO monsters from hand if you control none - real consistency piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'HERO''s Bond'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'If this is your only card in hand, Special Summon a Level 4 or lower HERO from Deck - strong opener.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'A Hero Lives'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Upgrade tying into Skyscraper; real ongoing support.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Skyscraper 2 - Hero City'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Quick-Play Special Summon of a Fusion Monster from the Extra Deck by banishing its materials - instant-speed alternate Fusion access.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Hero Flash!!'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'EASY', 'ESSENTIAL', 'EARLY', false, 'Fusion of Avian + Burstinatrix - the deck''s most accessible boss, deals piercing-adjacent burn on battle destruction.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Flame Wingman'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'EASY', 'ESSENTIAL', null, false, 'Fusion of Sparkman + Clayman - accessible boss with a destroy-and-remove-defense effect.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Thunder Giant'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'RECOMMENDED', 'MID', false, 'Fusion of 1 Elemental HERO + 1 Warrior-Type monster - generic-ish materials, real mid-game upgrade.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Gaia'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'RECOMMENDED', 'LATE', false, 'Special Summoned via Mask Change (2015-2018 whitelist) using any face-up HERO you control - real instant-speed upgrade path.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Masked HERO Goka'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'RECOMMENDED', null, false, 'Same Mask Change access pattern as Goka; a defensive/control-oriented Masked HERO option.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Masked HERO Vapor'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'RECOMMENDED', null, false, 'Same Mask Change access pattern as Goka; a LP-recovery-oriented Masked HERO option.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Masked HERO Dian'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'HARD', 'RECOMMENDED', 'SIGNATURE', false, 'Named upgrade of Flame Wingman - iconic anime capstone, picked as the archetype''s SIGNATURE boss.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Shining Flare Wingman'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'HARD', 'RECOMMENDED', null, false, 'Requires a LIGHT and a DARK Elemental HERO as material - constrained-but-not-fully-named; a real signature-tier alternative capstone (see the human calibration brief''s own worked example).'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Chaos Neos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'VERY_HARD', 'EXPANSION', null, true, 'Big multi-material HERO Fusion; exact required materials not independently re-verified this pass with full confidence.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Phoenix Enforcer'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'HARD', 'EXPANSION', null, false, 'Upgrade requiring multiple Elemental HERO monsters as material - accessible in a HERO-heavy build.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Shining Phoenix Enforcer'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'RECOMMENDED', null, false, 'Fusion of Neos + Neo-Spacian Flare Scarab - real, well-supported Neos sub-line boss.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Flare Neos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, false, 'Fusion of Neos + a Neo-Spacian partner - Neos sub-line boss.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Dark Neos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, false, 'Fusion of Neos + a Neo-Spacian partner - Neos sub-line boss.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Storm Neos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, false, 'Fusion of Neos + a Neo-Spacian partner - Neos sub-line boss.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Glow Neos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, false, 'Fusion of Neos + a Neo-Spacian partner - Neos sub-line boss.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Aqua Neos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, false, 'Fusion of Neos + a Neo-Spacian partner - Neos sub-line boss.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Grand Neos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'VERY_HARD', 'EXPANSION', null, false, 'Requires Neos plus multiple named Neo-Spacians - an intentionally hard-to-assemble capstone, the Neos-line equivalent of Rainbow Overdragon.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Rainbow Neos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'VERY_HARD', 'EXPANSION', null, true, 'Historically a narrow named 2-card lock; exact required names not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Absolute Zero'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, false, 'Fusion of 1 Elemental HERO + 1 Warrior-Type monster - late-game upgrade in the same generic-material family as Gaia.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Great Tornado'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, false, 'Fusion of 1 Elemental HERO + 1 Warrior-Type monster.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Terra Firma'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, false, 'Fusion of 1 Elemental HERO + 1 EARTH monster.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Mudballman'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, false, 'Fusion of 1 Elemental HERO + 1 Warrior-Type monster.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Wild Wingman'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, false, 'Fusion of 1 Elemental HERO + 1 DARK monster.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Escuridao'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, false, 'Fusion of 1 Elemental HERO + 1 FIRE monster.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Inferno'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, false, 'Fusion of 1 Elemental HERO + 1 EARTH monster.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Rampart Blaster'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, false, 'Fusion of 1 Elemental HERO + 1 WATER monster.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Mariner'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, true, 'Likely Neos + Warrior-Type material; not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Neos Knight'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, true, 'Exact material text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Darkbright'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, true, 'Exact material text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Plasma Vice'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, true, 'Exact material text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Tempest'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, true, 'Exact material text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Necroid Shaman'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'VERY_HARD', 'EXPANSION', null, true, 'Believed to require several named Elemental HERO monsters; exact list not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO The Shining'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'HARD', 'EXPANSION', null, true, 'Exact material text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Nova Master'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'HARD', 'EXPANSION', null, true, 'Exact material text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Wildedge'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'VERY_HARD', 'EXPANSION', null, true, 'Believed to require several named Elemental HERO monsters as a capstone; exact list not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Electrum'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'HARD', 'EXPANSION', null, true, 'Exact material text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Magma Neos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'HARD', 'EXPANSION', null, true, 'Exact material text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Divine Neos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'EXPANSION', null, true, 'Exact material text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Steam Healer'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Lets you treat monsters in GY as banished to pay Fusion/effect costs - real enabler for the Fusion-heavy plan.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Necroshade'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, true, 'Real-world print is a Fusion Monster (Yubel + Neos), but this project''s catalog tags its card_type as an Effect Monster - treated here as Main Deck per the catalog''s own field; flagged for a human to confirm which card_type is authoritative before this is trusted as a BOSS/FUSION entry.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Neos Wiseman'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Cannot be targeted by Trap Cards; generic beater.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Wildheart'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, false, 'Minor mill/utility effect.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Woodsman'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, false, 'Situational battle-triggered removal.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Poison Rose'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, false, 'ATK boost tied to discarding; situational damage on battle destruction.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Heat'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, false, 'Low-power utility body.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Ice Edge'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, false, 'Minor variant effect.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Lady Heat'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, true, 'Bubbleman-line variant; exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Neo Bubbleman'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Later-era print; exact function not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Captain Gold'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact function not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Ocean'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact function not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Elemental HERO Flash'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'AVOID', null, null, null, null, true, 'Tagged ''HERO'' archetype in the catalog, but this pass found no real functional connection between its effect and Elemental HERO or Destiny HERO strategies - likely a data-tagging artifact; excluded from every package and flagged for a human to check the underlying archetype tag.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Phantom Magician'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Field Spell boosting Neo-Spacians/Neos-line monsters; enables the Neos sub-line.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Neo Space'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Quick-Play version of Neo Space.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Instant Neo Space'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Recovery Spell for the Neos-line.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Reverse of Neos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Contact Fusion enabler for Neos-line Fusion Monsters, skipping Polymerization - key enabler for the Neos sub-line.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Miracle Contact'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Returns banished HERO/Neo-Spacian materials to fuel another Fusion Summon - real recursion/extension piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Parallel World Fusion'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Special Summons a Level 4 or lower HERO from hand, ignoring its own summoning conditions - real consistency piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Fake Hero'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Special Summons a Normal Monster from GY - fits the deck''s five Normal Monster originals as a recovery piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'O - Oversoul'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Destroys Spell/Traps while you control an ''R''-named HERO - situational removal.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'R - Righteous Justice'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Board-wipe effect tied to the Neos-line; powerful but requires setup.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Wrath of Neos'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'UTILITY', null, null, 'EXPANSION', null, false, 'Equip Spell granting Bubbleman extra utility.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Bubble Blaster'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Bounces a monster - situational tempo/removal.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Bubble Shuffle'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Bubbleman-line support; exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Bubble Illusion'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Bounces a card and draws for a HERO-related cost - real value Trap.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Change of Hero - Reflector Ray'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Recyclable Spell/Trap-adjacent removal.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Cyclone Boomerang'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, false, 'Equip changing an opponent monster''s battle position.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Spark Blaster'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Situational protection; exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Hero Mask'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Negates an attack targeting your HERO monster - situational protection.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Hero Barrier'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Special Summons a Level 4 or lower HERO from Deck when your monster is destroyed by battle - real defensive recovery.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Hero Signal'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Hero Counterattack'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Hero Heart'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Hero Blast'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Hero Spirit'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Feather Shot'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Feather Wind'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Edge Hammer'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Kid Guard'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Fifth Hope'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Rose Bud'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Clay Charge'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Terra Firma Gravity'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Mirror Gate'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, false, 'Bounces your own HERO(s) for a reset/value line - situational.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'elemental_hero' and c.name = 'Burst Return'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;

-- ---- Blue-Eyes (blue_eyes) ----
insert into public.archetype_registry (code, name, description, priority_rank, nostalgia_relevance, consistency, removal, defense, recovery, boss_power, summoning_speed, overall_health, deck_reality, gaps, notes)
values ('blue_eyes', 'Blue-Eyes', 'Seto Kaiba''s signature dragon line: Blue-Eyes White Dragon and its Ritual/Fusion upgrades, with a small but real set of hand-summon enablers.', 3, 'HIGH', 'MEDIUM', 'LOW', 'LOW', 'LOW', 'HIGH', 'MEDIUM', 'WEAK', 'ENGINE_PLUS_GENERIC', '[{"category":"consistency","description":"Has bosses (Blue-Eyes Ultimate Dragon, Dragon Master Knight) but insufficient consistency - only 3 real enablers (The White Stone of Legend, Kaibaman, Maiden with Eyes of Blue) exist to reliably find or summon Blue-Eyes White Dragon before the deck can reach for its Fusion bosses."},{"category":"xyz_access","description":"Zero Xyz Monsters and no Level 4 generic body exist in the eligible pool - the deck cannot use the Xyz half of this format''s Extra Deck at all."},{"category":"removal","description":"Burst Stream of Destruction is the only removal card, and it requires Blue-Eyes White Dragon already on the field to activate."}]'::jsonb, null)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  priority_rank = excluded.priority_rank,
  nostalgia_relevance = excluded.nostalgia_relevance,
  consistency = excluded.consistency,
  removal = excluded.removal,
  defense = excluded.defense,
  recovery = excluded.recovery,
  boss_power = excluded.boss_power,
  summoning_speed = excluded.summoning_speed,
  overall_health = excluded.overall_health,
  deck_reality = excluded.deck_reality,
  gaps = excluded.gaps,
  notes = excluded.notes,
  updated_at = now();

insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Namesake Normal Monster.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'blue_eyes' and c.name = 'Blue-Eyes White Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Adds Blue-Eyes White Dragon from Deck to hand on Normal Summon - the archetype''s iconic searcher.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'blue_eyes' and c.name = 'The White Stone of Legend'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Discards itself to Special Summon Blue-Eyes White Dragon from hand - strong consistency piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'blue_eyes' and c.name = 'Kaibaman'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Searches/Special Summons Blue-Eyes monsters - key consistency piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'blue_eyes' and c.name = 'Maiden with Eyes of Blue'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Destroys all opponent''s monsters while you control Blue-Eyes White Dragon - the archetype''s removal answer.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'blue_eyes' and c.name = 'Burst Stream of Destruction'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Ritual Monster support tied to Blue-Eyes; enables a small Ritual sub-package.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'blue_eyes' and c.name = 'Paladin of White Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Strong Main Deck beater/effect body; flagged borderline Ultra/Secret in the human calibration pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'blue_eyes' and c.name = 'Blue-Eyes Shining Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, false, 'High-risk/high-reward body tied to a field-spell-lock condition; situational.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'blue_eyes' and c.name = 'Malefic Blue-Eyes White Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'VERY_HARD', 'RECOMMENDED', 'MID', false, 'Fusion of 3 named Blue-Eyes White Dragon - the archetype''s iconic capstone.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'blue_eyes' and c.name = 'Blue-Eyes Ultimate Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'VERY_HARD', 'EXPANSION', 'SIGNATURE', true, 'Ultimate crossover capstone Fusion; exact required materials not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'blue_eyes' and c.name = 'Dragon Master Knight'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;

-- ---- Red-Eyes (red_eyes) ----
insert into public.archetype_registry (code, name, description, priority_rank, nostalgia_relevance, consistency, removal, defense, recovery, boss_power, summoning_speed, overall_health, deck_reality, gaps, notes)
values ('red_eyes', 'Red-Eyes', 'Joey Wheeler''s Red-Eyes Black Dragon line - a Normal Monster core with real upgrade and recursion support, now reinforced by the 2015-2018 whitelist''s Fusion package.', 4, 'HIGH', 'MEDIUM', 'LOW', 'LOW', 'MEDIUM', 'MEDIUM', 'MEDIUM', 'HEALTHY', 'ENGINE_PLUS_GENERIC', '[{"category":"fusion_spell","description":"Has Fusion identity (Meteor Black Dragon, and now Red-Eyes Fusion / Red-Eyes Black Dragon Sword from the 2015-2018 whitelist) but lacks enough reliable Main Deck setup - no searcher finds Meteor Black Dragon specifically, and the deck still has no unconditional removal."},{"category":"removal","description":"Inferno Fire Blast is the only removal-adjacent card and requires Red-Eyes Black Dragon already on the field."}]'::jsonb, 'Red-Eyes Fusion, Red-Eyes Black Dragon Sword, and The Black Stone of Legend are sourced from the 2015-2018 legacy support whitelist (migration 202608301200_seed_2015_2018_legacy_support_whitelist.sql) - included here per the brief''s instruction to integrate that whitelist into the registry.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  priority_rank = excluded.priority_rank,
  nostalgia_relevance = excluded.nostalgia_relevance,
  consistency = excluded.consistency,
  removal = excluded.removal,
  defense = excluded.defense,
  recovery = excluded.recovery,
  boss_power = excluded.boss_power,
  summoning_speed = excluded.summoning_speed,
  overall_health = excluded.overall_health,
  deck_reality = excluded.deck_reality,
  gaps = excluded.gaps,
  notes = excluded.notes,
  updated_at = now();

insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Namesake Normal Monster.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'Red-Eyes Black Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'On-summon searcher for Red-Eyes Black Dragon, the Red-Eyes counterpart to White Stone of Legend. From 2015-2018 whitelist.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'The Black Stone of Legend'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Searches Red-Eyes cards on summon - consistency piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'Red-Eyes Wyvern'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Direct upgrade of Red-Eyes Black Dragon with added protection/effect.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'Red-Eyes Black Metal Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, true, 'Further upgrade requiring Red-Eyes Black Metal Dragon; exact Special Summon condition not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'Red-Eyes Darkness Metal Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Gains ATK and has GY-recovery utility - real recovery piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'Red-Eyes Darkness Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Recursive body Special-Summonable under Zombie-support conditions.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'Red-Eyes Zombie Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Classic searcher/evolution piece with a randomness element (dice-roll based).'
from public.archetype_registry r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'Black Dragon''s Chick'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Deals damage equal to Red-Eyes Black Dragon''s ATK while it''s on the field - the archetype''s reach/removal-adjacent finisher.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'Inferno Fire Blast'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'HARD', 'RECOMMENDED', 'MID', false, 'Fusion of Red-Eyes Black Dragon + Meteor Dragon, both named - the archetype''s pre-whitelist Fusion boss.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'Meteor Black Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Fusion Summons a named ''Red-Eyes'' Fusion Monster using materials from hand/field including 1 Dragon-Type monster - Fusion enabler. From 2015-2018 whitelist.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'Red-Eyes Fusion'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'EASY', 'RECOMMENDED', 'EARLY', false, '2-material Fusion (Red-Eyes B. Dragon line + a Warrior-Type monster) that becomes a recoverable Equip Spell after leaving the field. From 2015-2018 whitelist.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'red_eyes' and c.name = 'Red-Eyes Black Dragon Sword'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;

-- ---- Cyber Dragon (cyber_dragon) ----
insert into public.archetype_registry (code, name, description, priority_rank, nostalgia_relevance, consistency, removal, defense, recovery, boss_power, summoning_speed, overall_health, deck_reality, gaps, notes)
values ('cyber_dragon', 'Cyber Dragon', 'A Machine-Type engine built around free Special Summons when you control no monsters and your opponent controls at least one, feeding a compact Rank-4/5 Xyz lineup.', 5, 'HIGH', 'HIGH', 'LOW', 'MEDIUM', 'MEDIUM', 'HIGH', 'FAST', 'HEALTHY', 'ENGINE_PLUS_GENERIC', '[{"category":"removal","description":"No dedicated destruction/removal Spell or Trap outside Cyber Dragon Infinity''s own negation once it is already summoned - the deck has speed and Xyz access but no answer to a board it hasn''t already beaten."},{"category":"other","description":"Only 2 real Xyz Monsters exist for the archetype (Nova, Infinity) - healthy for a Rank-4-centric engine, but the deck still needs generic Machine-Type filler to reach 40 cards, matching its ENGINE_PLUS_GENERIC classification rather than FULL_DECK."}]'::jsonb, null)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  priority_rank = excluded.priority_rank,
  nostalgia_relevance = excluded.nostalgia_relevance,
  consistency = excluded.consistency,
  removal = excluded.removal,
  defense = excluded.defense,
  recovery = excluded.recovery,
  boss_power = excluded.boss_power,
  summoning_speed = excluded.summoning_speed,
  overall_health = excluded.overall_health,
  deck_reality = excluded.deck_reality,
  gaps = excluded.gaps,
  notes = excluded.notes,
  updated_at = now();

insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Namesake free-Special-Summon body when you control no monsters and the opponent controls one.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Cyber Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Smaller free-Special-Summon body and Xyz material enabler.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Cyber Dragon Core'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Free-Special-Summon variant with an additional searcher/support effect.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Cyber Dragon Zwei'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Free-Special-Summon variant reinforcing the archetype''s central swarm-for-Xyz gameplan.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Cyber Dragon Drei'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Earlier, weaker free-Special-Summon variant.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Proto-Cyber Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Real searcher for Cyber Dragon cards - key consistency piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Cyber Network'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Recovers/searches Cyber monsters.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Cyber Repair Plant'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Special Summons a Cyber monster and negates an attack - real defensive piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Attack Reflector Unit'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Union Monster equipping to a Machine-Type for a stat boost/protection.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Armored Cybern'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, true, 'Special Summon/tutor effect for a Cyber Dragon variant under specific conditions; exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Evolution Burst'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Special Summons a Machine-Type from hand under an LP-cost condition.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Photon Generator Unit'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Cybernetic Hidden Technology'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'XYZ', 'EASY', 'RECOMMENDED', 'EARLY', false, 'Rank 4/5 Xyz built from the archetype''s own generic-Level bodies - the archetype''s accessible early Xyz boss.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Cyber Dragon Nova'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'XYZ', 'MODERATE', 'RECOMMENDED', 'SIGNATURE', false, 'Higher Rank Xyz with negation - the archetype''s signature boss.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'cyber_dragon' and c.name = 'Cyber Dragon Infinity'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;

-- ---- Ancient Gear (ancient_gear) ----
insert into public.archetype_registry (code, name, description, priority_rank, nostalgia_relevance, consistency, removal, defense, recovery, boss_power, summoning_speed, overall_health, deck_reality, gaps, notes)
values ('ancient_gear', 'Ancient Gear', 'A slow, heavy-hitting Machine-Type archetype built around Ancient Gear Golem and Geartown, reinforced by a strong 2015-2018 Fusion package.', 6, 'HIGH', 'MEDIUM', 'MEDIUM', 'LOW', 'LOW', 'HIGH', 'SLOW', 'HEALTHY', 'FULL_DECK', '[{"category":"xyz_access","description":"Zero Xyz Monsters in the eligible pool - Ancient Gear''s entire Extra Deck presence is its Fusion line; the archetype cannot use the Xyz half of this format at all."},{"category":"recovery","description":"No dedicated recursion or graveyard-recovery Spell/Trap - once the deck''s few searchers and beaters are spent, it has no way to rebuild."}]'::jsonb, 'Chaos Ancient Gear Giant, Ancient Gear Fusion, and Ancient Gear Howitzer are sourced from the 2015-2018 legacy support whitelist (migration 202608301200) - integrated here per the brief''s instruction.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  priority_rank = excluded.priority_rank,
  nostalgia_relevance = excluded.nostalgia_relevance,
  consistency = excluded.consistency,
  removal = excluded.removal,
  defense = excluded.defense,
  recovery = excluded.recovery,
  boss_power = excluded.boss_power,
  summoning_speed = excluded.summoning_speed,
  overall_health = excluded.overall_health,
  deck_reality = excluded.deck_reality,
  gaps = excluded.gaps,
  notes = excluded.notes,
  updated_at = now();

insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', 'EARLY', false, 'Namesake beater; opponent cannot activate Spell/Trap Cards during your Battle Phase while it''s on the field.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Golem'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Adds an Ancient Gear card on summon - the deck''s key consistency piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Engineer'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Real Main Deck beater/support body.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Soldier'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Strong beater with immunity-to-targeting and extra-attack-adjacent effect; rated Ultra Rare in the human calibration pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Beast'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Burn/removal-adjacent effect.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Cannon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Cannot be destroyed by battle - strong beater.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Gadjiltron Chimera'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Strong beater line, similar role to Gadjiltron Chimera.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Gadjiltron Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Gemini Monster; searcher-ish consistency once treated as Normal Summoned again.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Knight'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, false, 'Minor Flip/trigger utility effect.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Box'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Iconic Field Spell reducing summon costs and enabling recursion - archetype-defining.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Geartown'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Repeatable Special Summon engine card.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Factory'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Continuous Spell with searcher/floodgate-ish utility.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Castle'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Removal-oriented Spell - fills part of the removal gap.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Explosive'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Cost reduction for Tribute Summons.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Workshop'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'UTILITY', null, null, 'EXPANSION', null, false, 'Equip Spell granting piercing damage.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Tank'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Fist'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Drill'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Spell Gear'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'HARD', 'RECOMMENDED', 'SIGNATURE', true, 'The archetype''s premier Fusion boss; exact required materials not independently re-verified this pass with full confidence.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ultimate Ancient Gear Golem'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'RECOMMENDED', 'LATE', false, 'Fusion of Ancient Gear Golem + 1 DARK monster; opponent cannot respond to its attacks - archetype-defining. From 2015-2018 whitelist.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Chaos Ancient Gear Giant'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Dedicated Fusion Summon enabler for the archetype''s Machine-Type monsters. From 2015-2018 whitelist.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Fusion'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'MODERATE', 'RECOMMENDED', 'MID', false, 'Fusion of 2 Machine-Type monsters - a lower-power, more accessible Fusion option. From 2015-2018 whitelist.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'ancient_gear' and c.name = 'Ancient Gear Howitzer'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;

-- ---- Crystal Beast (crystal_beast) ----
insert into public.archetype_registry (code, name, description, priority_rank, nostalgia_relevance, consistency, removal, defense, recovery, boss_power, summoning_speed, overall_health, deck_reality, gaps, notes)
values ('crystal_beast', 'Crystal Beast', 'Rex Raptor''s rainbow-gem monsters, which move to the Spell/Trap Zone to power a distinctive resource-recursion engine and two capstone bosses.', 7, 'MEDIUM', 'HIGH', 'MEDIUM', 'LOW', 'MEDIUM', 'HIGH', 'MEDIUM', 'HEALTHY', 'FULL_DECK', '[{"category":"xyz_access","description":"Zero Xyz Monsters in the eligible pool, the same structural gap as Ancient Gear - the archetype''s entire Extra Deck presence is its two 7-material capstone bosses."},{"category":"level_4_body","description":"No Level 4 Crystal Beast monster exists at all - the six gem beasts run outside that band, leaving no clean Xyz material even where the format would otherwise allow it."}]'::jsonb, 'Advanced Crystal Beast has zero real eligible cards in the current catalog and is not otherwise represented in this registry entry - a genuine reported gap, not an omission.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  priority_rank = excluded.priority_rank,
  nostalgia_relevance = excluded.nostalgia_relevance,
  consistency = excluded.consistency,
  removal = excluded.removal,
  defense = excluded.defense,
  recovery = excluded.recovery,
  boss_power = excluded.boss_power,
  summoning_speed = excluded.summoning_speed,
  overall_health = excluded.overall_health,
  deck_reality = excluded.deck_reality,
  gaps = excluded.gaps,
  notes = excluded.notes,
  updated_at = now();

insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', 'EARLY', false, 'Special Summons itself and sends Crystal Beasts to the Spell/Trap Zone - the archetype''s consistency lynchpin.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Beast Ruby Carbuncle'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'One of the six core gem beasts; central to the archetype''s field-to-Spell/Trap-Zone gimmick.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Beast Topaz Tiger'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'One of the six core gem beasts.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Beast Sapphire Pegasus'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'One of the six core gem beasts.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Beast Amethyst Cat'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'One of the six core gem beasts.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Beast Amber Mammoth'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'One of the six core gem beasts.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Beast Emerald Tortoise'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'One of the six core gem beasts.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Beast Cobalt Eagle'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', null, null, 'RECOMMENDED', 'LATE', false, 'Special Summoned by returning all 7 Crystal Beasts to hand/field - the archetype''s premier boss. Main Deck per this catalog''s card_type, not Extra Deck.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Rainbow Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Identity Field Spell; returns Crystal Beasts from GY to the Spell/Trap Zone.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Ancient City - Rainbow Ruins'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Real searcher for Crystal Beast monsters.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Beacon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Tutors/searches toward the engine.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Promise'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Returns a Crystal Beast to hand from GY - recovery piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Blessing'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Board-wipe tied to controlling several Crystal Beasts in the Spell/Trap Zone - fills the removal gap.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Abundance'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Destroys monsters based on Crystal Beasts in the Spell/Trap Zone - key removal piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Raigeki'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Sets up multiple Crystal Beasts into the Spell/Trap Zone in one shot, directly enabling Rainbow Dragon.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Rainbow Gravity'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Tree'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Believed to be a rarity-based burn effect; gimmicky, exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Rare Value'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Release'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Possible catalog mistag; exact connection to Crystal Beast not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Advanced Dark'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Counter Gem'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Crystal Pair'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Rainbow Path'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'VERY_HARD', 'RECOMMENDED', 'SIGNATURE', false, 'Requires all 7 named Crystal Beast monsters as material - an intentionally hard-to-assemble capstone reward. From 2015-2018 whitelist.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'crystal_beast' and c.name = 'Rainbow Overdragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;

-- ---- Destiny HERO (destiny_hero) ----
insert into public.archetype_registry (code, name, description, priority_rank, nostalgia_relevance, consistency, removal, defense, recovery, boss_power, summoning_speed, overall_health, deck_reality, gaps, notes)
values ('destiny_hero', 'Destiny HERO', 'Aster Phoenix''s dark HERO counterpart line, built around discard-for-value (Destiny Draw) and graveyard recursion, capped by a single named Fusion boss.', 8, 'MEDIUM', 'MEDIUM', 'LOW', 'MEDIUM', 'MEDIUM', 'MEDIUM', 'MEDIUM', 'HEALTHY', 'FULL_DECK', '[{"category":"removal","description":"Only conditional interaction exists (Doom Lord''s flip-negate, Captain Tenacious''s GY-banish Trap-negate) - no unconditional destruction or removal card in the eligible pool."},{"category":"boss","description":"Extra Deck presence is a single Fusion Monster (Destiny End Dragoon) that depends on the 2015-2018 whitelisted D-Fusion - until that whitelist is activated, the archetype has no working Extra Deck boss."}]'::jsonb, 'D-Fusion is sourced from the 2015-2018 legacy support whitelist (migration 202608301200) - it is the only real way to Fusion Summon Destiny End Dragoon in this format. Wroughtweiler is catalogued under the broader ''HERO'' archetype tag in card_catalog, but its real function (recurs a Destiny HERO from GY, returns Destiny Draw from GY to hand) is exclusively Destiny HERO recursion, so it is listed here rather than under Elemental HERO.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  priority_rank = excluded.priority_rank,
  nostalgia_relevance = excluded.nostalgia_relevance,
  consistency = excluded.consistency,
  removal = excluded.removal,
  defense = excluded.defense,
  recovery = excluded.recovery,
  boss_power = excluded.boss_power,
  summoning_speed = excluded.summoning_speed,
  overall_health = excluded.overall_health,
  deck_reality = excluded.deck_reality,
  gaps = excluded.gaps,
  notes = excluded.notes,
  updated_at = now();

insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', 'EARLY', false, 'Special Summons copies of itself from GY - the archetype''s core recursion/swarm engine.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Malicious'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', null, false, 'Discards a Destiny HERO to draw 2 - the archetype''s signature card-advantage engine.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny Draw'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Reveals the top card of the Deck and can activate Normal Spells directly from it - a unique value engine.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Diamond Dude'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Draws 2 when discarded or sent to GY - real value with a discard-heavy shell.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Disk Commander'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', 'MID', false, 'Gains ATK per Destiny HERO in GY - a real scaling beater and natural mid-game boss.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Blade Master'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, true, 'Large beater historically important to the archetype; exact effect text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Dogma'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Banishes an opponent''s monster from GY to steal ATK - real value body.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Plasma'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Banishes itself from GY to negate a Trap - rare real interaction/removal for the archetype.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Captain Tenacious'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Flip effect negating a Special Summon - real interaction piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Doom Lord'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Special Summons a Destiny HERO Token, generating an extra body.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Double Dude'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Defensive wall body; partially addresses the defense gap.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Defender'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Flip/trigger effect for graveyard setup.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Fear Monger'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Mills for graveyard setup value.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Dread Servant'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, false, 'On-destruction replacement token; minor value.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Departed'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, false, 'Switches an opponent monster''s battle position.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Dunker'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact effect text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Dreadmaster'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact effect text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny HERO - Dasher'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'FUSION', 'HARD', 'RECOMMENDED', 'SIGNATURE', false, 'Fusion of a named Destiny HERO monster + a DARK Dragon-Type monster - requires D-Fusion (whitelisted, not yet active) to summon.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny End Dragoon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Field Spell tied to Destiny HERO; conditional ATK boost and recursion.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Dark City'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Floodgate Field Spell restricting Special Summons based on Destiny HERO count - real interaction/lock piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Clock Tower Prison'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Returns a Destiny-named card from GY to hand - recovery piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Over Destiny'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'D - Formation'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Cyclone Blade'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Adds a Destiny HERO from Deck to hand - the archetype''s searcher.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny Signal'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, true, 'Protection Trap for Destiny HERO monsters; exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'D - Fortune'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'D - Spirit'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Destiny Mirage'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'D - Shield'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'D - Time'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'D - Chain'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, true, 'Exact text not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'D - Counter'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Special Summons itself from GY when a Destiny HERO is destroyed, then returns Destiny Draw from GY to hand - real recursion engine for the archetype.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'destiny_hero' and c.name = 'Wroughtweiler'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;

-- ---- Vampire (vampire) ----
insert into public.archetype_registry (code, name, description, priority_rank, nostalgia_relevance, consistency, removal, defense, recovery, boss_power, summoning_speed, overall_health, deck_reality, gaps, notes)
values ('vampire', 'Vampire', 'A DARK Zombie-Type theme built around graveyard-recursive beaters and a single Rank 4 Xyz boss; smaller and more niche than the DM/GX-era archetypes above.', 9, 'LOW', 'MEDIUM', 'LOW', 'LOW', 'LOW', 'MEDIUM', 'MEDIUM', 'WEAK', 'ENGINE_PLUS_GENERIC', '[{"category":"other","description":"Roughly half the Main Deck monsters (Vampire''s Curse, Baby, Duke, Vamp, Lady, Grace, Hunter) have real names confirmed in the catalog, but this pass could not independently verify their exact oracle text with confidence - held at EXPANSION tier and flagged needsReview rather than asserted."},{"category":"searcher","description":"Only one on-summon searcher (Vampire Sorcerer) exists for a 15-card pool split across many individual effects, leaving consistency lower than the raw card count suggests."}]'::jsonb, null)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  priority_rank = excluded.priority_rank,
  nostalgia_relevance = excluded.nostalgia_relevance,
  consistency = excluded.consistency,
  removal = excluded.removal,
  defense = excluded.defense,
  recovery = excluded.recovery,
  boss_power = excluded.boss_power,
  summoning_speed = excluded.summoning_speed,
  overall_health = excluded.overall_health,
  deck_reality = excluded.deck_reality,
  gaps = excluded.gaps,
  notes = excluded.notes,
  updated_at = now();

insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', 'EARLY', false, 'Classic recurring-from-GY beater, discarding a card as the cost - the archetype''s earliest identity piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Lord'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', 'MID', false, 'Strong Special-Summon-from-GY beater that destroys a monster on that Special Summon - fills the removal gap.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Genesis'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Searches Vampire cards on summon - the archetype''s key consistency piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Sorcerer'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Mills to search a Vampire monster.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Shadow Vampire'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Flip/return-based recursive beater.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Dragon'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact function not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Hunter'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact function not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire''s Curse'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact function not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Baby'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, true, 'Exact function not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Duke'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact function not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Vamp'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact function not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Lady'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'NICHE', null, null, null, null, true, 'Exact function not independently re-verified this pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Grace'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'BOSS', 'XYZ', 'MODERATE', 'RECOMMENDED', 'SIGNATURE', false, 'Rank 4 Xyz boss, detaches material to inflict damage - the archetype''s signature Extra Deck piece.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Crimson Knight Vampire Bram'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', null, false, 'Field Spell boosting Zombie/Vampire monsters and enabling effects.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Kingdom'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'RECOMMENDED', null, false, 'Searches/Special Summons under a condition.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'vampire' and c.name = 'Vampire Takeover'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;

-- ---- Jinzo (jinzo) ----
insert into public.archetype_registry (code, name, description, priority_rank, nostalgia_relevance, consistency, removal, defense, recovery, boss_power, summoning_speed, overall_health, deck_reality, gaps, notes)
values ('jinzo', 'Jinzo', 'A single powerful floodgate identity (negates all Trap Cards) rather than a full archetype - the brief''s own example of a legitimate THIN_THEME.', 10, 'MEDIUM', 'LOW', 'LOW', 'LOW', 'LOW', 'MEDIUM', 'FAST', 'HEALTHY', 'THIN_THEME', '[{"category":"other","description":"Only 4 real cards exist for this identity - by design a THIN_THEME package meant to be run inside a generic Machine/DARK shell rather than a standalone 40-card deck. It has no searcher, no Extra Deck presence, and no archetype-specific removal beyond Jinzo''s own passive Trap negation."}]'::jsonb, null)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  priority_rank = excluded.priority_rank,
  nostalgia_relevance = excluded.nostalgia_relevance,
  consistency = excluded.consistency,
  removal = excluded.removal,
  defense = excluded.defense,
  recovery = excluded.recovery,
  boss_power = excluded.boss_power,
  summoning_speed = excluded.summoning_speed,
  overall_health = excluded.overall_health,
  deck_reality = excluded.deck_reality,
  gaps = excluded.gaps,
  notes = excluded.notes,
  updated_at = now();

insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'ESSENTIAL', 'EARLY', false, 'Negates all Trap Cards on the field - the archetype''s entire reason to exist.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'jinzo' and c.name = 'Jinzo'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'CORE', null, null, 'RECOMMENDED', 'MID', false, 'Real strong upgrade to the base Jinzo identity; rated Ultra Rare in the human calibration pass.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'jinzo' and c.name = 'Jinzo - Lord'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Recursion piece; Special Summons Jinzo from GY under a condition.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'jinzo' and c.name = 'Jinzo - Returner'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;
insert into public.archetype_cards (archetype_id, card_catalog_id, role, extra_deck_kind, summon_difficulty, package_tier, boss_stage, needs_review, notes)
select r.id, c.id, 'SUPPORT', null, null, 'EXPANSION', null, false, 'Weaker pre-evolution/support Jinzo; minor synergy.'
from public.archetype_registry r, public.card_catalog c
where r.code = 'jinzo' and c.name = 'Jinzo #7'
on conflict (archetype_id, card_catalog_id) do update set
  role = excluded.role,
  extra_deck_kind = excluded.extra_deck_kind,
  summon_difficulty = excluded.summon_difficulty,
  package_tier = excluded.package_tier,
  boss_stage = excluded.boss_stage,
  needs_review = excluded.needs_review,
  notes = excluded.notes;

-- =========================================================
-- SOURCE: supabase/migrations/202608301500_round_reward_settlement_and_auto_finalize.sql
-- =========================================================

-- =========================================================
-- ROUND-LEVEL REWARD SETTLEMENT + AUTOMATIC COMPETITION
-- FINALIZATION (Duelist Circle autonomous work session, Priority 1/2)
--
-- WHY
-- The V2 competition engine (202608231100 onward) already awards
-- per-MATCH DP (award_match_duel_points / _award_match_duel_points_
-- internal) and per-COMPETITION placement rewards (competition_
-- reward_rules / competition_reward_grants / distribute_competition_
-- rewards_v2), both idempotently. Two things were still missing/
-- manual:
--
--   1. No ROUND-level reward exists at all. A "round" here is not a
--      table - generate_round_robin_matches_v2 tags every match
--      played in the same round-robin round with the same
--      matches.round_number (a full round = every player's match
--      for that round_number, played simultaneously - NOT a single
--      match). This migration adds that layer: once every match in
--      a (competition_id, round_number) is completed, every player
--      who played that round gets a "participation" reward and
--      whoever won THEIR OWN match that round gets an additional
--      "round_winner" reward - both config-driven, both idempotent.
--
--   2. Competition finalization (finalize_competition_v2) and reward
--      distribution (distribute_competition_rewards_v2) already
--      existed and were already idempotent, but both were admin-
--      triggered actions - nothing called them automatically when
--      the last match actually completed. This migration adds
--      settle_competition_if_complete_v2(), called right after a
--      match (or tiebreak match) completes, which attempts both in
--      sequence and safely swallows the "not ready yet" case (open
--      matches remaining, or an unresolved tiebreak) so it can never
--      roll back the match result that triggered it.
--
-- CONFIG
-- No central reward-config table existed for anything round-shaped.
-- Rather than hardcoding new magic numbers, this adds
-- competition_round_reward_rules, keyed (competition_id, role) -
-- same shape/convention as the existing competition_reward_rules
-- (keyed (competition_id, placement)). install_default_round_
-- rewards_v2() seeds it defensively, mirroring install_default_
-- competition_rewards_v2()'s exact pattern.
--
-- IMPORTANT - HUMAN REVIEW NEEDED ON THE DEFAULT VALUES BELOW.
-- The autonomous work session brief mentioned "~850 DP/round +
-- Standard Pack for winner + Premium Pack for all" only as a
-- current design-discussion reference point, explicitly NOT a
-- mandate, and explicitly warned against silently inventing economy
-- values. No prior split between "participation" and "round winner
-- bonus" DP existed anywhere in this project to reuse. The defaults
-- seeded below (participation: 0 DP + 1 premium_pack voucher;
-- round_winner: 850 DP + 1 normal_pack voucher) are a best-effort,
-- clearly-flagged placeholder that uses the one concrete number the
-- brief gave (850) without guessing how it should split between the
-- two roles - a human should confirm the real split (and whether
-- participants should also get some DP, not just a pack) before this
-- is trusted as final. Changing it is a one-row UPDATE, no code
-- change required - see "easy to reconfigure" below.
-- =========================================================

-- ---------------------------------------------------------
-- 1. CONFIG: competition_round_reward_rules
-- ---------------------------------------------------------

create table if not exists public.competition_round_reward_rules (
  id uuid primary key default gen_random_uuid(),

  competition_id uuid not null
    references public.competitions(id)
    on delete cascade,

  -- 'participation' = every player who played a match in the round.
  -- 'round_winner' = the winner of each individual match in the
  -- round (there can be several per round - see header).
  role text not null
    check (role in ('participation', 'round_winner')),

  duel_points integer not null default 0
    check (duel_points >= 0),

  voucher_type text
    check (voucher_type in ('normal_pack', 'premium_pack', 'deluxe_pack', 'special_pack')),

  voucher_quantity integer not null default 0
    check (voucher_quantity >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (competition_id, role)
);

comment on table public.competition_round_reward_rules is
  'Config for automatic round-completion rewards, one row per (competition, role). Same shape/convention as competition_reward_rules (which is keyed by placement instead of role). Easy to reconfigure: UPDATE the duel_points/voucher_* columns for a competition - no code change needed. See install_default_round_rewards_v2() for the seeded defaults and this migration''s header for why they are flagged as needing human confirmation.';

-- ---------------------------------------------------------
-- 2. LEDGER: competition_round_reward_grants
--
-- Same "grants" pattern as competition_reward_grants: one row per
-- (competition, round, profile, role) actually paid out, a partial
-- unique index enforcing at most one ACTIVE grant per key, and a
-- reversed/terminal status rather than ever overwriting a row in
-- place (a reversal path is not built yet - see the final report's
-- "remaining human design decisions" - but the shape supports adding
-- one later without a further migration).
-- ---------------------------------------------------------

create table if not exists public.competition_round_reward_grants (
  id uuid primary key default gen_random_uuid(),

  competition_id uuid not null
    references public.competitions(id)
    on delete cascade,

  round_number integer not null,

  profile_id uuid not null
    references public.profiles(id)
    on delete cascade,

  reward_role text not null
    check (reward_role in ('participation', 'round_winner')),

  duel_points_granted integer not null default 0,
  voucher_type text,
  voucher_quantity integer not null default 0,

  duel_point_transaction_id uuid
    references public.duel_point_transactions(id),

  status text not null default 'granted'
    check (status in ('granted', 'reversed')),

  granted_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversal_reason text
);

comment on table public.competition_round_reward_grants is
  'One row per (competition, round, profile, role) round-completion reward actually granted. Mirrors competition_reward_grants exactly - see that table''s own comment. The partial unique index below is the idempotency guarantee: settle_round_rewards_v2() can be called any number of times (page re-render, retried RPC, re-running settlement manually) and will only ever pay out once per key.';

create unique index if not exists competition_round_reward_grants_active_unique
  on public.competition_round_reward_grants(competition_id, round_number, profile_id, reward_role)
  where status = 'granted';

create index if not exists competition_round_reward_grants_competition_idx
  on public.competition_round_reward_grants(competition_id);

-- ---------------------------------------------------------
-- 3. RLS - identical pattern to every other competition_* config/
--    ledger table (202608270900_security_hardening_rls_and_grants.sql):
--    league members can SELECT, nobody mutates directly from the
--    client - all writes happen inside SECURITY DEFINER functions.
-- ---------------------------------------------------------

alter table public.competition_round_reward_rules enable row level security;
alter table public.competition_round_reward_grants enable row level security;

drop policy if exists competition_round_reward_rules_select_league_member on public.competition_round_reward_rules;
create policy competition_round_reward_rules_select_league_member on public.competition_round_reward_rules
  for select to authenticated
  using (
    exists (
      select 1 from public.competitions c
      where c.id = competition_round_reward_rules.competition_id
        and public.is_league_member(c.league_id)
    )
  );

drop policy if exists competition_round_reward_grants_select_league_member on public.competition_round_reward_grants;
create policy competition_round_reward_grants_select_league_member on public.competition_round_reward_grants
  for select to authenticated
  using (
    exists (
      select 1 from public.competitions c
      where c.id = competition_round_reward_grants.competition_id
        and public.is_league_member(c.league_id)
    )
  );

revoke insert, update, delete on public.competition_round_reward_rules from authenticated;
revoke insert, update, delete on public.competition_round_reward_grants from authenticated;

grant select on public.competition_round_reward_rules to authenticated;
grant select on public.competition_round_reward_grants to authenticated;

-- ---------------------------------------------------------
-- 4. install_default_round_rewards_v2 - same pattern as
--    install_default_competition_rewards_v2. See the migration
--    header for why these specific numbers need human confirmation.
-- ---------------------------------------------------------

create or replace function public.install_default_round_rewards_v2(
  target_competition_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.competition_round_reward_rules (
    competition_id, role, duel_points, voucher_type, voucher_quantity
  ) values
    (target_competition_id, 'participation', 0, 'premium_pack', 1),
    (target_competition_id, 'round_winner', 850, 'normal_pack', 1)
  on conflict (competition_id, role) do nothing;
end;
$function$;

revoke all on function public.install_default_round_rewards_v2(uuid) from public;
grant execute on function public.install_default_round_rewards_v2(uuid) to authenticated;

-- ---------------------------------------------------------
-- 5. settle_round_rewards_v2 - the settlement function itself.
--
-- Called with a specific (competition_id, round_number). Returns
-- early (0 grants) if any match in that round is not yet completed,
-- or if the round has no matches at all. Otherwise grants:
--   - 'participation' to every profile who played a match in the
--     round (both players of every match)
--   - 'round_winner' to the winner_id of every match in the round
--     (each individual match's own winner - there is no single
--     round-wide winner when several matches happen in parallel)
--
-- Not admin-gated on its own: it is only ever called internally,
-- from submit_competition_match_result_v2 (already admin-gated) -
-- see section 6. It is still SECURITY DEFINER + revoked from public
-- so it can never be called directly by an authenticated client
-- either.
-- ---------------------------------------------------------

create or replace function public.settle_round_rewards_v2(
  target_competition_id uuid,
  target_round_number integer
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  incomplete_count integer;
  match_count integer;
  participant record;
  rule_row public.competition_round_reward_rules%rowtype;
  new_balance integer;
  new_tx_id uuid;
  new_grant_id uuid;
  grants_created integer := 0;
begin
  perform pg_advisory_xact_lock(
    hashtext('competition_round_settlement_' || target_competition_id::text || '_' || target_round_number::text)
  );

  select count(*) into match_count
  from public.matches
  where competition_id = target_competition_id
    and round_number = target_round_number;

  if match_count = 0 then
    return 0;
  end if;

  select count(*) into incomplete_count
  from public.matches
  where competition_id = target_competition_id
    and round_number = target_round_number
    and status <> 'completed';

  if incomplete_count > 0 then
    return 0;
  end if;

  if not exists (
    select 1 from public.competition_round_reward_rules
    where competition_id = target_competition_id
  ) then
    perform public.install_default_round_rewards_v2(target_competition_id);
  end if;

  -- ---- participation: every player who played this round ----
  for participant in
    select profile_id from (
      select player_one_id as profile_id
      from public.matches
      where competition_id = target_competition_id and round_number = target_round_number
      union
      select player_two_id as profile_id
      from public.matches
      where competition_id = target_competition_id and round_number = target_round_number
    ) players
  loop
    if exists (
      select 1 from public.competition_round_reward_grants
      where competition_id = target_competition_id
        and round_number = target_round_number
        and profile_id = participant.profile_id
        and reward_role = 'participation'
        and status = 'granted'
    ) then
      continue;
    end if;

    select * into rule_row
    from public.competition_round_reward_rules
    where competition_id = target_competition_id and role = 'participation';

    if not found then
      continue;
    end if;

    new_tx_id := null;

    insert into public.competition_round_reward_grants (
      competition_id, round_number, profile_id, reward_role,
      duel_points_granted, voucher_type, voucher_quantity, status
    ) values (
      target_competition_id, target_round_number, participant.profile_id, 'participation',
      rule_row.duel_points, rule_row.voucher_type, rule_row.voucher_quantity, 'granted'
    )
    returning id into new_grant_id;

    grants_created := grants_created + 1;

    if rule_row.duel_points > 0 then
      update public.profiles
      set duel_points = duel_points + rule_row.duel_points, updated_at = now()
      where id = participant.profile_id
      returning duel_points into new_balance;

      insert into public.duel_point_transactions (
        profile_id, amount, balance_after, reason, metadata
      ) values (
        participant.profile_id, rule_row.duel_points, new_balance, 'round_participation',
        jsonb_build_object(
          'competition_id', target_competition_id,
          'round_number', target_round_number,
          'grant_id', new_grant_id
        )
      )
      returning id into new_tx_id;

      update public.competition_round_reward_grants
      set duel_point_transaction_id = new_tx_id
      where id = new_grant_id;
    end if;

    if rule_row.voucher_type is not null and rule_row.voucher_quantity > 0 then
      insert into public.reward_vouchers (
        profile_id, voucher_type, quantity, source_type, source_id
      ) values (
        participant.profile_id, rule_row.voucher_type, rule_row.voucher_quantity,
        'round_reward', target_competition_id
      );
    end if;
  end loop;

  -- ---- round_winner: the winner of each individual match this round ----
  for participant in
    select distinct winner_id as profile_id
    from public.matches
    where competition_id = target_competition_id
      and round_number = target_round_number
      and winner_id is not null
  loop
    if exists (
      select 1 from public.competition_round_reward_grants
      where competition_id = target_competition_id
        and round_number = target_round_number
        and profile_id = participant.profile_id
        and reward_role = 'round_winner'
        and status = 'granted'
    ) then
      continue;
    end if;

    select * into rule_row
    from public.competition_round_reward_rules
    where competition_id = target_competition_id and role = 'round_winner';

    if not found then
      continue;
    end if;

    new_tx_id := null;

    insert into public.competition_round_reward_grants (
      competition_id, round_number, profile_id, reward_role,
      duel_points_granted, voucher_type, voucher_quantity, status
    ) values (
      target_competition_id, target_round_number, participant.profile_id, 'round_winner',
      rule_row.duel_points, rule_row.voucher_type, rule_row.voucher_quantity, 'granted'
    )
    returning id into new_grant_id;

    grants_created := grants_created + 1;

    if rule_row.duel_points > 0 then
      update public.profiles
      set duel_points = duel_points + rule_row.duel_points, updated_at = now()
      where id = participant.profile_id
      returning duel_points into new_balance;

      insert into public.duel_point_transactions (
        profile_id, amount, balance_after, reason, metadata
      ) values (
        participant.profile_id, rule_row.duel_points, new_balance, 'round_winner_bonus',
        jsonb_build_object(
          'competition_id', target_competition_id,
          'round_number', target_round_number,
          'grant_id', new_grant_id
        )
      )
      returning id into new_tx_id;

      update public.competition_round_reward_grants
      set duel_point_transaction_id = new_tx_id
      where id = new_grant_id;
    end if;

    if rule_row.voucher_type is not null and rule_row.voucher_quantity > 0 then
      insert into public.reward_vouchers (
        profile_id, voucher_type, quantity, source_type, source_id
      ) values (
        participant.profile_id, rule_row.voucher_type, rule_row.voucher_quantity,
        'round_reward', target_competition_id
      );
    end if;
  end loop;

  return grants_created;
end;
$function$;

revoke all on function public.settle_round_rewards_v2(uuid, integer) from public;
-- Intentionally NOT granted to authenticated - this is an internal
-- helper only ever called from within submit_competition_match_
-- result_v2 (already admin-gated), never directly by a client.

-- ---------------------------------------------------------
-- 6. settle_competition_if_complete_v2 - attempts finalize +
--    distribute in sequence and NEVER lets a "not ready yet"
--    condition (open matches, unresolved tiebreak) propagate as an
--    error - both are expected, normal states right after a single
--    match completes, not failures. Also never lets a distribute
--    failure roll back a finalize that already succeeded.
--
-- finalize_competition_v2 and distribute_competition_rewards_v2 are
-- BOTH already fully idempotent (see their own comments) - calling
-- either of them redundantly after every single match/tiebreak
-- result is always safe, just usually a fast no-op.
-- ---------------------------------------------------------

create or replace function public.settle_competition_if_complete_v2(
  target_competition_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  begin
    perform public.finalize_competition_v2(target_competition_id);
  exception when others then
    -- Expected: matches still open, or a tiebreak needs to be played
    -- first (finalize_competition_v2 raises in both cases). Not an
    -- error from this function's point of view.
    return;
  end;

  begin
    perform public.distribute_competition_rewards_v2(target_competition_id);
  exception when others then
    raise warning 'settle_competition_if_complete_v2: distribute_competition_rewards_v2 failed for competition %: %', target_competition_id, sqlerrm;
  end;
end;
$function$;

revoke all on function public.settle_competition_if_complete_v2(uuid) from public;
-- Intentionally NOT granted to authenticated - internal helper only,
-- same reasoning as settle_round_rewards_v2 above.

-- ---------------------------------------------------------
-- 7. Wire both into the two places a competition match can newly
--    reach "completed": a normal result submission, and a tiebreak
--    match result. Everything above the new two `perform` lines in
--    each function is byte-for-byte identical to the prior version
--    (202608270930 / 202608271000) - only the settlement calls at
--    the end are new.
-- ---------------------------------------------------------

create or replace function public.submit_competition_match_result_v2(
  target_match_id uuid,
  target_player_one_duel_wins integer,
  target_player_two_duel_wins integer
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  current_user_id uuid;
  match_row public.matches%rowtype;
  competition_row public.competitions%rowtype;
  is_admin boolean;
  computed_winner uuid;
  computed_result public.match_result_type;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select * into match_row from public.matches where id = target_match_id for update;

  if not found then
    raise exception 'Match not found.';
  end if;

  if match_row.competition_id is null then
    raise exception 'This match is not part of a competition.';
  end if;

  select * into competition_row from public.competitions where id = match_row.competition_id;

  select (role = 'admin')
  into is_admin
  from public.league_members
  where league_id = competition_row.league_id
    and profile_id = current_user_id;

  if is_admin is not true then
    raise exception 'Only a league admin can submit competition results.';
  end if;

  if match_row.status = 'completed' then
    raise exception 'This match already has a result - use correct_competition_match_result_v2 to change it.';
  end if;

  if match_row.match_format = 'single_duel' then
    if not (
      (target_player_one_duel_wins = 1 and target_player_two_duel_wins = 0)
      or (target_player_one_duel_wins = 0 and target_player_two_duel_wins = 1)
    ) then
      raise exception 'Single Duel requires exactly one winner (1-0 or 0-1).';
    end if;
  else
    if not (
      (target_player_one_duel_wins = 2 and target_player_two_duel_wins in (0, 1))
      or (target_player_two_duel_wins = 2 and target_player_one_duel_wins in (0, 1))
    ) then
      raise exception 'Best of 3 requires a first-to-2 score (2-0 or 2-1).';
    end if;
  end if;

  if target_player_one_duel_wins > target_player_two_duel_wins then
    computed_winner := match_row.player_one_id;
    computed_result := 'player_one_win';
  else
    computed_winner := match_row.player_two_id;
    computed_result := 'player_two_win';
  end if;

  update public.matches
  set
    player_one_duel_wins = target_player_one_duel_wins,
    player_two_duel_wins = target_player_two_duel_wins,
    winner_id = computed_winner,
    result = computed_result,
    status = 'completed',
    completed_at = now(),
    updated_at = now()
  where id = target_match_id;

  perform public._award_match_duel_points_internal(target_match_id);

  perform public.refresh_competition_current_round_v2(match_row.competition_id);

  -- NEW: automatic round + competition settlement (Priority 1/2).
  perform public.settle_round_rewards_v2(match_row.competition_id, match_row.round_number);
  perform public.settle_competition_if_complete_v2(match_row.competition_id);
end;
$function$;

revoke all on function public.submit_competition_match_result_v2(uuid, integer, integer) from public;
grant execute on function public.submit_competition_match_result_v2(uuid, integer, integer) to authenticated;

create or replace function public.submit_competition_tiebreak_match_result(
  target_match_id uuid,
  target_player_one_duel_wins integer,
  target_player_two_duel_wins integer
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  current_user_id uuid;
  match_row public.matches%rowtype;
  tiebreak_row public.competition_tiebreaks%rowtype;
  competition_row public.competitions%rowtype;
  is_admin boolean;
  computed_winner uuid;
  computed_loser uuid;
  computed_result public.match_result_type;
  most_recent_opponent uuid;
  second_most_recent_opponent uuid;
  tiebreak_resolved boolean := false;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select * into match_row from public.matches where id = target_match_id for update;

  if not found then
    raise exception 'Match not found.';
  end if;

  if match_row.tiebreak_id is null then
    raise exception 'This match is not a tiebreak match - use submit_competition_match_result_v2.';
  end if;

  if match_row.status = 'completed' then
    raise exception 'This tiebreak match already has a result.';
  end if;

  select * into tiebreak_row from public.competition_tiebreaks where id = match_row.tiebreak_id for update;
  select * into competition_row from public.competitions where id = tiebreak_row.competition_id;

  select (role = 'admin')
  into is_admin
  from public.league_members
  where league_id = competition_row.league_id
    and profile_id = current_user_id;

  if is_admin is not true then
    raise exception 'Only a league admin can submit tiebreak results.';
  end if;

  if tiebreak_row.status = 'resolved' then
    raise exception 'This tiebreak has already been resolved.';
  end if;

  if match_row.match_format = 'single_duel' then
    if not (
      (target_player_one_duel_wins = 1 and target_player_two_duel_wins = 0)
      or (target_player_one_duel_wins = 0 and target_player_two_duel_wins = 1)
    ) then
      raise exception 'Single Duel requires exactly one winner (1-0 or 0-1).';
    end if;
  else
    if not (
      (target_player_one_duel_wins = 2 and target_player_two_duel_wins in (0, 1))
      or (target_player_two_duel_wins = 2 and target_player_one_duel_wins in (0, 1))
    ) then
      raise exception 'Best of 3 requires a first-to-2 score (2-0 or 2-1).';
    end if;
  end if;

  if target_player_one_duel_wins > target_player_two_duel_wins then
    computed_winner := match_row.player_one_id;
    computed_loser := match_row.player_two_id;
    computed_result := 'player_one_win';
  else
    computed_winner := match_row.player_two_id;
    computed_loser := match_row.player_one_id;
    computed_result := 'player_two_win';
  end if;

  update public.matches
  set
    player_one_duel_wins = target_player_one_duel_wins,
    player_two_duel_wins = target_player_two_duel_wins,
    winner_id = computed_winner,
    result = computed_result,
    status = 'completed',
    completed_at = now(),
    updated_at = now()
  where id = target_match_id;

  if tiebreak_row.tie_size = 2 then
    update public.competition_tiebreaks
    set
      status = 'resolved',
      resolved_order = array[computed_winner, computed_loser],
      resolved_at = now()
    where id = tiebreak_row.id;
    tiebreak_resolved := true;
  else
    if tiebreak_row.streak_holder_id is null or tiebreak_row.streak_holder_id <> computed_winner then
      update public.competition_tiebreaks
      set streak_holder_id = computed_winner, streak_count = 1
      where id = tiebreak_row.id;
    elsif tiebreak_row.streak_count + 1 < 2 then
      update public.competition_tiebreaks
      set streak_count = tiebreak_row.streak_count + 1
      where id = tiebreak_row.id;
    else
      most_recent_opponent := computed_loser;

      select case when player_one_id = computed_winner then player_two_id else player_one_id end
      into second_most_recent_opponent
      from public.matches
      where tiebreak_id = tiebreak_row.id
        and status = 'completed'
        and id <> target_match_id
        and (player_one_id = computed_winner or player_two_id = computed_winner)
      order by completed_at desc
      limit 1;

      if second_most_recent_opponent is null then
        raise exception 'Could not determine the tiebreak''s prior deciding match - data inconsistency.';
      end if;

      update public.competition_tiebreaks
      set
        status = 'resolved',
        streak_count = tiebreak_row.streak_count + 1,
        resolved_order = array[computed_winner, most_recent_opponent, second_most_recent_opponent],
        resolved_at = now()
      where id = tiebreak_row.id;
      tiebreak_resolved := true;
    end if;
  end if;

  -- NEW: a resolved tiebreak means the competition may now be
  -- finalize-able (this was the exact "not ready" reason finalize_
  -- competition_v2 would otherwise raise on).
  if tiebreak_resolved then
    perform public.settle_competition_if_complete_v2(competition_row.id);
  end if;
end;
$function$;

revoke all on function public.submit_competition_tiebreak_match_result(uuid, integer, integer) from public;
grant execute on function public.submit_competition_tiebreak_match_result(uuid, integer, integer) to authenticated;

-- =========================================================
-- SOURCE: supabase/migrations/202608310000_round_reward_economy_correction.sql
-- =========================================================

-- =========================================================
-- ROUND REWARD ECONOMY CORRECTION (human-approved baseline)
--
-- WHY
-- 202608301500_round_reward_settlement_and_auto_finalize.sql
-- shipped install_default_round_rewards_v2() with placeholder
-- values (participation = 0 DP + 1 premium_pack, round_winner =
-- 850 DP + 1 normal_pack) because no round-reward economy decision
-- existed yet at the time - see that migration's own header and the
-- prior session's final report, both of which explicitly flagged
-- these as needing human confirmation before going live.
--
-- The human has since approved a baseline for the "every player who
-- played a match in the round" (participation) tier: 250 DP + 1
-- Premium Pack. That maps cleanly onto the existing two-role
-- schema (role in ('participation','round_winner')) and is applied
-- here.
--
-- The human's supplied baseline also described a 3-tier per-round
-- placement shape (1st/2nd/3rd) for what it called "round" rewards.
-- That does NOT fit the currently-implemented round_reward schema
-- or settlement logic (a round-robin round can have multiple
-- simultaneous match winners - see settle_round_rewards_v2's own
-- comments - so there is no single per-round 1st/2nd/3rd ranking to
-- grant against, only "played in the round" and "won your match in
-- the round"). Building real 2nd/3rd-place round tiers would need a
-- genuine schema/settlement change (e.g. a per-round ranking
-- concept), which is out of scope for a database-readiness pass -
-- see the rollout report's economy-conflicts section for the exact
-- flag. This migration applies only the one number that maps
-- 1:1 onto the existing round_winner role (the "1st place" figure,
-- 150 DP + 1 Standard/normal_pack) as the best-available single
-- value for "won your match in the round," and does not attempt to
-- invent 2nd/3rd-place round tiers that the schema cannot express.
--
-- This is purely additive/corrective, following this repo's own
-- established convention (see 202608231030_special_pack_price_900.sql)
-- of layering a correction on top of an already-shipped migration
-- file rather than editing it in place.
--
-- SAFETY
-- - CREATE OR REPLACE FUNCTION: byte-identical to the 202608301500
--   version except for the two corrected literal values, so every
--   future competition (install_default_round_rewards_v2 is only
--   ever called from create_competition_v2 at creation time) seeds
--   the corrected numbers.
-- - The UPDATE below is a no-op unless a competition already has
--   round-reward rules seeded with the OLD placeholder values
--   (participation=0/premium_pack, round_winner=850/normal_pack) -
--   defensive only, in case 202608301500 was already applied once
--   live before this correction existed. It will never touch a row
--   a human has since hand-edited to a different value (the WHERE
--   clause matches the exact old placeholder numbers, nothing else).
-- =========================================================

create or replace function public.install_default_round_rewards_v2(
  target_competition_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.competition_round_reward_rules (
    competition_id, role, duel_points, voucher_type, voucher_quantity
  ) values
    (target_competition_id, 'participation', 250, 'premium_pack', 1),
    (target_competition_id, 'round_winner', 150, 'normal_pack', 1)
  on conflict (competition_id, role) do nothing;
end;
$function$;

revoke all on function public.install_default_round_rewards_v2(uuid) from public;
grant execute on function public.install_default_round_rewards_v2(uuid) to authenticated;

-- Defensive correction for any competition that already has the old
-- placeholder rules seeded (no-op if none exist).
update public.competition_round_reward_rules
set
  duel_points = 250,
  voucher_type = 'premium_pack',
  voucher_quantity = 1
where
  role = 'participation'
  and duel_points = 0
  and voucher_type = 'premium_pack'
  and voucher_quantity = 1;

update public.competition_round_reward_rules
set
  duel_points = 150,
  voucher_type = 'normal_pack',
  voucher_quantity = 1
where
  role = 'round_winner'
  and duel_points = 850
  and voucher_type = 'normal_pack'
  and voucher_quantity = 1;

-- =========================================================
-- SOURCE: supabase/migrations/202608302335_legendary_league_wide_scarcity.sql
-- =========================================================

-- =========================================================
-- LEGENDARY CARDS: TRUE LEAGUE-WIDE SCARCITY FIX
--
-- Bug: purchase_shop_pack()'s copy-limit check counted existing
-- card_instances filtered by `current_owner_id = current_user_id`
-- for EVERY rarity, including Legendary. shop_card_copy_limit()'s
-- own comment has always documented Legendary as "max 1 copy per
-- league, everything else max 3" - but the per-player filter meant
-- the real enforced limit for Legendary was "max 1 copy PER PLAYER",
-- not one copy total. In a 3-player league, all 3 players could
-- each independently pull and keep their own "only" copy of the
-- same Legendary card - directly contradicting the documented rule
-- and the product intent that a Legendary is a single, unique,
-- league-wide card.
--
-- Fix: when chosen_card_rarity = 'Legendary', count every
-- card_instances row for that card_catalog_id in the league
-- regardless of current_owner_id (true league-wide count). Every
-- other rarity is completely unchanged - still counts only the
-- current player's own copies, exactly as before. No other logic
-- in this function is touched: rarity odds, pity thresholds, pack
-- prices, first-pull history handling, and voucher consumption are
-- all byte-for-byte identical to 202608231410.
--
-- Concurrency: this reuses the pre-existing
-- pg_advisory_xact_lock(hashtext(chosen_card_id::text)) taken
-- earlier in this same function for this exact card_catalog_id.
-- That lock has always been keyed by card, not by (card, player),
-- so it was already league-wide-safe - no additional locking is
-- needed to make the league-wide count race-safe.
--
-- This is a straight CREATE OR REPLACE FUNCTION; the only
-- behavioral change vs. the currently-live body (202608231410) is
-- the Legendary branch of the copy-limit count query below. Diffed
-- against 202608231410's body to confirm nothing else changed.
-- =========================================================

create or replace function public.purchase_shop_pack(
  target_pack_code text,
  target_voucher_id uuid default null::uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  current_user_id uuid;
  current_league_id uuid;
  active_rotation_id uuid;
  theme_category text;
  special_rotation_id uuid;
  pack_price integer;
  pack_card_count integer;
  required_voucher_type text;
  current_dp integer;
  voucher_row public.reward_vouchers%rowtype;
  purchase_id uuid;
  opening_id uuid;
  pity_count integer := 0;
  position_number integer;
  minimum_rarity_rank integer;
  rolled_rarity text;
  chosen_card_id uuid;
  chosen_card_rarity text;
  copy_limit integer;
  current_owned_count integer;
  next_copy_number integer;
  new_instance_id uuid;
  hit_pity_target boolean := false;
  attempts integer;
  is_first_pull boolean;
begin
  -- =======================================================
  -- AUTH
  -- =======================================================
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  -- =======================================================
  -- CURRENT LEAGUE
  -- =======================================================
  select
    lm.league_id
  into current_league_id
  from public.league_members lm
  where lm.profile_id = current_user_id
  limit 1;

  if current_league_id is null then
    raise exception 'Current user is not a league member.';
  end if;

  -- =======================================================
  -- VALID PACK
  -- =======================================================
  if target_pack_code not in ('normal', 'premium', 'deluxe', 'special_attribute', 'special_archetype') then
    raise exception 'Invalid pack type.';
  end if;

  active_rotation_id := public.get_active_shop_rotation();

  if target_pack_code in ('special_attribute', 'special_archetype') then
    theme_category := case target_pack_code
      when 'special_attribute' then 'attribute'
      else 'archetype'
    end;
  end if;

  -- =======================================================
  -- PACK CONFIG
  -- =======================================================
  if theme_category is null then
    select
      price_dp,
      cards_per_pack
    into
      pack_price,
      pack_card_count
    from public.shop_pack_types
    where
      code = target_pack_code
      and active = true;

    if not found then
      raise exception 'Pack is not available.';
    end if;
  else
    special_rotation_id := public.get_active_special_pack_rotation(theme_category);

    if special_rotation_id is null then
      raise exception 'No active special pack rotation for this theme.';
    end if;

    select
      price_dp,
      cards_per_pack
    into
      pack_price,
      pack_card_count
    from public.shop_special_pack_rotations
    where id = special_rotation_id;

    if pack_price is null or pack_card_count is null then
      raise exception 'Special Pack is not configured for this rotation.';
    end if;
  end if;

  -- =======================================================
  -- VOUCHER TYPE
  -- =======================================================
  required_voucher_type :=
    case target_pack_code
      when 'normal' then 'normal_pack'
      when 'premium' then 'premium_pack'
      when 'deluxe' then 'deluxe_pack'
      when 'special_attribute' then 'special_pack'
      when 'special_archetype' then 'special_pack'
    end;

  -- =======================================================
  -- PAYMENT
  -- =======================================================
  if target_voucher_id is not null then
    select *
    into voucher_row
    from public.reward_vouchers
    where
      id = target_voucher_id
      and profile_id = current_user_id
    for update;

    if not found then
      raise exception 'Voucher not found.';
    end if;

    if voucher_row.voucher_type <> required_voucher_type then
      raise exception 'This voucher cannot be used for this pack.';
    end if;
  else
    select
      duel_points
    into current_dp
    from public.profiles
    where id = current_user_id
    for update;

    if not found then
      raise exception 'Profile not found.';
    end if;

    if current_dp < pack_price then
      raise exception 'Not enough Duel Points.';
    end if;

    update public.profiles
    set
      duel_points = duel_points - pack_price,
      updated_at = now()
    where id = current_user_id;
  end if;

  -- =======================================================
  -- PURCHASE
  -- =======================================================
  insert into public.shop_purchases (
    profile_id,
    purchase_type,
    rotation_id,
    special_pack_rotation_id,
    pack_type_id,
    used_voucher_id,
    voucher_type_used,
    dp_spent
  )
  values (
    current_user_id,
    case
      when theme_category is not null then 'special_pack'
      else 'pack'
    end,
    active_rotation_id,
    special_rotation_id,
    case
      when theme_category is not null then null
      else (
        select id
        from public.shop_pack_types
        where code = target_pack_code
        limit 1
      )
    end,
    target_voucher_id,
    case
      when target_voucher_id is not null then required_voucher_type
      else null
    end,
    case
      when target_voucher_id is null then pack_price
      else 0
    end
  )
  returning id
  into purchase_id;

  -- =======================================================
  -- PACK OPENING
  -- =======================================================
  insert into public.shop_pack_openings (
    profile_id,
    purchase_id,
    rotation_id,
    special_pack_rotation_id,
    pack_code
  )
  values (
    current_user_id,
    purchase_id,
    active_rotation_id,
    special_rotation_id,
    target_pack_code
  )
  returning id
  into opening_id;

  -- =======================================================
  -- PITY STATE
  -- =======================================================
  insert into public.shop_pack_pity (
    profile_id,
    pack_code,
    packs_since_ultra_or_better
  )
  values (
    current_user_id,
    target_pack_code,
    0
  )
  on conflict (profile_id, pack_code)
  do nothing;

  select
    packs_since_ultra_or_better
  into pity_count
  from public.shop_pack_pity
  where
    profile_id = current_user_id
    and pack_code = target_pack_code
  for update;

  -- =======================================================
  -- GENERATE CARDS
  -- =======================================================
  for position_number in 1..pack_card_count loop
    minimum_rarity_rank := 1;

    -- NORMAL PITY
    if target_pack_code = 'normal'
      and pity_count >= 8
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 3;
    -- PREMIUM
    elsif target_pack_code = 'premium'
      and pity_count >= 7
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 4;
    elsif target_pack_code = 'premium'
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 2;
    -- DELUXE
    elsif target_pack_code = 'deluxe'
      and pity_count >= 5
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 5;
    elsif target_pack_code = 'deluxe'
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 3;
    -- SPECIAL (both categories share the old 'special' thresholds)
    elsif target_pack_code in ('special_attribute', 'special_archetype')
      and pity_count >= 6
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 4;
    elsif target_pack_code in ('special_attribute', 'special_archetype')
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 3;
    end if;

    rolled_rarity := public.roll_shop_pack_rarity(target_pack_code, minimum_rarity_rank);

    -- =====================================================
    -- PICK CARD
    -- =====================================================
    attempts := 0;

    loop
      attempts := attempts + 1;

      if attempts > 25 then
        raise exception 'Could not find an eligible card for this pack.';
      end if;

      chosen_card_id := public.pick_shop_pack_card(
        current_user_id,
        rolled_rarity,
        special_rotation_id
      );

      if chosen_card_id is null then
        raise exception 'Could not select a card for this pack.';
      end if;

      perform pg_advisory_xact_lock(hashtext(chosen_card_id::text));

      select
        game_rarity
      into chosen_card_rarity
      from public.card_catalog
      where id = chosen_card_id;

      if chosen_card_rarity is null then
        raise exception 'Selected card has no rarity.';
      end if;

      copy_limit := public.shop_card_copy_limit(chosen_card_rarity);

      -- LEAGUE-WIDE LEGENDARY SCARCITY FIX (2026-08-30):
      -- shop_card_copy_limit()'s own comment has always said
      -- "Legendary = max 1 copy per league, everything else = max
      -- 3" - but this count query used to filter by
      -- current_owner_id = current_user_id for every rarity, making
      -- the Legendary limit a max of 1 copy PER PLAYER instead of
      -- one copy total across the whole league (each of the 3
      -- friends could pull their own "only" copy of the same
      -- Legendary). Legendary now counts every instance of this
      -- card in the league regardless of owner; every other rarity
      -- keeps its original per-player cap unchanged. Race-safe
      -- under the pg_advisory_xact_lock(hashtext(chosen_card_id::text))
      -- already taken above for this exact card_catalog_id, which
      -- was always keyed league-wide (not per-player) - so this was
      -- already safe to make league-wide, nothing else needed to
      -- change for concurrency.
      if chosen_card_rarity = 'Legendary' then
        select count(*)
        into current_owned_count
        from public.card_instances
        where
          league_id = current_league_id
          and card_catalog_id = chosen_card_id;
      else
        select count(*)
        into current_owned_count
        from public.card_instances
        where
          league_id = current_league_id
          and current_owner_id = current_user_id
          and card_catalog_id = chosen_card_id;
      end if;

      exit when current_owned_count < copy_limit;
    end loop;

    -- =====================================================
    -- FIRST-EVER PULL CHECK (Legendary only)
    --
    -- Computed here, under the pg_advisory_xact_lock already
    -- taken above for this exact card_catalog_id - race-safe
    -- against concurrent purchases of the same card by design,
    -- not a client-side guess. Checked BEFORE the new instance
    -- below is inserted.
    --
    -- IMPORTANT: this is NOT "was this player the original_owner_id
    -- of some existing instance" - that only reflects the very
    -- first acquirer of a card_instance row and goes stale the
    -- moment that instance changes hands (trade, wager, any other
    -- ownership transfer). A player who received this exact
    -- card_catalog_id via trade and later traded it away again
    -- would wrongly read as "never owned" under that check.
    --
    -- public.ownership_history is the source of truth for every
    -- acquisition of every card_instance, for both the initial
    -- acquisition (INSERT trigger, to_owner_id = acquirer) and
    -- every later transfer (UPDATE trigger, to_owner_id = new
    -- owner) - see record_card_ownership_history() in
    -- 202608190004_card_instances.sql. So "has this player ever
    -- owned this card_catalog_id, via any route" is exactly
    -- "does a row exist where to_owner_id = current_user_id for
    -- any card_instance of this card_catalog_id", regardless of
    -- whether that player still holds it today.
    -- =====================================================
    is_first_pull := null;

    if chosen_card_rarity = 'Legendary' then
      select not exists (
        select 1
        from public.card_instances ci
        join public.ownership_history oh
          on oh.card_instance_id = ci.id
        where
          ci.card_catalog_id = chosen_card_id
          and oh.to_owner_id = current_user_id
      )
      into is_first_pull;
    end if;

    -- =====================================================
    -- COPY NUMBER PER LEAGUE
    -- =====================================================
    select
      coalesce(max(copy_number), 0) + 1
    into next_copy_number
    from public.card_instances
    where
      league_id = current_league_id
      and card_catalog_id = chosen_card_id;

    -- =====================================================
    -- CREATE CARD INSTANCE
    --
    -- Definitive shop ownership metadata
    -- =====================================================
    insert into public.card_instances (
      league_id,
      card_catalog_id,
      copy_number,
      current_owner_id,
      original_owner_id,
      original_acquisition_type,
      original_source_id,
      acquired_at,
      locked
    )
    values (
      current_league_id,
      chosen_card_id,
      next_copy_number,
      current_user_id,
      current_user_id,
      'shop',
      opening_id,
      now(),
      false
    )
    returning id
    into new_instance_id;

    -- =====================================================
    -- RECORD PULL
    -- =====================================================
    insert into public.shop_pack_pulls (
      opening_id,
      card_catalog_id,
      card_instance_id,
      pull_position,
      pulled_rarity,
      is_first_for_player
    )
    values (
      opening_id,
      chosen_card_id,
      new_instance_id,
      position_number,
      chosen_card_rarity,
      is_first_pull
    );

    -- =====================================================
    -- PITY RESET CHECK
    -- =====================================================
    if target_pack_code = 'normal'
      and public.shop_rarity_rank(chosen_card_rarity) >= 3
    then
      hit_pity_target := true;
    elsif target_pack_code = 'premium'
      and public.shop_rarity_rank(chosen_card_rarity) >= 4
    then
      hit_pity_target := true;
    elsif target_pack_code = 'deluxe'
      and public.shop_rarity_rank(chosen_card_rarity) >= 5
    then
      hit_pity_target := true;
    elsif target_pack_code in ('special_attribute', 'special_archetype')
      and public.shop_rarity_rank(chosen_card_rarity) >= 4
    then
      hit_pity_target := true;
    end if;
  end loop;

  -- =======================================================
  -- UPDATE PITY
  -- =======================================================
  if hit_pity_target then
    update public.shop_pack_pity
    set
      packs_since_ultra_or_better = 0,
      updated_at = now()
    where
      profile_id = current_user_id
      and pack_code = target_pack_code;
  else
    update public.shop_pack_pity
    set
      packs_since_ultra_or_better = packs_since_ultra_or_better + 1,
      updated_at = now()
    where
      profile_id = current_user_id
      and pack_code = target_pack_code;
  end if;

  -- =======================================================
  -- CONSUME VOUCHER
  -- =======================================================
  if target_voucher_id is not null then
    if voucher_row.quantity <= 1 then
      delete from public.reward_vouchers
      where id = target_voucher_id;
    else
      update public.reward_vouchers
      set
        quantity = quantity - 1,
        updated_at = now()
      where id = target_voucher_id;
    end if;
  end if;

  return opening_id;
end;
$function$;

revoke all
  on function public.purchase_shop_pack(text, uuid)
  from public;

grant execute
  on function public.purchase_shop_pack(text, uuid)
  to authenticated;

-- =========================================================
-- SOURCE: supabase/migrations/202608310010_phase1_verify_introspect_helper.sql
-- =========================================================

-- =========================================================
-- PHASE 1 VERIFICATION HELPER (read-only introspection RPC)
--
-- scripts/verify-phase1-live.mjs needs to confirm specific functions
-- and unique indexes exist, and that a few function bodies contain
-- the expected corrected literals/wiring - but Supabase's default
-- PostgREST config does not expose pg_catalog over the REST API, so
-- a plain `.from("pg_proc")` call from the JS client would fail on
-- most projects regardless of whether the underlying fix is really
-- there. This narrow, read-only, security-definer RPC is the
-- reliable way to check: RPC calls to public-schema functions always
-- work over PostgREST, independent of exposed-schema settings.
--
-- SAFETY
-- - Read-only: only ever SELECTs from pg_proc / pg_indexes. No
--   application table is touched, nothing is inserted/updated/
--   deleted, nothing outside this one JSON return value is exposed.
-- - Narrow: the exact function/index names it inspects are
--   hardcoded inside the function body, not passed in as arguments -
--   it cannot be used to introspect arbitrary objects.
-- - Grants execute to service_role only (not authenticated/anon) -
--   this is a one-time deployment-verification tool, not something
--   the app itself should ever call.
-- - Optional to keep: safe to leave in place permanently (it does
--   nothing unless explicitly called with the service-role key), or
--   drop it after Phase 1 verification is done with:
--     drop function if exists public._phase1_verify_introspect();
-- =========================================================

create or replace function public._phase1_verify_introspect()
returns jsonb
language plpgsql
security definer
set search_path to 'public, pg_catalog'
as $function$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'functions', (
      select jsonb_object_agg(fn, exists(select 1 from pg_proc where proname = fn))
      from unnest(array[
        'settle_round_rewards_v2',
        'settle_competition_if_complete_v2',
        'install_default_round_rewards_v2',
        'purchase_shop_pack',
        '_compute_league_match_reward',
        'submit_competition_match_result_v2'
      ]) as fn
    ),
    'sources', (
      select jsonb_object_agg(p.proname, p.prosrc)
      from pg_proc p
      where p.proname in (
        'install_default_round_rewards_v2',
        '_compute_league_match_reward',
        'submit_competition_match_result_v2',
        'purchase_shop_pack'
      )
    ),
    'indexes', (
      select jsonb_object_agg(idx, exists(select 1 from pg_indexes where indexname = idx))
      from unnest(array[
        'duel_point_transactions_match_reason_unique',
        'competition_reward_grants_active_unique',
        'competition_round_reward_grants_active_unique'
      ]) as idx
    )
  ) into result;

  return result;
end;
$function$;

revoke all on function public._phase1_verify_introspect() from public;
grant execute on function public._phase1_verify_introspect() to service_role;


-- =========================================================
-- POST-ROLLOUT STRUCTURAL ASSERTIONS
--
-- Hard-fail (and roll back the ENTIRE transaction) only on
-- structural invariants this same script just created - these
-- cannot legitimately be false unless something upstream silently
-- failed. Does NOT hard-fail on data-dependent outcomes (a card name
-- not matching this league's real catalog, a rarity override not
-- finding its target) since those already self-report via RAISE
-- NOTICE in their own sections and a real name mismatch is a data
-- question for the human, not a reason to discard the entire
-- rollout.
-- =========================================================

do $$
declare
  v_archetype_count integer;
  v_relationship_count integer;
begin
  if to_regclass('public.archetype_registry') is null then
    raise exception 'PHASE 1 ROLLOUT ABORTED: public.archetype_registry table was not created.';
  end if;

  if to_regclass('public.archetype_cards') is null then
    raise exception 'PHASE 1 ROLLOUT ABORTED: public.archetype_cards table was not created.';
  end if;

  select count(*) into v_archetype_count from public.archetype_registry;
  if v_archetype_count <> 10 then
    raise exception 'PHASE 1 ROLLOUT ABORTED: expected 10 archetype_registry rows, found %.', v_archetype_count;
  end if;

  select count(*) into v_relationship_count from public.archetype_cards;
  if v_relationship_count <> 255 then
    raise exception 'PHASE 1 ROLLOUT ABORTED: expected 255 archetype_cards relationship rows, found %.', v_relationship_count;
  end if;

  if to_regclass('public.competition_round_reward_rules') is null then
    raise exception 'PHASE 1 ROLLOUT ABORTED: public.competition_round_reward_rules table was not created.';
  end if;

  if to_regclass('public.competition_round_reward_grants') is null then
    raise exception 'PHASE 1 ROLLOUT ABORTED: public.competition_round_reward_grants table was not created.';
  end if;

  if to_regprocedure('public.settle_round_rewards_v2(uuid, integer)') is null then
    raise exception 'PHASE 1 ROLLOUT ABORTED: settle_round_rewards_v2(uuid, integer) function was not created.';
  end if;

  if to_regprocedure('public.settle_competition_if_complete_v2(uuid)') is null then
    raise exception 'PHASE 1 ROLLOUT ABORTED: settle_competition_if_complete_v2(uuid) function was not created.';
  end if;

  if to_regprocedure('public.install_default_round_rewards_v2(uuid)') is null then
    raise exception 'PHASE 1 ROLLOUT ABORTED: install_default_round_rewards_v2(uuid) function was not created.';
  end if;

  if to_regprocedure('public.purchase_shop_pack(text, uuid)') is null then
    raise exception 'PHASE 1 ROLLOUT ABORTED: purchase_shop_pack(text, uuid) function was not created.';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'competition_round_reward_grants_active_unique'
  ) then
    raise exception 'PHASE 1 ROLLOUT ABORTED: competition_round_reward_grants_active_unique partial unique index is missing - round rewards would not be duplicate-safe.';
  end if;

  if to_regprocedure('public._phase1_verify_introspect()') is null then
    raise exception 'PHASE 1 ROLLOUT ABORTED: _phase1_verify_introspect() helper function was not created - the verification script will not be able to run.';
  end if;

  raise notice 'PHASE 1 ROLLOUT: all structural assertions passed (archetype registry: 10 archetypes / 255 relationships; round-reward schema, functions and idempotency index present; Legendary scarcity fix present; verification helper installed).';
end $$;

commit;
