-- =========================================================
-- 2.0 card pool, part 1: Master Duel gate for UNLIMITED rooms
--
-- WHY
-- The group plays Master Duel in Duel Rooms with the Forbidden/
-- Limited setting on "Unlimited" (docs/V2_PLAN.md, "Card pool &
-- ranking"; docs/cardpool-v2-foundation.md, "Master Duel legacy
-- research"). The Master Duel banlist therefore does not apply.
-- The only Master Duel reason to block a card is that it does not
-- exist in Master Duel at all ('not_available').
--
-- Old rule (202608220020): offerable only for unlimited /
-- semi_limited / limited; forbidden / not_available / unknown
-- blocked.
--
-- New rule:
--   not_available           -> blocked, always (no override,
--                              no Boss-route exemption beats it)
--   forbidden / limited /
--   semi_limited / unlimited -> allowed (our OWN banlist,
--                              duelist_circle_card_limits, decides
--                              deck copies - see 202610121010)
--   unknown                 -> allowed only for cards in our curated
--                              pool (a format_card_overrides
--                              'include' row of the format being
--                              checked). Never-checked cards outside
--                              the curated pool stay blocked by the
--                              format engine.
--
-- CALLERS (all go through is_master_duel_offerable(); none inline
-- the status list - verified by grep over supabase/migrations):
--   create_next_draft_offer, pick_shop_pack_card,
--   refresh_shop_singles_rotation_if_needed,
--   refresh_shop_special_pack_rotation_if_needed (curated special
--   pools), is_duelist_circle_format_eligible.
-- Every one of them ALSO requires card_catalog.format_eligible =
-- true, and format_eligible is written only by the format engine
-- (recompute_format_eligibility / the Season 2 launch script). So
-- letting 'unknown' through is_master_duel_offerable() is safe: the
-- "only inside the curated pool" half of the rule lives in
-- is_duelist_circle_format_eligible() below, which decides
-- format_eligible.
--
-- Signatures are unchanged (create or replace, same arguments and
-- return types), so every caller picks the new body up without
-- being redefined.
-- =========================================================

begin;

create or replace function public.is_master_duel_offerable(
  target_status text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- Unlimited rooms: the Master Duel banlist is ignored, only
  -- "does not exist in Master Duel" blocks. null / unrecognised
  -- values stay blocked (the column is NOT NULL + CHECKed, so this
  -- is belt and braces).
  select coalesce(target_status, '') = any (
    array['unlimited', 'semi_limited', 'limited', 'forbidden', 'unknown']
  );
$$;

comment on function public.is_master_duel_offerable(text) is
  '2.0 (Unlimited rooms): false only for not_available (and null/unrecognised). forbidden/limited/semi_limited/unlimited are allowed - the Master Duel banlist does not apply; our own duelist_circle_card_limits does. unknown passes here because every caller also requires card_catalog.format_eligible, and is_duelist_circle_format_eligible() only lets an unknown card become eligible when it is in the format''s curated pool (include override). See 202610121000_master_duel_unlimited_rooms.sql.';


-- ---------------------------------------------------------
-- Format engine: same body as 202608231500, only the Master Duel
-- gate at the top changes (see header). Redefined again (curated
-- pool + Boss-route exemption) in 202610121020.
-- ---------------------------------------------------------

create or replace function public.is_duelist_circle_format_eligible(
  target_card_catalog_id uuid,
  target_format_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  fmt public.duelist_circle_formats;
  card public.card_catalog;
  override public.format_card_overrides;
  is_synchro boolean;
  is_xyz boolean;
  is_link boolean;
  is_pendulum boolean;
  is_fusion boolean;
  is_illusion boolean;
begin
  select * into card from public.card_catalog where id = target_card_catalog_id;
  if card is null then
    return false;
  end if;

  -- Absolute gate: a card that does not exist in Master Duel can
  -- never be played in an Unlimited room.
  if coalesce(card.master_duel_status, 'unknown') = 'not_available' then
    return false;
  end if;

  if target_format_id is null then
    select * into fmt from public.duelist_circle_formats where is_active = true limit 1;
  else
    select * into fmt from public.duelist_circle_formats where id = target_format_id;
  end if;

  if fmt is null then
    -- No active format: legacy global flag + the (now permissive)
    -- shared Master Duel helper, same fallback as before.
    return coalesce(card.format_eligible, false)
      and public.is_master_duel_offerable(card.master_duel_status);
  end if;

  select * into override
  from public.format_card_overrides
  where format_id = fmt.id and card_catalog_id = target_card_catalog_id;

  if override.id is not null and override.override_type = 'exclude' then
    return false;
  end if;

  -- A curated include is the "our pool" signal: allowed even when
  -- the Master Duel status was never checked (not_available was
  -- already rejected above).
  if override.id is not null and override.override_type = 'include' then
    return true;
  end if;

  -- Outside the curated pool an unchecked card stays blocked.
  if not public.is_master_duel_offerable(card.master_duel_status)
    or coalesce(card.master_duel_status, 'unknown') = 'unknown'
  then
    return false;
  end if;

  is_synchro := coalesce(card.card_type, '') ilike '%synchro%' or coalesce(card.frame_type, '') ilike '%synchro%';
  is_xyz := coalesce(card.card_type, '') ilike '%xyz%' or coalesce(card.frame_type, '') ilike '%xyz%';
  is_link := coalesce(card.card_type, '') ilike '%link%' or coalesce(card.frame_type, '') ilike '%link%';
  is_pendulum := coalesce(card.card_type, '') ilike '%pendulum%' or coalesce(card.frame_type, '') ilike '%pendulum%';
  is_fusion := coalesce(card.card_type, '') ilike '%fusion%' or coalesce(card.frame_type, '') ilike '%fusion%';
  is_illusion := coalesce(card.race, '') = 'Illusion' or coalesce(card.monster_type, '') ilike '%illusion%';

  if is_synchro and not fmt.allow_synchro then return false; end if;
  if is_xyz and not fmt.allow_xyz then return false; end if;
  if is_link and not fmt.allow_link then return false; end if;
  if is_pendulum and not fmt.allow_pendulum then return false; end if;
  if is_fusion and not fmt.allow_fusion then return false; end if;
  if is_illusion and not fmt.allow_illusion then return false; end if;

  if fmt.release_cutoff is not null
    and card.release_date is not null
    and card.release_date > fmt.release_cutoff
  then
    return false;
  end if;

  if fmt.power_ceiling is not null
    and card.power_score is not null
    and card.power_score > fmt.power_ceiling
  then
    return false;
  end if;

  if card.release_stage is null or card.release_stage > fmt.current_release_stage then
    return false;
  end if;

  return true;
end;
$$;

comment on function public.is_duelist_circle_format_eligible(uuid, uuid) is
  'Single source of truth for Duelist Circle format eligibility. 2.0 Master Duel rule (Unlimited rooms): only not_available is an absolute block; the MD banlist is ignored; an unknown (never checked) card is eligible only through a curated include override. See 202610121000_master_duel_unlimited_rooms.sql.';

revoke all on function public.is_duelist_circle_format_eligible(uuid, uuid) from public;
grant execute on function public.is_duelist_circle_format_eligible(uuid, uuid) to authenticated;

commit;
