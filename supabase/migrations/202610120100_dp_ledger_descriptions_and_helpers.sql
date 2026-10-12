-- =========================================================
-- 2.0 rewards, part 1: DP ledger descriptions + the two DP helpers
--
-- 1. duel_point_transactions.description (English, human-readable)
--    so the wallet / reward pop-up can always say WHY a balance
--    changed ("Round 2 complete - 1st place"). A BEFORE INSERT
--    trigger fills it for any writer that does not pass one, and
--    every existing row is backfilled, so the column is NOT NULL.
-- 2. _credit_duel_points gets an optional description and now
--    returns the ledger row id (callers that link a grant row to its
--    transaction no longer have to write the ledger themselves).
-- 3. New _debit_duel_points: the single place that takes DP away
--    for reward reversals / Boss purchases, with an optional
--    "partial" mode that never drives a balance below zero and
--    records what could not be recovered.
-- 4. profiles.duel_points is the canonical balance (every RPC reads
--    and writes it). public.wallets is Phase-1 scaffolding that
--    nothing reads; a trigger now mirrors the balance into it so the
--    two can never disagree.
--
-- Backwards compatible with the live main app: no RPC that the app
-- calls changes its signature, and the new column is filled by a
-- trigger.
-- =========================================================

-- ---------------------------------------------------------
-- 1. description column + generator + trigger
-- ---------------------------------------------------------

alter table public.duel_point_transactions
  add column if not exists description text;

comment on column public.duel_point_transactions.description is
  'Human-readable English reason for this balance change, shown in the wallet. Filled automatically by duel_point_transactions_fill_description when the writer does not pass one.';

create or replace function public._ordinal_label(target_number integer)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when target_number is null then '?'
    when target_number % 100 between 11 and 13 then target_number::text || 'th'
    when target_number % 10 = 1 then target_number::text || 'st'
    when target_number % 10 = 2 then target_number::text || 'nd'
    when target_number % 10 = 3 then target_number::text || 'rd'
    else target_number::text || 'th'
  end;
$$;

create or replace function public._round_reward_role_label(target_role text)
returns text
language sql
immutable
set search_path = public
as $$
  select case target_role
    when 'participation' then 'participation reward'
    when 'round_winner' then '1st place'
    when 'round_runner_up' then '2nd place'
    when 'round_third' then '3rd place'
    else coalesce(replace(target_role, '_', ' '), 'reward')
  end;
$$;

-- Fallback text for rows written without an explicit description.
-- Writers that know more (opponent name, card name) pass their own.
create or replace function public._describe_duel_point_transaction(
  target_reason text,
  target_amount integer,
  target_metadata jsonb,
  target_note text
)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    case
      when target_reason = 'match_reward' then
        case target_metadata ->> 'result'
          when 'win' then 'Competition duel won'
          when 'loss' then 'Competition duel played (loss)'
          when 'draw' then 'Competition duel drawn'
          else 'Duel reward'
        end
      when target_reason like 'match_reward_correction%' then
        'Duel result corrected by an admin'
      when target_reason in (
        'round_participation',
        'round_winner_bonus',
        'round_runner_up_bonus',
        'round_third_bonus'
      ) then
        'Round '
        || coalesce(target_metadata ->> 'logical_round_number', target_metadata ->> 'round_number', '?')
        || ' complete — '
        || case target_reason
          when 'round_participation' then 'participation reward'
          when 'round_winner_bonus' then '1st place'
          when 'round_runner_up_bonus' then '2nd place'
          else '3rd place'
        end
      when target_reason = 'round_reward_reversal' then
        'Round '
        || coalesce(target_metadata ->> 'logical_round_number', '?')
        || ' corrected — '
        || public._round_reward_role_label(target_metadata ->> 'reward_role')
        || ' reward taken back'
      when target_reason = 'competition_reward' then
        'Competition finished — '
        || public._ordinal_label(nullif(target_metadata ->> 'placement', '')::integer)
        || ' place'
      when target_reason = 'competition_reward_reversal' then
        'Competition result corrected — '
        || public._ordinal_label(nullif(target_metadata ->> 'previous_placement', '')::integer)
        || ' place reward taken back'
      when target_reason = 'boss_route_stage_evolve' then
        'Boss evolved to stage ' || coalesce(target_metadata ->> 'stage_number', '?')
      when target_reason = 'boss_route_unlock_slot' then
        'Unlocked Boss Route slot ' || coalesce(target_metadata ->> 'route_slot', '?')
      when target_reason = 'practice_wager_stake' then 'Practice duel wager stake'
      when target_reason = 'practice_wager_win' then 'Practice duel wager won'
      when target_reason = 'practice_wager_refund' then 'Practice duel wager refunded'
      when target_reason = 'trade' then
        case
          when target_amount < 0 then 'Duel Points sent in a trade'
          else 'Duel Points received in a trade'
        end
      when target_reason = 'achievement' then
        'Perk reward' || coalesce(': ' || nullif(trim(target_note), ''), '')
      when target_reason = 'shop_purchase' then 'Shop purchase'
      else null
    end,
    nullif(trim(target_note), ''),
    initcap(replace(target_reason, '_', ' '))
  );
$$;

create or replace function public._fill_duel_point_transaction_description()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.description is null or length(trim(new.description)) = 0 then
    new.description := public._describe_duel_point_transaction(
      new.reason,
      new.amount,
      new.metadata,
      new.note
    );
  end if;

  return new;
end;
$$;

drop trigger if exists duel_point_transactions_fill_description
  on public.duel_point_transactions;

create trigger duel_point_transactions_fill_description
before insert on public.duel_point_transactions
for each row
execute function public._fill_duel_point_transaction_description();

update public.duel_point_transactions
set description = public._describe_duel_point_transaction(reason, amount, metadata, note)
where description is null
   or length(trim(description)) = 0;

alter table public.duel_point_transactions
  alter column description set not null;

-- ---------------------------------------------------------
-- 2. _credit_duel_points: + description, returns the ledger row id.
--    Signature change => drop + create (a second overload would make
--    every existing 3-6 argument call ambiguous).
-- ---------------------------------------------------------

drop function if exists public._credit_duel_points(uuid, integer, text, uuid, text, jsonb);

create function public._credit_duel_points(
  target_profile_id uuid,
  target_amount integer,
  target_reason text,
  target_match_id uuid default null,
  target_note text default null,
  target_metadata jsonb default '{}'::jsonb,
  target_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
  new_tx_id uuid;
begin
  if target_amount is null or target_amount <= 0 then
    raise exception 'Credit amount must be positive.';
  end if;

  update public.profiles
  set
    duel_points = duel_points + target_amount,
    updated_at = now()
  where id = target_profile_id
  returning duel_points
  into new_balance;

  if new_balance is null then
    raise exception 'Profile not found.';
  end if;

  insert into public.duel_point_transactions (
    profile_id,
    match_id,
    amount,
    balance_after,
    reason,
    note,
    metadata,
    description
  )
  values (
    target_profile_id,
    target_match_id,
    target_amount,
    new_balance,
    target_reason,
    target_note,
    coalesce(target_metadata, '{}'::jsonb),
    nullif(trim(target_description), '')
  )
  returning id
  into new_tx_id;

  return new_tx_id;
end;
$$;

comment on function public._credit_duel_points(uuid, integer, text, uuid, text, jsonb, text) is
  'The ONLY way DP is granted. Internal: callable from other SECURITY DEFINER functions only.';

-- ---------------------------------------------------------
-- 3. _debit_duel_points
--    allow_partial = false: all-or-nothing, raises "Not enough Duel
--      Points." (purchases).
--    allow_partial = true: takes at most the current balance (reward
--      reversals) - a balance can never go negative. The shortfall
--      is returned as `unrecovered` and stored in the row metadata.
--    A debit of 0 writes no ledger row (transaction_id is null).
-- ---------------------------------------------------------

create or replace function public._debit_duel_points(
  target_profile_id uuid,
  target_amount integer,
  target_reason text,
  target_match_id uuid default null,
  target_note text default null,
  target_metadata jsonb default '{}'::jsonb,
  target_description text default null,
  target_allow_partial boolean default false,
  out debited integer,
  out unrecovered integer,
  out transaction_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance integer;
  new_balance integer;
begin
  if target_amount is null or target_amount <= 0 then
    raise exception 'Debit amount must be positive.';
  end if;

  select duel_points
  into current_balance
  from public.profiles
  where id = target_profile_id
  for update;

  if not found then
    raise exception 'Profile not found.';
  end if;

  if target_allow_partial then
    debited := least(current_balance, target_amount);
  elsif current_balance < target_amount then
    raise exception 'Not enough Duel Points.';
  else
    debited := target_amount;
  end if;

  unrecovered := target_amount - debited;
  transaction_id := null;

  if debited = 0 then
    return;
  end if;

  update public.profiles
  set
    duel_points = duel_points - debited,
    updated_at = now()
  where id = target_profile_id
  returning duel_points
  into new_balance;

  insert into public.duel_point_transactions (
    profile_id,
    match_id,
    amount,
    balance_after,
    reason,
    note,
    metadata,
    description
  )
  values (
    target_profile_id,
    target_match_id,
    -debited,
    new_balance,
    target_reason,
    target_note,
    coalesce(target_metadata, '{}'::jsonb)
      || case
        when unrecovered > 0 then jsonb_build_object(
          'requested_amount', target_amount,
          'unrecovered', unrecovered
        )
        else '{}'::jsonb
      end,
    nullif(trim(target_description), '')
  )
  returning id
  into transaction_id;
end;
$$;

comment on function public._debit_duel_points(uuid, integer, text, uuid, text, jsonb, text, boolean) is
  'Takes DP away and writes the ledger row. Internal: callable from other SECURITY DEFINER functions only.';

-- ---------------------------------------------------------
-- 4. wallets mirror profiles.duel_points
-- ---------------------------------------------------------

create or replace function public._sync_wallet_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wallets (profile_id, duel_points, updated_at)
  values (new.id, new.duel_points, now())
  on conflict (profile_id)
  do update set
    duel_points = excluded.duel_points,
    updated_at = now();

  return null;
end;
$$;

drop trigger if exists profiles_sync_wallet_balance on public.profiles;

create trigger profiles_sync_wallet_balance
after update of duel_points on public.profiles
for each row
when (new.duel_points is distinct from old.duel_points)
execute function public._sync_wallet_balance();

insert into public.wallets (profile_id, duel_points, updated_at)
select p.id, p.duel_points, now()
from public.profiles p
on conflict (profile_id)
do update set
  duel_points = excluded.duel_points,
  updated_at = now()
where public.wallets.duel_points is distinct from excluded.duel_points;

comment on table public.wallets is
  'Read-only mirror of profiles.duel_points (the canonical DP balance), kept in sync by the profiles_sync_wallet_balance trigger. Never write DP here.';

-- ---------------------------------------------------------
-- Privileges: helpers are internal. Supabase default privileges
-- grant EXECUTE to anon/authenticated on every new function, so
-- revoke explicitly.
-- ---------------------------------------------------------

revoke all on function public._credit_duel_points(uuid, integer, text, uuid, text, jsonb, text)
  from public, anon, authenticated;
revoke all on function public._debit_duel_points(uuid, integer, text, uuid, text, jsonb, text, boolean)
  from public, anon, authenticated;
revoke all on function public._sync_wallet_balance() from public, anon, authenticated;
revoke all on function public._fill_duel_point_transaction_description() from public, anon, authenticated;
revoke all on function public._describe_duel_point_transaction(text, integer, jsonb, text)
  from public, anon, authenticated;
