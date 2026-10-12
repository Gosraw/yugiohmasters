-- =========================================================
-- Signup capacity check (2026-10-12 bug hunt)
--
-- The private league holds 3 players (bootstrap_private_league()
-- raises 'private league is full' for a 4th). A 4th signup used to
-- create the account first and only then fail to join, landing in a
-- broken half-app. The signup form now asks this BEFORE creating the
-- account.
--
-- Callable anonymously (the visitor has no account yet) and returns
-- one boolean only - no league id, names or member count. Same
-- league choice and limit as bootstrap_private_league(): the oldest
-- non-archived league, room while it has fewer than 3 members (or no
-- league exists yet). Additive; the live main app does not call it.
-- =========================================================

create or replace function public.private_league_has_room()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select (
        select count(*)
        from public.league_members lm
        where lm.league_id = l.id
      ) < 3
      from public.leagues l
      where l.archived_at is null
      order by l.created_at
      limit 1
    ),
    true
  );
$$;

revoke all on function public.private_league_has_room() from public;
grant execute on function public.private_league_has_room() to anon, authenticated;
