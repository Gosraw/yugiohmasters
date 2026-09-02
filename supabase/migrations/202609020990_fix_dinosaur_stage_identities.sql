begin;

-- =========================================================
-- FIX-FORWARD: Dinosaur route stage-identity correction (Season 1
-- audit - RESOLVED this round, previously explicitly held back)
--
-- WHY
-- The Dinosaur route was withheld from 202609020960 because the
-- final spec text only said "verify the final approved Stage 4
-- against project history before changing, do NOT guess if source
-- conflicts" - the exact Stage 4 identity was unresolved. This round
-- the full, final chain has been explicitly confirmed and approved:
--   Stage 1: Babycerasaurus              (unchanged)
--   Stage 2: Souleating Oviraptor        (was: Kabazauls)
--   Stage 3: Ultimate Conductor Tyranno  (was: Super Conductor Tyranno -
--                                         this is the route's OLD Stage 4
--                                         card, now confirmed to belong
--                                         at Stage 3 instead)
--   Stage 4: Transcendosaurus Gigantozowler (new - a real Fusion Monster,
--                                         compatible with this format's
--                                         Fusion/Xyz-only Extra Deck rule;
--                                         verified present in card_catalog
--                                         as a real, already-existing row -
--                                         not a new import, unlike Harpie's
--                                         Stage 4 card)
--
-- Both "Souleating Oviraptor" and "Transcendosaurus Gigantozowler"
-- were verified as exact, existing card_catalog rows before writing
-- this migration (unlike Harpie's Stage 4 card, no catalog import is
-- needed here).
--
-- SAFETY - FIX-FORWARD 2026-09-02 (POST-DEPLOY-FAILURE CORRECTION)
-- Stage 3's corrected card ("Ultimate Conductor Tyranno") is the
-- route's CURRENT Stage 4 card. This migration originally performed
-- the reassignment as a single multi-row UPDATE...FROM (VALUES...)
-- statement, on the theory (also used by 202609020910 and originally
-- by 202609020960) that Postgres resolves a same-statement
-- rotation/swap safely regardless of row order. That theory does not
-- hold in general: a live deploy attempt hit exactly this failure
-- mode on a different route (elemental_hero, in 202609020960) with
-- "ERROR 23505: duplicate key value violates unique constraint
-- boss_route_stages_route_id_evolution_card_catalog_id_key". Since
-- this migration has the identical collision shape (Stage 3's target
-- is Stage 4's current value), it carried the same latent risk and
-- is corrected here the same way: 4 separate, single-row UPDATE
-- statements, issued in dependency order (Stage 4 first, to vacate
-- "Ultimate Conductor Tyranno" onto "Transcendosaurus
-- Gigantozowler"; then Stage 3, to take "Ultimate Conductor Tyranno";
-- Stages 1 and 2 have no such dependency and can run in either
-- order). Each statement's effect is fully committed before the next
-- one runs, so there is no intra-statement row-processing order left
-- to depend on.
--
-- dp_cost_to_reach is left untouched - the spec does not redefine
-- DP costs for this route, only stage identities.
-- =========================================================

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'dinosaur'
  and brs.stage_number = 4
  and c.name = 'Transcendosaurus Gigantozowler';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'dinosaur'
  and brs.stage_number = 3
  and c.name = 'Ultimate Conductor Tyranno';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'dinosaur'
  and brs.stage_number = 1
  and c.name = 'Babycerasaurus';

update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from public.boss_routes r, public.card_catalog c
where brs.route_id = r.id
  and r.code = 'dinosaur'
  and brs.stage_number = 2
  and c.name = 'Souleating Oviraptor';

do $verify$
declare
  v_actual int;
begin
  select count(*) into v_actual
  from (
    with target_values (stage_number, card_name) as (
      values
        (1, 'Babycerasaurus'),
        (2, 'Souleating Oviraptor'),
        (3, 'Ultimate Conductor Tyranno'),
        (4, 'Transcendosaurus Gigantozowler')
    )
    select 1
    from target_values tv
    join public.boss_routes r on r.code = 'dinosaur'
    join public.boss_route_stages brs
      on brs.route_id = r.id and brs.stage_number = tv.stage_number
    join public.card_catalog c on c.id = brs.evolution_card_catalog_id
    where c.name = tv.card_name
  ) matched;

  if v_actual <> 4 then
    raise exception
      'DINOSAUR STAGE IDENTITY FIX ABORTED: % of 4 target stage cells do not match the approved final chain.', v_actual;
  end if;

  raise notice 'DINOSAUR STAGE IDENTITY FIX: all 4 stages now match the approved final chain.';
end $verify$;

commit;
