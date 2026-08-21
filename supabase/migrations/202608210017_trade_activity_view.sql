begin;

-- =========================================================
-- DUELIST CIRCLE - V3: TRADE ACTIVITY VIEW
--
-- WHY THIS EXISTS
--
-- `trades` and `trade_items` are intentionally private between
-- the two people in the trade (RLS: sender_id = auth.uid() or
-- receiver_id = auth.uid()). That is correct and this migration
-- does NOT change it — nobody should be able to browse what
-- cards someone else offered in a trade.
--
-- But the V3 Activity Feed and League Record Book want to show
-- one harmless, already-public-in-spirit fact league-wide:
-- "Gos and Samo completed a trade" and "who has traded the
-- most". That is not sensitive - it is the same kind of thing
-- as a completed duel result.
--
-- This view exposes ONLY: which two players, which league,
-- and when - for trades that have actually been accepted.
-- It never exposes trade_items, so the cards involved in a
-- trade stay private to the two participants, exactly as
-- before.
--
-- SAFETY NOTES
--
-- - Read-only. No inserts/updates/deletes are possible through
--   a plain view like this.
--
-- - This does not touch the `trades` or `trade_items` tables,
--   their columns, their RLS policies, or any trigger. It is
--   purely additive.
--
-- - Postgres views run with the privileges of the view owner
--   (the migration role, which bypasses RLS), not the caller.
--   That is what lets this view see every accepted trade in
--   the database - so the `where public.is_league_member(...)`
--   clause below is doing the actual access control that RLS
--   would normally do. Every row returned is filtered down to
--   "trades in a league the calling user is a member of" before
--   it ever reaches the client.
--
-- - Idempotent: safe to re-run.
-- =========================================================

create or replace view public.trade_activity as
select
  t.id,
  t.league_id,
  t.sender_id,
  t.receiver_id,
  t.status,
  t.completed_at,
  t.created_at
from public.trades t
where
  t.status = 'accepted'
  and public.is_league_member(t.league_id);

comment on view public.trade_activity is
  'Read-only, minimal summary of ACCEPTED trades for the Activity '
  'Feed and League Record Book. Deliberately excludes trade_items '
  '(the actual cards traded) which stay private to the two '
  'participants. Rows are pre-filtered to the calling user''s own '
  'league via is_league_member().';

revoke all on public.trade_activity from public;
grant select on public.trade_activity to authenticated;

commit;
