-- =========================================================
-- PASTE THIS WHOLE FILE INTO THE SUPABASE SQL EDITOR, THEN PRESS RUN.
--
-- Gives the player sam (Samo) 200 Duel Points on top of the current
-- balance, a one-off the owner asked for on 2026-11-04. It goes through
-- _credit_duel_points, so it shows up in the DP history like any other
-- grant. Other players are not touched.
--
-- One transaction: if anything goes wrong, nothing changes. Safe to run
-- twice: the second run sees the first grant and adds nothing.
--
-- The result is one row. checks_passed must say true.
-- =========================================================

begin;

do $grant$
declare
  v_player uuid;
begin
  select id
  into v_player
  from public.profiles
  where username = 'sam';

  if v_player is null then
    raise exception 'Grant aborted: player sam not found. Nothing changed.';
  end if;

  if exists (
    select 1
    from public.duel_point_transactions
    where profile_id = v_player
      and reason = 'owner_grant'
      and note = '2026-11-04-sam-200'
  ) then
    return;
  end if;

  perform public._credit_duel_points(
    v_player,
    200,
    'owner_grant',
    null,
    '2026-11-04-sam-200',
    '{}'::jsonb,
    'Gift from the league owner'
  );
end;
$grant$;

commit;

-- =========================================================
-- VERIFICATION (reads only)
-- =========================================================

with p as (
  select id, duel_points
  from public.profiles
  where username = 'sam'
),
counts as (
  select
    (select duel_points from p) as duel_points,
    (select w.duel_points from public.wallets w, p where w.profile_id = p.id) as wallet,
    (select count(*) from public.duel_point_transactions t, p where t.profile_id = p.id and t.reason = 'owner_grant' and t.note = '2026-11-04-sam-200') as grants
)
select
  duel_points,
  wallet,
  grants,
  (
    grants = 1
    and duel_points = wallet
  ) as checks_passed
from counts;
