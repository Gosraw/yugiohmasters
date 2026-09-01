-- =========================================================
-- FIX: practice challenge configuration was calling a direct
-- UPDATE on public.matches from the authenticated client, but
-- 202608190010_matches.sql's own RLS section revokes insert/
-- update/delete on public.matches from authenticated ("Alle
-- mutations via RPC.") and never re-grants it or adds a
-- compensating RLS UPDATE policy.
--
-- Effect before this fix: EVERY BO3/practice challenge (Free,
-- DP-stake, and Card-stake alike) failed at creation time with a
-- Postgres permission-denied error the moment
-- createMatchChallenge() tried to set match_type='practice' plus
-- the wager fields via `supabase.from("matches").update(...)`
-- (src/app/actions/matches.ts, the block right after
-- create_match_challenge() returns a new match id). League
-- (non-practice) matches were unaffected because they never take
-- this code path.
--
-- Fix: add configure_practice_challenge(), a security definer RPC
-- following the exact same pattern as every other match-mutation
-- RPC in this file's family (create_match_challenge,
-- accept_match_challenge, decline_match_challenge,
-- cancel_match_challenge, fund_match_dp_wager,
-- add_match_wager_card) - validates ownership/state itself
-- (never trusts the client) and performs the UPDATE from inside
-- a security definer function, which is exactly what the
-- existing revoke was designed to require. Table grants are
-- intentionally left untouched.
-- =========================================================

begin;

create or replace function public.configure_practice_challenge(
  target_match_id uuid,
  target_wager_type text,
  target_wager_dp_amount integer default 0
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  target_player_one_id uuid;
  current_status public.match_status;
  effective_dp_amount integer;
  effective_wager_status text;
begin
  current_user_id := (select auth.uid());

  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if target_wager_type not in ('none', 'dp', 'card') then
    raise exception 'Invalid wager type';
  end if;

  select m.player_one_id, m.status
  into target_player_one_id, current_status
  from public.matches m
  where m.id = target_match_id
  for update;

  if not found then
    raise exception 'Match not found';
  end if;

  if target_player_one_id <> current_user_id then
    raise exception 'Only the challenger may configure this practice duel';
  end if;

  if current_status <> 'pending' then
    raise exception 'This challenge is no longer pending';
  end if;

  if target_wager_type = 'dp'
     and (target_wager_dp_amount is null or target_wager_dp_amount <= 0)
  then
    raise exception 'Invalid DP wager amount';
  end if;

  effective_dp_amount := case
    when target_wager_type = 'dp' then target_wager_dp_amount
    else 0
  end;

  effective_wager_status := case
    when target_wager_type = 'none' then 'none'
    else 'proposed'
  end;

  update public.matches
  set
    match_type = 'practice',
    wager_type = target_wager_type,
    wager_dp_amount = effective_dp_amount,
    wager_status = effective_wager_status,
    updated_at = now()
  where id = target_match_id;
end;
$$;

revoke all on function public.configure_practice_challenge(uuid, text, integer) from public;
grant execute on function public.configure_practice_challenge(uuid, text, integer) to authenticated;

-- ---------------------------------------------------------
-- POST-MIGRATION STRUCTURAL ASSERTION
-- ---------------------------------------------------------

do $$
begin
  if to_regprocedure('public.configure_practice_challenge(uuid, text, integer)') is null then
    raise exception 'MIGRATION ABORTED: configure_practice_challenge(uuid, text, integer) was not created.';
  end if;
end $$;

commit;
