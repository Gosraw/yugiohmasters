begin;

-- =========================================================
-- FINAL CARDPOOL CALIBRATION - EXPLICIT INCLUDE/EXCLUDE PASS
-- (Duelist Circle "Final Implementation & Go-Live Sprint", 2026-09-01)
--
-- WHY
-- The go-live spec names a small explicit calibration list on top of
-- the already-eligible <=2014 pool and the existing 2015-2018
-- whitelist (202608301200_seed_2015_2018_legacy_support_whitelist.sql,
-- 15 cards): a short list of specific 2015-2018 cards to additionally
-- INCLUDE (nostalgia/archetype support), and a short list of cards to
-- explicitly EXCLUDE (compact generic engines that make unrelated
-- decks converge - exactly the pattern this format's philosophy
-- already treats as strict).
--
-- CARD VALIDATION
-- Every name below was looked up against the real card catalog via
-- reports/card-valuation/2026-08-25T12-39-31-069Z/full-proposal.json
-- (13,931-card local snapshot; card_catalog_id/card_type/release_date
-- are raw catalog facts unaffected by later valuation-engine scoring
-- changes, so this snapshot is still valid for name/id lookups even
-- though its rarity SCORES are stale - see the rarity recalibration
-- migration's own header for that distinction). All 17 names below
-- were found with an exact match; none required a thematic
-- substitution. This sandbox still has no live Supabase/network
-- access, so as with every prior override migration, the actual
-- INSERT ... SELECT ... WHERE c.name = '<exact name>' pattern is what
-- verifies the name for real at apply time - a typo matches 0 rows
-- and is reported via RAISE NOTICE rather than failing the migration.
--
-- INCLUDES (9 new rows - Cyber Emergency from the same target list is
-- already whitelisted by the prior migration, not re-added here):
--   Fairy Tail - Snow (2016) - standalone nostalgia pick, no archetype tag.
--   Ultimate Conductor Tyranno (2017) - explicitly named nostalgic pick
--     for this group; also independently granted as Dinosaur Boss
--     Route Stage 3 support (see the Boss Route seed migration) - this
--     override is what makes it usable in the normal cardpool/draft
--     too, not just via that Route.
--   Vision HERO Vyon (2017) - Elemental HERO family consistency piece.
--   Amazoness Onslaught (2017) - Amazoness archetype support.
--   Vampire Fraulein (2018) - Vampire archetype support.
--   Return of the Dragon Lords (2016) - Felgrand/Dragon Lords support.
--   Toon Kingdom (2015) - Toon archetype support.
--   Bingo Machine, Go!!! (2018) - Blue-Eyes archetype support.
--   Apprentice Illusion Magician (2017) - Dark Magician archetype support.
--
-- EXCLUDES (7 rows - "be strict with compact generic splash engines /
-- packages that make unrelated decks converge", per the format
-- philosophy already governing this cardpool):
--   The full Invoked/Aleister package (Aleister the Invoker, Invocation,
--   Invoked Magellanica/Purgatrio/Elysium/Cocytus/Mechaba) - a
--   self-contained, near-any-deck-splashable generic Fusion engine.
--   Number 86: Heroic Champion - Rhongomyniad - a single, extremely
--   generic, near-any-Xyz-deck splash payoff.
-- All 7 are 2015-2018 releases and were therefore ALREADY excluded by
-- default under this format's whitelist-only policy for that window
-- (none were in the existing 15-card whitelist) - these rows exist as
-- explicit, self-documenting, defense-in-depth EXCLUDE overrides
-- (exclude always wins over any future include, per
-- is_duelist_circle_format_eligible()'s own precedence rule) rather
-- than relying on silent omission, so a future whitelist edit can
-- never accidentally re-admit this specific package without someone
-- deliberately removing an exclude row that explains why it's there.
--
-- SAFETY (identical pattern to every prior override migration)
-- - on conflict (format_id, card_catalog_id) do nothing - safe to re-run.
-- - Purely additive to format_card_overrides. Does not touch
--   duelist_circle_formats, card_catalog, game_rarity, or any
--   archetype_registry/archetype_cards data.
-- - is_active on duelist_circle_classic_v1 is untouched (still false,
--   set by the original format migration) - activating the format
--   remains a separate, deliberate operator decision.
-- =========================================================

do $$
declare
  v_format_id uuid;
  v_count integer;
  v_row text[];
  v_includes text[][] := array[
    array['Fairy Tail - Snow', 'Explicit nostalgia include from the go-live cardpool calibration list.'],
    array['Ultimate Conductor Tyranno', 'Explicit nostalgia include; also independently granted as Dinosaur Boss Route Stage 3 support - this override makes it usable outside that Route too.'],
    array['Vision HERO Vyon', 'Elemental HERO family consistency support.'],
    array['Amazoness Onslaught', 'Amazoness archetype support.'],
    array['Vampire Fraulein', 'Vampire archetype support.'],
    array['Return of the Dragon Lords', 'Felgrand / Dragon Lords archetype support.'],
    array['Toon Kingdom', 'Toon archetype support.'],
    array['Bingo Machine, Go!!!', 'Blue-Eyes archetype support.'],
    array['Apprentice Illusion Magician', 'Dark Magician archetype support.']
  ];
  v_excludes text[][] := array[
    array['Aleister the Invoker', 'Invoked/Aleister package: compact generic Fusion engine that makes unrelated decks converge - excluded per format philosophy, defense-in-depth (already outside the 2015-2018 whitelist).'],
    array['Invocation', 'Invoked/Aleister package: see Aleister the Invoker.'],
    array['Invoked Magellanica', 'Invoked/Aleister package: see Aleister the Invoker.'],
    array['Invoked Purgatrio', 'Invoked/Aleister package: see Aleister the Invoker.'],
    array['Invoked Elysium', 'Invoked/Aleister package: see Aleister the Invoker.'],
    array['Invoked Cocytus', 'Invoked/Aleister package: see Aleister the Invoker.'],
    array['Invoked Mechaba', 'Invoked/Aleister package: see Aleister the Invoker.'],
    array['Number 86: Heroic Champion - Rhongomyniad', 'Extremely generic, near-any-Xyz-deck splash payoff - excluded per format philosophy, defense-in-depth (already outside the 2015-2018 whitelist).']
  ];
begin
  select id into v_format_id from public.duelist_circle_formats where code = 'duelist_circle_classic_v1';

  if v_format_id is null then
    raise notice 'Cardpool final calibration: no duelist_circle_classic_v1 format row found - run 202608300900_duelist_circle_classic_format.sql first. Skipping all inserts.';
  else
    foreach v_row slice 1 in array v_includes
    loop
      insert into public.format_card_overrides (format_id, card_catalog_id, override_type, reason)
      select v_format_id, c.id, 'include', v_row[2]
      from public.card_catalog c
      where c.name = v_row[1]
      on conflict (format_id, card_catalog_id) do nothing;

      get diagnostics v_count = row_count;
      if v_count = 0 then
        raise notice 'Cardpool final calibration (include): no card_catalog row found for "%" (or override already existed) - check the exact name.', v_row[1];
      end if;
    end loop;

    foreach v_row slice 1 in array v_excludes
    loop
      insert into public.format_card_overrides (format_id, card_catalog_id, override_type, reason)
      select v_format_id, c.id, 'exclude', v_row[2]
      from public.card_catalog c
      where c.name = v_row[1]
      on conflict (format_id, card_catalog_id) do nothing;

      get diagnostics v_count = row_count;
      if v_count = 0 then
        raise notice 'Cardpool final calibration (exclude): no card_catalog row found for "%" (or override already existed) - check the exact name.', v_row[1];
      end if;
    end loop;
  end if;
end $$;

commit;
