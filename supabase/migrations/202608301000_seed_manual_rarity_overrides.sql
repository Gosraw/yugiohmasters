begin;

-- =========================================================
-- MANUAL RARITY OVERRIDE SEED (Codex approved calibration table)
--
-- WHY
-- card_catalog already has a manual-override mechanism for the live,
-- player-facing game_rarity column - game_rarity itself, plus
-- rarity_manually_overridden / rarity_reason / rarity_needs_review /
-- rarity_reviewed_at / rarity_reviewed_by
-- (202608190003_game_rarity.sql). It has just never been WIRED to
-- anything live: rarity_manually_overridden was previously read only
-- by the now-deprecated scripts/classify-rarities.mjs (see that
-- file's own "DEPRECATED - DO NOT USE" header) - nothing live
-- actually enforced it. scripts/apply-manual-rarity-overrides.mjs
-- (added alongside this migration) is the first live code to treat
-- it as authoritative: it refuses to touch any card where
-- rarity_manually_overridden = true, full stop.
--
-- This migration is the "seed" half of that: it sets game_rarity
-- directly for the 9 cards the Codex brief explicitly, repeatedly
-- approved by name (not an algorithmic guess at scale - see
-- docs/cardpool-classic-format-audit-2026-08-30.md for why this
-- project deliberately does NOT do that for the rest of the
-- catalog), and marks them rarity_manually_overridden = true so no
-- future automated pass - the valuation engine, an eventual
-- proposed_game_rarity -> game_rarity promotion, anything - can ever
-- silently change them again.
--
-- SAFETY
-- - UPDATE ... WHERE name = '<exact name>', never a hardcoded id
--   (this sandbox has no live database to look up real UUIDs from).
--   A name that doesn't exist in your catalog updates 0 rows and
--   raises a NOTICE below rather than failing the migration.
-- - Only touches the 9 named cards. Does not touch Change of Heart,
--   Dark Hole, Monster Reborn, or Premature Burial - the brief was
--   explicit that Change of Heart/Dark Hole's existing manually-
--   approved relationship must be preserved exactly as-is (untouched
--   by this migration, not even read), Monster Reborn is a benchmark
--   reference only (no override value was given for it), and
--   Premature Burial is a HUMAN REVIEW item, not a value to force -
--   see the audit report's review list.
-- - Purely a data change (UPDATE on existing, already-migrated
--   columns) - no schema change, nothing to roll back structurally.
-- =========================================================

do $$
declare
  v_count integer;
begin
  -- Rescue Rabbit = Super Rare
  update public.card_catalog
  set game_rarity = 'Super Rare',
      rarity_manually_overridden = true,
      rarity_needs_review = false,
      rarity_confidence = 1.0,
      rarity_reason = 'Codex approved calibration table (2026-08-30): theoretical ceiling (explosive double-Normal-Monster Xyz enabler) far exceeds real applicability in an archetype-heavy field where few decks run Normal Monsters - Super Rare, not higher, despite strong historical reputation.',
      rarity_reviewed_at = now()
  where name = 'Rescue Rabbit';
  get diagnostics v_count = row_count;
  if v_count = 0 then raise notice 'Manual rarity override: no card_catalog row found for "Rescue Rabbit" - check the name.'; end if;

  -- Tragoedia = Secret Rare
  update public.card_catalog
  set game_rarity = 'Secret Rare',
      rarity_manually_overridden = true,
      rarity_needs_review = false,
      rarity_confidence = 1.0,
      rarity_reason = 'Codex approved calibration table (2026-08-30): strong comeback potential and scalability (hand-size-based stats, Special Summons off battle damage, can commandeer an opponent monster), but not sufficiently universal/consistently dominant for Legendary.',
      rarity_reviewed_at = now()
  where name = 'Tragoedia';
  get diagnostics v_count = row_count;
  if v_count = 0 then raise notice 'Manual rarity override: no card_catalog row found for "Tragoedia" - check the name.'; end if;

  -- Gorz the Emissary of Darkness = Secret Rare
  update public.card_catalog
  set game_rarity = 'Secret Rare',
      rarity_manually_overridden = true,
      rarity_needs_review = false,
      rarity_confidence = 1.0,
      rarity_reason = 'Codex approved calibration table (2026-08-30): excellent comeback card, punishes direct attacks with immediate board presence, but requires an open field / a specific trigger rather than being universally active.',
      rarity_reviewed_at = now()
  where name = 'Gorz the Emissary of Darkness';
  get diagnostics v_count = row_count;
  if v_count = 0 then raise notice 'Manual rarity override: no card_catalog row found for "Gorz the Emissary of Darkness" - check the name.'; end if;

  -- Battle Fader = Ultra Rare
  update public.card_catalog
  set game_rarity = 'Ultra Rare',
      rarity_manually_overridden = true,
      rarity_needs_review = false,
      rarity_confidence = 1.0,
      rarity_reason = 'Codex approved calibration table (2026-08-30): strong Battle Phase defense with real follow-up (stays on the field, can become material afterward), but purely defensive/situational relative to the Secret-tier references.',
      rarity_reviewed_at = now()
  where name = 'Battle Fader';
  get diagnostics v_count = row_count;
  if v_count = 0 then raise notice 'Manual rarity override: no card_catalog row found for "Battle Fader" - check the name.'; end if;

  -- Swift Scarecrow = Super Rare
  update public.card_catalog
  set game_rarity = 'Super Rare',
      rarity_manually_overridden = true,
      rarity_needs_review = false,
      rarity_confidence = 1.0,
      rarity_reason = 'Codex approved calibration table (2026-08-30): useful Battle Phase protection, but unlike Battle Fader it does not remain on the field afterward, so less follow-up value - one tier below Battle Fader.',
      rarity_reviewed_at = now()
  where name = 'Swift Scarecrow';
  get diagnostics v_count = row_count;
  if v_count = 0 then raise notice 'Manual rarity override: no card_catalog row found for "Swift Scarecrow" - check the name.'; end if;

  -- D.D. Crow = Ultra Rare
  update public.card_catalog
  set game_rarity = 'Ultra Rare',
      rarity_manually_overridden = true,
      rarity_needs_review = false,
      rarity_confidence = 1.0,
      rarity_reason = 'Codex approved calibration table (2026-08-30): strong, broadly playable hand disruption against Graveyard-reliant strategies specifically, but matchup-dependent - excellent in some games, mediocre in others.',
      rarity_reviewed_at = now()
  where name = 'D.D. Crow';
  get diagnostics v_count = row_count;
  if v_count = 0 then raise notice 'Manual rarity override: no card_catalog row found for "D.D. Crow" - check the name.'; end if;

  -- Effect Veiler = Secret Rare
  update public.card_catalog
  set game_rarity = 'Secret Rare',
      rarity_manually_overridden = true,
      rarity_needs_review = false,
      rarity_confidence = 1.0,
      rarity_reason = 'Codex approved calibration table (2026-08-30): very strong generic disruption, minimal setup, works from the hand, fits a wide variety of decks and board states.',
      rarity_reviewed_at = now()
  where name = 'Effect Veiler';
  get diagnostics v_count = row_count;
  if v_count = 0 then raise notice 'Manual rarity override: no card_catalog row found for "Effect Veiler" - check the name.'; end if;

  -- Maxx "C" = Ultra Rare
  update public.card_catalog
  set game_rarity = 'Ultra Rare',
      rarity_manually_overridden = true,
      rarity_needs_review = false,
      rarity_confidence = 1.0,
      rarity_reason = 'Codex approved calibration table (2026-08-30): the format''s own flagship "do not rank by modern reputation" example - real value is almost entirely a function of the OPPONENT''s Special Summon frequency, which is much lower in this format than modern Yu-Gi-Oh, so this is deliberately NOT ranked at its high modern-metagame reputation.',
      rarity_reviewed_at = now()
  where name = 'Maxx "C"';
  get diagnostics v_count = row_count;
  if v_count = 0 then raise notice 'Manual rarity override: no card_catalog row found for "Maxx ''C''" - check the exact name/quoting in your catalog (may be stored without the embedded quote marks).'; end if;

  -- Giant Trunade = Ultra Rare
  update public.card_catalog
  set game_rarity = 'Ultra Rare',
      rarity_manually_overridden = true,
      rarity_needs_review = false,
      rarity_confidence = 1.0,
      rarity_reason = 'Codex approved calibration table (2026-08-30): returns Spells/Traps to hand rather than destroying them - the opponent can often reset them next turn, so this is NOT Legendary despite strong historical banlist reputation.',
      rarity_reviewed_at = now()
  where name = 'Giant Trunade';
  get diagnostics v_count = row_count;
  if v_count = 0 then raise notice 'Manual rarity override: no card_catalog row found for "Giant Trunade" - check the name.'; end if;

  raise notice 'Manual rarity override seed complete - see rarity_manually_overridden = true rows for the 9 Codex-approved cards.';
end $$;

commit;
