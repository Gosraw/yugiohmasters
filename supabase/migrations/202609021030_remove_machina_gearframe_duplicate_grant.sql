begin;

-- =========================================================
-- FIX-FORWARD: remove machina's duplicate Machina Gearframe
-- Stage 4 support grant (Season 1 audit, approved correction)
--
-- WHY
-- 202609020960_fix_16_boss_route_stage_identities.sql makes Machina
-- Gearframe the machina Stage 1 EVOLUTION card. The already-deployed
-- seed (202609011900_seed_boss_routes.sql) also grants Machina
-- Gearframe as a machina Stage 4 SUPPORT card (quantity 1,
-- is_route_exclusive = true). _boss_route_grant_stage() (see
-- 202609012000_boss_route_rpcs.sql) grants the Stage N evolution
-- card and every Stage N support grant as independent, unconditional
-- card_instances inserts with no de-duplication between the two -
-- so without this fix, a player who has already received Machina
-- Gearframe at Stage 1 (as the evolution card) would receive a
-- SECOND, fully independent copy on reaching Stage 4, purely as a
-- side effect of the stage-identity correction. This is the exact
-- same bug class as chaos_bls / D.D. Warrior Lady, fixed by
-- 202609020980, just discovered one route later by the same
-- systematic cross-check.
--
-- This migration removes only that one now-redundant Stage 4
-- support grant row. It does not touch any other machina support
-- card, does not touch any other route, and does not touch any
-- already-existing player's card_instances (a player who already
-- has a duplicate Machina Gearframe from a past Stage 4 grant keeps
-- both copies - this only prevents a NEW double-grant going
-- forward). Per instruction, machina support is not otherwise
-- redesigned: Machina Fortress, Machina Citadel, and any other
-- Stage 4 support grants for this route are untouched.
--
-- SAFETY
-- Single, narrowly-scoped DELETE keyed on the exact (route, stage,
-- card) triple. Fully idempotent - deleting an already-deleted row
-- is a no-op. Deploy this migration strictly after 202609020960 (so
-- the Stage 1 evolution reassignment is already in place) though the
-- DELETE itself does not actually depend on it having run.
-- =========================================================

delete from public.boss_route_stage_grants g
using public.boss_route_stages s, public.boss_routes r, public.card_catalog c
where g.stage_id = s.id
  and s.route_id = r.id
  and r.code = 'machina'
  and s.stage_number = 4
  and g.card_catalog_id = c.id
  and c.name = 'Machina Gearframe';

do $verify_machina$
declare
  v_remaining int;
begin
  select count(*)
  into v_remaining
  from public.boss_route_stage_grants g
  join public.boss_route_stages s on s.id = g.stage_id
  join public.boss_routes r on r.id = s.route_id
  join public.card_catalog c on c.id = g.card_catalog_id
  where r.code = 'machina'
    and s.stage_number = 4
    and c.name = 'Machina Gearframe';

  if v_remaining <> 0 then
    raise exception
      'MACHINA DEDUP FIX ABORTED: Machina Gearframe is still granted as machina Stage 4 support (% row(s)).', v_remaining;
  end if;

  raise notice 'MACHINA DEDUP FIX: Machina Gearframe Stage 4 support grant removed - now granted exactly once, as the Stage 1 evolution card.';
end $verify_machina$;

-- =========================================================
-- GLOBAL AUDIT: zero unintended evolution-card / support-grant
-- overlaps across ALL 20 routes (not just chaos_bls / machina).
--
-- For every route, for every stage's evolution_card_catalog_id,
-- check whether that same card_catalog_id also appears anywhere in
-- boss_route_stage_grants for the SAME route (any stage). This is
-- the general form of the bug fixed above and by 202609020980 - run
-- here, after both fixes, as a hard deploy-time gate so this bug
-- class cannot silently reappear (e.g. from a future stage-identity
-- edit that reintroduces an overlap without anyone re-running this
-- specific check by hand).
--
-- Expected result after the D.D. Warrior Lady + Machina Gearframe
-- fixes: ZERO rows. If this ever finds a row, that is a live
-- double-grant bug and must be triaged the same way as the two
-- above (do not blanket-delete without confirming which side -
-- evolution assignment or support grant - is the mistake).
-- =========================================================

do $verify_global_overlap$
declare
  v_overlap_count int;
  v_row record;
begin
  select count(*) into v_overlap_count
  from public.boss_route_stages brs
  join public.boss_routes r on r.id = brs.route_id
  join public.boss_route_stage_grants g on g.card_catalog_id = brs.evolution_card_catalog_id
  join public.boss_route_stages gs on gs.id = g.stage_id and gs.route_id = brs.route_id;

  if v_overlap_count <> 0 then
    for v_row in
      select
        r.code as route_code,
        brs.stage_number as evolution_stage,
        c.name as card_name,
        gs.stage_number as grant_stage,
        g.is_route_exclusive,
        g.quantity
      from public.boss_route_stages brs
      join public.boss_routes r on r.id = brs.route_id
      join public.card_catalog c on c.id = brs.evolution_card_catalog_id
      join public.boss_route_stage_grants g on g.card_catalog_id = brs.evolution_card_catalog_id
      join public.boss_route_stages gs on gs.id = g.stage_id and gs.route_id = brs.route_id
      order by r.code, brs.stage_number
    loop
      raise warning 'REMAINING OVERLAP: route=% card="%" is Stage % evolution AND a Stage % support grant (is_route_exclusive=%, qty=%)',
        v_row.route_code, v_row.card_name, v_row.evolution_stage, v_row.grant_stage, v_row.is_route_exclusive, v_row.quantity;
    end loop;

    raise exception
      'GLOBAL OVERLAP AUDIT FAILED: % evolution-card/support-grant overlap(s) remain across the 20 routes. See WARNING lines above for detail.', v_overlap_count;
  end if;

  raise notice 'GLOBAL OVERLAP AUDIT: zero evolution-card/support-grant overlaps across all 20 Boss Routes.';
end $verify_global_overlap$;

commit;
