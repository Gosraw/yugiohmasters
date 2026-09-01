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
-- The plain "Dark Magician" card (previously Stage 3's evolution
-- monster) is no longer an evolution stage in the corrected chain.
-- Rather than silently drop the route's single most iconic card,
-- it is added as a Stage 3 support grant alongside the existing
-- Dark-Magician-specific support (Eternal Soul, Sage's Stone,
-- Diffusion Wave-Motion all reference "a Dark Magician" by name),
-- non-exclusive since Dark Magician is a normal draft/pack-eligible
-- card in its own right, not something this route should lock
-- away. Flagged in the audit report as a judgment call the user
-- should confirm rather than a directly-specified requirement.
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
-- against a spec'd 4. The best-evidence 4th card is Crimson Nova
-- Trinity the Dark Cubic Lord - the direct upgraded/Trinity form of
-- the Stage 4 boss itself (2016-07-21, inside the 2015-2018
-- whitelist window) - confirmed present in card_catalog. No other
-- "Crimson Nova"-named card exists in the catalog. Added as a
-- Stage 4 exclusive grant, consistent with how this route already
-- flags its strongest per-stage pieces (Vijam the Cubic Seed /
-- Unification of the Cubic Lords at Stage 2, Cubic Ascension at
-- Stage 3) as route-exclusive.
--
-- SAFETY
-- Every statement below is the same on-conflict-do-update /
-- on-conflict-do-nothing shape as the original seed migration -
-- fully idempotent, re-runnable, and additive only. No table shape
-- changes. No deletes.
-- =========================================================

-- ---- Dark Magician: corrected evolution chain ----

update public.boss_route_stages s
set
  evolution_card_catalog_id = c.id,
  dp_cost_to_reach = null
from public.boss_routes r, public.card_catalog c
where s.route_id = r.id
  and r.code = 'dark_magician'
  and s.stage_number = 1
  and c.name = 'Berry Magician Girl';

update public.boss_route_stages s
set
  evolution_card_catalog_id = c.id,
  dp_cost_to_reach = 900
from public.boss_routes r, public.card_catalog c
where s.route_id = r.id
  and r.code = 'dark_magician'
  and s.stage_number = 2
  and c.name = 'Dark Magician Girl';

update public.boss_route_stages s
set
  evolution_card_catalog_id = c.id,
  dp_cost_to_reach = 1400
from public.boss_routes r, public.card_catalog c
where s.route_id = r.id
  and r.code = 'dark_magician'
  and s.stage_number = 3
  and c.name = 'Dark Magician of Chaos';

update public.boss_route_stages s
set
  evolution_card_catalog_id = c.id,
  dp_cost_to_reach = 2400
from public.boss_routes r, public.card_catalog c
where s.route_id = r.id
  and r.code = 'dark_magician'
  and s.stage_number = 4
  and c.name = 'The Dark Magicians';

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

-- ---- Dark Magician: restore plain "Dark Magician" as Stage 3 support ----
-- (was implicitly present as the old Stage 3 evolution card; the
-- corrected chain no longer includes it as an evolution monster)

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, false, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'dark_magician' and s.stage_number = 3 and c.name = 'Dark Magician'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

-- ---- Cubic: Stage 4 missing 4th support card ----

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, true, 1
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
cross join public.card_catalog c
where r.code = 'cubic' and s.stage_number = 4 and c.name = 'Crimson Nova Trinity the Dark Cubic Lord'
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

commit;
