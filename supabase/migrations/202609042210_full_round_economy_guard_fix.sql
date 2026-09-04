begin;

-- Follow-up hardening for 202609042200_fix_full_round_economy.sql.
-- 1) Rename the PL/pgSQL reward-role variables in the generated
--    function body so they can never collide with the reward_role
--    table column.
-- 2) Restore the original league-admin guard on the public helper
--    that installs end-of-competition reward rules. The rules remain
--    zeroed because the approved economy pays placement per FULL round.


do $patch$
declare
  ddl text;
begin
  select pg_get_functiondef(
    'public.settle_round_rewards_v2(uuid,integer)'::regprocedure
  ) into ddl;

  if ddl is null then
    raise exception 'settle_round_rewards_v2(uuid,integer) not found.';
  end if;

  ddl := replace(ddl, '  reward_role text;', '  v_reward_role text;');
  ddl := replace(ddl, '  reward_reason text;', '  v_reward_reason text;');
  ddl := replace(ddl, '    reward_role := case', '    v_reward_role := case');
  ddl := replace(ddl, '    reward_reason := case', '    v_reward_reason := case');
  ddl := replace(ddl, '    if reward_role is null then', '    if v_reward_role is null then');
  ddl := replace(
    ddl,
    '        and reward_role = reward_role',
    '        and competition_round_reward_grants.reward_role = v_reward_role'
  );
  ddl := replace(ddl, '      and role = reward_role;', '      and role = v_reward_role;');
  ddl := replace(
    ddl,
    E'      placement_row.profile_id,\n      reward_role,\n      rule_row.duel_points,',
    E'      placement_row.profile_id,\n      v_reward_role,\n      rule_row.duel_points,'
  );
  ddl := replace(
    ddl,
    E'        rule_row.duel_points,\n        reward_reason,',
    E'        rule_row.duel_points,\n        v_reward_reason,'
  );

  if ddl like '%reward_role = reward_role%'
     or ddl like '%  reward_role text;%'
     or ddl like '%  reward_reason text;%' then
    raise exception 'Guard patch could not safely rewrite settle_round_rewards_v2.';
  end if;

  execute ddl;
end;
$patch$;


create or replace function public.install_default_competition_rewards_v2(
  target_competition_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  current_user_id uuid;
  competition_row public.competitions%rowtype;
  is_admin boolean;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select *
  into competition_row
  from public.competitions
  where id = target_competition_id;

  if not found then
    raise exception 'Competition not found.';
  end if;

  select (role = 'admin')
  into is_admin
  from public.league_members
  where league_id = competition_row.league_id
    and profile_id = current_user_id;

  if is_admin is not true then
    raise exception 'Only a league admin can install competition reward rules.';
  end if;

  insert into public.competition_reward_rules (
    competition_id,
    placement,
    duel_points,
    voucher_type,
    voucher_quantity
  ) values
    (target_competition_id, 1, 0, null, 0),
    (target_competition_id, 2, 0, null, 0),
    (target_competition_id, 3, 0, null, 0)
  on conflict (competition_id, placement)
  do update set
    duel_points = 0,
    voucher_type = null,
    voucher_quantity = 0;
end;
$function$;

revoke all on function public.install_default_competition_rewards_v2(uuid) from public;
grant execute on function public.install_default_competition_rewards_v2(uuid) to authenticated;


do $verify$
declare
  ddl text;
begin
  select pg_get_functiondef(
    'public.settle_round_rewards_v2(uuid,integer)'::regprocedure
  ) into ddl;

  if ddl not like '%v_reward_role%'
     or ddl like '%reward_role = reward_role%' then
    raise exception 'FULL ROUND GUARD FIX ABORTED: settlement variable hardening failed.';
  end if;
end;
$verify$;

commit;
