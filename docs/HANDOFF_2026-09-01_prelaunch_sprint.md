# Duelist Circle — Final Pre-Launch Sprint Handoff

Session: "DUELIST CIRCLE — FINAL PRE-LAUNCH AUTONOMOUS RELEASE SPRINT",
completed 2026-09-01. Written so a future session (human or AI) can
continue without re-discovering anything below from scratch.

## 1. Mission and constraints going in

The directive: prepare this repo for real 3-player use starting
"tomorrow." Work autonomously through the full session without
stopping for approval. Explicit scope limits: fix the existing BO3
challenge system, do not rebuild it; fix the existing pack economy to
a newly human-approved spec, do not redesign the season/rerun model;
no decorative/documentation-only/speculative work; produce this report
plus `docs/PRELAUNCH_CHECKLIST.md` at the end.

## 2. Starting state (already done before this window began)

Two prior commits landed at the very start of this window, both
preserving/fixing work that existed before this session's own new
work: `6cfea60` (Phase 2 economy centralization — config, round
rewards, pack prices, special rotation, legendary odds) and `812efff`
(the original Phase 1 live rollout package). The Phase 1 rollout had
a concrete, named blocker at that point — see #3.

## 3. Phase 1 blocker — fixed (commit `4a64f8a`)

Root cause: `v_card` in
`supabase/migrations/202608301200_seed_2015_2018_legacy_support_whitelist.sql`
was declared `record`, used in `foreach v_card slice 1 in array
v_cards` over a `text[][]` source. Postgres requires a SLICE loop
variable to be an array type — this fails at runtime with error 42804,
only detectable by actually running the SQL. Fixed the declaration to
`text[]`, regenerated the matching section of
`scripts/generated/LIVE_PHASE1_ROLLOUT_2026_08_31.sql`, and added a
permanent static guard for this exact bug class:
`scripts/check-plpgsql-foreach-slice.mjs` (`npm run check:sql`),
confirmed this was the only FOREACH...SLICE occurrence anywhere in the
migrations tree.

## 4. Phase 3 — final pack economy rebuild (commit `df63609`)

New human-approved spec: pack sizes Standard 5 / Premium 7 / Special 7
/ Deluxe 10, and a **pack-level "peak rarity"** model — exactly one
random roll per pack purchase decides the pack's single most exciting
card (Legendary/Secret/Ultra/Super/none) at an exact, mutually
exclusive percentage per tier, replacing the old per-card-independent
model (which multiplicatively over-produced top-tier hits as pack size
grew, worsened further by an always-on "guaranteed floor card"
mechanic). Every non-peak slot draws only Normal/Rare, so it can never
independently reproduce a top-tier hit. Implemented in
`supabase/migrations/202609010900_phase3_prelaunch_pack_sizes_and_peak_rarity.sql`
(1051 lines) via two new functions, `roll_shop_pack_peak_rarity()` and
`roll_shop_pack_filler_rarity()`, wired into a reissued
`purchase_shop_pack()`. Also fixed the Shop UI's 3rd Special Pack
category (Monster Type), which the API already supported but 4
different files each independently hardcoded a 2-category assumption.
League-wide Legendary uniqueness is architecturally untouched by any
of this (confirmed by reading the trigger, not assumed).

## 5. BO3 Challenge system — audited then fixed (commits `2aa1987`, `4f39c71`)

Three read-only audit subagents ran in parallel (BO3 challenges,
match/round/competition flow, mobile layout). The single most severe
finding: **every practice/BO3 challenge of every wager type
(Free/DP/Card) was completely broken at creation** —
`createMatchChallenge()` called `.from("matches").update(...)`
directly, but `202608190010_matches.sql` revokes update on
`public.matches` from `authenticated` with no compensating RLS policy
("Alle mutations via RPC."). Fixed with a new security-definer RPC,
`configure_practice_challenge()`
(`supabase/migrations/202609011000_fix_practice_challenge_configure_rpc.sql`),
following the exact pattern of every sibling match RPC. Four more
real bugs found and fixed in
`supabase/migrations/202609011100_fix_bo3_challenge_hardening.sql` and
`src/app/actions/matches.ts`:

- Accept-flow order bug: DP funding / card locking ran BEFORE the
  Active Ready deck check, so a failed deck check could leave DP
  already deducted or a card already locked with no rollback.
  Reordered so the check-that-can-fail-for-unrelated-reasons runs
  first.
- `add_match_wager_card()` had no per-side card limit (the UI models
  exactly one staked card per player; a second one was silently
  accepted and invisible in the UI) and no league-scoping check on
  the staked card. Both added.
- `accept_match_challenge()` / `decline_match_challenge()` /
  `cancel_match_challenge()` had no `for update` row lock, unlike
  every sibling RPC — a race window for concurrent accept/cancel.
  Added.
- Wallet ledger: `practice_wager_stake/win/refund` had no label,
  falling back to the raw reason string. Added "Challenge stake" /
  "Challenge winnings" / "Challenge stake refunded" labels, visually
  distinct from ordinary "Duel result" rewards
  (`src/app/(app)/wallet/page.tsx`).

## 6. Match/round/competition flow — audited then fixed (commit `2aa1987`, `ca25115`)

Second-most severe finding: the bye player (this format's
every-single-round occurrence — 3 players, 1 match, 1 bye) rendered as
"Unknown Duelist" in the post-match settlement summary on essentially
every round, because `buildMatchSettlementSummary()`
(`src/lib/match-settlement-summary.ts`) only fetched profiles for the
two match participants, not every registered `competition_players`
row (round/competition rewards can include players outside the
current match). Fixed. Also added a "`<completed>`/`<total>` duels
done" counter and a bye-indicator chip to each round's header in the
V2 round view (`src/app/(app)/competitions/[id]/page.tsx`) — a bye
previously had zero on-screen acknowledgment.

## 7. Mobile-first pass — audited then fixed (commit `ca25115`)

Three concrete bugs fixed, not a redesign: the bottom nav's longest
label ("PROFILE") could wrap onto two lines at 375px with no
`whitespace-nowrap` guard; the competition standings table had a
hardcoded `min-w-[650px]` that forced horizontal scroll regardless of
its actual (tiny) content; the legacy non-V2 match-list card had no
`min-w-0`/`truncate` guard on the player-names line and could scroll
the whole page sideways on a long name.

## 8. Pack opening loop — verified, no changes needed

Traced the full path from `purchase_shop_pack()`'s new Phase 3 body
through to the reveal UI: the RPC still returns the same `uuid`
opening id it always did; `src/app/(app)/shop/opening/[id]/page.tsx`
reads `pulled_rarity` generically as a string with no coupling to the
old model; `src/components/pack-opening-reveal.tsx`'s rarity label set
(`Normal`/`Rare`/`Super Rare`/`Ultra Rare`/`Secret Rare`/`Legendary`)
exactly matches what the new roll functions return. Nothing to fix.

## 9. Rollout-file decision — keep Phase 1/2/3/fixes as separate migrations

Decided **not** to merge Phase 2, Phase 3, or this session's two new
fix migrations into `scripts/generated/LIVE_PHASE1_ROLLOUT_2026_08_31.sql`
or a new combined rollout file. `supabase db push` (the documented
default in `docs/SEASON_1_RUNBOOK.md`) already applies every file in
`supabase/migrations/` correctly and mechanically. Phase 1 needed a
hand-assembled rollout for one specific, named reason (a legacy
seed-generator dependency-ordering incident); nothing since has that
problem, and every manual assembly step is itself a proven source of
risk this same session (see #15). Full reasoning recorded in
`docs/PRELAUNCH_CHECKLIST.md` section 7.

## 10. Rerun/season safety — checked, no blocker found

Verified `reset_duelist_circle_season()`
(`supabase/migrations/202608231520_season_reset.sql`, which predates
the round-reward-grant tables) still correctly clears
`competition_round_reward_rules`/`competition_round_reward_grants` via
their `on delete cascade` back to `competitions`, even though the
reset function's own body never explicitly lists those two tables.
Confirmed `card_instances.lock_reference_id` is a plain UUID column,
not an FK, so no constraint-violation risk from deleting matches while
wager-locked cards still reference them (they're deleted moments later
in the same transaction anyway). No changes made — nothing broken.

## 11. Test suite status

`npm run typecheck`, `npm run lint`, and `npm run check:sql` all pass
clean, re-run as a final pass after every change landed. `npm test`
(vitest) is blocked by a pre-existing, unrelated environment issue on
this machine — see #15 — and could not be run at any point this
session; every fix was instead verified by direct code reading against
the actual committed source plus the three static checks above.

## 12. Documentation produced this session

`docs/PRELAUNCH_CHECKLIST.md` (checkbox format, VERIFIED
LOCALLY/NEEDS LIVE SUPABASE TEST/NEEDS HUMAN UI TEST) and this file.
Both are genuinely new content reflecting this session's actual
changes, not restatements of older docs.

## 13. Full commit list, this session (oldest first)

- `df63609` — Phase 3 final pre-launch economy (pack sizes, pack-level
  peak rarity, 3rd Special Pack in Shop UI)
- `2aa1987` — BO3 challenge creation blocker + Unknown Duelist
  bye-player bug
- `4f39c71` — BO3 challenge accept-flow rollback bug, wager hardening,
  wallet labels
- `ca25115` — mobile layout gaps (bottom nav wrap, standings scroll,
  round info)

(`4a64f8a` and `6cfea60`, the Phase 1 fix and Phase 2 rollout, landed
at the very start of this window preserving/fixing pre-existing work —
listed here for completeness, not new work invented this session.)

Nothing has been pushed to any remote — `git push` is a deliberate
manual step for the human operator, per `docs/SEASON_1_RUNBOOK.md`
Phase I.

## 14. What was explicitly NOT done (lower priority, time-bounded out)

Per the directive's own priority order, these were correctly left
for a later pass: a dedicated Home/Dashboard next-match/round/packs
widget; Wallet page further polish beyond the label fix in #5;
Archetype registry UI exposure; a small Achievements set; Game Modes;
a Life Point calculator; a personalized "your position/next match"
callout on the competition overview page. None of these block
tomorrow's real use — they are additive UX, not correctness fixes.

## 15. Environment limitations encountered (not code bugs)

`npm test` fails everywhere this session ran with `Cannot find module
'@rollup/rollup-linux-arm64-gnu'` — a known npm optional-dependency
resolution bug on the real machine's arm64 Mac. `npm install --no-save
@rollup/rollup-linux-arm64-gnu` was attempted and failed with `403
Forbidden` (this session's sandbox has no npm registry access). This
needs to be fixed ON THE REAL MACHINE with real internet access — see
`docs/PRELAUNCH_CHECKLIST.md` section 6 for suggested fixes. Separately,
earlier in this session, manually retyping a large base64 blob from a
tool-output text into a device shell heredoc silently corrupted a file
(caught only by an MD5 mismatch) — the standard method for
transferring file content to the device for the remainder of the
session became a quoted heredoc (`cat > path << 'EOF' ... EOF`) of the
raw source text, never base64, and every transfer after that point was
verified by line-count + tail-content spot checks.

## 16. How to actually verify all of this live (in order)

1. `git log` — confirm the 4 commits in #13 are present and nothing
   unexpected is staged.
2. `supabase db push` (or paste each new/changed migration file into
   the SQL Editor in filename order — see
   `docs/PRELAUNCH_CHECKLIST.md` section 7 for the exact order).
3. `node --env-file=.env.local scripts/verify-phase3-live.mjs` —
   confirms the live pack-size/rarity-model state matches Phase 3's
   intent.
4. Work through every "NEEDS LIVE SUPABASE TEST" and "NEEDS HUMAN UI
   TEST" line in `docs/PRELAUNCH_CHECKLIST.md`, in the order they
   appear (BO3 challenges first — that was the launch-blocking one).
5. On the real Mac, try to unblock `npm test` (see #15) and, once
   unblocked, run the full existing suite once for a second opinion
   on everything above.

## 17. Recommended next-session priority order

1. Everything under `docs/PRELAUNCH_CHECKLIST.md` section 3 (BO3
   challenges) — this was completely broken before this session and
   is the highest-stakes area to re-verify live before real play
   starts.
2. Section 2 (Phase 2/3 economy) — verify a purchase of each pack tier
   actually produces the approved card count and a sane rarity mix
   over a few dozen pulls.
3. Section 4 and 5 (match/round flow, mobile) — lower risk, but still
   worth a real-phone pass before "tomorrow."
4. Only after all of the above are confirmed live: pick up the
   deliberately-deferred lower-priority polish items in section 14
   above, in whatever order the players actually want them.
