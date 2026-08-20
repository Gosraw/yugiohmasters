begin;

-- =========================================================
-- DUELIST CIRCLE - MATCH RESULT CONFIRMATION
--
-- Nieuwe flow:
--
-- accepted
--   -> result_submitted
--   -> completed
--        of
--   -> disputed
--
-- Eén speler meldt het resultaat.
-- De andere speler bevestigt of betwist.
-- =========================================================


-- =========================================================
-- 1. MATCH STATUS UITBREIDEN
-- =========================================================

alter type public.match_status
add value if not exists 'result_submitted';

alter type public.match_status
add value if not exists 'disputed';


-- =========================================================
-- 2. EXTRA KOLOMMEN OP MATCHES
-- =========================================================

alter table public.matches
add column if not exists result_submitted_by uuid
references public.profiles(id)
on delete restrict;


alter table public.matches
add column if not exists result_submitted_at timestamptz;


alter table public.matches
add column if not exists result_confirmed_by uuid
references public.profiles(id)
on delete restrict;


alter table public.matches
add column if not exists result_confirmed_at timestamptz;


alter table public.matches
add column if not exists disputed_by uuid
references public.profiles(id)
on delete restrict;


alter table public.matches
add column if not exists disputed_at timestamptz;


alter table public.matches
add column if not exists dispute_reason text;


-- =========================================================
-- 3. BESTAANDE complete_match VERVANGEN
--
-- Deze functie maakt de match NIET meer completed.
--
-- Hij zet:
-- - resultaat
-- - winner
-- - notes
-- - submitted_by
-- - status = result_submitted
-- =========================================================

create or replace function public.complete_match(
  target_match_id uuid,
  target_result public.match_result_type,
  match_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;

  target_player_one_id uuid;
  target_player_two_id uuid;

  current_status public.match_status;

  resolved_winner_id uuid;
begin

  current_user_id :=
    (select auth.uid());


  if current_user_id is null then
    raise exception
      'Not authenticated';
  end if;


  select
    m.player_one_id,
    m.player_two_id,
    m.status

  into
    target_player_one_id,
    target_player_two_id,
    current_status

  from public.matches m

  where m.id =
    target_match_id;


  if not found then
    raise exception
      'Match not found';
  end if;


  if current_user_id <>
       target_player_one_id
     and current_user_id <>
       target_player_two_id
  then
    raise exception
      'You are not a participant in this match';
  end if;


  if current_status <>
     'accepted'
  then
    raise exception
      'Only accepted matches can receive a result';
  end if;


  if target_result =
     'player_one_win'
  then

    resolved_winner_id :=
      target_player_one_id;

  elsif target_result =
        'player_two_win'
  then

    resolved_winner_id :=
      target_player_two_id;

  elsif target_result =
        'draw'
  then

    resolved_winner_id :=
      null;

  else

    raise exception
      'Invalid match result';

  end if;


  update public.matches
  set
    status =
      'result_submitted',

    result =
      target_result,

    winner_id =
      resolved_winner_id,

    notes =
      nullif(
        trim(
          match_notes
        ),
        ''
      ),

    result_submitted_by =
      current_user_id,

    result_submitted_at =
      now(),

    result_confirmed_by =
      null,

    result_confirmed_at =
      null,

    disputed_by =
      null,

    disputed_at =
      null,

    dispute_reason =
      null,

    completed_at =
      null,

    updated_at =
      now()

  where id =
    target_match_id;
end;
$$;


-- =========================================================
-- 4. CONFIRM MATCH RESULT
--
-- Alleen de ANDERE speler mag bevestigen.
-- =========================================================

create or replace function public.confirm_match_result(
  target_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;

  target_player_one_id uuid;
  target_player_two_id uuid;

  submitted_by uuid;

  current_status public.match_status;
begin

  current_user_id :=
    (select auth.uid());


  if current_user_id is null then
    raise exception
      'Not authenticated';
  end if;


  select
    m.player_one_id,
    m.player_two_id,
    m.result_submitted_by,
    m.status

  into
    target_player_one_id,
    target_player_two_id,
    submitted_by,
    current_status

  from public.matches m

  where m.id =
    target_match_id;


  if not found then
    raise exception
      'Match not found';
  end if;


  if current_status <>
     'result_submitted'
  then
    raise exception
      'This match is not awaiting confirmation';
  end if;


  if current_user_id <>
       target_player_one_id
     and current_user_id <>
       target_player_two_id
  then
    raise exception
      'You are not a participant in this match';
  end if;


  if current_user_id =
     submitted_by
  then
    raise exception
      'The player who submitted the result cannot confirm it';
  end if;


  update public.matches
  set
    status =
      'completed',

    result_confirmed_by =
      current_user_id,

    result_confirmed_at =
      now(),

    completed_at =
      now(),

    updated_at =
      now()

  where id =
    target_match_id;
end;
$$;


-- =========================================================
-- 5. DISPUTE MATCH RESULT
--
-- Alleen de andere speler mag betwisten.
-- =========================================================

create or replace function public.dispute_match_result(
  target_match_id uuid,
  reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;

  target_player_one_id uuid;
  target_player_two_id uuid;

  submitted_by uuid;

  current_status public.match_status;

  cleaned_reason text;
begin

  current_user_id :=
    (select auth.uid());


  if current_user_id is null then
    raise exception
      'Not authenticated';
  end if;


  cleaned_reason :=
    nullif(
      trim(
        reason
      ),
      ''
    );


  select
    m.player_one_id,
    m.player_two_id,
    m.result_submitted_by,
    m.status

  into
    target_player_one_id,
    target_player_two_id,
    submitted_by,
    current_status

  from public.matches m

  where m.id =
    target_match_id;


  if not found then
    raise exception
      'Match not found';
  end if;


  if current_status <>
     'result_submitted'
  then
    raise exception
      'This match is not awaiting confirmation';
  end if;


  if current_user_id <>
       target_player_one_id
     and current_user_id <>
       target_player_two_id
  then
    raise exception
      'You are not a participant in this match';
  end if;


  if current_user_id =
     submitted_by
  then
    raise exception
      'The player who submitted the result cannot dispute their own result';
  end if;


  update public.matches
  set
    status =
      'disputed',

    disputed_by =
      current_user_id,

    disputed_at =
      now(),

    dispute_reason =
      cleaned_reason,

    result_confirmed_by =
      null,

    result_confirmed_at =
      null,

    completed_at =
      null,

    updated_at =
      now()

  where id =
    target_match_id;
end;
$$;


-- =========================================================
-- 6. ADMIN RESOLVE DISPUTE
--
-- Admin kan uiteindelijk resultaat definitief vastzetten.
-- =========================================================

create or replace function public.resolve_disputed_match(
  target_match_id uuid,
  target_result public.match_result_type,
  admin_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;

  target_league_id uuid;

  target_player_one_id uuid;
  target_player_two_id uuid;

  current_status public.match_status;

  resolved_winner_id uuid;

  is_admin boolean;
begin

  current_user_id :=
    (select auth.uid());


  if current_user_id is null then
    raise exception
      'Not authenticated';
  end if;


  select
    m.league_id,
    m.player_one_id,
    m.player_two_id,
    m.status

  into
    target_league_id,
    target_player_one_id,
    target_player_two_id,
    current_status

  from public.matches m

  where m.id =
    target_match_id;


  if not found then
    raise exception
      'Match not found';
  end if;


  if current_status <>
     'disputed'
  then
    raise exception
      'Only disputed matches can be resolved';
  end if;


  select exists (
    select 1
    from public.league_members lm
    where lm.league_id =
        target_league_id
      and lm.profile_id =
        current_user_id
      and lm.role =
        'admin'
  )
  into is_admin;


  if not is_admin then
    raise exception
      'Only a league admin may resolve a disputed match';
  end if;


  if target_result =
     'player_one_win'
  then

    resolved_winner_id :=
      target_player_one_id;

  elsif target_result =
        'player_two_win'
  then

    resolved_winner_id :=
      target_player_two_id;

  elsif target_result =
        'draw'
  then

    resolved_winner_id :=
      null;

  else

    raise exception
      'Invalid match result';

  end if;


  update public.matches
  set
    status =
      'completed',

    result =
      target_result,

    winner_id =
      resolved_winner_id,

    notes =
      coalesce(
        nullif(
          trim(
            admin_notes
          ),
          ''
        ),
        notes
      ),

    result_confirmed_by =
      current_user_id,

    result_confirmed_at =
      now(),

    completed_at =
      now(),

    updated_at =
      now()

  where id =
    target_match_id;
end;
$$;


-- =========================================================
-- 7. PERMISSIONS
-- =========================================================

revoke all
on function public.confirm_match_result(
  uuid
)
from public;


revoke all
on function public.dispute_match_result(
  uuid,
  text
)
from public;


revoke all
on function public.resolve_disputed_match(
  uuid,
  public.match_result_type,
  text
)
from public;


grant execute
on function public.confirm_match_result(
  uuid
)
to authenticated;


grant execute
on function public.dispute_match_result(
  uuid,
  text
)
to authenticated;


grant execute
on function public.resolve_disputed_match(
  uuid,
  public.match_result_type,
  text
)
to authenticated;


commit;