begin;

-- =========================================================
-- DUELIST CIRCLE - PAY-TO-WIN v1: REAL-LIFE ACHIEVEMENTS (P1C)
--
-- A simple, honor-system real-life achievement/claim board. No
-- photo uploads, no receipts, no proof system - a claim is only
-- ever as good as another player being willing to approve it.
--
-- Rules (from the sprint spec, exactly):
-- - Max 1 SUCCESSFUL (approved) claim per player per achievement
--   per calendar week (ISO week, Monday-Sunday).
-- - A claim always requires approval from ANOTHER, non-self
--   player. Approval (and rejection) are idempotent - calling
--   either twice on an already-decided claim is a safe no-op,
--   never a double payout.
-- - "THE CREATOR" is a 400 DP ONE-TIME achievement, eligible
--   only for the player named BossG.
--
-- Design: one partial unique index does almost all of the actual
-- enforcement work. Every claim row gets a period_key computed
-- at request time from the achievement's cadence - the current
-- ISO week for 'weekly', or the constant 'once' for 'one_time' -
-- and `unique (achievement_id, claimant_id, period_key) where
-- status = 'approved'` means the database itself refuses a
-- second approved claim for the same player+achievement+period,
-- whether that's a second week (new period_key, allowed) or a
-- second attempt at the same week/one-time slot (blocked). No
-- enum extension needed, no card-locking-style resource to
-- release - this is pure claim/approve bookkeeping.
-- =========================================================


-- ---------------------------------------------------------
-- ACHIEVEMENTS (seeded content, not player data)
-- ---------------------------------------------------------

create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),

  key text not null unique,

  title text not null,

  description text not null,

  dp_value integer not null
    check (dp_value > 0),

  cadence text not null
    check (cadence in ('weekly', 'one_time')),

  -- Null for everyone-eligible achievements. Matched against
  -- profiles.duelist_name (case-insensitively) rather than a
  -- baked-in profile id, so this migration never has to guess
  -- BossG's actual row id or the exact stored casing.
  eligible_duelist_name text,

  active boolean not null default true,

  sort_order integer not null default 0,

  created_at timestamptz not null default now()
);

create index if not exists achievements_active_sort_idx
  on public.achievements(active, sort_order);


-- ---------------------------------------------------------
-- CLAIMS
-- ---------------------------------------------------------

create table if not exists public.achievement_claims (
  id uuid primary key default gen_random_uuid(),

  achievement_id uuid not null
    references public.achievements(id)
    on delete restrict,

  claimant_id uuid not null
    references public.profiles(id)
    on delete restrict,

  league_id uuid not null
    references public.leagues(id)
    on delete restrict,

  -- ISO week ('2026-W36') for a 'weekly' achievement, or the
  -- constant 'once' for a 'one_time' achievement. See the header
  -- comment - this is what the unique index below keys off.
  period_key text not null,

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),

  approver_id uuid
    references public.profiles(id)
    on delete set null,

  created_at timestamptz not null default now(),

  decided_at timestamptz,

  constraint achievement_claims_approver_not_self
    check (
      approver_id is null
      or approver_id <> claimant_id
    )
);

create unique index if not exists achievement_claims_one_success_per_period
  on public.achievement_claims(achievement_id, claimant_id, period_key)
  where status = 'approved';

create index if not exists achievement_claims_league_idx
  on public.achievement_claims(league_id, created_at desc);

create index if not exists achievement_claims_pending_idx
  on public.achievement_claims(league_id, status)
  where status = 'pending';

create index if not exists achievement_claims_claimant_idx
  on public.achievement_claims(claimant_id, created_at desc);


-- ---------------------------------------------------------
-- RLS
--
-- achievements: seeded reference content, same shape as
-- boss_monster_options - readable by any authenticated player,
-- never written from the browser.
--
-- achievement_claims: league members can see every claim in
-- their own league (this is a low-stakes 3 player league -
-- visibility of who claimed/approved what is the point).
-- Mutations only ever happen through the RPCs below, exactly
-- like set_card_for_trade / toggle_card_wishlist, so the status
-- machine (pending -> approved/rejected) and the "not yourself"
-- rule can never be bypassed from the browser.
-- ---------------------------------------------------------

alter table public.achievements
  enable row level security;

drop policy if exists achievements_read_active
  on public.achievements;

create policy achievements_read_active
on public.achievements
for select
to authenticated
using (
  active
);

revoke insert, update, delete
on public.achievements
from authenticated;

grant select
on public.achievements
to authenticated;


alter table public.achievement_claims
  enable row level security;

drop policy if exists achievement_claims_read_league
  on public.achievement_claims;

create policy achievement_claims_read_league
on public.achievement_claims
for select
to authenticated
using (
  public.is_league_member(league_id)
);

revoke insert, update, delete
on public.achievement_claims
from authenticated;

grant select
on public.achievement_claims
to authenticated;


-- ---------------------------------------------------------
-- REQUEST_ACHIEVEMENT_CLAIM
-- ---------------------------------------------------------

create or replace function public.request_achievement_claim(
  target_achievement_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  caller_league_id uuid;
  caller_duelist_name text;

  achievement_row public.achievements%rowtype;

  computed_period_key text;
  new_claim_id uuid;
begin

  current_user_id :=
    (select auth.uid());

  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select league_id
  into caller_league_id
  from public.league_members
  where profile_id = current_user_id
  limit 1;

  if caller_league_id is null then
    raise exception 'You are not a member of any league';
  end if;

  select *
  into achievement_row
  from public.achievements
  where key = target_achievement_key
    and active = true;

  if not found then
    raise exception 'Achievement not found';
  end if;

  if achievement_row.eligible_duelist_name is not null then

    select duelist_name
    into caller_duelist_name
    from public.profiles
    where id = current_user_id;

    if caller_duelist_name is null
      or lower(caller_duelist_name) <>
        lower(achievement_row.eligible_duelist_name)
    then
      raise exception
        'This achievement is not available to you.';
    end if;

  end if;

  if achievement_row.cadence = 'weekly' then
    computed_period_key :=
      to_char(date_trunc('week', now()), 'IYYY-"W"IW');
  else
    computed_period_key := 'once';
  end if;

  if exists (
    select 1
    from public.achievement_claims
    where achievement_id = achievement_row.id
      and claimant_id = current_user_id
      and period_key = computed_period_key
      and status = 'pending'
  ) then
    raise exception
      'You already have a pending claim for this achievement.';
  end if;

  if exists (
    select 1
    from public.achievement_claims
    where achievement_id = achievement_row.id
      and claimant_id = current_user_id
      and period_key = computed_period_key
      and status = 'approved'
  ) then
    raise exception
      case
        when achievement_row.cadence = 'weekly'
          then 'You already claimed this achievement this week.'
        else 'This one-time achievement has already been claimed.'
      end;
  end if;

  insert into public.achievement_claims (
    achievement_id,
    claimant_id,
    league_id,
    period_key
  )
  values (
    achievement_row.id,
    current_user_id,
    caller_league_id,
    computed_period_key
  )
  returning id
  into new_claim_id;

  return new_claim_id;
end;
$$;

revoke all
on function public.request_achievement_claim(text)
from public;

grant execute
on function public.request_achievement_claim(text)
to authenticated;


-- ---------------------------------------------------------
-- APPROVE_ACHIEVEMENT_CLAIM
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

  -- Idempotent: a claim already decided (by this approver, by
  -- someone else, or by a duplicate click of the same button)
  -- is a safe no-op rather than an error or a double payout.
  if claim_status <> 'pending' then
    return;
  end if;

  select title, dp_value
  into achievement_title, achievement_dp_value
  from public.achievements
  where id = claim_achievement_id;

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


-- ---------------------------------------------------------
-- REJECT_ACHIEVEMENT_CLAIM
-- ---------------------------------------------------------

create or replace function public.reject_achievement_claim(
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
begin

  current_user_id :=
    (select auth.uid());

  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select
    c.league_id,
    c.claimant_id,
    c.status
  into
    claim_league_id,
    claim_claimant_id,
    claim_status
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
    raise exception 'You cannot reject your own claim.';
  end if;

  -- Idempotent, same reasoning as approve_achievement_claim().
  if claim_status <> 'pending' then
    return;
  end if;

  update public.achievement_claims
  set
    status = 'rejected',
    approver_id = current_user_id,
    decided_at = now()
  where id = target_claim_id;
end;
$$;

revoke all
on function public.reject_achievement_claim(uuid)
from public;

grant execute
on function public.reject_achievement_claim(uuid)
to authenticated;


-- ---------------------------------------------------------
-- SEED: the 7 launch achievements, exact values from spec.
-- ---------------------------------------------------------

insert into public.achievements (
  key,
  title,
  description,
  dp_value,
  cadence,
  eligible_duelist_name,
  sort_order
)
values
  (
    'the_cleaning_phase',
    'THE CLEANING PHASE',
    'Cleaned up before or after the session - end phase, but for the room.',
    150,
    'weekly',
    null,
    10
  ),
  (
    'snack_phase',
    'SNACK PHASE',
    'Brought snacks for the table.',
    150,
    'weekly',
    null,
    20
  ),
  (
    'home_cooked_advantage',
    'HOME-COOKED ADVANTAGE',
    'Made a home-cooked meal for game night.',
    100,
    'weekly',
    null,
    30
  ),
  (
    'fast_food_tech',
    'FAST FOOD TECH',
    'Picked up fast food for the group.',
    200,
    'weekly',
    null,
    40
  ),
  (
    'delivery_from_another_dimension',
    'DELIVERY FROM ANOTHER DIMENSION',
    'Ordered delivery for the table.',
    250,
    'weekly',
    null,
    50
  ),
  (
    'fine_dining_summon',
    'FINE DINING SUMMON',
    'Took the table out for a proper meal.',
    300,
    'weekly',
    null,
    60
  ),
  (
    'the_creator',
    'THE CREATOR',
    'Somebody had to build the arena.',
    400,
    'one_time',
    'BossG',
    70
  )
on conflict (key) do nothing;

commit;
