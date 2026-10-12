-- =========================================================
-- Small bug-hunt leftovers (2026-10-12). All backwards compatible
-- with the live `main` app: two new functions, one re-created
-- function with the same signature, two tightened read policies.
--
-- 1. Trade drafts are private to the player who is building them.
--    A counter-offer draft used to be readable by the other player
--    (they could open the unsent draft). Once sent (pending,
--    accepted, declined, cancelled) both players see it as before.
--    The trade RPCs are SECURITY DEFINER and are not affected.
--
-- 2. save_trade_draft_message(): keeps the typed message on the
--    draft when sending fails (e.g. a card moved on), so the player
--    doesn't have to type it again.
--
-- 3. start_season_competition(): creates the season competition,
--    flags it as THE season, enters every league member and
--    schedules all rounds in ONE transaction. Before, a failure
--    after create_competition_v2 left an orphan draft competition
--    behind (and a flagged-but-empty season blocked new seasons).
--
-- 4. Clearer ledger wording for a reversed season bounty:
--    "Bounty reversed after a result correction".
-- =========================================================


-- ---------------------------------------------------------
-- 1. Trade draft privacy
-- ---------------------------------------------------------

drop policy if exists trades_read_participants
  on public.trades;

create policy trades_read_participants
on public.trades
for select
to authenticated
using (
  created_by = auth.uid()
  or (
    status <> 'draft'
    and (
      sender_id = auth.uid()
      or receiver_id = auth.uid()
    )
  )
);

drop policy if exists trade_items_read_participants
  on public.trade_items;

create policy trade_items_read_participants
on public.trade_items
for select
to authenticated
using (
  exists (
    select 1
    from public.trades t
    where t.id = trade_id
      and (
        t.created_by = auth.uid()
        or (
          t.status <> 'draft'
          and (
            t.sender_id = auth.uid()
            or t.receiver_id = auth.uid()
          )
        )
      )
  )
);


-- ---------------------------------------------------------
-- 2. Keep the trade message on a draft
-- ---------------------------------------------------------

create or replace function public.save_trade_draft_message(
  target_trade_id uuid,
  trade_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  trade_row public.trades%rowtype;
  clean_message text := nullif(btrim(coalesce(trade_message, '')), '');
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into trade_row
  from public.trades
  where id = target_trade_id
  for update;

  if not found then
    raise exception 'Trade not found';
  end if;

  if trade_row.sender_id <> current_user_id then
    raise exception 'Only the sender may edit this trade';
  end if;

  if trade_row.status <> 'draft' then
    raise exception 'Trade can only be edited while Draft';
  end if;

  if clean_message is not null and length(clean_message) > 1000 then
    raise exception 'Messages can be at most 1000 characters.';
  end if;

  update public.trades
  set
    message = clean_message,
    updated_at = now()
  where id = trade_row.id;
end;
$$;

revoke all on function public.save_trade_draft_message(uuid, text) from public, anon;
grant execute on function public.save_trade_draft_message(uuid, text) to authenticated;


-- ---------------------------------------------------------
-- 3. Start the season in one transaction
-- ---------------------------------------------------------

create or replace function public.start_season_competition(
  target_league_id uuid,
  target_name text,
  target_rounds integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  new_competition_id uuid;
  member_id uuid;
  member_count integer;
begin
  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select count(*)
  into member_count
  from public.league_members
  where league_id = target_league_id;

  if member_count < 2 then
    raise exception 'Need at least 2 league members to start the season.';
  end if;

  -- Each step keeps its own checks (admin only, one season at a
  -- time, ...). Any error rolls back every step, so no half-made
  -- season competition is ever left behind.
  new_competition_id := public.create_competition_v2(
    target_league_id,
    coalesce(nullif(btrim(coalesce(target_name, '')), ''), 'Season Competition'),
    target_rounds,
    'single_duel'
  );

  if new_competition_id is null then
    raise exception 'The competition could not be created.';
  end if;

  perform public.mark_competition_as_season(new_competition_id);

  for member_id in
    select profile_id
    from public.league_members
    where league_id = target_league_id
    order by joined_at nulls last, profile_id
  loop
    perform public.add_competition_player_v2(new_competition_id, member_id);
  end loop;

  perform public.generate_round_robin_matches_v2(new_competition_id);

  return new_competition_id;
end;
$$;

revoke all on function public.start_season_competition(uuid, text, integer) from public, anon;
grant execute on function public.start_season_competition(uuid, text, integer) to authenticated;


-- ---------------------------------------------------------
-- 4. Reversed bounty wording (same body, new text)
-- ---------------------------------------------------------

create or replace function public._season_bonus_reverse(
  target_grant_id uuid,
  target_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  grant_row public.season_bonus_grants%rowtype;
  debit_row record;
  recovered integer := 0;
  unrecovered integer := 0;
  reversal_tx_id uuid;
begin
  select *
  into grant_row
  from public.season_bonus_grants
  where id = target_grant_id
  for update;

  if not found or grant_row.status <> 'granted' then
    return;
  end if;

  if grant_row.duel_points_granted > 0 then
    select *
    into debit_row
    from public._debit_duel_points(
      grant_row.profile_id,
      grant_row.duel_points_granted,
      case grant_row.kind when 'bounty' then 'season_bounty_reversal' else 'season_catch_up_reversal' end,
      null,
      target_reason,
      jsonb_build_object(
        'competition_id', grant_row.competition_id,
        'match_id', grant_row.match_id,
        'logical_round_number', grant_row.round_number,
        'season_bonus_grant_id', grant_row.id
      ),
      case grant_row.kind
        when 'bounty' then 'Bounty reversed after a result correction'
        else 'Catch-up bonus taken back — Round ' || grant_row.round_number || ' standings corrected'
      end,
      true
    );

    recovered := debit_row.debited;
    unrecovered := debit_row.unrecovered;
    reversal_tx_id := debit_row.transaction_id;
  end if;

  update public.season_bonus_grants
  set
    status = 'reversed',
    reversed_at = now(),
    reversal_reason = target_reason,
    duel_points_recovered = recovered,
    duel_points_unrecovered = unrecovered,
    reversal_duel_point_transaction_id = reversal_tx_id
  where id = grant_row.id;
end;
$$;

revoke all on function public._season_bonus_reverse(uuid, text) from public, anon, authenticated;

update public.duel_point_transactions
set description = 'Bounty reversed after a result correction'
where reason = 'season_bounty_reversal'
  and description = 'Bounty taken back — duel result corrected';
