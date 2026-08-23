-- =========================================================
-- VALUATION ENGINE V2 - additive proposal columns
--
-- Purely additive, backwards-compatible - adds columns only,
-- never drops or rewrites the columns 202608231500 already added.
-- Written for lib/valuation-engine.mjs v2 (engine version
-- "2026-08-23.2"), which reshaped the score axes after a real
-- valuation report review found concrete errors in v1 (see that
-- file's own header comment and the Season 1 follow-up report for
-- the full account): usability_score and versatility_score are
-- SUPERSEDED by the more precisely-scoped accessibility_score and
-- generic_utility_score, and two new axes (floor_score,
-- ceiling_score) separate "guaranteed value with zero synergy"
-- from "best-case value when fully enabled" - something v1 never
-- distinguished at all.
--
-- power_score, dependency_score, consistency_score,
-- draft_value_score, oppressiveness_tier/_reason,
-- proposed_game_rarity, valuation_reason,
-- valuation_engine_version, valuation_computed_at, and
-- valuation_manually_overridden are UNCHANGED - v2 still populates
-- all of them, just from a rebuilt scoring model underneath.
--
-- Like 202608231500, this migration does not touch game_rarity,
-- release_stage, or format_eligible, and does not write any row
-- data itself - only scripts/audit-card-valuation.mjs writes these
-- columns, and only when explicitly run with --write-scores.
-- =========================================================

alter table public.card_catalog
  add column if not exists accessibility_score numeric(5, 2);

comment on column public.card_catalog.accessibility_score is
  'v2. How easily this card can be summoned/activated on its OWN terms (cost, timing, Set-first delay, Extra Deck board-presence tax) - independent of whether the deck happens to have the right support cards (see dependency_score for that). Supersedes usability_score, which blended this together with dependency in a way that made both harder to reason about independently.';

alter table public.card_catalog
  add column if not exists generic_utility_score numeric(5, 2);

comment on column public.card_catalog.generic_utility_score is
  'v2. Can almost any random Duelist Circle deck use this effectively? Supersedes versatility_score - renamed and rebuilt to derive narrowness from classified in-text references (see valuation-engine.mjs classifyReference()) instead of a raw archetype-tag match, which is what let a genuinely generic card (e.g. a Fusion Monster with fully generic materials) get penalized just because its DB archetype tag happened to look thematic.';

alter table public.card_catalog
  add column if not exists floor_score numeric(5, 2);

comment on column public.card_catalog.floor_score is
  'v2, NEW axis. Guaranteed value with ZERO synergy/setup - what you actually get from randomly owning this one card with no build-around. A card can have a high power_score/ceiling_score and still have a very low floor_score (e.g. a card that is a total brick without a specific named support card). This did not exist as a separate concept in v1.';

alter table public.card_catalog
  add column if not exists ceiling_score numeric(5, 2);

comment on column public.card_catalog.ceiling_score is
  'v2, NEW axis. Best-case value when fully enabled/supported - the payoff a real build-around deserves. Archetype/build-around cards are explicitly allowed a high ceiling_score even with a high dependency_score; dependency is meant to penalize draft_value_score (how exciting a RANDOM offer of this card is), never to cap how good the card can be in the right deck.';

comment on column public.card_catalog.usability_score is
  'SUPERSEDED by accessibility_score as of valuation engine v2 (2026-08-23.2) - column kept for backwards compatibility with any historical rows/reports, no longer written by scripts/audit-card-valuation.mjs going forward.';

comment on column public.card_catalog.versatility_score is
  'SUPERSEDED by generic_utility_score as of valuation engine v2 (2026-08-23.2) - column kept for backwards compatibility with any historical rows/reports, no longer written by scripts/audit-card-valuation.mjs going forward.';

comment on column public.card_catalog.draft_value_score is
  'How valuable it is to be RANDOMLY offered this card - the intended basis for proposed_game_rarity. As of v2, this is computed from floor_score/ceiling_score/accessibility_score/generic_utility_score/consistency_score minus a dependency_score penalty, and DELIBERATELY EXCLUDES oppressiveness entirely - a card can be extremely desirable (high draft_value_score) and still unsuitable for Season 1 (high oppressiveness) at the same time; oppressiveness only ever informs release_stage, never rarity.';
