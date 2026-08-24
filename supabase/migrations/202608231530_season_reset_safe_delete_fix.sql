-- Production-safe redeploy of season_reset_apply(): adds explicit WHERE true to full-table deletes for safe-update compatibility.

create or replace function public.season_reset_apply(
  confirmation_phrase text
)
returns table (reset_profile_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  is_admin boolean;
begin
  current_user_id := (select auth.uid());
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1 from public.league_members lm
    where lm.profile_id = current_user_id and lm.role = 'admin'
  ) into is_admin;

  if not is_admin then
    raise exception 'Only a league admin may apply a season reset.';
  end if;

  if confirmation_phrase is distinct from 'RESET DUELIST CIRCLE SEASON' then
    raise exception 'Confirmation phrase did not match. Nothing was changed. Pass exactly: RESET DUELIST CIRCLE SEASON';
  end if;

  -- ---- Draft system ----
  delete from public.draft_picks where true;
  delete from public.draft_offer_cards where true;
  delete from public.draft_offers where true;
  delete from public.draft_players where true;
  delete from public.drafts where true;

  -- ---- Shop / pack history + pity ----
  delete from public.shop_pack_pulls where true;
  delete from public.shop_pack_openings where true;
  delete from public.shop_purchases where true;
  delete from public.shop_pack_pity where true;
  delete from public.reward_vouchers where true;

  -- ---- Un-sell shop rotation slots (config kept, player state cleared) ----
  update public.shop_rotation_cards
  set sold_to_profile_id = null, sold_at = null
  where sold_to_profile_id is not null;

  -- ---- Competitions (full history reset, per explicit scope) ----
  delete from public.competition_reward_grants where true;
  delete from public.competition_results where true;
  delete from public.competition_players where true;
  delete from public.competitions where true; -- cascades competition_reward_rules

  -- ---- Matches, wagers, DP ledger ----
  delete from public.match_wager_cards where true;
  delete from public.match_dp_escrows where true;
  delete from public.duel_point_transactions where true;
  delete from public.matches where true;

  -- ---- Trading ----
  delete from public.trade_items where true;
  delete from public.trades where true;

  -- ---- Decks ----
  delete from public.deck_cards where true;
  delete from public.decks where true;

  -- ---- Owned cards ----
  -- card_instances carries an intentional, deliberate app-level
  -- guard (prevent_card_instance_delete_trigger, added in
  -- 202608190004_card_instances.sql: "Een bestaande kaart
  -- verdwijnt niet zomaar uit de wereld" / an existing card does
  -- not just disappear from the world - trading/wagers change the
  -- owner, they never delete the row, so scarcity stays reliable).
  -- A full Season reset is the one deliberate, admin-gated,
  -- confirmation-phrase-gated exception to that rule, so the
  -- trigger is suspended for exactly the one statement that needs
  -- it and re-enabled immediately after - both inside this same
  -- function transaction, so if anything below raises, the
  -- trigger's suspension rolls back along with everything else and
  -- is never left disabled outside of this atomic operation.
  delete from public.ownership_history where true;
  alter table public.card_instances disable trigger prevent_card_instance_delete_trigger;
  delete from public.card_instances where true;
  alter table public.card_instances enable trigger prevent_card_instance_delete_trigger;

  -- ---- League membership (structure kept, members cleared) ----
  delete from public.league_members where true;

  -- ---- Clear attribution FKs that would otherwise block the
  --      profile/auth-user cascade delete that follows ----
  update public.leagues set created_by = null where created_by is not null;
  update public.card_catalog set rarity_reviewed_by = null where rarity_reviewed_by is not null;

  return query select p.id from public.profiles p;
end;
$$;

comment on function public.season_reset_apply(text) is
  'DESTRUCTIVE. Admin-gated + requires the exact confirmation phrase RESET DUELIST CIRCLE SEASON. Wraps every delete in one transaction. Does NOT delete auth.users/profiles itself - returns the profile ids for scripts/season-reset.mjs to pass to supabase.auth.admin.deleteUser(), which cascades profiles (and wallets) cleanly since this function has already cleared everything that would otherwise block that cascade.';

revoke all on function public.season_reset_preview() from public;
grant execute on function public.season_reset_preview() to authenticated;

revoke all on function public.season_reset_apply(text) from public;
grant execute on function public.season_reset_apply(text) to authenticated;
