-- =========================================================
-- 2.0: weekly cap on P2W perk DP (real-life achievements)
--
-- WHY
-- Proposal: a player can earn at most 600 DP per week from approved
-- perk claims (public.achievements / achievement_claims, see
-- 202609012400_p2w_achievements.sql). The amount is a config value
-- (perk_config.weekly_dp_cap, default 600) - change it there, never
-- in code. null = no cap.
--
-- RULE
-- "This week" = the ISO week (Monday 00:00 - Sunday 24:00) in
-- Europe/Amsterdam, measured on the APPROVAL time (decided_at), so
-- the cap counts the DP that actually got paid out this week. Every
-- approved claim counts, weekly and one-time achievements alike.
-- approve_achievement_claim() refuses an approval that would take
-- the claimant over the cap; the claim stays pending (it can be
-- approved next week, or rejected).
--
-- Additive + same signature: new config table, a new read helper,
-- approve_achievement_claim redefined with create or replace (body
-- identical to 202609012400 apart from the cap check and the
-- per-claimant lock that keeps two parallel approvals from both
-- slipping under the cap).
-- =========================================================

begin;

create table if not exists public.perk_config (
  id boolean primary key default true check (id),
  weekly_dp_cap integer default 600
    check (weekly_dp_cap is null or weekly_dp_cap >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.perk_config is
  'P2W perk economy. weekly_dp_cap = max DP a player can receive from approved perk claims per ISO week (Europe/Amsterdam); null = no cap. PROPOSAL: 600. Change here, never in code.';

insert into public.perk_config (id)
values (true)
on conflict (id) do nothing;

alter table public.perk_config enable row level security;

drop policy if exists perk_config_read on public.perk_config;
create policy perk_config_read on public.perk_config
  for select to authenticated using (true);

revoke insert, update, delete on public.perk_config from anon, authenticated;
grant select on public.perk_config to authenticated;


-- ---------------------------------------------------------
-- DP from approved perk claims in the Amsterdam ISO week that
-- contains target_at.
-- ---------------------------------------------------------

create or replace function public.perk_dp_this_week(
  target_profile_id uuid,
  target_at timestamptz default now()
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(a.dp_value), 0)::integer
  from public.achievement_claims c
  join public.achievements a on a.id = c.achievement_id
  where c.claimant_id = target_profile_id
    and c.status = 'approved'
    and c.decided_at >= public._amsterdam_day_start(public._amsterdam_week_start(target_at))
    and c.decided_at < public._amsterdam_day_start(public._amsterdam_week_start(target_at) + 7);
$$;

comment on function public.perk_dp_this_week(uuid, timestamptz) is
  'Sum of achievements.dp_value over approved claims of this player decided in the Europe/Amsterdam ISO week containing target_at. Used by the weekly perk cap (202610121100).';

revoke all on function public.perk_dp_this_week(uuid, timestamptz) from public;
grant execute on function public.perk_dp_this_week(uuid, timestamptz) to authenticated;


-- ---------------------------------------------------------
-- APPROVE_ACHIEVEMENT_CLAIM (+ weekly cap)
-- ---------------------------------------------------------

create or replace function public.approve_achievement_claim(
  target_claim_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;

  claim_league_id uuid;
  claim_claimant_id uuid;
  claim_status text;
  claim_achievement_id uuid;

  achievement_title text;
  achievement_dp_value integer;

  weekly_cap integer;
  earned_this_week integer;
begin

  current_user_id :=
    (select auth.uid());

  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select
    c.league_id,
    c.claimant_id,
    c.status,
    c.achievement_id
  into
    claim_league_id,
    claim_claimant_id,
    claim_status,
    claim_achievement_id
  from public.achievement_claims c
  where c.id = target_claim_id
  for update;

  if not found then
    raise exception 'Claim not found';
  end if;

  if not public.is_league_member(claim_league_id) then
    raise exception 'You are not a member of this league';
  end if;

  if current_user_id = claim_claimant_id then
    raise exception 'You cannot approve your own claim.';
  end if;

  -- Idempotent: a claim already decided is a safe no-op.
  if claim_status <> 'pending' then
    return;
  end if;

  select title, dp_value
  into achievement_title, achievement_dp_value
  from public.achievements
  where id = claim_achievement_id;

  select weekly_dp_cap
  into weekly_cap
  from public.perk_config
  where id = true;

  if weekly_cap is not null then
    -- Serialise approvals for the same claimant (two different
    -- claims approved at the same moment by two players) so both
    -- can't pass the check below against the same old total.
    perform 1
    from public.profiles p
    where p.id = claim_claimant_id
    for update;

    earned_this_week :=
      public.perk_dp_this_week(claim_claimant_id);

    if earned_this_week + achievement_dp_value > weekly_cap then
      raise exception
        'Weekly perk cap reached: % / % DP this week. This claim (% DP) can be approved next week.',
        earned_this_week, weekly_cap, achievement_dp_value;
    end if;
  end if;

  update public.achievement_claims
  set
    status = 'approved',
    approver_id = current_user_id,
    decided_at = now()
  where id = target_claim_id;

  perform public._credit_duel_points(
    claim_claimant_id,
    achievement_dp_value,
    'achievement',
    null,
    achievement_title,
    '{}'::jsonb
  );
end;
$$;

revoke all
on function public.approve_achievement_claim(uuid)
from public;

grant execute
on function public.approve_achievement_claim(uuid)
to authenticated;

commit;
