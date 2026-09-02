begin;

-- =========================================================
-- FIX-FORWARD: Harpie route stage-identity correction (Season 1
-- audit - RESOLVED this round, previously fully blocked)
--
-- WHY
-- The Harpie route was withheld entirely from 202609020960 because
-- its Stage 4 card, "Harpie's Pet Dragon - Fearsome Fire Blast",
-- did not exist in card_catalog and the "stop the whole route,
-- don't substitute" rule applied to all 4 stages, not just Stage 4.
-- That card now exists (202609021000_import_harpies_pet_dragon_
-- fearsome_fire_blast.sql, which MUST run before this migration).
-- The full, final chain is now applied:
--   Stage 1: Harpie Lady                              (unchanged)
--   Stage 2: Harpie Channeler                         (was: Harpie Lady Sisters)
--   Stage 3: Harpie's Pet Phantasmal Dragon            (was: Harpie Queen)
--   Stage 4: Harpie's Pet Dragon - Fearsome Fire Blast (was: Harpie's Pet Dragon - newly imported)
--
-- SAFETY
-- None of the 3 new names collides with any of this route's other
-- current stage values, so there is no unique-constraint ordering
-- risk here the way there was for several other routes - still
-- written as one multi-row UPDATE...FROM (VALUES...) for consistency
-- with every other stage-identity fix this pass, not because this
-- specific route requires it.
--
-- dp_cost_to_reach is left untouched - the spec does not redefine
-- DP costs for this route, only stage identities.
-- =========================================================

with target_values (stage_number, card_name) as (
  values
    (1, 'Harpie Lady'),
    (2, 'Harpie Channeler'),
    (3, 'Harpie''s Pet Phantasmal Dragon'),
    (4, 'Harpie''s Pet Dragon - Fearsome Fire Blast')
)
update public.boss_route_stages brs
set evolution_card_catalog_id = c.id
from target_values tv
join public.boss_routes r on r.code = 'harpie'
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
        (1, 'Harpie Lady'),
        (2, 'Harpie Channeler'),
        (3, 'Harpie''s Pet Phantasmal Dragon'),
        (4, 'Harpie''s Pet Dragon - Fearsome Fire Blast')
    )
    select 1
    from target_values tv
    join public.boss_routes r on r.code = 'harpie'
    join public.boss_route_stages brs
      on brs.route_id = r.id and brs.stage_number = tv.stage_number
    join public.card_catalog c on c.id = brs.evolution_card_catalog_id
    where c.name = tv.card_name
  ) matched;

  if v_actual <> 4 then
    raise exception
      'HARPIE STAGE IDENTITY FIX ABORTED: % of 4 target stage cells do not match the approved final chain (did 202609021000 run first?).', v_actual;
  end if;

  raise notice 'HARPIE STAGE IDENTITY FIX: all 4 stages now match the approved final chain.';
end $verify$;

commit;
