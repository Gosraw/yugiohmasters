-- =========================================================
-- PHASE 1 DEPLOYMENT - SECTION 01 of 08
-- Round-2 manual rarity overrides (6 cards). Independent - safe to
-- run standalone. Idempotent: safe to re-run.
-- SOURCE (unmodified): supabase/migrations/202608301100_seed_manual_rarity_overrides_round2.sql
-- =========================================================

begin;

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

commit;
