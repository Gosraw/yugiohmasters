begin;

-- =========================================================
-- FIX-FORWARD: remove chaos_bls's duplicate D.D. Warrior Lady
-- Stage 1 support grant (Season 1 audit, approved correction)
--
-- WHY
-- 202609020960_fix_16_boss_route_stage_identities.sql makes D.D.
-- Warrior Lady the chaos_bls Stage 2 EVOLUTION card. The already-
-- deployed seed (202609011900_seed_boss_routes.sql) also grants
-- D.D. Warrior Lady as a chaos_bls Stage 1 SUPPORT card (quantity
-- 1, is_route_exclusive = false). _boss_route_grant_stage() (see
-- 202609012000_boss_route_rpcs.sql) grants the Stage N evolution
-- card and every Stage N support grant as independent, unconditional
-- card_instances inserts with no de-duplication between the two -
-- so without this fix, a player advancing chaos_bls from Stage 1 to
-- Stage 2 would receive 2 separate copies of D.D. Warrior Lady (1
-- from the Stage 1 support grant, 1 from the Stage 2 evolution
-- grant), purely as a side effect of the stage-identity correction.
--
-- This migration removes only that one now-redundant Stage 1
-- support grant row. It does not touch any other chaos_bls support
-- card, does not touch any other route, and does not touch any
-- already-existing player's card_instances (a player who already
-- has D.D. Warrior Lady from a past Stage 1 grant keeps that card -
-- this only prevents a NEW double-grant going forward).
--
-- SAFETY
-- Single, narrowly-scoped DELETE keyed on the exact (route, stage,
-- card) triple. Fully idempotent - deleting an already-deleted row
-- is a no-op. Deploy this migration strictly after 202609020960 (so
-- the Stage 2 evolution reassignment is already in place) though the
-- DELETE itself does not actually depend on it having run.
-- =========================================================

delete from public.boss_route_stage_grants g
using public.boss_route_stages s, public.boss_routes r, public.card_catalog c
where g.stage_id = s.id
  and s.route_id = r.id
  and r.code = 'chaos_bls'
  and s.stage_number = 1
  and g.card_catalog_id = c.id
  and c.name = 'D.D. Warrior Lady';

do $verify$
declare
  v_remaining int;
begin
  select count(*)
  into v_remaining
  from public.boss_route_stage_grants g
  join public.boss_route_stages s on s.id = g.stage_id
  join public.boss_routes r on r.id = s.route_id
  join public.card_catalog c on c.id = g.card_catalog_id
  where r.code = 'chaos_bls'
    and s.stage_number = 1
    and c.name = 'D.D. Warrior Lady';

  if v_remaining <> 0 then
    raise exception
      'CHAOS_BLS DEDUP FIX ABORTED: D.D. Warrior Lady is still granted as chaos_bls Stage 1 support (% row(s)).', v_remaining;
  end if;

  raise notice 'CHAOS_BLS DEDUP FIX: D.D. Warrior Lady Stage 1 support grant removed - now granted exactly once, as the Stage 2 evolution card.';
end $verify$;

commit;
