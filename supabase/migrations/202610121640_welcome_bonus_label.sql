-- =========================================================
-- Welcome bonus label is season-agnostic (2026-10-12 bug hunt)
--
-- New players in Season 2+ got vouchers labelled "Season 1 welcome
-- bonus". Same function as before (202609020920), only the note text
-- changes; source_type stays 'season1_welcome_bonus' (an internal
-- code other queries may filter on). Existing unredeemed vouchers
-- are relabelled too. Backwards compatible with the live main app.
-- =========================================================

create or replace function public.claim_welcome_packs()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid;
  claim_inserted boolean;
begin
  current_user_id := (select auth.uid());

  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.league_members
    where profile_id = current_user_id
  ) then
    raise exception 'You are not a league member yet.';
  end if;

  insert into public.season1_welcome_bonus_claims (profile_id)
  values (current_user_id)
  on conflict (profile_id) do nothing;

  claim_inserted := found;

  if not claim_inserted then
    -- Already claimed previously - total no-op, safe to call
    -- repeatedly (e.g. on every proxy.ts request).
    return false;
  end if;

  insert into public.reward_vouchers (
    profile_id,
    voucher_type,
    quantity,
    source_type,
    note
  )
  values
    (current_user_id, 'normal_pack', 1, 'season1_welcome_bonus', 'Welcome bonus'),
    (current_user_id, 'premium_pack', 1, 'season1_welcome_bonus', 'Welcome bonus'),
    (current_user_id, 'deluxe_pack', 1, 'season1_welcome_bonus', 'Welcome bonus');

  return true;
end;
$function$;


update public.reward_vouchers
set note = 'Welcome bonus'
where note = 'Season 1 welcome bonus';
