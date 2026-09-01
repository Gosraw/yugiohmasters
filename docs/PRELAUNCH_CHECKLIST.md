# Duelist Circle — Pre-Launch Checklist

Generated 2026-09-01, end of the final pre-launch autonomous release
sprint. Every item below reflects what was actually verified this
session (or is known from the commit history it builds on) — nothing
here is aspirational. Three states are used:

- **VERIFIED LOCALLY** — confirmed via `npm run typecheck` /
  `npm run lint` / `npm run check:sql` / direct code reading against
  the actual committed source, with no live Postgres available this
  session to run anything further.
- **NEEDS LIVE SUPABASE TEST** — cannot be confirmed without actually
  running the migration/RPC against a real database. Run
  `supabase db push`, then the referenced verify script (if any) or
  the referenced manual SQL check.
- **NEEDS HUMAN UI TEST** — needs a person clicking through the real
  app on a phone. A precise sequence of steps is given for each.

---

## 1. Phase 1 — Live rollout blocker (this session's named fix)

- [x] **VERIFIED LOCALLY** — root cause found and fixed: `v_card` in
  `supabase/migrations/202608301200_seed_2015_2018_legacy_support_whitelist.sql`
  was declared `record` but used in a `foreach v_card slice 1 in
  array v_cards` loop over a `text[][]` source — Postgres requires
  the SLICE loop variable to be an array type. Fixed to `v_card
  text[]`. The corresponding section of
  `scripts/generated/LIVE_PHASE1_ROLLOUT_2026_08_31.sql` was
  regenerated from the fixed source.
- [x] **VERIFIED LOCALLY** — a new static guard,
  `scripts/check-plpgsql-foreach-slice.mjs` (wired to `npm run
  check:sql`), scans every migration and generated-rollout file for
  this exact bug class and confirms there is exactly one
  FOREACH...SLICE occurrence in the whole repo, and it is now
  correctly typed.
- [ ] **NEEDS LIVE SUPABASE TEST** — actually run
  `scripts/generated/LIVE_PHASE1_ROLLOUT_2026_08_31.sql` (or
  `supabase db push`, which applies the same underlying migration
  files) against the real database and confirm it completes without
  the 42804 error this rollout previously hit.

## 2. Phase 2 + Phase 3 economy (pack sizes, pack-level peak rarity)

- [x] **VERIFIED LOCALLY** — pack sizes updated to the final
  human-approved numbers: Standard 5 (already correct, verified
  against the full chronological migration chain, not just the
  latest file), Premium 7, Special (all 3 categories) 7, Deluxe 10.
  Guarded by idempotent `where cards_per_pack = <old value>` UPDATEs
  plus a `do $$ ... $$` structural assertion block that aborts the
  whole migration transaction if the pre-migration baseline doesn't
  match what it assumes.
- [x] **VERIFIED LOCALLY** — rarity model rebuilt from per-card
  independent rolls (with a separate always-on "floor card"
  mechanic) to a single pack-level "peak rarity" roll
  (`roll_shop_pack_peak_rarity`), with every other card slot drawn
  only from Normal/Rare (`roll_shop_pack_filler_rarity`) so a pack's
  realized top-tier hit rate now matches the approved percentages by
  construction, not by post-hoc simulation. `purchase_shop_pack`'s
  source was confirmed (via a `do $$ ... $$` post-migration
  assertion, not just by eye) to use both new functions and to no
  longer contain any reference to the old `minimum_rarity_rank`
  floor mechanic.
- [x] **VERIFIED LOCALLY** — league-wide Legendary uniqueness
  (`validate_new_card_instance` trigger, `shop_card_copy_limit`) is
  completely independent of how `rolled_rarity` for a slot is
  produced, so it applies identically under the new model; confirmed
  by reading the trigger and copy-limit check, not just by
  assumption.
- [x] **VERIFIED LOCALLY** — the pack-opening reveal UI
  (`src/components/pack-opening-reveal.tsx`) and the opening detail
  page (`src/app/(app)/shop/opening/[id]/page.tsx`) both read
  `pulled_rarity` as a generic string with no hardcoded coupling to
  the old model, and their rarity label sets (`Normal`, `Rare`,
  `Super Rare`, `Ultra Rare`, `Secret Rare`, `Legendary`) exactly
  match what the new roll functions return — the pack-opening loop
  needs no further changes for Phase 3 to render correctly.
- [x] **VERIFIED LOCALLY** — Shop UI's 3rd Special Pack category
  (Monster Type) is now fully purchasable: fixed a binary
  attribute/archetype-only ternary in `shop/page.tsx` plus matching
  2-category hardcoding in `pack-art.tsx`, `pack-opening-reveal.tsx`,
  and `actions/shop.ts` that all independently assumed only 2
  categories existed.
- [ ] **NEEDS LIVE SUPABASE TEST** — run
  `node --env-file=.env.local scripts/verify-phase3-live.mjs` after
  applying the Phase 3 migration; it checks the live
  `_phase3_verify_introspect()` output against the expected pack
  sizes/prices/function set.
- [ ] **NEEDS HUMAN UI TEST** — open Shop, confirm all 4 pack tiers
  show their new sizes, and confirm all 3 Special Pack categories
  (Attribute, Archetype, Monster Type) each have a working "Buy"
  button that completes a real purchase.
- [ ] **NEEDS HUMAN UI TEST** — open several packs of each tier
  (Standard/Premium/Special/Deluxe) and confirm the reveal always
  shows exactly the number of cards configured for that tier, and
  that a pulled Legendary/Secret/Ultra/Super Rare card renders with
  the correct cinematic/styling.

## 3. BO3 Challenge system (this session's audit + fixes)

- [x] **VERIFIED LOCALLY — BLOCKER FIXED** — every practice/BO3
  challenge (Free, DP-stake, Card-stake) previously failed at
  creation with a Postgres permission-denied error, because
  `createMatchChallenge()` called `.from("matches").update(...)`
  directly from the authenticated client, but
  `202608190010_matches.sql` revokes insert/update/delete on
  `public.matches` from `authenticated` with no compensating RLS
  policy ("Alle mutations via RPC."). Fixed with a new
  `configure_practice_challenge()` security-definer RPC following
  the same pattern as every sibling match RPC.
- [x] **VERIFIED LOCALLY** — `acceptMatchChallenge()` reordered so
  `accept_match_challenge()` (the Active Ready deck check) runs
  BEFORE DP funding / card locking, not after — previously a deck
  check failure after DP was already deducted or a card already
  locked had no rollback path.
- [x] **VERIFIED LOCALLY** — `add_match_wager_card()` now rejects a
  second locked wager card from the same player on the same match
  (the match detail page's UI models exactly one staked card per
  side; a second one was previously silently accepted by the
  database and invisible in the UI), and now checks the staked
  card's `league_id` matches the match's `league_id`.
- [x] **VERIFIED LOCALLY** — `accept_match_challenge()` /
  `decline_match_challenge()` / `cancel_match_challenge()` now all
  take a `for update` row lock on the match, matching every other
  match-mutation RPC in this family, closing a race where a
  concurrent accept + cancel/decline could both proceed off a stale
  read.
- [x] **VERIFIED LOCALLY** — `settle_match_wagers()` was confirmed to
  already correctly loop over every locked wager-card row (not just
  one), so it settles correctly regardless of the new per-side cap.
- [x] **VERIFIED LOCALLY** — DP wallet ledger: `practice_wager_stake`
  / `practice_wager_win` / `practice_wager_refund` transactions
  previously had no label and fell back to the raw reason string
  ("practice wager win"); now show as "Challenge stake" / "Challenge
  winnings" / "Challenge stake refunded", visually distinct from
  ordinary league "Duel result" rewards.
- [ ] **NEEDS LIVE SUPABASE TEST** — after applying
  `202609011000_fix_practice_challenge_configure_rpc.sql` and
  `202609011100_fix_bo3_challenge_hardening.sql`, create a practice
  challenge of each wager type (none/DP/card) from one test account
  to another and confirm each one succeeds where it previously
  failed outright.
- [ ] **NEEDS HUMAN UI TEST** — full BO3 lifecycle for all 3 wager
  types: create → accept → play → submit result → confirm DP/card
  actually moves the right direction, confirm the DP wallet shows
  the new "Challenge stake/winnings" labels, confirm cancelling a
  pending challenge releases nothing (nothing was ever taken, by
  design after the reorder fix) and declining behaves the same way.
- [ ] **NEEDS HUMAN UI TEST** — attempt to stake a second card on the
  same challenge from the same side and confirm it is now rejected
  with a clear error instead of silently succeeding.

## 4. Match / round / competition flow

- [x] **VERIFIED LOCALLY — BUG FIXED** — the bye player (this
  format's every-round occurrence — 3 players, 1 match, 1 bye) was
  rendering as "Unknown Duelist" in the post-match settlement
  summary essentially every round, because
  `buildMatchSettlementSummary()`'s profile lookup only fetched the
  two match participants, not every registered `competition_players`
  row. Fixed to fetch all registered competition players (unioned
  defensively with the two match participants).
- [x] **VERIFIED LOCALLY** — added a "`<completed>`/`<total>` duels
  done" counter and a bye-player indicator chip to each round's
  header in the V2 round view — previously a bye had no on-screen
  sign anything happened that round.
- [x] **VERIFIED LOCALLY** — season/rerun safety re-checked against
  everything added since the season-reset migration
  (`202608231520_season_reset.sql`) was written: the later
  `competition_round_reward_rules` / `competition_round_reward_grants`
  tables both use `on delete cascade` back to `competitions`, so
  `reset_duelist_circle_season()`'s existing `delete from
  competitions` still correctly clears them with no FK-violation
  risk, even though the reset function predates those tables and
  never explicitly lists them. No blocker found; no change needed.
- [ ] **NEEDS HUMAN UI TEST** — play a full round-robin round (1
  match + 1 bye) and confirm the post-match summary correctly names
  every player, including the bye, with no "Unknown Duelist"
  anywhere.
- [ ] **NEEDS HUMAN UI TEST** — mid-round, confirm the new "X/Y duels
  done" counter and bye chip render correctly and update once the
  round's one match is submitted.

## 5. Mobile-first layout pass

- [x] **VERIFIED LOCALLY** — bottom nav: "PROFILE" (the longest of 7
  labels) could wrap onto two lines at 375px with no
  `whitespace-nowrap` guard, breaking that item's alignment with its
  siblings. Fixed with tighter tracking, a slightly smaller size, and
  a hard `whitespace-nowrap` guarantee for all 7 labels.
- [x] **VERIFIED LOCALLY** — competition standings table: a
  hardcoded `min-w-[650px]` plus 20px cell padding on all 7 columns
  forced horizontal scroll on every phone regardless of the table's
  actual (tiny, 3-row) content. Removed the arbitrary min-width and
  tightened padding below the `sm` breakpoint; `overflow-x-auto`
  stays only as a safety net for an unusually long name.
- [x] **VERIFIED LOCALLY** — legacy (non-V2) match-list card: the
  player-names line had no `min-w-0`/`truncate` guard, so a long
  duelist name could force the flex row (and the whole page) to
  scroll sideways. Fixed.
- [ ] **NEEDS HUMAN UI TEST** — on an actual phone (or a 375px
  browser viewport at minimum), confirm: the bottom nav shows all 7
  labels on one line each; the competition standings table needs no
  horizontal scroll; Home, Round view, Standings, and Shop all
  render without any horizontal page scroll.
- [ ] **NOT DONE — lower priority, time-permitting only per the
  sprint's own priority order** — a dedicated Home/Dashboard
  next-match/round/packs widget (DP balance currently sits further
  down the page than ideal) was flagged by the mobile audit but not
  built this session; Wallet/Archetype-registry-exposure/Achievements
  polish were likewise not reached.

## 6. Static verification suite (this session, final pass)

- [x] **VERIFIED LOCALLY** — `npm run typecheck` — clean, zero errors,
  run after every code change this session and again as a final
  pass with everything applied.
- [x] **VERIFIED LOCALLY** — `npm run lint` — clean, zero
  warnings/errors, same cadence as typecheck.
- [x] **VERIFIED LOCALLY** — `npm run check:sql` — clean across every
  `.sql` file in `supabase/migrations/` and
  `scripts/generated/`.
- [ ] **BLOCKED, NOT FIXABLE FROM THIS SESSION** — `npm test`
  (vitest) fails with `Cannot find module
  '@rollup/rollup-linux-arm64-gnu'`, a known npm optional-dependency
  resolution bug on this machine's arm64 Mac, unrelated to any change
  made this session or in prior sessions. `npm install --no-save
  @rollup/rollup-linux-arm64-gnu` was attempted and failed with `403
  Forbidden` (no npm registry access from the sandboxed environment
  this fix was written in). **On the actual Mac, with real internet
  access, try:** `npm install --no-save
  @rollup/rollup-linux-arm64-gnu`, or delete `node_modules` and
  `package-lock.json` and reinstall, or pin `rollup` to a version
  without this optional-dependency split. Until resolved,
  `npm run typecheck` / `npm run lint` / `npm run check:sql` are the
  only automated checks available, and every fix above was verified
  by direct code reading against them, not by running the existing
  unit test suite.

## 7. Deployment — how to actually roll this out

- [x] **DECIDED, this session (no rollout file needed)** — Phase 2,
  Phase 3, and this session's two new fix migrations
  (`202609011000_fix_practice_challenge_configure_rpc.sql`,
  `202609011100_fix_bo3_challenge_hardening.sql`) are **not** merged
  into `scripts/generated/LIVE_PHASE1_ROLLOUT_2026_08_31.sql` or a
  new combined rollout file. Reasoning: `supabase db push` (the
  documented default path in `docs/SEASON_1_RUNBOOK.md`) already
  applies every file in `supabase/migrations/` in filename order
  correctly and mechanically. Phase 1 needed a hand-assembled rollout
  for a specific, named reason (a legacy seed-generator dependency
  ordering incident); nothing here has that problem. Every manual
  assembly step is itself a source of risk — this session's own
  headline bug (the FOREACH...SLICE fix) existed only in a
  hand-regenerated section of that same rollout file, and a
  transcription slip earlier this session silently corrupted a file
  being hand-copied to the device (caught only by an MD5 check) —
  so the mechanical path is preferred wherever nothing forces the
  manual one.
- [ ] **NEEDS LIVE SUPABASE TEST** — run `supabase db push` (or, if
  not using the CLI, paste each new migration file's contents into
  the Supabase Dashboard SQL Editor **in filename order**):
  `202608311100` → `202608311200` → `202608311300` → `202608311400`
  → `202609010900` → `202609011000` → `202609011100`. Confirm each
  applies without error before moving to the next.
