begin;

-- =========================================================
-- DUELIST CIRCLE 2.0 - CARD POOL VOTE ("stem-scherm")
--
-- docs/V2_PLAN.md, "Card pool & ranking": the whole group votes
-- in-app on the proposed ranking - per Boss theme top lists, every
-- Legendary, the Secret Rare border cases and the proposed
-- forbidden / 1-per-deck list. "Agree / too strong / too weak";
-- majority wins, the owner (league admin) breaks ties.
--
-- Tables
--   card_vote_items      what is being voted on (seeded per league
--                        by scripts/cardpool/seed-vote-items.mjs from
--                        data/cardpool/ranking-vote-lists.json).
--                        One item per card per league.
--   card_votes           one vote per player per item.
--   card_vote_tiebreaks  the admin's explicit tie-break per item.
--
-- Vote values are the same three everywhere:
--   agree       the proposal is right
--   too_strong  the card is stronger than the proposal says: one
--               step stricter (rarer; Legendary / 1-per-deck ->
--               forbidden)
--   too_weak    the card is weaker than the proposal says: one step
--               looser (more common; 1-per-deck -> 3 per deck;
--               forbidden -> allowed)
-- A forbidden item cannot be voted too_strong (nothing is stricter).
--
-- This is additive only (new tables + new functions); nothing that
-- the live main app uses is touched.
-- =========================================================

create table if not exists public.card_vote_items (
  id uuid primary key default gen_random_uuid(),

  league_id uuid not null
    references public.leagues(id)
    on delete cascade,

  list_key text not null
    check (list_key ~ '^[a-z0-9_]{2,60}$'),

  list_title text not null,

  list_order integer not null default 0,

  card_catalog_id uuid not null
    references public.card_catalog(id)
    on delete cascade,

  proposed_verdict text not null
    check (proposed_verdict in (
      'Legendary',
      'Secret Rare',
      'Ultra Rare',
      'Super Rare',
      'Rare',
      'Normal',
      'limited_1',
      'forbidden'
    )),

  context text not null default '',

  sort_order integer not null default 0,

  created_at timestamptz not null default now(),

  unique (
    league_id,
    card_catalog_id
  )
);

create index if not exists card_vote_items_league_list_idx
  on public.card_vote_items(league_id, list_order, sort_order);

create index if not exists card_vote_items_card_idx
  on public.card_vote_items(card_catalog_id);


create table if not exists public.card_votes (
  item_id uuid not null
    references public.card_vote_items(id)
    on delete cascade,

  profile_id uuid not null
    references public.profiles(id)
    on delete cascade,

  vote text not null
    check (vote in ('agree', 'too_strong', 'too_weak')),

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  primary key (
    item_id,
    profile_id
  )
);

create index if not exists card_votes_profile_idx
  on public.card_votes(profile_id);


create table if not exists public.card_vote_tiebreaks (
  item_id uuid primary key
    references public.card_vote_items(id)
    on delete cascade,

  vote text not null
    check (vote in ('agree', 'too_strong', 'too_weak')),

  decided_by uuid
    references public.profiles(id)
    on delete set null,

  decided_at timestamptz not null default now()
);

create index if not exists card_vote_tiebreaks_decided_by_idx
  on public.card_vote_tiebreaks(decided_by);


-- ---------------------------------------------------------
-- What a vote turns a verdict into. Pure function, used by the
-- results RPC and by the UI labels.
-- ---------------------------------------------------------

create or replace function public.card_vote_resolve(
  verdict text,
  vote_value text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when vote_value is null then null
    when vote_value = 'agree' then verdict
    when verdict = 'forbidden' then
      case vote_value when 'too_weak' then 'allowed' else 'forbidden' end
    when verdict = 'limited_1' then
      case vote_value when 'too_strong' then 'forbidden' else 'unlimited' end
    when verdict = 'Legendary' then
      case vote_value when 'too_strong' then 'forbidden' else 'Secret Rare' end
    when vote_value = 'too_strong' then
      case verdict
        when 'Secret Rare' then 'Legendary'
        when 'Ultra Rare' then 'Secret Rare'
        when 'Super Rare' then 'Ultra Rare'
        when 'Rare' then 'Super Rare'
        when 'Normal' then 'Rare'
      end
    else
      case verdict
        when 'Secret Rare' then 'Ultra Rare'
        when 'Ultra Rare' then 'Super Rare'
        when 'Super Rare' then 'Rare'
        else 'Normal'
      end
  end;
$$;

grant execute
on function public.card_vote_resolve(text, text)
to authenticated;


-- ---------------------------------------------------------
-- Vote validation + updated_at, for every write path (RLS direct
-- writes and cast_card_vote alike).
-- ---------------------------------------------------------

create or replace function public.card_votes_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  item_verdict text;
begin
  select proposed_verdict
  into item_verdict
  from public.card_vote_items
  where id = new.item_id;

  if item_verdict = 'forbidden' and new.vote = 'too_strong' then
    raise exception 'A forbidden card can only be voted "agree" or "too weak"';
  end if;

  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;

  new.updated_at := now();

  return new;
end;
$$;

drop trigger if exists card_votes_before_write_trigger
  on public.card_votes;

create trigger card_votes_before_write_trigger
  before insert or update on public.card_votes
  for each row execute function public.card_votes_before_write();


-- ---------------------------------------------------------
-- RLS
--
-- Items: league members read; nobody writes from the browser
-- (seeded by the operator script).
-- Votes: league members read every vote of their league (it is a
-- 3-player friends league - the vote is open, like the wishlist);
-- a member inserts/updates only their OWN vote, only on an item of
-- their own league. No deletes.
-- Tie-breaks: league members read; written only through
-- set_vote_tiebreak() (admin-gated).
-- ---------------------------------------------------------

alter table public.card_vote_items enable row level security;
alter table public.card_votes enable row level security;
alter table public.card_vote_tiebreaks enable row level security;

drop policy if exists card_vote_items_read_league on public.card_vote_items;

create policy card_vote_items_read_league
on public.card_vote_items
for select
to authenticated
using (
  (select public.is_league_member(league_id))
);

drop policy if exists card_votes_read_league on public.card_votes;

create policy card_votes_read_league
on public.card_votes
for select
to authenticated
using (
  exists (
    select 1
    from public.card_vote_items i
    where i.id = card_votes.item_id
      and public.is_league_member(i.league_id)
  )
);

drop policy if exists card_votes_insert_own on public.card_votes;

create policy card_votes_insert_own
on public.card_votes
for insert
to authenticated
with check (
  profile_id = (select auth.uid())
  and exists (
    select 1
    from public.card_vote_items i
    where i.id = card_votes.item_id
      and public.is_league_member(i.league_id)
  )
);

drop policy if exists card_votes_update_own on public.card_votes;

create policy card_votes_update_own
on public.card_votes
for update
to authenticated
using (
  profile_id = (select auth.uid())
)
with check (
  profile_id = (select auth.uid())
  and exists (
    select 1
    from public.card_vote_items i
    where i.id = card_votes.item_id
      and public.is_league_member(i.league_id)
  )
);

drop policy if exists card_vote_tiebreaks_read_league on public.card_vote_tiebreaks;

create policy card_vote_tiebreaks_read_league
on public.card_vote_tiebreaks
for select
to authenticated
using (
  exists (
    select 1
    from public.card_vote_items i
    where i.id = card_vote_tiebreaks.item_id
      and public.is_league_member(i.league_id)
  )
);

revoke all on public.card_vote_items from anon, authenticated;
revoke all on public.card_votes from anon, authenticated;
revoke all on public.card_vote_tiebreaks from anon, authenticated;

grant select on public.card_vote_items to authenticated;
grant select, insert, update on public.card_votes to authenticated;
grant select on public.card_vote_tiebreaks to authenticated;


-- ---------------------------------------------------------
-- cast_card_vote: insert-or-change the caller's own vote.
-- SECURITY INVOKER on purpose - the RLS policies above are the
-- permission check; this only saves the client an upsert.
-- ---------------------------------------------------------

create or replace function public.cast_card_vote(
  target_item_id uuid,
  vote_value text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if vote_value is null or vote_value not in ('agree', 'too_strong', 'too_weak') then
    raise exception 'Unknown vote';
  end if;

  if not exists (
    select 1
    from public.card_vote_items
    where id = target_item_id
  ) then
    raise exception 'This vote item does not exist in your league';
  end if;

  insert into public.card_votes (
    item_id,
    profile_id,
    vote
  )
  values (
    target_item_id,
    current_user_id,
    vote_value
  )
  on conflict (item_id, profile_id)
  do update set vote = excluded.vote;

  return vote_value;
end;
$$;

revoke all
on function public.cast_card_vote(uuid, text)
from public, anon;

grant execute
on function public.cast_card_vote(uuid, text)
to authenticated;


-- ---------------------------------------------------------
-- set_vote_tiebreak: the league admin's tie-break for one item.
-- Pass null to clear it. Only used when the vote is actually tied
-- and the tie-break is one of the tied options.
-- ---------------------------------------------------------

create or replace function public.set_vote_tiebreak(
  target_item_id uuid,
  vote_value text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  item_league uuid;
  item_verdict text;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select league_id, proposed_verdict
  into item_league, item_verdict
  from public.card_vote_items
  where id = target_item_id;

  if item_league is null then
    raise exception 'Vote item not found';
  end if;

  if not exists (
    select 1
    from public.league_members
    where league_id = item_league
      and profile_id = current_user_id
      and role = 'admin'
  ) then
    raise exception 'Only the league admin can break a tie';
  end if;

  if vote_value is null then
    delete from public.card_vote_tiebreaks
    where item_id = target_item_id;

    return null;
  end if;

  if vote_value not in ('agree', 'too_strong', 'too_weak') then
    raise exception 'Unknown vote';
  end if;

  if item_verdict = 'forbidden' and vote_value = 'too_strong' then
    raise exception 'A forbidden card can only be "agree" or "too weak"';
  end if;

  insert into public.card_vote_tiebreaks (
    item_id,
    vote,
    decided_by,
    decided_at
  )
  values (
    target_item_id,
    vote_value,
    current_user_id,
    now()
  )
  on conflict (item_id)
  do update set
    vote = excluded.vote,
    decided_by = excluded.decided_by,
    decided_at = excluded.decided_at;

  return vote_value;
end;
$$;

revoke all
on function public.set_vote_tiebreak(uuid, text)
from public, anon;

grant execute
on function public.set_vote_tiebreak(uuid, text)
to authenticated;


-- ---------------------------------------------------------
-- get_vote_results: per item, the counts and the outcome.
--
-- outcome / decided_by:
--   no_votes        nobody voted yet                -> outcome null
--   majority        one option has the most votes   -> that option
--   owner_tiebreak  tied, and the admin's explicit
--                   tie-break is one of the tied options
--   owner_vote      tied, no tie-break set, and an admin's own vote
--                   is one of the tied options
--   tied            tied and the owner has not decided -> outcome null
-- resolved_verdict = what the proposal becomes with that outcome.
--
-- SECURITY INVOKER: RLS on the three tables already limits it to
-- the caller's league; the membership check gives a clear error.
-- "Admin" = league_members.role = 'admin' (the owner).
-- ---------------------------------------------------------

create or replace function public.get_vote_results(
  target_league uuid
)
returns table (
  item_id uuid,
  list_key text,
  list_title text,
  list_order integer,
  sort_order integer,
  card_catalog_id uuid,
  proposed_verdict text,
  agree_count integer,
  too_strong_count integer,
  too_weak_count integer,
  total_votes integer,
  member_count integer,
  my_vote text,
  tiebreak_vote text,
  outcome text,
  decided_by text,
  resolved_verdict text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_league_member(target_league) then
    raise exception 'You are not a member of this league';
  end if;

  return query
  with members as (
    select count(*)::integer as n
    from public.league_members
    where league_id = target_league
  ),
  counts as (
    select
      i.id,
      count(*) filter (where v.vote = 'agree')::integer as agree_count,
      count(*) filter (where v.vote = 'too_strong')::integer as too_strong_count,
      count(*) filter (where v.vote = 'too_weak')::integer as too_weak_count,
      count(v.vote)::integer as total_votes,
      max(v.vote) filter (where v.profile_id = (select auth.uid())) as my_vote,
      array_remove(
        array_agg(v.vote order by lm.joined_at) filter (where lm.role = 'admin'),
        null
      ) as admin_votes
    from public.card_vote_items i
    left join public.card_votes v
      on v.item_id = i.id
    left join public.league_members lm
      on lm.league_id = i.league_id
     and lm.profile_id = v.profile_id
    where i.league_id = target_league
    group by i.id
  ),
  tops as (
    select
      c.*,
      greatest(c.agree_count, c.too_strong_count, c.too_weak_count) as top
    from counts c
  ),
  winners as (
    select
      t.*,
      array_remove(array[
        case when t.agree_count = t.top then 'agree' end,
        case when t.too_strong_count = t.top then 'too_strong' end,
        case when t.too_weak_count = t.top then 'too_weak' end
      ], null) as tied
    from tops t
  ),
  decided as (
    select
      w.*,
      tb.vote as tiebreak_vote,
      case
        when w.total_votes = 0 then 'no_votes'
        when cardinality(w.tied) = 1 then 'majority'
        when tb.vote = any (w.tied) then 'owner_tiebreak'
        when exists (select 1 from unnest(w.admin_votes) av where av = any (w.tied)) then 'owner_vote'
        else 'tied'
      end as decided_by
    from winners w
    left join public.card_vote_tiebreaks tb
      on tb.item_id = w.id
  )
  select
    i.id,
    i.list_key,
    i.list_title,
    i.list_order,
    i.sort_order,
    i.card_catalog_id,
    i.proposed_verdict,
    d.agree_count,
    d.too_strong_count,
    d.too_weak_count,
    d.total_votes,
    (select n from members),
    d.my_vote,
    d.tiebreak_vote,
    o.outcome,
    d.decided_by,
    public.card_vote_resolve(i.proposed_verdict, o.outcome)
  from public.card_vote_items i
  join decided d
    on d.id = i.id
  cross join lateral (
    select case d.decided_by
      when 'majority' then d.tied[1]
      when 'owner_tiebreak' then d.tiebreak_vote
      when 'owner_vote' then (
        select av
        from unnest(d.admin_votes) av
        where av = any (d.tied)
        limit 1
      )
      else null
    end as outcome
  ) o
  where i.league_id = target_league
  order by i.list_order, i.sort_order;
end;
$$;

revoke all
on function public.get_vote_results(uuid)
from public, anon;

grant execute
on function public.get_vote_results(uuid)
to authenticated;

commit;
