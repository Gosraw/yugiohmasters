-- =========================================================
-- /admin edits the REAL config tables (2026-10-12 bug hunt)
--
-- /admin used to edit the old public.settings rows, which nothing
-- reads (e.g. economy.match_win_dp there said 35 while the real
-- value lives in league_economy_defaults). It now shows the real
-- config tables and saves through this one admin-only RPC.
--
-- admin_set_config_value(key, value) only accepts the whitelisted
-- keys below (no dynamic SQL), only for a league admin (same
-- auth.uid() + league_members.role = 'admin' check as the other
-- admin RPCs), and leaves value range checks to each table's own
-- CHECK constraints. Integer settings only; perk.weekly_dp_cap
-- accepts null (= no cap).
--
-- Additive: the live main app never calls it.
-- =========================================================

create or replace function public.admin_set_config_value(
  p_key text,
  p_value integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_parts text[];
begin
  if v_uid is null then
    raise exception 'Not authenticated.';
  end if;

  if not exists (
    select 1
    from public.league_members lm
    where lm.profile_id = v_uid
      and lm.role = 'admin'
  ) then
    raise exception 'Only a league admin can change settings.';
  end if;

  if p_value is null and p_key <> 'perk.weekly_dp_cap' then
    raise exception 'Enter a number.';
  end if;

  case p_key
    when 'economy.match_win_dp' then
      update public.league_economy_defaults set match_win_dp = p_value, updated_at = now()
        where id;
    when 'economy.match_draw_dp' then
      update public.league_economy_defaults set match_draw_dp = p_value, updated_at = now()
        where id;
    when 'economy.match_loss_dp' then
      update public.league_economy_defaults set match_loss_dp = p_value, updated_at = now()
        where id;
    when 'economy.round_participation_dp' then
      update public.league_economy_defaults set round_participation_dp = p_value, updated_at = now()
        where id;
    when 'economy.round_first_dp' then
      update public.league_economy_defaults set round_first_dp = p_value, updated_at = now()
        where id;
    when 'economy.round_second_dp' then
      update public.league_economy_defaults set round_second_dp = p_value, updated_at = now()
        where id;
    when 'economy.round_third_dp' then
      update public.league_economy_defaults set round_third_dp = p_value, updated_at = now()
        where id;
    when 'economy.boss_route_slot_2_unlock_dp' then
      update public.league_economy_defaults set boss_route_slot_2_unlock_dp = p_value, updated_at = now()
        where id;
    when 'economy.boss_route_slot_3_unlock_dp' then
      update public.league_economy_defaults set boss_route_slot_3_unlock_dp = p_value, updated_at = now()
        where id;
    when 'boss.stage_2_dp', 'boss.stage_3_dp', 'boss.stage_4_dp' then
      -- Same price for that stage on every route.
      update public.boss_route_stages
      set dp_cost_to_reach = p_value
      where stage_number = substring(p_key from 'stage_(\d)')::integer;
    when 'weekly_goal.goal_dp' then
      update public.weekly_goal_config set goal_dp = p_value, updated_at = now()
        where id;
    when 'season_bonus.bounty_dp' then
      update public.season_bonus_config set bounty_dp = p_value, updated_at = now()
        where id;
    when 'season_bonus.catch_up_dp' then
      update public.season_bonus_config set catch_up_dp = p_value, updated_at = now()
        where id;
    when 'season_bonus.catch_up_min_win_gap' then
      update public.season_bonus_config set catch_up_min_win_gap = p_value, updated_at = now()
        where id;
    when 'perk.weekly_dp_cap' then
      update public.perk_config set weekly_dp_cap = p_value, updated_at = now()
        where id;
    else
      -- mini_game.<game>.<day|week>.<place>
      v_parts := regexp_match(p_key, '^mini_game\.([a-z_]+)\.(day|week)\.(\d+)$');

      if v_parts is null then
        raise exception 'Unknown setting.';
      end if;

      update public.mini_game_reward_config
      set dp = p_value, updated_at = now()
      where game = v_parts[1]
        and period = v_parts[2]
        and place = v_parts[3]::integer;

      if not found then
        raise exception 'Unknown setting.';
      end if;
  end case;
end;
$$;

revoke all on function public.admin_set_config_value(text, integer) from public, anon;
grant execute on function public.admin_set_config_value(text, integer) to authenticated;
