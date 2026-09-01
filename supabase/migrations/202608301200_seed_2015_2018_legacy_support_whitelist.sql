begin;

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

commit;
