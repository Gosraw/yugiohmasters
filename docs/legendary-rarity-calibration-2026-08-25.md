# Legendary rarity calibration — 2026-08-25

Engine version before this pass: `2026-08-23.3`. Engine version after: `2026-08-25.1`.

## The problem

Among the true Season-1 `format_eligible` pool (~8,954 cards — see
"What population this was calibrated against" below), the live engine
proposed only **13 Legendary cards: 12 Fusion Monsters and 1 Effect
Monster**. Soft target for a healthy pool: 20–30 Legendary cards, aim
~25, reachable through multiple legitimate profiles (generic
high-floor power, exceptional build-around, game-defining Spell/Trap
utility, Extra Deck boss) — not a quota, and not one structural card
type winning by default.

## Root cause

Two bugs in `scoreCard()` (`lib/valuation-engine.mjs`), both upstream
of `proposeRarity()`:

1. **A flat, unjustified Extra Deck power bonus.** `power` construction
   included `if (s.isExtraDeckCard) power += 0.8;` — a bonus for being
   Fusion/Synchro/Xyz/Link with zero functional justification, and a
   double-dip against the separate Extra Deck accessibility penalty
   (`-1.5`) already applied for the same trait. This gave every Extra
   Deck card, regardless of how exceptional its actual effect was, a
   head start on power (and therefore ceiling, since ceiling is built
   from power) that a Main Deck monster or Spell/Trap with an
   identical effect never got.
2. **A ceiling formula with no generic-power route.** Every ceiling
   bonus (`optional_bonus` reference, archetype payoff, named/mandatory
   materials) required an archetype-lock/build-around signal. A
   genuinely generic, non-archetype-locked, powerful card had no path
   to a high ceiling at all — and Spell/Trap cards, having no ATK
   stat, can never trigger the ATK-based power bonuses either, so their
   power (and ceiling) structurally capped low. Empirically, among the
   3,194 low-dependency (≤2.5) Spell/Trap cards in the true eligible
   pool, the maximum `power` was only 7.4, reached by ~9 cards.

Within the true 8,954-card pool, only 37 cards reached `ceiling >= 9.0`
at all: 34 Fusion, 2 Xyz, 1 Main Deck Monster — **zero** Spell/Trap/
Ritual. All 13 final Legendaries reached Legendary through the gate's
Path B (`ceiling >= 9.6 && (floor >= 3.0 || ceiling >= 9.9)`); Path A
(`draftValue >= 6.3 && floor >= 4.5`) had **zero passing cards anywhere
in the pool** — completely dead.

## The fix

1. Removed the flat `+0.8` Extra Deck power bonus entirely (no
   replacement — Extra Deck status now confers no power/ceiling
   advantage on its own).
2. Added a new ceiling bonus in `scoreCard()`: a card whose `power >=
   7.2` **and** `dependency <= 4.0` gets `ceiling += 2.0`, independent
   of archetype tag, materials, or card_type. This is the "generic
   power" route — any card, monster or not, Main Deck or Extra Deck,
   that is simply exceptional on its own terms and not meaningfully
   archetype-locked now has a real path to a high ceiling.
3. Lowered `proposeRarity()`'s Legendary Path B ceiling threshold from
   `9.6` to `9.4`, to match the new, more honestly-earned ceiling scale
   (several genuinely exceptional generic cards land at 9.3–9.4 under
   the new formula). Path A's thresholds (`draftValue >= 6.3 && floor
   >= 4.5`) were left untouched — the fix above makes Path A reachable
   on its own, without loosening it.

Nothing about Secret Rare / Ultra Rare / Super Rare / Rare / Normal's
gates was touched.

## What population this was calibrated against

This sandbox has no network access to the live Supabase project
(confirmed via a direct `curl` test: `403 Forbidden`,
`X-Proxy-Error: blocked-by-allowlist`), so the live audit script
(`scripts/audit-card-valuation.mjs`) could not be run against real
data. Instead, calibration used a **cached, real export from a
previous live run**: `reports/card-valuation/2026-08-23T16-39-21-938Z/full-proposal.json`
(13,931 cards, timestamped 2026-08-23T16:39:22Z). `git log --follow`
on `lib/valuation-engine.mjs` confirms only one commit
(`dd3633f`, 2026-08-23 16:18:57 UTC) touched scoring/rarity logic
before that export was generated, and `VALUATION_ENGINE_VERSION` was
still exactly `"2026-08-23.3"` going into this session — so the cached
scores are exactly representative of the engine this recalibration
started from, safe to use as ground truth despite no live DB access.

The **true eligible pool** was identified empirically:
`season1_provisional_eligible === true AND suggested_release_stage
=== 1` filters the 13,931-card export down to exactly **8,954 cards**,
matching the reported production figure precisely, and reproduces the
reported 13-Legendary (12 Fusion + 1 Effect) baseline exactly when the
export's own `proposed_rarity` field is used unmodified. `release_stage`
gating is confirmed part of the live `format_eligible` boolean itself
(`is_duelist_circle_format_eligible()`,
`supabase/migrations/202608231500_duelist_circle_format_engine.sql`,
~line 409) — not a separate concept — so this is the correct proxy for
live `format_eligible = true` in an offline session. This same gap
(the audit script's own "PROVISIONAL 2020 Season 1 pool" section never
applied release_stage gating) is fixed in
`scripts/audit-card-valuation.mjs` alongside this recalibration — see
its new `FORMAT_ELIGIBLE_PROXY` section, which supersedes the older
one for calibration purposes.

## Methodology: offline exact-delta recomputation

Since the engine's raw signal extraction (`extractValuationSignals`)
needs the card's own oracle text, which is not present in the cached
export (only computed scores are), new candidate parameters could not
be re-derived from scratch offline. Instead, an exact-delta approach
was used: because the *only* changes are (a) subtracting a known
constant (`0.8`) from `power` for Extra Deck cards whose old power
wasn't already clamped at the 0–10 ceiling, and (b) adding a new,
independently-computable ceiling term, the new `power`/`floor`/
`ceiling`/`draftValue` can be reconstructed exactly from the cached old
values for all cards except the small number whose `power` or
`ceiling` was already clamped at exactly `10.0` (3 cards clamped at
power=10, 13 at ceiling=10, out of 8,954 — handled conservatively and
disclosed, not silently assumed). This was implemented as a Python
harness reading the cached JSON and reproducing `scoreCard()`'s
power/floor/ceiling/draftValue construction and `proposeRarity()`'s
gate logic in parallel, parameterized by threshold/bonus/dependency-cap/
pathB-ceiling, enabling a real empirical grid search against real
production data rather than picking numbers by feel. This scratch
harness was not committed (it's a one-off analysis tool, not a
repository dependency); its exact logic is captured in this document
and in the finished `lib/valuation-engine.mjs` code itself.

## Grid search summary

Varied: generic-power ceiling-bonus threshold (`power >=`), bonus
magnitude, the dependency cap for eligibility (`dependency <=`), and
`proposeRarity()`'s Path B ceiling threshold. Representative results
(all against the true 8,954-card eligible pool):

| threshold | bonus | dep_max | pathB_ceil | Legendary count | by type |
|---|---|---|---|---|---|
| 7.0 | 2.0 | 2.5 | 9.6 | 24 | Trap 5, MainDeckMonster 16, Fusion 2, Spell 1 |
| 7.2 | 2.0 | 3.0 | 9.3/9.4 | 23 | MainDeckMonster 11, Trap 7, Spell 3, Fusion 2 |
| 7.2 | 2.0 | 3.5 | 9.3/9.4 | 24 | MainDeckMonster 12, Trap 7, Spell 3, Fusion 2 |
| **7.2** | **2.0** | **4.0** | **9.4** | **25** | **Xyz 1, MainDeckMonster 12, Trap 7, Spell 3, Fusion 2** |
| 7.2 | 2.0 | 4.5 | 9.3/9.4 | 30 | Xyz 1, Fusion 6, MainDeckMonster 13, Trap 7, Spell 3 |
| 7.1 | 2.0 | 3.0 | 9.3/9.4 | 31 | MainDeckMonster 18, Trap 8, Spell 3, Fusion 2 |
| 7.2 | 2.5 | any tested | any tested | 70–117 | too aggressive — rejected |

Values around `bonus = 2.5` were rejected outright (Legendary count
far exceeds the target range regardless of other parameters, and the
distribution shape stops being meaningfully differentiated from
Secret/Ultra Rare). `dep_max = 3.0` (the engine's own internal
"generic" dependency breakpoint used elsewhere in
`genericUtility`/`consistency`) gives a slightly "purer" semantic read
but caps Fusion representation at 2 cards and excludes any Xyz;
`dep_max = 4.5` gives the most Fusion/Xyz diversity but pushes the
count to 30, at the edge of the target range.

## Final parameters (locked)

- Generic-power ceiling bonus: `power >= 7.2 && dependency <= 4.0` → `ceiling += 2.0`.
- `proposeRarity()` Legendary Path B ceiling threshold: `9.6` → `9.4`.
- Path A (`draftValue >= 6.3 && floor >= 4.5`) unchanged.
- First gate condition (`ceiling >= 9.0`) unchanged.

This configuration was chosen because it lands at **25** Legendary
(the task's stated "aim ~25″), keeps every card_type under 50% share,
gives Fusion the smallest footprint of any tested in-range
configuration (2 of 25 = 8%, down from 92%), and is the only
configuration tested that includes an Xyz Legendary while still
staying inside the 20–30 target band.

## Result on the true eligible pool (8,954 cards)

Full distribution, BEFORE (current live proposal) vs. AFTER (this
recalibration):

| Rarity | Before | After | Δ |
|---|---|---|---|
| Normal | 3,832 | 3,918 | +86 |
| Rare | 2,997 | 2,994 | −3 |
| Super Rare | 1,467 | 1,410 | −57 |
| Ultra Rare | 585 | 556 | −29 |
| Secret Rare | 60 | 51 | −9 |
| **Legendary** | **13** | **25** | **+12** |

Legendary by card_type, before vs. after:

| card_type | Before | After |
|---|---|---|
| Fusion | 12 | 2 |
| Xyz | 0 | 1 |
| Main Deck Monster | 1 | 12 |
| Trap | 0 | 7 |
| Spell | 0 | 3 |

No Synchro/Link/Pendulum/Illusion cards appear in the eligible
Legendary list (these mechanics are excluded from Season 1 eligibility
entirely, unrelated to rarity — confirmed empirically on the real
data, and covered by a dedicated regression test).

Path usage: 9 of the 25 Legendaries reach Path A (the previously
completely dead "true powerhouse" route); the remaining 16 reach Path
B (build-around / exceptional-ceiling). Both paths are now genuinely
alive.

Two cards among the new proposals — "Noctovision Dragon" and "Gemini
Imps" — already carry `current_rarity: "Legendary"` in the cached
export (i.e., the live database's current `game_rarity` for these two
already is Legendary, independent of what the buggy old engine
proposed), while the OLD engine proposed only "Secret Rare" for them.
The new proposal agreeing with the live `game_rarity` on these two is
a positive signal, not a coincidence to worry about — but the cached
export does not carry `valuation_manually_overridden` /
`rarity_manually_overridden` flags, so whether that agreement reflects
a prior manual override cannot be confirmed offline. **No production
write of any kind occurred or is proposed by this pass** — a human
reviewing the live audit's dry-run output (once network access is
available) will see the real flags before anything is applied.

## Full proposed eligible Legendary list (25 cards)

Sorted by ceiling, descending. `path` is which `proposeRarity()`
branch the card passed through (A = generic/high-floor power, B =
build-around/exceptional-ceiling). All release_stage/oppressiveness
values are `1` / `green` for every card below (none flagged
high-oppressiveness).

| Card | card_type | archetype | current_rarity | old proposal | path | draftValue | power | floor | ceiling | accessibility | dependency | genericUtility |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Number 99: Utopic Dragon | XYZ Monster | Utopia | Super Rare | Secret Rare | B | 4.99 | 8.40 | 7.40 | 10.00 | 4.80 | 3.70 | 5.00 |
| The Prime Monarch | Trap Card | Monarch | Super Rare | Ultra Rare | B | 5.71 | 7.20 | 6.20 | 10.00 | 6.00 | 2.50 | 7.50 |
| Red Cocoon | Trap Card | Archfiend | Rare | Ultra Rare | B | 5.59 | 7.20 | 6.20 | 10.00 | 6.20 | 2.50 | 6.50 |
| Greedy Venom Fusion Dragon | Fusion Monster | Predaplant | Rare | Legendary | B | 4.26 | 10.00 | 5.50 | 10.00 | 4.80 | 4.50 | 4.00 |
| Elemental HERO Nebula Neos | Fusion Monster | Elemental HERO | Normal | Legendary | B | 4.13 | 10.00 | 5.50 | 10.00 | 4.80 | 5.10 | 4.00 |
| Lunalight Emerald Bird | Effect Monster | Lunalight | Super Rare | Ultra Rare | B | 5.84 | 7.40 | 6.40 | 10.00 | 6.50 | 2.50 | 7.50 |
| Jinzo - Lord | Effect Monster | Jinzo | Rare | Legendary | B | 4.56 | 9.20 | 4.70 | 10.00 | 6.30 | 3.50 | 4.00 |
| T.G. Halberd Cannon/Assault Mode | Effect Monster | Assault Mode | Super Rare | Super Rare | B | 5.18 | 7.50 | 6.50 | 9.50 | 7.50 | 3.10 | 4.00 |
| Ghost Belle & Haunted Mansion | Tuner Monster | — | Rare | Secret Rare | A | 6.31 | 7.40 | 7.40 | 9.40 | 6.30 | 1.00 | 6.50 |
| Astra Ghouls | Effect Monster | — | Rare | Secret Rare | B | 6.11 | 7.40 | 7.40 | 9.40 | 5.30 | 1.00 | 6.50 |
| Gameciel, the Sea Turtle Kaiju | Effect Monster | Kaiju | Secret Rare | Secret Rare | A | 6.42 | 7.40 | 7.40 | 9.40 | 7.50 | 1.60 | 6.50 |
| The Resolute Meklord Army | Spell Card | Meklord | Rare | Secret Rare | B | 6.24 | 7.40 | 7.40 | 9.40 | 6.20 | 1.60 | 7.00 |
| Noctovision Dragon | Effect Monster | Rokket | Legendary | Secret Rare | A | 6.51 | 7.40 | 7.40 | 9.40 | 6.90 | 1.40 | 7.50 |
| Living Fossil | Spell Card | — | Super Rare | Secret Rare | B | 6.29 | 7.40 | 7.40 | 9.40 | 6.20 | 1.00 | 6.50 |
| Clear Kuriboh | Effect Monster | Kuriboh | Secret Rare | Secret Rare | A | 6.57 | 7.40 | 7.40 | 9.40 | 7.20 | 1.40 | 7.50 |
| Cyber Network | Trap Card | Cyber Dragon | Rare | Ultra Rare | B | 5.83 | 7.40 | 7.40 | 9.40 | 4.80 | 1.60 | 6.50 |
| Gemini Imps | Effect Monster | — | Legendary | Secret Rare | A | 6.41 | 7.40 | 7.40 | 9.40 | 6.00 | 1.00 | 7.50 |
| Darkness Neosphere | Effect Monster | — | Super Rare | Secret Rare | A | 6.32 | 7.40 | 7.40 | 9.40 | 6.30 | 1.00 | 7.00 |
| Black Illusion | Trap Card | — | Super Rare | Secret Rare | B | 6.09 | 7.40 | 7.40 | 9.40 | 5.00 | 1.00 | 7.00 |
| Chain Hole | Trap Card | Hole | Ultra Rare | Ultra Rare | B | 6.01 | 7.40 | 7.40 | 9.40 | 5.00 | 1.00 | 6.50 |
| The Phantom Knights of Wrong Magnetring | Trap Card | Phantom Knights | Secret Rare | Secret Rare | A | 6.44 | 7.40 | 7.40 | 9.40 | 7.50 | 2.20 | 7.50 |
| Lost Wind | Trap Card | — | Super Rare | Ultra Rare | B | 6.01 | 7.40 | 7.40 | 9.40 | 5.00 | 1.00 | 6.50 |
| Necroid Synchro | Spell Card | Roid | Ultra Rare | Secret Rare | B | 6.16 | 7.40 | 7.40 | 9.40 | 6.20 | 1.60 | 6.50 |
| Dogmatika Fleurdelis, the Knighted | Effect Monster | Dogmatika | Secret Rare | Secret Rare | A | 6.33 | 7.20 | 7.20 | 9.20 | 7.50 | 1.60 | 6.50 |
| Blue-Eyes Shining Dragon | Effect Monster | Blue-Eyes | Normal | Secret Rare | A | 6.33 | 7.20 | 7.20 | 9.20 | 7.50 | 1.60 | 6.50 |

Type counts: Main Deck Monster 12, Trap 7, Spell 3, Fusion 2, Xyz 1
(Ritual: 0 — no Ritual card cleared the bar at these settings; a route
exists structurally, since Ritual isn't excluded by any gate
condition, but no specific card in the current catalog happens to
qualify).

## Sanity checks

| Check | Result |
|---|---|
| >40% of eligible Legendaries are Fusion? | No — 8% (2 of 25) |
| One card_type dominates >50%? | No — Main Deck Monster is the largest at 48% (12 of 25) |
| Zero Spell/Trap Legendary candidates despite strong scores? | No — 10 of 25 (3 Spell + 7 Trap) |
| Legendary count <20 or >30? | No — 25, at the stated "aim ~25" |
| Banned/excluded mechanics (Synchro/Link/Pendulum/Illusion) appear? | No — confirmed empirically and by regression test |
| Any Legendary reached via only one extreme axis with otherwise weak support? | The two `power`-clamped Fusion cards (Greedy Venom Fusion Dragon, Elemental HERO Nebula Neos) are the closest to this — `genericUtility` sits exactly at the 4.0 gate floor and `accessibility` at 4.80, both real but thin margins. Both were already clamped at `power = 10.0` under the OLD engine too (this is a pre-existing characteristic of those two cards, not introduced by this recalibration) — flagged here for the human reviewer's attention, not auto-excluded. |

## Side effects on Secret Rare / Ultra Rare / Super Rare / Rare / Normal

All five other tiers shift by low single digits as a percentage of the
pool (see the distribution table above) — no tier's gate logic was
touched, and the shifts are entirely downstream of some individual
cards moving between adjacent proposed tiers due to changed
floor/ceiling/draftValue values. Ultra Rare and Secret Rare remain
diverse by card_type after the change (Ultra: Main Deck Monster 304,
Trap 56, Spell 137, Xyz 31, Ritual 14, Fusion 14; Secret: Main Deck
Monster 24, Trap 10, Spell 8, Fusion 7, Ritual 2).

## Verdict

**PASS.** 25 Legendary cards, within the 20–30 target band, at the
stated "aim ~25". No card_type exceeds 50%. Fusion's share fell from
92% to 8%. Both Path A and Path B are genuinely reachable (9 and 16
cards respectively). Spell and Trap both have real representation (3
and 7). Excluded mechanics remain excluded. No other rarity tier was
broken. See the main session report for the full required
20-point writeup, test results, and exact manual next steps.
