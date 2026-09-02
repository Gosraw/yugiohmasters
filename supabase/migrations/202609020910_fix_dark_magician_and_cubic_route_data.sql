begin;

-- =========================================================
-- FIX: Dark Magician route stage chain drift + Cubic Stage 4
-- support gap (Season 1 audit, Boss Route data item)
--
-- WHY - Dark Magician
-- The route was live-corrected by hand before this migration
-- existed (bossg's route selection predated the fix, so bossg was
-- also manually granted Berry/Lemon/Chocolate Magician Girl
-- directly): the intended Stage 1-4 evolution chain is
--   Stage 1: Berry Magician Girl      (free)
--   Stage 2: Dark Magician Girl       (900 DP)
--   Stage 3: Dark Magician of Chaos   (1400 DP)
--   Stage 4: The Dark Magicians       (2400 DP, final Boss)
-- and Stage 1 permanent support is five cards: Skilled Dark
-- Magician, Old Vindictive Magician, Magical Dimension, Lemon
-- Magician Girl, Chocolate Magician Girl. The seed migration
-- (202609011900_seed_boss_routes.sql) and data/boss-route-
-- registry.mjs were never updated to match and still show the old
-- Apprentice Magician -> Dark Magician Girl -> Dark Magician ->
-- Dark Magician of Chaos chain with only 3 of the 5 Stage 1
-- support cards. This migration is the missing update, applied the
-- same idempotent way as the original seed (on conflict do
-- update), so it is safe to run against a database that already
-- has the old OR the manually-corrected data.
--
-- LIVE-SAFETY RECONCILIATION (2026-09-02, pre-deploy review):
-- production already has Lemon Magician Girl and Chocolate
-- Magician Girl as Stage 1 grants, both manually set
-- is_route_exclusive = true. This file originally hardcoded both
-- inserts to is_route_exclusive = false, which the `on conflict do
-- update set is_route_exclusive = excluded.is_route_exclusive`
-- clause would have silently flipped back to false on deploy -
-- clobbering an intended live fix and, worse, reopening a Special
-- Pack pool leak (both cards had been curated into the
-- arcane_circle pool on the false assumption that they were
-- ordinary, non-exclusive support - removed from that pool in
-- 202609021020 as part of this same reconciliation). Both inserts
-- below now use true, matching the confirmed-correct live state;
-- the on-conflict clause is therefore idempotent in both directions
-- (true -> true) rather than clobbering true -> false. Skilled Dark
-- Magician / Old Vindictive Magician / Magical Dimension are
-- unaffected - they are already false in the original seed and stay
-- that way; nothing about this reconciliation changes them.
--
-- DESIGN CHANGE (2026-09-02, supersedes the LIVE-SAFETY
-- RECONCILIATION note above): approved design was revised again -
-- Magician Girls and their normal Spell/Trap support MUST remain
-- obtainable through normal Draft/Shop/Packs. A Boss Path grant does
-- NOT automatically make a card route-exclusive: a card may be
-- granted by a Boss Path stage AND still be part of the normal
-- eligible pool if it otherwise belongs there (i.e. is not outside
-- the curated pool/cutoff, and was not explicitly designed as a
-- route-only reward). Lemon Magician Girl and Chocolate Magician
-- Girl are both ordinary, non-exclusive Magician Girl support within
-- the curated pool/cutoff - there was never a design reason for
-- either to be route-only. Both grants below are reverted back to
-- is_route_exclusive = false (their original, pre-reconciliation
-- value), and both cards are restored to the arcane_circle Special
-- Pack pool in 202609021020 (280 cards again - see that file's own
-- updated note). This does NOT retroactively touch any already-
-- granted card_instances (bossg's existing Berry/Lemon/Chocolate
-- ownership is untouched) and does NOT replay any Boss stage - it
-- only changes the boss_route_stage_grants CONFIGURATION governing
-- future eligibility and Special Pack pool membership.
--
-- The plain "Dark Magician" card (previously Stage 3's evolution
-- monster) is no longer an evolution stage in the corrected chain.
-- CORRECTED 2026-09-02: an earlier draft of this migration re-added
-- it as a Stage 3 support grant on its own initiative - reverted.
-- The authoritative Stage 1 support list (below) is exactly the 5
-- named cards and nothing else; no placement is invented for Dark
-- Magician (plain) here. See the bottom of this file for the
-- explicit revert note.
--
-- Existing card ownership already granted to players (bossg's
-- manual Berry/Lemon/Chocolate grant, and any cards already
-- awarded on stage advancement) is untouched - this migration only
-- changes the boss_routes/boss_route_stages/boss_route_stage_grants
-- CONFIGURATION that drives what the route displays and what
-- future stage advancements grant.
--
-- WHY - Cubic
-- Stage 4 (Crimson Nova the Dark Cubic Lord) currently grants only
-- 3 support cards (Cubic Dharma, Cubic Causality, Cubic Mandala)
-- against the spec's own 4th named card, "Crimson Nova Boss EX".
-- CORRECTED 2026-09-02: an earlier draft of this migration
-- substituted "Crimson Nova Trinity the Dark Cubic Lord" for that
-- card without approval - reverted. "Crimson Nova Boss EX" does not
-- exist as an exact row in card_catalog (verified against the local
-- card-valuation snapshot). This migration does NOT add a 4th Stage
-- 4 support card - see the bottom of this file for the explicit
-- flag-not-guess note.
--
-- SAFETY
-- The Stage 1-4 evolution chain fix is one multi-row UPDATE keyed
-- on (route, stage_number) - safe to re-run any number of times,
-- since it always sets the same final values regardless of the
-- table's current contents (see the note directly above that
-- statement for why it must be one statement, not four). The Stage
-- 1 support additions below use the same on-conflict-do-update
-- shape as the original seed migration - also fully idempotent. No
-- table shape changes. No deletes.
-- =========================================================

-- ---- Dark Magician: corrected evolution chain ----
--
-- SAFETY: this is deliberately ONE multi-row UPDATE (not 4 separate
-- single-row UPDATEs). boss_route_stages has a UNIQUE (route_id,
-- evolution_card_catalog_id) constraint, and the corrected Stage 3
-- card ("Dark Magician of Chaos") is the CURRENT Stage 4 card in the
-- old/live seed data. Four separate UPDATE statements, run in
-- stage-number order, would set Stage 3 to "Dark Magician of Chaos"
-- while Stage 4 still held that exact same card - an immediate
-- unique-constraint violation, since this constraint is not
-- deferrable. A single UPDATE...FROM (VALUES...) statement changes
-- every affected row together, so Postgres only evaluates the
-- constraint against the final state of the statement and never
-- sees that transient collision.

with target_values (stage_number, card_name, new_dp_cost) as (
  values
    (1, 'Berry Magician Girl', null::integer),
    (2, 'Dark Magician Girl', 900),
    (3, 'Dark Magician of Chaos', 1400),
    (4, 'The Dark Magicians', 2400)
)
update public.boss_route_stages s
set
  evolution_card_catalog_id = c.id,
  dp_cost_to_reach = tv.new_dp_cost
from target_values tv
join public.boss_routes r on r.code = 'dark_magician'
join public.card_catalog c on c.name = tv.card_name
where s.route_id = r.id
  and s.stage_number = tv.stage_number;

-- ---- Dark Magician: Stage 1 support additions ----

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dark_magician' and s.stage_number = 1 and c.name = 'Lemon Magician Girl'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dark_magician' and s.stage_number = 1 and c.name = 'Chocolate Magician Girl'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

-- ---- Dark Magician: plain "Dark Magician" support placement ----
-- CORRECTION (2026-09-02 review): an earlier draft of this
-- migration re-added plain "Dark Magician" as a Stage 3 support
-- grant on the reasoning that it was "implicitly present" as the
-- old Stage 3 evolution card. That placement was never actually
-- specified anywhere in the authoritative route spec (only the 5
-- named Stage 1 support cards above are specified for this route)
-- and has been reverted - do not invent a support placement for a
-- card the spec doesn't mention. If Dark Magician (plain) is meant
-- to be part of this route at all, that needs an explicit decision
-- and a follow-up migration, not a guess made here.

-- ---- Cubic: Stage 4 support gap - NOT fixed, flagged instead ----
-- CORRECTION (2026-09-02 review): an earlier draft of this
-- migration added "Crimson Nova Trinity the Dark Cubic Lord" as a
-- substitute for the spec's actual 4th Stage 4 support card,
-- "Crimson Nova Boss EX" - that substitution was never approved and
-- has been reverted. "Crimson Nova Boss EX" does not exist as an
-- exact row in card_catalog (verified against the local
-- card-valuation snapshot; confirm against the live database before
-- concluding it's truly absent). Cubic's Stage 4 support stays at
-- its current 3 cards (Cubic Dharma, Cubic Causality, Cubic
-- Mandala) until the real card is identified or added - do not
-- guess a replacement.

commit;
