-- =========================================================
-- profiles.custom_title is no longer client-writable (2026-10-12)
--
-- Before: authenticated had a column UPDATE grant on custom_title,
-- so any player could give themselves any title straight through
-- the API, skipping the "is this title unlocked?" check in the
-- equipAchievementTitle server action.
--
-- After: the column grant is revoked; the server action checks the
-- unlock and then sets the title through set_profile_custom_title(),
-- which only the service role may call (same pattern as
-- submit_game_run, 202610121210).
--
-- NOT backwards compatible with the live main app's title equip
-- button (it updates the column directly). Apply on 2.0 launch night
-- together with the rest of the 2026-10-12 migrations, like the
-- runbook says.
-- =========================================================

revoke update (custom_title) on public.profiles from authenticated, anon;

create or replace function public.set_profile_custom_title(
  p_profile_id uuid,
  p_title text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_title is not null and (length(btrim(p_title)) = 0 or length(p_title) > 80) then
    raise exception 'Invalid title.';
  end if;

  update public.profiles
  set
    custom_title = p_title,
    updated_at = now()
  where id = p_profile_id;

  if not found then
    raise exception 'Profile not found.';
  end if;
end;
$$;

revoke all on function public.set_profile_custom_title(uuid, text) from public, anon, authenticated;
grant execute on function public.set_profile_custom_title(uuid, text) to service_role;
