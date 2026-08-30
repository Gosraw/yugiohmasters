begin;

-- =========================================================
-- DUELIST CIRCLE CLASSIC FORMAT (proposed, INACTIVE)
--
-- WHY
-- The seeded 'season_1' format row (202608231500_duelist_circle_
-- format_engine.sql) uses a single 2020-12-31 release cutoff with
-- Fusion/Xyz allowed. The Codex cardpool-balancing brief asks for a
-- meaningfully different, more restrictive ruleset - an
-- "alternate-history old-school / GX / early-Xyz-era" format:
--   - 2014-12-31 as the CORE eligibility cutoff (everything at or
--     before this date is normally eligible, subject to the same
--     mechanic/Master Duel checks as any other format);
--   - 2015-2018 as a CURATED, WHITELIST-ONLY period - a card
--     released in this window is eligible ONLY via an explicit
--     format_card_overrides include row, never by the cutoff alone;
--   - 2019 onward excluded by default, with only exceptional,
--     individually-reviewed manual includes.
--
-- This is expressible entirely within the EXISTING format engine
-- (is_duelist_circle_format_eligible(), unchanged by this
-- migration) by setting release_cutoff to 2014-12-31 and relying on
-- format_card_overrides.override_type = 'include' for the curated
-- 2015-2018 whitelist - override_type=include bypasses the cutoff
-- check but never the Master Duel gate (see that function's own
-- comment). No schema change is needed; this migration only adds a
-- new, separate format row and a small number of override rows.
--
-- This is purely additive and purely proposed:
--   - is_active = false. Activating this format (and therefore
--     changing what Draft/Shop/Deckbuilder actually offer) remains
--     a separate, deliberate operator decision - see the Season 1
--     runbook's "Later, whenever you're ready" section for the
--     exact activation steps (this migration does not repeat them;
--     the mechanism is identical, only the format code differs).
--   - The existing 'season_1' row and its is_active state are
--     completely untouched - this migration does not edit that row.
--   - The one override row this migration inserts is an INSERT ...
--     SELECT keyed on card_catalog.name, not a hardcoded id, since
--     this migration was authored in a sandbox with no live
--     database access to look up real UUIDs. If no card with that
--     exact name exists in your catalog (e.g. a name mismatch), the
--     SELECT simply returns no rows and nothing is inserted - this
--     migration cannot fail or silently corrupt data on that count.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- It does not attempt to enumerate the full 2015-2018 curated
-- whitelist, and it does not attempt to build the "hard mechanic
-- text dependency" exclusion list (Main Deck/Spell/Trap cards that
-- functionally require a Synchro/Pendulum/Link Monster without
-- being one themselves - see scripts/audit-mechanic-text-
-- dependency.mjs). Both of those require running real tooling
-- against the live ~13,900-card catalog, which needs network access
-- this sandboxed session did not have (same limitation documented
-- in docs/SEASON_1.md §11 for the pre-existing valuation/cutoff
-- audits). See the accompanying cardpool balance audit report for
-- the reviewed candidate list and exact commands to run for real.
-- =========================================================

insert into public.duelist_circle_formats (
  code, name, version,
  release_cutoff,
  allow_illusion, allow_synchro, allow_xyz, allow_link, allow_pendulum, allow_fusion,
  current_release_stage,
  is_active,
  notes
)
values (
  'duelist_circle_classic_v1',
  'Duelist Circle Classic',
  1,
  '2014-12-31',
  false, false, true, false, false, true,
  1,
  false,
  'PROPOSED, not yet approved or activated. Implements the Codex cardpool-balancing brief''s tiered era structure: 2014-12-31 is the CORE eligibility cutoff; 2015-2018 is intentionally curated/whitelist-only via format_card_overrides(override_type=''include'') rather than a looser cutoff date, since this format''s release_cutoff alone would otherwise exclude all of 2015-2018 along with 2019+; 2019 onward is excluded by default with only exceptional, individually-reviewed manual includes. allow_synchro/allow_link/allow_pendulum/allow_illusion = false and allow_xyz/allow_fusion = true per the brief''s absolute Extra Deck rule (Fusion + Xyz only). Independent of, and does not replace, the existing ''season_1'' row (2020-12-31 cutoff) - both can coexist; only one may be is_active at a time (see duelist_circle_formats_one_active). Activating this format is a separate, deliberate operator decision, same as season_1.'
)
on conflict (code) do nothing;

-- One high-confidence curated 2015-2018 include: Chocolate Magician
-- Girl, the brief's own explicitly-given model example of the kind
-- of later Dark Magician / Magician Girl support this format wants
-- (strengthens the archetype identity; does not, by itself, create
-- a generic multi-search/multi-Special-Summon engine). Every other
-- 2015-2018 candidate this session identified is deliberately left
-- OUT of this migration and listed instead in the audit report's
-- human review section, pending real release_date verification
-- against the live catalog (this sandbox could not query it) -
-- see the "2015-2018 LEGACY SUPPORT CANDIDATES" section there.
insert into public.format_card_overrides (format_id, card_catalog_id, override_type, reason)
select
  f.id,
  c.id,
  'include',
  'Curated 2015-2018 legacy support for the Dark Magician / Magician Girl archetype - the Codex brief''s own explicit model example of desired later support. Strengthens archetype identity without introducing a generic searchable engine. See the cardpool balance audit report for the full reasoning.'
from public.duelist_circle_formats f
cross join public.card_catalog c
where f.code = 'duelist_circle_classic_v1'
  and c.name = 'Chocolate Magician Girl'
on conflict (format_id, card_catalog_id) do nothing;

commit;
