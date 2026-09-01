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
filename order, including every migration listed below. This is the same
method `docs/SEASON_1_RUNBOOK.md` recommends and avoids the large-paste
issue entirely (each migration is pushed as its own file).

**2026-09-02 update:** the table and `pbcopy` list below originally
stopped at file #14 (`202609012110_final_rarity_distribution_fix.sql`)
even though 11 more migrations already existed in the repo at that point
(#15-20, from the trading/wishlist/achievements/season-reset/draft-start
work) or were added by the Season 1 audit-and-repair pass that day
(#21-25: Dark Magician/Cubic route data fix, the welcome-pack RPC, the
Shop Boss-Route-exclusion fix, and the Special Pack curated-pool rebuild
in two parts). `supabase db push` was never affected by this gap (it
always applies every file in the folder regardless of what this doc
lists) - only the manual-paste fallback path was missing these. Rows
15-25 below close that gap.

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
| 15 | `202609012200_card_wishlist.sql` | 185 | Card wishlist ("Wanted By" / "From You") | Yes |
| 16 | `202609012300_trade_offer_expiry.sql` | 672 | 24h trade-offer expiry enforcement | Yes |
| 17 | `202609012400_p2w_achievements.sql` | 568 | The 7 final P2W achievement claims (approval-gated, cadence-enforced) | Yes |
| 18 | `202609012500_seed_manual_rarity_override_ancient_gear_beast.sql` | 62 | Ancient Gear Beast manual rarity anchor fix | Yes |
| 19 | `202609020900_season_reset_apply_achievement_claims_fix.sql` | 326 | Season-reset FK fix for `achievement_claims` | Yes |
| 20 | `202609020901_start_personal_initial_draft.sql` | 194 | **Adds `start_personal_initial_draft()`** — the self-service Initial Draft starter the client already calls; without this file, tapping "Start Draft" raises a Postgres "function does not exist" error | Yes |
| 21 | `202609020910_fix_dark_magician_and_cubic_route_data.sql` | 156 | *(Season 1 audit)* Corrects the Dark Magician route's Stage 1-4 chain to match the live manual fix (Berry Magician Girl → Dark Magician Girl → Dark Magician of Chaos → The Dark Magicians) and adds the missing Cubic Stage 4 support card | Yes |
| 22 | `202609020920_claim_welcome_packs.sql` | 138 | *(Season 1 audit)* Adds `claim_welcome_packs()` — grants each league member's one-time Season 1 welcome bonus (1 Normal + 1 Premium + 1 Deluxe voucher) idempotently | Yes |
| 23 | `202609020930_fix_shop_pack_boss_route_exclusion.sql` | 340 | *(Season 1 audit)* Closes the gap where Shop pack pulls could hand out a Boss Route's evolution monster or exclusive support before it was earned | Yes |
| 24 | `202609020940_special_pack_curated_pools_schema.sql` | 778 | *(Season 1 audit)* **Special Pack rebuild, part 1** — 15 fixed curated pack identities + their snapshotted card pools | Yes |
| 25 | `202609020950_special_pack_curated_pools_functions.sql` | 460 | *(Season 1 audit)* **Special Pack rebuild, part 2** — switches pack pulls and rotation refresh over to the curated pools from #24 | Yes |

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
pbcopy < supabase/migrations/202609012200_card_wishlist.sql
pbcopy < supabase/migrations/202609012300_trade_offer_expiry.sql
pbcopy < supabase/migrations/202609012400_p2w_achievements.sql
pbcopy < supabase/migrations/202609012500_seed_manual_rarity_override_ancient_gear_beast.sql
pbcopy < supabase/migrations/202609020900_season_reset_apply_achievement_claims_fix.sql
pbcopy < supabase/migrations/202609020901_start_personal_initial_draft.sql
pbcopy < supabase/migrations/202609020910_fix_dark_magician_and_cubic_route_data.sql
pbcopy < supabase/migrations/202609020920_claim_welcome_packs.sql
pbcopy < supabase/migrations/202609020930_fix_shop_pack_boss_route_exclusion.sql
pbcopy < supabase/migrations/202609020940_special_pack_curated_pools_schema.sql
pbcopy < supabase/migrations/202609020950_special_pack_curated_pools_functions.sql
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

Run in the SQL Editor after all 14 files succeed (the original 1-14; see the audit addendum below for #21-25):

```sql
-- Boss Route content landed completely
select count(*) from public.boss_routes;                        -- expect 20
select count(*) from public.boss_route_stages;                  -- expect 80
select count(*) from public.boss_route_stage_grants;             -- expect 244 (240 original + 4 from #21's Dark Magician/Cubic data fix)
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

**2026-09-02 audit addendum — verify files #21-25 too:**

```sql
-- Dark Magician route now reads Berry Magician Girl -> Dark Magician
-- Girl -> Dark Magician of Chaos -> The Dark Magicians (expect 4 rows,
-- stage_number 1-4 in that evolution-card order)
select s.stage_number, c.name
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
join public.card_catalog c on c.id = s.evolution_card_catalog_id
where r.code = 'dark_magician'
order by s.stage_number;

-- claim_welcome_packs() and the Special Pack rebuild functions/tables exist
select proname from pg_proc
  where proname in (
    'claim_welcome_packs', 'pick_shop_pack_card',
    'refresh_shop_special_pack_rotation_if_needed'
  );                                                              -- expect 3 rows

select count(*) from public.shop_special_pack_definitions;        -- expect 15
select count(*) from public.shop_special_pack_pool_cards;         -- expect roughly 3,000-3,500 (15 packs x ~200-290 curated cards each)

-- No curated pack pool should be empty or wildly undersized
select d.name, count(p.id) as pool_size
from public.shop_special_pack_definitions d
left join public.shop_special_pack_pool_cards p on p.pack_definition_id = d.id
group by d.name
order by pool_size asc;
```

**STOP if:** the Dark Magician chain isn't Berry → Dark Magician Girl →
Dark Magician of Chaos → The Dark Magicians in that stage order, any of
the 3 functions is missing, `shop_special_pack_definitions` isn't exactly
15 rows, or any pack's `pool_size` reads 0.

---

## 3. Resetting gameplay progress (NOT the same as "starting the real season" — read this before running anything here)

**Season 1 already went live for real on 2026-09-01**, before this
section's two scripts were reconciled. The real accounts (bossg, samo,
fardin — the old test accounts were deleted first) already have real
progress: completed Initial Drafts, chosen Boss Routes (including a
live-corrected Dark Magician route with cards already granted), and
welcome-bonus vouchers. **Do not run either script below against the
current live league** unless you specifically intend to erase that
progress — neither script "starts" anything that hasn't already started.
This section previously called the accounts-PRESERVING script "Starting
the REAL season," which read as a required one-time step; it wasn't, and
running it now would wipe bossg/samo/fardin's real progress. The two
scripts below are kept for two different FUTURE situations, not as steps
to run tonight:

- **`scripts/generated/RESET_LEAGUE_FOR_REAL_START.sql`** — wipes every
  gameplay artifact (matches, drafts, decks, owned cards, DP balances,
  Legendary Luck pity, and Boss Route progress — but not the 20 Boss
  Routes themselves, which are config) while **preserving accounts,
  league membership, and the cardpool**. Use this only if bossg/samo/
  fardin ever need a full gameplay restart on their SAME 3 accounts
  (e.g. re-running Season 1 from scratch by agreement). Read the giant
  warning at the top of that file first.
  ```bash
  pbcopy < scripts/generated/RESET_LEAGUE_FOR_REAL_START.sql
  ```
  It self-verifies with `raise notice`/`raise exception` and rolls back
  the whole transaction if anything preserved unexpectedly changed or
  anything gameplay-related still has rows at the end. Re-runnable, not
  a one-shot.

- **`scripts/season-reset.mjs`** (documented in full in
  `docs/SEASON_1_RUNBOOK.md`, Phase E) — the accounts-DELETING flow:
  wipes gameplay data AND deletes the login accounts themselves. This is
  what was actually used, once, for the real 2026-09-01 transition from
  test accounts to bossg/samo/fardin. Use this only for a genuine future
  Season 2 / new-roster restart, never against the current 3 real
  accounts unless you mean to remove them. Always run
  `npm run season:reset` (dry run) before `npm run season:reset:apply`.

---

## 4. First click-flow (all 3 players, after the reset)

**2026-09-02 audit correction:** this list previously had Draft before
Boss Path and described Draft as admin-started — both were stale. The
mandatory onboarding order (enforced automatically by `proxy.ts` on every
request, and by `start_personal_initial_draft()`) is Boss Path **then**
Draft, and both are self-service per player, not admin-run:

1. **Log in.** DP balances start at 0, Legendary Luck pity is 0, no cards,
   no decks — a clean slate. Landing on any page automatically redirects
   you to the next required onboarding step below — there is nothing an
   admin needs to trigger.
2. **Choose a Boss Path.** Redirected to `/boss/select?slot=1` until you
   pick one. Each player picks their first route for free — Stage 1's
   evolution monster and its support cards land in their collection
   immediately.
3. **Initial Draft.** Redirected to `/draft` next. Each player starts
   and completes their own personal Initial Draft independently (60 Main
   + 2 Fusion + 2 Xyz picks) — there is no shared/admin-run draft session
   to wait on.
4. **Build a deck**, including your Boss Path's Stage 1 card if you want
   to run it right away.
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
