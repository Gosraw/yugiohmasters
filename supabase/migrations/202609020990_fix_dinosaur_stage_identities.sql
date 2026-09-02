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
-- SAFETY - WHY ONE STATEMENT
-- Stage 3's corrected card ("Ultimate Conductor Tyranno") is the
-- route's CURRENT Stage 4 card. Running these as separate per-stage
-- UPDATEs in Stage 1->4 order would hit boss_route_stages' UNIQUE
-- (route_id, evolution_card_catalog_id) constraint the moment Stage
-- 3 is set, since Stage 4 would not yet have moved off that value -
-- the same issue already identified and fixed for Dark Magician
-- (202609020910) and the other 16 routes (202609020960). This
-- migration uses the identical single multi-row UPDATE...FROM
-- (VALUES...) technique so Postgres only evaluates the constraint
-- against this statement's final state.
--
-- dp_cost_to_reach is left untouched - the spec does not redefine
-- DP costs for this route, only stage identities.
-- =========================================================

with target_values (stage_number, card_name) as (
  values
    (1, 'Babycerasaurus'),
    (2, 'Souleating Oviraptor'),
    (3, 'Ultimate Conductor Tyranno'),
    (4, 'Transcendosaurus Gigantozowler')
)
update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from target_values tv
join public.boss_routes r on r.code = 'dinosaur'
join public.card_catalog c on c.name = tv.card_name
where brs.route_id = r.id
  and brs.stage_number = tv.stage_number;

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
