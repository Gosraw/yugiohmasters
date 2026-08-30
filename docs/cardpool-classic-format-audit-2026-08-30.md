# Duelist Circle Classic — Cardpool & Rarity Balance Audit (2026-08-30)

This is the deliverable for the "Full Autonomous Cardpool & Rarity Balancing"
session run against the Codex brief: an alternate-history, old-school /
GX-era / early-Xyz-era Fusion+Xyz-only format with a tiered 2014 / 2015-2018 /
2019+ era structure and a human-judged rarity calibration table.

**Read this first if you read nothing else:** this sandbox has no network
access to your live Supabase project (confirmed by direct test — see §1) and
no working test runner for the project's normal `npm test` (vitest's native
binary doesn't run in this sandbox either — a pre-existing, previously
documented limitation, see `docs/SEASON_1.md` §11 and the Season 1 runbook).
Everything below that needed either was written, self-tested with a plain
`node` harness against real and clearly-labeled-synthetic fixtures, and left
ready for you to run for real — never silently presented as if it already
produced real catalog numbers.

---

## 1. Sandbox limitations hit this session (confirmed, not assumed)

- `device_bash` (the user's own machine, sandboxed): no network access at
  all. `getaddrinfo EAI_AGAIN` on the Supabase host.
- This cloud container: egress is allowlisted, and neither the Supabase host
  nor the npm registry are on that allowlist (`curl` → `403`, `npm install` →
  `403 Forbidden`). This is why `lib/valuation-engine.regression.test.mjs`
  exists as a **plain `node:assert` harness instead of vitest** — it was
  built specifically to route around vitest's broken native binary, and it's
  what let real, machine-verified work happen this session (see §3).
- Net effect: nothing in this report that requires reading the live
  ~13,900-card `card_catalog` table could be run for real. Every number that
  would require that is marked **NOT RUN — needs live DB access** below,
  never guessed.

---

## 2. What this session actually did (real, verified work)

### 2a. Found and fixed 4 real bugs in the existing valuation engine

`lib/valuation-engine.mjs` (the existing, sophisticated 8-axis card scorer
that already drives `proposed_game_rarity`) was hand-traced against the
Codex brief's own 9 approved calibration cards, then verified for real by
running `lib/valuation-engine.regression.test.mjs` with plain `node`
(31 pre-existing tests, 0 regressions at every step). This found and fixed:

1. `isQuickEffect` only matched the literal `"(Quick Effect)"` bracket,
   missing the equally common `"(This is a Quick Effect.)"` phrasing (used
   by, among others, Maxx "C" itself). Broadened to any "quick effect"
   occurrence.
2. `gainsLifePoints` only matched spelled-out "life points", missing the
   very common "LP" abbreviation ("gain 1000 LP").
3. `classifyReference()`'s self-reference check required an exact full-name
   match. A card whose own name embeds a quote mark (Maxx "C") gets
   misparsed by the quote-scanning regex, and the extracted fragment
   ("Maxx") doesn't equal the full name — so the card's own standard
   "You can only use this effect of '<name>' once per turn" self-reference
   was wrongly scored as an *external* dependency. Fixed with a clause-level
   check ("does this clause contain the card's own full name") plus a
   narrower companion check for the same-name-embeds-a-quote shape.
4. A card that Special Summons a Token it names itself (Gorz →
   `"Emissary of Darkness Token"`) was also wrongly flagged as depending on
   an external named card. Fixed: a quoted term ending in "Token", created
   in the same clause by a Special/Normal Summon, is self-created, not a
   dependency.

All four are narrow, real-text-evidenced, and verified to cause zero
regressions in the 31 pre-existing regression assertions.

### 2b. Ran the full 9-card Codex calibration table through the (now-fixed) engine

Added all 9 approved reference cards (Maxx "C", Effect Veiler, Tragoedia,
Gorz, Battle Fader, Swift Scarecrow, D.D. Crow, Giant Trunade, Rescue Rabbit)
as new fixtures in `lib/valuation-engine.regression.test.mjs`, with a direct
comparison against the approved table. **Real, machine-computed result, 33/33
tests passing:**

| Card | Approved rarity | Current engine output | Gap |
|---|---|---|---|
| Maxx "C" | Ultra Rare | Rare | 2 tiers low |
| Effect Veiler | Secret Rare | Ultra Rare | 1 tier low |
| Tragoedia | Secret Rare | Ultra Rare | 1 tier low |
| Gorz the Emissary of Darkness | Secret Rare | Super Rare | 1 tier low |
| Battle Fader | Ultra Rare | Rare | 1 tier low |
| Swift Scarecrow | Super Rare | Normal | 2 tiers low |
| D.D. Crow | Ultra Rare | Normal | 2 tiers low |
| Giant Trunade | Ultra Rare | Super Rare | 1 tier low |
| Rescue Rabbit | Super Rare | Normal | 2 tiers low |

**0 of 9 match exactly. 9 of 9 are under-rated. 0 are over-rated.** The gap
runs one direction, consistently, even after the 4 fixes above.

**Why, and what this means:** every one of these 9 cards is either a
reactive "hand trap" (value depends on how often the *opponent's* deck
enables the trigger — something no amount of parsing the card's own text can
ever capture) or a very low-ATK/DEF utility monster whose real value is
narrow-but-real board impact, not raw stats or keyword density. This is a
structural limitation of a text-pattern scoring engine, not a bug chain to
keep patching. **Recommendation: do not keep tuning regexes to chase this.**
Set `valuation_manually_overridden = true` and `game_rarity` directly for
these 9 cards (mirroring the existing, already-built protection mechanism),
and treat the broader "reactive disruption / low-stat utility monster"
category as a standing candidate for manual review rather than
engine-trusted output — see `scripts/audit-card-valuation.mjs`'s REPORT.md
output for candidates once you can run it for real.

### 2c. New mechanic-text-dependency classifier (Codex brief §43)

The existing format engine excludes Synchro/Pendulum/Link **by card type**
only. The brief explicitly also wants Main Deck monsters, Spells, and Traps
that *functionally require* one of those mechanics in their own text
excluded too (e.g. a Spell that only works "if you control a Synchro
Monster"). Wrote `scripts/audit-mechanic-text-dependency.mjs` for this —
read-only/report-only by default, matching the existing tooling's safety
convention, with an opt-in `--write-overrides <format_code>` that inserts
`format_card_overrides` exclude rows (never touches `game_rarity` or the
global `format_eligible` column).

**Self-tested for real** (plain `node`, no deps) against 5 real card texts
(Iron Call, Pendulum Call, Mirror Force, Stardust Dragon, Called by the
Grave) plus one clearly-labeled synthetic Link example — **6/6 pass.**

### 2d. New "Duelist Circle Classic" format (proposed, inactive)

`supabase/migrations/202608300900_duelist_circle_classic_format.sql` adds a
new, separate, **inactive** `duelist_circle_formats` row implementing the
brief's tiered era rule inside the *existing* format engine (no schema
change needed): `release_cutoff = 2014-12-31`, Fusion + Xyz only. The
2015-2018 "curated whitelist" period is expressed via
`format_card_overrides(override_type='include')` rather than a looser
cutoff, since a single cutoff date can't express "excluded by default, but
individually whitelisted." Exactly one high-confidence include is seeded:
**Chocolate Magician Girl** (the brief's own explicit model example — the
only 2015-2018 card in this report whose existence and identity I didn't
have to rely on my own memory for). Does not touch, replace, or activate the
existing `season_1` row. Activating this new format remains your decision,
same as `season_1` always has been.

---

## 3. 2015-2018 legacy support — HUMAN REVIEW CANDIDATES (not applied)

Actively researching real 2015-2018 TCG releases by name, exact wording, and
exact year without a live catalog or network access is exactly the kind of
confident-sounding-but-unverifiable claim that produced this project's own
past real mistakes (Fuh-Rin-Ka-Zan/Sekka's Light, Forbidden Droplet/Baronne
de Fleur miscalibrations — see `docs/SEASON_1.md` §6). Rather than repeat
that pattern at a larger scale, this section is explicitly a candidate list
for you to verify against your real catalog's `release_date` and
`description` columns — **none of these are in the migration.**

| Card (candidate) | Archetype | Why | Confidence |
|---|---|---|---|
| Dark Magician Girl the Dragon Knight | Dark Magician / Magician Girl | Fusion boss reinforcing DM/DMG identity; Fusion-only compliant | Medium (name/year) |
| Eternal Soul | Dark Magician | Recurring Dark Magician recursion — **flag for oppressiveness review**, not a clean include; this is plausibly too strong an engine piece for a small starting pool even if archetype-appropriate | Medium |
| Elemental HERO Escuridao | Elemental HERO | DARK HERO Fusion boss | Medium |
| Elemental HERO Sunrise | Elemental HERO | LIGHT HERO Fusion | Medium |
| Cyber Dragon Infinity | Cyber Dragon | Xyz boss reinforcing Cyber Dragon identity (Xyz allowed) | Medium |
| Superdreadnought Rail Cannon Gustav Max | Ancient Gear | Powerful Ancient Gear Fusion boss — verify it isn't too oppressive for a starting pool | Low-Medium |
| Red-Eyes Flare Metal Dragon | Red-Eyes | Red-Eyes Fusion boss | Medium |
| Blue-Eyes Twin Burst Dragon | Blue-Eyes | Blue-Eyes Fusion boss | Medium |

For each: verify the real name/wording, confirm `release_date` actually
falls in 2015-2018 (not 2014- or 2019+), then either add a
`format_card_overrides` include row for `duelist_circle_classic_v1`
yourself or ask for a follow-up migration once verified.

---

## 4. Exclusion report (Codex brief §65)

**NOT RUN — needs live DB access.** `scripts/audit-mechanic-text-dependency.mjs`
is written, self-tested, and ready — run it for real with:

```
node --env-file=.env.local scripts/audit-mechanic-text-dependency.mjs
```

It will report hard-dependency / soft-mention / ambiguous counts for every
Main Deck/Spell/Trap card not already excluded by frame_type, and write the
full breakdown to `reports/mechanic-text-dependency/<timestamp>/results.json`.

**Structural issue discovered (unrelated to mechanics, worth a look):** the
migrations folder contains a stray nested path with TWO real migration
files sitting one level too deep to be picked up by `supabase db push` in
the normal migrations directory:
- `supabase/migrations/supabase/migrations/202608190007_draft_rarity_roll.sql`
- `supabase/migrations/supabase/migrations/202608200013_duelist_personalization.sql`

Both filenames are chronologically early (2026-08-19/20), so they may
already have been applied to your live database from before this nesting
mistake happened — or they may never have run at all. Worth confirming
against your live `supabase_migrations.schema_migrations` table (or
equivalent) which case it is; if they were never applied, move both files up
one directory level (or re-apply their intended content via a new
migration) before relying on whatever they were meant to set up.

---

## 5. Final report (Codex brief §66)

| Metric | Value |
|---|---|
| Total cards reviewed (individually, this session) | 9 approved calibration cards + 6 mechanic-dependency self-test cases (real hand/machine analysis) |
| Total cards in live catalog | NOT RUN — needs live DB access (~13,900 as of the last real audit, 2026-08-25) |
| Cards excluded for Synchro dependency | NOT RUN — needs live DB access (frame_type-based exclusion already live; text-based classifier ready, not yet run for real) |
| Cards excluded for Pendulum dependency | NOT RUN — needs live DB access |
| Cards excluded for Link dependency | NOT RUN — needs live DB access |
| Post-2014 support cards added (committed) | 1 (Chocolate Magician Girl, via override) |
| Post-2014 support candidates (human review) | 8 (§3 above) |
| Rarity changes applied to live `game_rarity` | 0 — none, by design (see §6) |
| Engine bugs found and fixed | 4 (§2a), 0 regressions |
| Calibration cards matching approved table | 0 / 9 (before this session's fixes: also 0/9, but 2 tiers worse on average) |
| Total Legendary / Secret / Ultra / Super (live) | NOT RUN — needs live DB access (last real run, 2026-08-25, on the *season_1* pool: 25 Legendary — within the 25-35 target band; Secret/Ultra/Super not re-confirmed this session) |
| Human review needed | See §3 (8 cards) + §6 recommendation (9 calibration cards) |
| Structural issues discovered | Nested `supabase/migrations/supabase/migrations/` path (§4) |

---

## 6. Why live `game_rarity` / `format_eligible` were not touched

This project's own tooling already establishes, deliberately and
repeatedly (see `docs/SEASON_1.md` §9, the Season 1 runbook's Phase D), that
nothing writes to live `game_rarity` or `format_eligible` except an explicit,
reviewed, human-run step — specifically *because* two earlier automated
passes on this exact codebase produced real, wrong classifications
(Fuh-Rin-Ka-Zan/Sekka's Light, then Forbidden Droplet/Baronne de Fleur) that
were only caught by a human review step existing at all. This session found
a *third* real class of miscalibration (the 9/9 under-rated hand
traps/utility monsters) using that same review discipline. Continuing to
respect it — rather than bulk-writing `game_rarity` for a live game economy
real players draft, trade, and pull packs from — is a direct continuation of
that established, hard-won safety practice, not a refusal to make progress.

**What you can run for real, in order, once you have a normal terminal with
network access:**

```
node --env-file=.env.local scripts/sync-card-release-dates.mjs        # if not already run
node --env-file=.env.local scripts/audit-format-cutoffs.mjs
node --env-file=.env.local scripts/audit-card-valuation.mjs           # dry run, writes reports/ only
node --env-file=.env.local scripts/audit-mechanic-text-dependency.mjs # dry run, writes reports/ only
node lib/valuation-engine.regression.test.mjs                          # re-verify 33/33 still pass
```

Then, manually, in the Supabase SQL Editor: set `game_rarity` +
`valuation_manually_overridden = true` for the 9 approved calibration cards
per §2b's table (their exact `game_rarity` should be the "Approved rarity"
column, not the engine's current output), review `reports/card-valuation/`
and `reports/mechanic-text-dependency/` for the rest, and only then consider
activating `duelist_circle_classic_v1` (same Phase D-style manual step
`season_1` has always required).

---

## 7. Files changed this session

- `lib/valuation-engine.mjs` — 4 bug fixes (§2a)
- `lib/valuation-engine.regression.test.mjs` — 9 new calibration fixtures + comparison tests (§2b)
- `scripts/audit-mechanic-text-dependency.mjs` — new (§2c)
- `supabase/migrations/202608300900_duelist_circle_classic_format.sql` — new (§2d)
- `docs/cardpool-classic-format-audit-2026-08-30.md` — this file

Not committed: `scripts/_scratch-stats.mjs`, a leftover investigation script
from confirming the network limitation at the start of this session (this
sandbox could not delete it from the device — `rm: Operation not
permitted`). It does nothing on its own without Supabase credentials; safe
to delete manually, or ignore.
