begin;

-- =========================================================
-- Practice challenges vs season duels, and unfunded wagers
-- (2026-10-15, code-review findings H1 / H2 / H3)
--
-- H1  create_match_challenge refused a new practice challenge while
--     ANY pending match existed between the two players - and every
--     unplayed season duel is a pending match. Only non-competition
--     matches count now.
--
-- H2  decline_match_challenge, cancel_match_challenge,
--     configure_practice_challenge, fund_match_dp_wager and
--     add_match_wager_card refuse season / competition matches
--     (competition_id is not null). A player could cancel or decline
--     a scheduled season duel, or put a wager on it; league matches
--     never have wagers.
--
-- H3  A wager could be won while only ONE side had paid its stake:
--     the challenged player accepted first and funded in a separate
--     call; if funding failed (not enough DP, card locked) the duel
--     stayed accepted with a one-sided pot, and the result paid that
--     pot to whoever won. Safest backwards-compatible fix, all three:
--       * accept_practice_challenge(match, card default null): accept
--         + stake in ONE transaction (the 2.0 app uses it). A failed
--         stake rolls the accept back.
--       * complete_match refuses a result on a wagered practice duel
--         until both stakes are in (the live main app still accepts
--         and funds in two calls, so this guard protects it too).
--       * settle_match_wagers refunds / returns every stake instead
--         of paying out when the wager was never fully staked (old
--         rows); and a league admin may run it too (an admin who
--         resolved someone else's dispute used to get "You are not
--         part of this match").
--     cancel_match_challenge also lets EITHER player cancel an
--     accepted wager duel whose stakes are not both in (the way out
--     of a stuck one-sided duel; release_match_wagers then refunds).
--
-- No signature changes. Guards in configure / fund / add-card /
-- complete_match are inserted right after the first "begin" (same
-- technique as 202610121800 section 4), with a marker so a re-run is
-- a no-op.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Is the wager fully staked (both players)?
-- ---------------------------------------------------------

create or replace function public._match_wager_fully_staked(target_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case m.wager_type
    when 'dp' then (
      select count(distinct e.profile_id)
      from public.match_dp_escrows e
      where e.match_id = m.id
        and e.status = 'funded'
        and e.profile_id in (m.player_one_id, m.player_two_id)
    ) = 2
    when 'card' then (
      select count(distinct c.owner_id)
      from public.match_wager_cards c
      where c.match_id = m.id
        and c.status = 'locked'
        and c.owner_id in (m.player_one_id, m.player_two_id)
    ) = 2
    else true
  end
  from public.matches m
  where m.id = target_match_id;
$$;

revoke all on function public._match_wager_fully_staked(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------
-- 2. H1: create_match_challenge (body from 202608190010; only the
--    duplicate-challenge check changed).
-- ---------------------------------------------------------

create or replace function public.create_match_challenge(
  target_league_id uuid,
  target_opponent_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  current_user_deck_id uuid;
  new_match_id uuid;
begin
  current_user_id := (select auth.uid());

  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if current_user_id = target_opponent_id then
    raise exception 'You cannot challenge yourself';
  end if;

  if not public.is_league_member(target_league_id) then
    raise exception 'You are not a member of this league';
  end if;

  if not exists (
    select 1
    from public.league_members lm
    where lm.league_id = target_league_id
      and lm.profile_id = target_opponent_id
  ) then
    raise exception 'Opponent is not a member of this league';
  end if;

  select d.id
  into current_user_deck_id
  from public.decks d
  where d.league_id = target_league_id
    and d.owner_id = current_user_id
    and d.status = 'ready'
    and d.is_active = true
  limit 1;

  if current_user_deck_id is null then
    raise exception 'You need an Active Ready deck before challenging another player';
  end if;

  -- One open challenge per pair. Season duels (competition_id set)
  -- are scheduled matches, not challenges, and never block one.
  if exists (
    select 1
    from public.matches m
    where m.league_id = target_league_id
      and m.status = 'pending'
      and m.competition_id is null
      and (
        (m.player_one_id = current_user_id and m.player_two_id = target_opponent_id)
        or (m.player_one_id = target_opponent_id and m.player_two_id = current_user_id)
      )
  ) then
    raise exception 'There is already a pending challenge between these players';
  end if;

  insert into public.matches (
    league_id,
    created_by,
    player_one_id,
    player_two_id,
    player_one_deck_id,
    status
  )
  values (
    target_league_id,
    current_user_id,
    current_user_id,
    target_opponent_id,
    current_user_deck_id,
    'pending'
  )
  returning id
  into new_match_id;

  return new_match_id;
end;
$$;

revoke all on function public.create_match_challenge(uuid, uuid) from public, anon;
grant execute on function public.create_match_challenge(uuid, uuid) to authenticated;

-- ---------------------------------------------------------
-- 3. H2: decline / cancel (bodies from 202609011100 + guards).
-- ---------------------------------------------------------

create or replace function public.decline_match_challenge(
  target_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  match_row public.matches%rowtype;
begin
  current_user_id := (select auth.uid());

  select *
  into match_row
  from public.matches m
  where m.id = target_match_id
  for update;

  if not found then
    raise exception 'Match not found';
  end if;

  if match_row.competition_id is not null then
    raise exception 'Season duels can''t be declined.';
  end if;

  if match_row.player_two_id is distinct from current_user_id then
    raise exception 'Only the challenged player may decline this match';
  end if;

  if match_row.status <> 'pending' then
    raise exception 'This challenge is no longer pending';
  end if;

  update public.matches
  set
    status = 'declined',
    updated_at = now()
  where id = target_match_id;
end;
$$;

revoke all on function public.decline_match_challenge(uuid) from public, anon;
grant execute on function public.decline_match_challenge(uuid) to authenticated;

create or replace function public.cancel_match_challenge(
  target_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  match_row public.matches%rowtype;
  stuck_wager boolean;
begin
  current_user_id := (select auth.uid());

  select *
  into match_row
  from public.matches m
  where m.id = target_match_id
  for update;

  if not found then
    raise exception 'Match not found';
  end if;

  if match_row.competition_id is not null then
    raise exception 'Season duels can''t be cancelled.';
  end if;

  -- H3 way out: an accepted wager duel whose stakes are not both in
  -- can be called off by either player (stakes are refunded by
  -- release_match_wagers afterwards).
  stuck_wager :=
    match_row.status = 'accepted'
    and match_row.match_type = 'practice'
    and match_row.wager_type in ('dp', 'card')
    and not public._match_wager_fully_staked(target_match_id);

  if stuck_wager then
    if current_user_id is null
       or current_user_id not in (match_row.player_one_id, match_row.player_two_id) then
      raise exception 'Only a player in this duel may cancel it';
    end if;
  else
    if match_row.player_one_id is distinct from current_user_id then
      raise exception 'Only the challenger may cancel this match';
    end if;

    if match_row.status <> 'pending' then
      raise exception 'This challenge is no longer pending';
    end if;
  end if;

  update public.matches
  set
    status = 'cancelled',
    updated_at = now()
  where id = target_match_id;
end;
$$;

revoke all on function public.cancel_match_challenge(uuid) from public, anon;
grant execute on function public.cancel_match_challenge(uuid) to authenticated;

-- ---------------------------------------------------------
-- 4. H2 / H3 guards patched in after the first "begin".
-- ---------------------------------------------------------

do $$
declare
  target record;
  def text;
  patched text;
  marker constant text := 'practice-challenge guard (202610152030)';
begin
  for target in
    select *
    from (
      values
        (
          'public.configure_practice_challenge(uuid,text,integer)'::regprocedure,
          'if exists (select 1 from public.matches where id = target_match_id and competition_id is not null) then raise exception ''League duels never have a wager.''; end if;'
        ),
        (
          'public.fund_match_dp_wager(uuid)'::regprocedure,
          'if exists (select 1 from public.matches where id = target_match_id and competition_id is not null) then raise exception ''League duels never have a wager.''; end if;'
        ),
        (
          'public.add_match_wager_card(uuid,uuid)'::regprocedure,
          'if exists (select 1 from public.matches where id = target_match_id and competition_id is not null) then raise exception ''League duels never have a wager.''; end if;'
        ),
        (
          'public.complete_match(uuid,public.match_result_type,text)'::regprocedure,
          'if exists (select 1 from public.matches where id = target_match_id and competition_id is null and match_type = ''practice'' and wager_type in (''dp'', ''card'')) and not public._match_wager_fully_staked(target_match_id) then raise exception ''Both wagers must be in before a result can be entered.''; end if;'
        )
    ) as t(fn, action)
  loop
    def := pg_get_functiondef(target.fn);

    if position(marker in def) > 0 then
      continue;
    end if;

    patched := regexp_replace(
      def,
      E'\\nbegin\\n',
      E'\nbegin\n  -- ' || marker || E'\n  ' || target.action || E'\n'
    );

    if patched = def then
      raise exception 'practice challenge guards: could not patch %', target.fn;
    end if;

    execute patched;
  end loop;
end;
$$;

-- ---------------------------------------------------------
-- 5. H3: settle_match_wagers. Body = the live definition
--    (202608220019 + 202610121500's 'lost' escrow status), plus:
--    a league admin may call it, and a wager that was never fully
--    staked is refunded / returned instead of paid out.
-- ---------------------------------------------------------

create or replace function public.settle_match_wagers(
  target_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid;
  target_match public.matches%rowtype;
  escrow_row record;
  card_row record;
  total_dp integer := 0;
  void_wager boolean;
begin
  caller_id := auth.uid();

  if caller_id is null then
    raise exception 'Not authenticated.';
  end if;

  select *
  into target_match
  from public.matches
  where id = target_match_id
  for update;

  if not found then
    raise exception 'Match not found.';
  end if;

  if caller_id not in (target_match.player_one_id, target_match.player_two_id)
     and not exists (
       select 1
       from public.league_members lm
       where lm.league_id = target_match.league_id
         and lm.profile_id = caller_id
         and lm.role = 'admin'
     ) then
    raise exception 'You are not part of this match.';
  end if;

  if target_match.match_type <> 'practice' then
    return;
  end if;

  if target_match.status <> 'completed' then
    raise exception 'Match is not completed.';
  end if;

  if target_match.wager_status = 'settled' then
    return;
  end if;

  -- A draw, or a wager only one side ever paid into: everyone gets
  -- their own stake back.
  void_wager :=
    target_match.winner_id is null
    or not public._match_wager_fully_staked(target_match_id);

  -- DP WAGER
  if target_match.wager_type = 'dp' then
    if void_wager then
      for escrow_row in
        select *
        from public.match_dp_escrows
        where match_id = target_match_id
          and status = 'funded'
        for update
      loop
        perform public._credit_duel_points(
          escrow_row.profile_id,
          escrow_row.amount,
          'practice_wager_refund',
          target_match_id,
          case
            when target_match.winner_id is null then 'Practice duel ended in a draw. Wager refunded.'
            else 'Practice duel wager was never fully staked. Wager refunded.'
          end,
          '{}'::jsonb
        );

        update public.match_dp_escrows
        set
          status = 'refunded',
          settled_at = now()
        where id = escrow_row.id;
      end loop;
    else
      select coalesce(sum(amount), 0)
      into total_dp
      from public.match_dp_escrows
      where match_id = target_match_id
        and status = 'funded';

      if total_dp > 0 then
        perform public._credit_duel_points(
          target_match.winner_id,
          total_dp,
          'practice_wager_win',
          target_match_id,
          'Practice duel wager winnings.',
          jsonb_build_object('pool', total_dp)
        );
      end if;

      update public.match_dp_escrows
      set
        status = case
          when profile_id = target_match.winner_id then 'won'
          else 'lost'
        end,
        settled_at = now()
      where match_id = target_match_id
        and status = 'funded';
    end if;
  end if;

  -- CARD WAGER
  if target_match.wager_type = 'card' then
    for card_row in
      select *
      from public.match_wager_cards
      where match_id = target_match_id
        and status = 'locked'
      for update
    loop
      if void_wager then
        update public.card_instances
        set
          locked = false,
          lock_type = null,
          lock_reference_id = null,
          locked_at = null
        where id = card_row.card_instance_id;

        update public.match_wager_cards
        set
          status = 'returned',
          settled_at = now()
        where id = card_row.id;
      else
        update public.card_instances
        set
          current_owner_id = target_match.winner_id,
          locked = false,
          lock_type = null,
          lock_reference_id = null,
          locked_at = null
        where id = card_row.card_instance_id;

        update public.match_wager_cards
        set
          status = 'won',
          settled_at = now()
        where id = card_row.id;
      end if;
    end loop;
  end if;

  update public.matches
  set wager_status = 'settled'
  where id = target_match_id;
end;
$$;

revoke all on function public.settle_match_wagers(uuid) from public, anon;
grant execute on function public.settle_match_wagers(uuid) to authenticated;

-- ---------------------------------------------------------
-- 6. H3: accept + stake in one transaction (used by the 2.0 app).
-- ---------------------------------------------------------

create or replace function public.accept_practice_challenge(
  target_match_id uuid,
  target_card_instance_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  match_row public.matches%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  select * into match_row from public.matches where id = target_match_id;

  if not found then
    raise exception 'Match not found.';
  end if;

  if match_row.competition_id is not null then
    raise exception 'Season duels are played from the round screen.';
  end if;

  if match_row.match_type = 'practice'
     and match_row.wager_type = 'card'
     and target_card_instance_id is null then
    raise exception 'Pick a card to wager first.';
  end if;

  -- Any failure below (no Ready deck, not enough DP, card locked)
  -- rolls the whole accept back: no one-sided wager.
  perform public.accept_match_challenge(target_match_id);

  if match_row.match_type = 'practice' and match_row.wager_type = 'dp' then
    perform public.fund_match_dp_wager(target_match_id);
  elsif match_row.match_type = 'practice' and match_row.wager_type = 'card' then
    perform public.add_match_wager_card(target_match_id, target_card_instance_id);
  end if;
end;
$$;

revoke all on function public.accept_practice_challenge(uuid, uuid) from public, anon;
grant execute on function public.accept_practice_challenge(uuid, uuid) to authenticated;

commit;
