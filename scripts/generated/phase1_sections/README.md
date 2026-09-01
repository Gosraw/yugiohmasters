# Phase 1 Deployment — Section-by-Section Files

## Why this directory exists

The combined `scripts/generated/LIVE_PHASE1_ROLLOUT_2026_08_31.sql`
(~300KB, 5,467 lines) failed when pasted into the Supabase SQL Editor
with:

```
ERROR: 42P01: relation "Skyscraper" does not exist
```

An exhaustive investigation (custom SQL tokenizer trace, the
project's `check:sql` quote-balance guard, the archetype-registry
generator's own self-test and regression suite, and a byte-for-byte
diff against a freshly regenerated migration) found **no
quote-corruption bug anywhere in the committed source** — every
occurrence of `Skyscraper` in the source is correctly inside a
single-quoted string literal. A prior session independently reached
the same conclusion. The leading remaining hypothesis is that the
Supabase SQL Editor's paste/clipboard path mishandled the very large
(~300KB) combined paste — not that the SQL itself is wrong.

**The fix here is not a code change — it's this directory.** Splitting
Phase 1 into 9 much smaller, independently-pasteable files removes
the large-paste variable entirely. Each file below is byte-identical
to its already-committed, already quote-safety-checked source
migration (verified by diff — see the section table), just wrapped in
its own `begin;`/`commit;` instead of sharing one giant transaction.

## Execution order

Paste and run these ONE AT A TIME, in this exact order, into the
Supabase SQL Editor. Each is its own transaction: if one fails, only
that file rolls back — everything already applied by earlier files
stays applied.

| # | File | Contains Skyscraper? | Idempotent / safe to re-run? | Depends on |
|---|------|----------------------|-------------------------------|------------|
| 01 | `01_manual_rarity_overrides_round2.sql` | No | Yes | none |
| 02 | `02_legacy_2015_2018_whitelist.sql` | No | Yes (self-no-ops if `duelist_circle_classic_v1` doesn't exist yet, via its own RAISE NOTICE) | none |
| 03 | `03_archetype_registry_schema.sql` | No | Yes (`CREATE TABLE IF NOT EXISTS`) | none |
| 04 | `04_archetype_registry_seed_CONTAINS_SKYSCRAPER.sql` | **YES — this is the file** | Yes (`ON CONFLICT DO NOTHING`/`DO UPDATE`) | 03 |
| 05 | `05_round_reward_settlement_and_auto_finalize.sql` | No | Yes | existing competitions/matches schema (already live) |
| 06 | `06_round_reward_economy_correction.sql` | No | Yes (UPDATE only touches rows matching the old placeholder values) | 05 |
| 07 | `07_legendary_league_wide_scarcity.sql` | No | Yes (`CREATE OR REPLACE FUNCTION`) | existing shop schema (already live) |
| 08 | `08_phase1_verify_introspect_helper.sql` | No | Yes | none |
| 09 | `09_final_verification.sql` | No | Yes (read-only assertions) | **run LAST, after 01–08 all succeed** |

## How to copy each file (macOS `pbcopy`)

Run from the repo root, one line per file, then paste into the SQL
Editor and run before moving to the next:

```bash
pbcopy < scripts/generated/phase1_sections/01_manual_rarity_overrides_round2.sql
pbcopy < scripts/generated/phase1_sections/02_legacy_2015_2018_whitelist.sql
pbcopy < scripts/generated/phase1_sections/03_archetype_registry_schema.sql
pbcopy < scripts/generated/phase1_sections/04_archetype_registry_seed_CONTAINS_SKYSCRAPER.sql
pbcopy < scripts/generated/phase1_sections/05_round_reward_settlement_and_auto_finalize.sql
pbcopy < scripts/generated/phase1_sections/06_round_reward_economy_correction.sql
pbcopy < scripts/generated/phase1_sections/07_legendary_league_wide_scarcity.sql
pbcopy < scripts/generated/phase1_sections/08_phase1_verify_introspect_helper.sql
pbcopy < scripts/generated/phase1_sections/09_final_verification.sql
```

## If a file fails

- **01, 02, 03, 05, 06, 07, 08**: each is a single self-contained
  transaction. A failure rolls back only that file — nothing else is
  affected. Fix the reported error and re-run the same file (all are
  safe to re-run).
- **04 (the Skyscraper file)**: if this one fails again even pasted
  alone, that is new information — it would mean the failure is not a
  large-paste issue after all, and is worth reporting back with the
  exact error text. Do not re-run it repeatedly hoping it passes;
  capture the exact error and stop.
- **09**: only run this after 01–08 have all succeeded. If it raises
  an exception, it means one of 01–08 did not fully apply as expected
  — re-check which file's target it names in the error (it names the
  specific missing table/function/index/row-count) and re-run that
  file, not 09 itself.

## What was NOT changed

No cardpool, rarity, archetype membership, or economy value was
touched to build this split — every numbered file's SQL body is
byte-identical to its already-committed, already-reviewed migration
(confirmed by diff during this session). The only additions are: a
documentation header per file, and `begin;`/`commit;` wrapping for
file 07 (whose source migration had none) and file 09 (extracted from
the combined rollout's own tail).

The original combined file, `LIVE_PHASE1_ROLLOUT_2026_08_31.sql`, is
left in place for reference / as a single-paste option if the
Supabase SQL Editor's paste limits turn out not to be the actual
issue — but pasting the 9 files above, in order, is now the
recommended deployment path.
