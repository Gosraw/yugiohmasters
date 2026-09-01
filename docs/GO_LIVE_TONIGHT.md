# GO LIVE TONIGHT — Duelist Circle Deploy Runbook

**Date:** 2026-09-01
**Scope:** Deploying everything built in this sprint (tasks 133–144: final
cardpool calibration, rarity/pack-size lock-in, the Legendary Luck pity
system, draft fairness fixes, and the full 20-route Boss Path system) and
starting the real season tonight.

Read this top to bottom before touching Supabase. Every phase has a
**STOP condition** — if you hit it, stop and don't continue until it's
resolved.

---

## 0. Before you start

- Make sure `.env.local` has real credentials (`NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `..._ANON_KEY`,
  `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`).
- Take a Supabase backup/snapshot first if your plan supports it. None of
  tonight's steps were run against live Supabase from this sandbox — it
  has no network access to your project at all — so tonight is the first
  time any of this touches a real database.
- If Phase 1 (`scripts/generated/phase1_sections/`) and Phase 2
  (`scripts/generated/LIVE_PHASE2_ROLLOUT_2026_08_31.sql`) from the
  earlier build-first sprint haven't been applied to your Supabase
  project yet, apply those first — see `docs/SEASON_1_RUNBOOK.md` and
  `docs/HANDOFF_2026-09-01_buildfirst_launch_sprint.md`. Everything below
  assumes those are already live.

---

## 1. Deploy tonight's migrations

**Preferred: Supabase CLI.**

```bash
supabase db push
```

This applies every not-yet-applied file in `supabase/migrations/` in
filename order, including all 14 new ones below. This is the same method
`docs/SEASON_1_RUNBOOK.md` recommends and avoids the large-paste issue
entirely (each migration is pushed as its own file).

**Fallback: manual paste**, one file at a time, into the Supabase SQL
Editor, in this exact order (`pbcopy` shown for macOS):

| # | File | Lines | What it does | Re-run safe? |
|---|------|------:|---------------|:---:|
| 1 | `202609010900_phase3_prelaunch_pack_sizes_and_peak_rarity.sql` | 1,051 | Pre-launch pack size / peak-rarity odds pass | Yes |
| 2 | `202609011000_fix_practice_challenge_configure_rpc.sql` | 119 | Practice challenge config RPC fix | Yes |
| 3 | `202609011100_fix_bo3_challenge_hardening.sql` | 393 | BO3 challenge hardening fix | Yes |
| 4 | `202609011200_cardpool_final_calibration_includes_excludes.sql` | 138 | Final cardpool includes/excludes | Yes |
| 5 | `202609011300_final_pack_sizes_and_peak_odds.sql` | 229 | Final pack sizes + peak odds | Yes |
| 6 | `202609011400_final_legendary_luck_pity_system.sql` | 654 | Legendary Luck pity system (replaces old streak-pity) | Yes |
| 7 | `202609011500_final_draft_fairness_and_legendary_exclusion.sql` | 1,542 | Draft fairness soft-correction + deterministic Fusion/Xyz targeting | Yes |
| 8 | `202609011600_boss_route_schema.sql` | 512 | Boss Route schema (8 new tables) | Yes |
| 9 | `202609011700_draft_boss_route_exclusion.sql` | 1,568 | Excludes Boss Route cards from the draft pool | Yes |
| 10 | `202609011800_boss_route_stage_grants_quantity.sql` | 45 | Adds multi-copy support to stage grants (e.g. Toon World ×2) | Yes |
| 11 | `202609011900_seed_boss_routes.sql` | 4,737 | **Seeds all 20 Boss Routes** (231 KB — see note below) | Yes |
| 12 | `202609012000_boss_route_rpcs.sql` | 906 | Boss Route RPCs (choose/unlock/evolve/confirm) | Yes |
| 13 | `202609012100_apply_final_season1_rarities.sql` | 315 | **Applies the Sep 1 rarity-engine recalibration** to the eligible Classic pool (275 cards; preserves all 15 manual overrides) — run this before §3's reset so the real season starts with final rarities | Yes |
| 14 | `202609012110_final_rarity_distribution_fix.sql` | 6,165 | **Supersedes #13 with the flattened final-sprint distribution** (Normal 1893 / Rare 1519 / Super 1412 / Ultra 1112 / Secret 199 / Legendary 46; 16 manual overrides incl. Ancient Gear Beast→Ultra) — run this immediately after #13, still before §3's reset | Yes |

Every file is idempotent by construction (`create or replace function`,
`create table if not exists`, `on conflict do update`, or plain `update`
statements) — re-running any of them after a partial failure is safe.

```bash
pbcopy < supabase/migrations/202609010900_phase3_prelaunch_pack_sizes_and_peak_rarity.sql
pbcopy < supabase/migrations/202609011000_fix_practice_challenge_configure_rpc.sql
pbcopy < supabase/migrations/202609011100_fix_bo3_challenge_hardening.sql
pbcopy < supabase/migrations/202609011200_cardpool_final_calibration_includes_excludes.sql
pbcopy < supabase/migrations/202609011300_final_pack_sizes_and_peak_odds.sql
pbcopy < supabase/migrations/202609011400_final_legendary_luck_pity_system.sql
pbcopy < supabase/migrations/202609011500_final_draft_fairness_and_legendary_exclusion.sql
pbcopy < supabase/migrations/202609011600_boss_route_schema.sql
pbcopy < supabase/migrations/202609011700_draft_boss_route_exclusion.sql
pbcopy < supabase/migrations/202609011800_boss_route_stage_grants_quantity.sql
pbcopy < supabase/migrations/202609011900_seed_boss_routes.sql
pbcopy < supabase/migrations/202609012000_boss_route_rpcs.sql
pbcopy < supabase/migrations/202609012100_apply_final_season1_rarities.sql
pbcopy < supabase/migrations/202609012110_final_rarity_distribution_fix.sql
```

Run each `pbcopy`, paste into the SQL Editor, run it, confirm it succeeds,
then move to the next line.

**⚠️ File 11 (`seed_boss_routes.sql`) is 231 KB** — the closest any file in
this repo has come to the ~300 KB paste that failed with the "Skyscraper"
error during Phase 1 (`scripts/generated/phase1_sections/README.md` has
the full story). If it fails with a similar `relation "..." does not
exist` error on a name that's clearly inside a quoted string, that's the
same paste-size issue, not a SQL bug — prefer `supabase db push` for this
file specifically rather than re-pasting it repeatedly.

**STOP if:** any migration errors. Don't edit an already-applied
migration to "fix" it — copy the exact error and get it looked at first.

---

## 2. Essential verification (read-only)

Run in the SQL Editor after all 12 files succeed:

```sql
-- Boss Route content landed completely
select count(*) from public.boss_routes;                        -- expect 20
select count(*) from public.boss_route_stages;                  -- expect 80
select count(*) from public.boss_route_stage_grants;             -- expect 240
select count(*) from public.boss_route_achievement_events;       -- expect 60
select count(*) from public.boss_route_achievement_requirements; -- expect 100

-- Every stage's evolution card and every support grant resolved to a
-- real card_catalog row (should return 0 rows both times)
select s.* from public.boss_route_stages s
  left join public.card_catalog c on c.id = s.evolution_card_catalog_id
  where c.id is null;

select g.* from public.boss_route_stage_grants g
  left join public.card_catalog c on c.id = g.card_catalog_id
  where c.id is null;

-- The 4 Boss Route RPCs exist
select proname from pg_proc
  where proname in (
    'choose_boss_path', 'unlock_second_third_boss_path',
    'evolve_boss_stage', 'confirm_boss_achievement_event'
  );                                                              -- expect 4 rows

-- Legendary Luck pity table exists and starts empty/zeroed
select count(*) from public.player_pack_luck;
```

**STOP if:** any count is off, any join returns rows, or any RPC is
missing — that means a migration silently didn't apply cleanly even
though the editor reported success.

---

## 3. Starting the REAL season (run once, when everyone is ready)

`scripts/generated/RESET_LEAGUE_FOR_REAL_START.sql` wipes every
test-run gameplay artifact (matches, drafts, decks, owned cards, DP
balances, Legendary Luck pity, **and Boss Route progress** — but not the
20 Boss Routes themselves, which are config) while preserving accounts,
league membership, and the cardpool. Read the giant warning at the top of
that file first.

```bash
pbcopy < scripts/generated/RESET_LEAGUE_FOR_REAL_START.sql
```

Paste and run it once, only when you're actually ready to start the real
season — not before, and not more than once per season. It self-verifies
with `raise notice`/`raise exception` and rolls back the whole transaction
if anything preserved unexpectedly changed or anything gameplay-related
still has rows at the end.

---

## 4. First click-flow (all 3 players, after the reset)

1. **Log in.** DP balances start at 0, Legendary Luck pity is 0, no cards,
   no decks — a clean slate.
2. **Draft.** An admin starts the league draft the same way as before
   (unchanged this sprint aside from the fairness/exclusion fixes below);
   all 3 players complete their picks.
3. **Choose a Boss Path.** From `/explore`, tap **Boss Path** (or go
   directly to `/boss`). Each player picks their first route for free —
   Stage 1's evolution monster and its support cards land in their
   collection immediately.
4. **Build a deck**, including the Stage 1 Boss card if you want to run
   it right away.
5. **Play duels as normal.** After a match is confirmed, the confirming
   player will see checkboxes for the other player's Boss Route
   achievements if any apply — check only what you actually witnessed.
6. **Evolve stages, unlock more Boss Path slots (7,000 / 10,000 DP), and
   repeat** as DP and achievements allow. `/boss/[pathId]` shows exactly
   what's needed for the next stage.

Note for the draft: this sprint's fairness fix nudges Secret/Ultra Rare
offers toward whoever has been offered fewer of them so far, and Boss
Route cards (evolution monsters + exclusive support) never appear in the
draft pool at all — they're only obtainable through the Boss Path system.

---

## 5. Known caveats going in

- **Boss Route card substitutions.** All 20 routes' card lists were
  authored and validated against the real card catalog this sprint (see
  `data/boss-route-registry.mjs`'s header for the full list of
  name/mechanic corrections). If a route's flavor feels slightly off from
  what you originally had in mind for a specific card, that's the reason
  — nothing was left unvalidated or guessed at runtime.
- **Rarity recalibration** from earlier in this build (~300 Secret /
  25–35 Legendary target) has not been re-verified against a live full
  catalog pull in this sandbox (no network access) — worth a spot-check
  against `reports/card-valuation/` once real data is flowing.
- **Balance is a first pass.** Achievement thresholds (3 / 10 / 1 / 22 / 2
  events) and the 900/1400/2400/7000/10000 DP economy are deliberately
  uniform across all 20 routes for a playable first season. If something
  feels too easy or too grindy in actual play, that's expected — tune it
  after a few real matches, not before.
- **Sandbox limitations, not app bugs:** `next build` and `npm test`
  both fail in this specific sandbox on missing native ARM64 binaries
  (SWC, Rollup) unrelated to any code in this repo. Every change this
  sprint was verified with `tsc --noEmit`, `eslint`, and
  `npm run check:sql` instead (all clean) — a real dev machine or CI
  runner should run the full build/test suite once before relying solely
  on this doc.

---

## 6. If something goes wrong mid-deploy

- A single migration failing only rolls back that one file (each is its
  own transaction) — everything applied before it stays applied. Fix the
  reported error, then re-run just that file.
- If you need to back out of tonight's Boss Route rollout entirely before
  starting the real season, the 5 Boss Route config tables and the 4 RPCs
  can be dropped without touching anything else (they don't get read by
  any other system until a player actually calls `choose_boss_path`).
- The reset script (§3) is safe to run again later in the season if you
  ever need another full restart — it was written to be re-runnable, not
  a one-shot.
