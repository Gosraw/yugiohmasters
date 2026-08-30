# Duelist Circle Classic — Cardpool & Rarity Balance Audit (2026-08-30)

This is the deliverable for the "Full Autonomous Cardpool & Rarity Balancing"
session run against the Codex brief: an alternate-history, old-school /
GX-era / early-Xyz-era Fusion+Xyz-only format with a tiered 2014 / 2015-2018 /
2019+ era structure, a human-judged rarity calibration table, and (as of the
second round of this session) an explicit eligibility → valuation →
manual-override → context-classification architecture.

**Read this first if you read nothing else:** this sandbox has no network
access to your live Supabase project (confirmed by direct test — see §1) and
no working test runner for the project's normal `npm test` (vitest's native
binary doesn't run in this sandbox either — a pre-existing, previously
documented limitation, see `docs/SEASON_1.md` §11). Everything below that
needed either was written, self-tested with a plain `node` harness against
real and clearly-labeled-synthetic fixtures, and left ready for you to run
for real — never silently presented as if it already produced real catalog
numbers.

---

## 1. Sandbox limitations hit this session (confirmed, not assumed)

- `device_bash` (the user's own machine, sandboxed): no network access at
  all. `getaddrinfo EAI_AGAIN` on the Supabase host.
- This cloud container: egress is allowlisted, and neither the Supabase host
  nor the npm registry are on that allowlist (`curl` → `403`, `npm install` →
  `403 Forbidden`).
- `lib/valuation-engine.regression.test.mjs` exists as a **plain
  `node:assert` harness instead of vitest** specifically to route around
  vitest's broken native binary — it, and every new script this session,
  were verified for real by running them with plain `node`, not just
  written and hoped-correct.
- Net effect: nothing in this report that requires reading the live
  ~13,900-card `card_catalog` table could be run for real. Every number that
  would require that is marked **NOT RUN — needs live DB access** below,
  never guessed.

---

## 2. Architecture (this round): eligibility → valuation → override → context

The first round of this audit spent real effort trying to get the automated
valuation engine to reproduce the 9 approved calibration cards by fixing
ever-more-specific text patterns. That was explicitly the wrong path forward
— **the engine is a baseline estimator, not a final authority**, and this
round replaces "chase the regex gap" with four separate, composable layers.
Each is independently real and self-tested; none depend on the others being
perfect.

### 2a. Layer 1 — Eligibility (decided BEFORE rarity is ever computed)

`scripts/audit-duelist-circle-classic.mjs`'s `computeClassicEligibility()`
is the single function that decides whether a card is in Duelist Circle
Classic at all, in this exact precedence (mirrors
`is_duelist_circle_format_eligible()`'s own precedence, plus the new
text-dependency layer that SQL function doesn't have):

1. Master Duel forbidden/not_available/unknown → excluded, absolute, no
   override can bypass this.
2. Manual `format_card_overrides` exclude → excluded.
3. Manual `format_card_overrides` include → eligible (skips everything
   below).
4. Synchro / Link / Pendulum / Illusion by card type → excluded. **Fusion
   and Xyz are allowed.** Tuners are explicitly NOT auto-excluded — only
   Synchro Monsters themselves are; a Tuner with real standalone/Fusion/Xyz
   value stays eligible on its own merits (self-tested, see below).
5. Hard text-dependency (`scripts/audit-mechanic-text-dependency.mjs`) — a
   Main Deck/Spell/Trap card that functionally requires an excluded
   mechanic without being one itself (e.g. a Spell that only works "if you
   control a Synchro Monster") → excluded.
6. Release era: ≤2014 → eligible by default. 2015–2018 → excluded UNLESS an
   include override exists (curated-whitelist-only, never a looser cutoff).
   2019+ → excluded UNLESS an include override exists. Unknown release date
   → never excluded on cutoff grounds alone.
7. Otherwise → eligible.

**Self-tested for real, 9/9 passing**, including the two cases that matter
most for correctness: a real Synchro-text-dependent Spell (Iron Call) that
is NOT itself a Synchro Monster, and a standalone-value Tuner that is
correctly NOT excluded just for being a Tuner.

### 2b. Layer 2 — Valuation (runs ONLY on eligible cards, treated as a recommendation)

`lib/valuation-engine.mjs`'s `scoreCard`/`proposeRarity` run only after
eligibility is settled, and their output is reported as a recommendation,
never written automatically to live `game_rarity`. This round did NOT add
more calibration-chasing regexes — the 4 real bugs fixed **last** round
(quick-effect phrasing, LP abbreviation, two self-reference
misclassifications) are the last engine changes made for calibration
purposes; see §2b-2 below for why that path was correctly abandoned.

#### 2b-1. What's structurally true about the 9 calibration cards (documented, not re-litigated)

| Card | Approved rarity | Engine output (after the 4 fixes) | Gap |
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

0/9 match, 9/9 under-rated, 0/9 over-rated, one direction only — real
opponent-dependent/hand-trap/comeback value that text-only scoring
structurally cannot see. This table stays in the regression suite
(`lib/valuation-engine.regression.test.mjs`) as a permanent, documented pin
— not as a to-do list to keep closing by tuning the engine further.

### 2c. Layer 3 — Manual override (persistent, supersedes valuation, never auto-changed)

The "clean persistent mechanism" the brief asked for **already existed** in
the schema (`card_catalog.game_rarity` / `rarity_manually_overridden` /
`rarity_reason` / `rarity_reviewed_at`, from `202608190003_game_rarity.sql`)
— it had just never been wired to anything live (`rarity_manually_overridden`
was previously read only by the deprecated `scripts/classify-rarities.mjs`).
This round:

- **Seeded the 9 approved values** via
  `supabase/migrations/202608301000_seed_manual_rarity_overrides.sql` — a
  data-only migration, name-lookup-based (no hardcoded UUIDs, since this
  sandbox can't look any up), setting `game_rarity`,
  `rarity_manually_overridden = true`, and a `rarity_reason` citing the
  approved table, for exactly: Rescue Rabbit, Tragoedia, Gorz the Emissary
  of Darkness, Battle Fader, Swift Scarecrow, D.D. Crow, Effect Veiler,
  Maxx "C", Giant Trunade.
- **Does not touch** Change of Heart, Dark Hole (existing manually-approved
  relationship preserved exactly, not even read), or Monster Reborn (kept
  as a benchmark reference only — no override value was given for it).
- **Premature Burial** is deliberately NOT force-set — it's a human review
  item (§5), per the brief's own instruction that it must stay below
  Monster Reborn and be flagged if uncertain.
- Built `scripts/apply-manual-rarity-overrides.mjs` — the first live code
  that actually treats `rarity_manually_overridden` as authoritative. It's
  the intended path for eventually promoting
  `proposed_game_rarity → game_rarity` at scale (once you've run the
  valuation audit for real): dry-run by default, and it **refuses to touch
  any row where `rarity_manually_overridden = true`, unconditionally** —
  this is the actual enforcement mechanism, not just a comment.

### 2d. Layer 4 — Context classification (a separate axis, never blended into rarity)

New `classifyCardContext()` in `lib/valuation-engine.mjs` labels every
eligible card as exactly one of:

- **archetype** — a genuine, functional archetype payoff (the archetype tag
  is load-bearing in the card's own text). A high ceiling here is expected
  and fine.
- **splashable_engine** — carries an archetype tag, but the tag is
  thematic-only AND the card is broadly usable anyway. This is the "engine
  splashability test" failure mode the brief's §11 warned about — a card
  that *reads* as archetype support but *plays* as a generic staple
  regardless of deck. **Verified for real** against this project's own
  documented past mistakes: Baronne de Fleur and Forbidden Droplet (the
  two cards that triggered the original v2 engine rewrite) both correctly
  land here, not in "archetype".
- **generic** — no real archetype tag, broadly usable. The honest,
  undisguised version of the case above (Giant Trunade, Harpie's Feather
  Duster).
- **narrow_support** — not a real archetype payoff, not broadly generic
  either — situational or matchup-dependent. 7 of the 9 approved
  calibration cards land here (Maxx "C", Gorz, Battle Fader, Swift
  Scarecrow, D.D. Crow, Rescue Rabbit — see the exact match to the brief's
  own stated reasoning per card in the regression suite), which is a real
  signal this axis tracks something meaningful rather than an arbitrary
  split.

**Self-tested for real, all passing** (40/40 total regression tests
including 9 new context-classification assertions), directly against real
fixtures already in this codebase, not synthetic ones invented for the
occasion.

This directly serves the brief's §4 requirement — "a card extremely strong
in one archetype should not automatically receive the same rarity as an
equally strong card playable in almost every deck" — by making that
distinction an explicit, reportable field (`context`) rather than something
buried inside a single blended `draftValue` number. It deliberately does
NOT change `proposeRarity()`'s thresholds; it's additive information for a
human reviewer and for the orchestrator's reporting (§4 below), not a new
rarity formula.

---

## 3. Full pipeline orchestrator

`scripts/audit-duelist-circle-classic.mjs` ties all four layers into one
pass and produces exactly the report shape the brief's VALIDATION section
asked for. **Self-tested for real, 9/9 eligibility cases passing** (Dark
Magician → eligible; Stardust Dragon → mechanic-excluded; Iron Call →
text-dependency-excluded; Chocolate Magician Girl → era-excluded without
the override, override-included with it; a hypothetical 2022 card →
era-excluded; a Master-Duel-forbidden card → excluded even with an include
override; a standalone-value Tuner → eligible; unknown release date →
eligible).

Run for real once you have network access:

```
node --env-file=.env.local scripts/audit-duelist-circle-classic.mjs
```

It reports (writing full detail to `reports/duelist-circle-classic/<timestamp>/`):
total cards scanned; the eligibility breakdown by exclusion category
(mechanic / text-dependency / era / Master Duel / override); total cards in
Duelist Circle Classic; the automated rarity distribution (pre-override);
the manual override count; the final rarity distribution (overrides
applied); the context distribution; and Legendary/Secret/Ultra/Super
totals.

---

## 4. 2015-2018 legacy support — scored candidates (not applied except Chocolate Magician Girl)

Every candidate scored against all 8 fields the brief asked for. **None of
these except Chocolate Magician Girl are in the migration** — release-year
and exact-wording confidence is noted per card, and verifying against your
real catalog's `release_date`/`description` columns is a five-minute check
once you have DB access, versus a real risk of repeating this project's own
past mistakes (Fuh-Rin-Ka-Zan/Sekka's Light, Forbidden Droplet/Baronne de
Fleur — see `docs/SEASON_1.md` §6) at a larger scale by trusting memory
alone.

| Card | Archetype | Year (confidence) | Fusion/Xyz OK | Modern-engine risk | Splashability | SS acceleration | Search/recursion | Power impact | Recommendation |
|---|---|---|---|---|---|---|---|---|---|
| Chocolate Magician Girl | Dark Magician / Magician Girl | ~2017 (approved by brief) | Yes (Effect Monster) | Low | Low | Low | Low | Low-Moderate | **INCLUDE** (seeded) |
| Dark Magician Girl the Dragon Knight | Dark Magician / Magician Girl | ~2017 (Medium) | Yes (Fusion boss) | Low | Low (named DM+DMG-style materials) | Low | Low | Moderate-High | INCLUDE (pending year/text verification) |
| Eternal Soul | Dark Magician | ~2017 (Medium) | N/A (Continuous Spell) | **Moderate-High** — repeatable Special Summon/protection engine | Low | Moderate (repeatable revival) | **High** (recursion is the whole point) | High for the archetype | **REVIEW** — plausible oppressiveness/release_stage candidate even though archetype-appropriate |
| Elemental HERO Escuridao | Elemental HERO | ~2017-18 (Medium) | Yes (Fusion boss) | Low | Low-Moderate | Low | Low | Moderate-High | INCLUDE (pending verification) |
| Elemental HERO Sunrise | Elemental HERO | ~2017-18 (Medium) | Yes (Fusion boss) | Low | Low-Moderate | Low | Low | Moderate-High | INCLUDE (pending verification) |
| Cyber Dragon Infinity | Cyber Dragon | ~2015-17 (Medium) | Yes (Xyz boss, Xyz allowed) | **Moderate** — recall a strong recurring negate; verify text | Low (Cyber Dragon-specific materials) | Low | Low | Moderate-High | **REVIEW** — verify exact effect text before including |
| Superdreadnought Rail Cannon Gustav Max | Ancient Gear | ~2017 (Low-Medium) | Yes (Fusion boss) | **Moderate** — recall high raw power/direct-attack enabling | Low (Ancient Gear-specific) | Low | Low | **High** | **REVIEW** — verify power level; likely a release_stage candidate rather than day-one even if included |
| Red-Eyes Flare Metal Dragon | Red-Eyes | ~2015-16 (Medium) | Yes (Fusion boss, named Red-Eyes material like Red-Eyes Dark Dragoon) | Low | Low | Low | Low-Moderate | Moderate | INCLUDE (pending verification) |
| Blue-Eyes Twin Burst Dragon | Blue-Eyes | ~2017 (Medium) | Yes (Fusion boss, named Blue-Eyes material) | Low | Low | Low | Low | Moderate-High | INCLUDE (pending verification) |

All 6 archetypes the brief named (Dark Magician, Elemental HERO, Cyber
Dragon, Ancient Gear, Blue-Eyes, Red-Eyes) now have at least one scored
candidate.

---

## 5. HUMAN REVIEW list (compact, prioritized per the brief's order)

1. **Premature Burial vs. Monster Reborn** — brief-mandated: must stay
   below Monster Reborn; flag if final rarity is uncertain. Not forced to a
   value this session (no live catalog to compare current values against).
2. **Eternal Soul** (2015-2018 candidate) — plausible modern-engine risk
   (repeatable Special Summon/protection recursion) despite being genuine,
   on-brief Dark Magician archetype support. Recommend REVIEW, not a clean
   INCLUDE, before any whitelist decision.
3. **Cyber Dragon Infinity** (2015-2018 candidate) — moderate-confidence
   recollection of a strong recurring negate effect; verify exact oracle
   text for oppressiveness before including.
4. **Superdreadnought Rail Cannon Gustav Max** (2015-2018 candidate) —
   recalled high raw power; verify before including, and consider
   `release_stage` even if ultimately included.
5. **Legendary vs. Secret / Secret vs. Ultra border cases catalog-wide** —
   cannot be populated without a live run; `scripts/audit-duelist-circle-classic.mjs`
   is ready to surface these the moment you have DB access (its per-card
   JSON output includes automated rarity + context for every eligible
   card, sorted for exactly this kind of border-case review).
6. **The 6 remaining 2015-2018 INCLUDE candidates** (§4) — all Medium
   confidence on exact release year/wording; five-minute verification each
   against the real catalog before treating as final.
7. **Structural: nested migrations folder** —
   `supabase/migrations/supabase/migrations/202608190007_draft_rarity_roll.sql`
   and `.../202608200013_duelist_personalization.sql` sit one directory
   level too deep to be picked up by `supabase db push`. Confirm whether
   they were ever actually applied; if not, move them up a level.
8. **Nothing found this session suggests any currently-approved archetype
   is significantly too strong or too weak overall** — this assessment
   itself needs the live per-archetype rarity/context distribution from
   §3's orchestrator to actually verify; treat "no findings" here as "not
   yet checked", not "confirmed fine".

---

## 6. Final report (Codex brief validation-section fields)

| Metric | Value |
|---|---|
| Total cards scanned | NOT RUN — needs live DB access (~13,900 as of the last real audit, 2026-08-25) |
| Eligible ≤2014 cards | NOT RUN — needs live DB access |
| Mechanic-dependent exclusions (Synchro/Pendulum/Link, by type) | NOT RUN — needs live DB access |
| Text-dependency exclusions (functional requirement without the type itself) | NOT RUN — needs live DB access |
| 2015-2018 candidates identified | 8 scored (§4), 1 seeded as INCLUDE (Chocolate Magician Girl), 3 flagged REVIEW, 5 conditional INCLUDE pending verification |
| Approved post-2014 inclusions (committed) | 1 (Chocolate Magician Girl, via `format_card_overrides`) |
| Total cards in Duelist Circle Classic | NOT RUN — needs live DB access; pipeline ready (§3) |
| Automated rarity distribution | NOT RUN — needs live DB access; pipeline ready (§3) |
| Manual override count | 9 (seeded this session, §2c) |
| Legendary total | NOT RUN — needs live DB access (target ~25-35, not a forced quota; last real run on the *season_1* pool, 2026-08-25, found 25) |
| Secret Rare total | NOT RUN — needs live DB access |
| Ultra Rare total | NOT RUN — needs live DB access |
| Super Rare total | NOT RUN — needs live DB access |
| Engine bugs found and fixed (last round) | 4, 0 regressions |
| Regression suite size | 40 tests, 40 passing |

---

## 7. Why live `game_rarity` for the 9 named cards WAS touched this round (and nothing else was)

Last round's report declined to touch live `game_rarity` at all, reasoning
that this project's own established practice (`docs/SEASON_1.md` §9, the
Season 1 runbook's Phase D) requires an explicit, reviewed, human decision
before anything writes to a live column real players draft/trade/pull packs
from — a practice this exact codebase has needed twice before (Fuh-Rin-Ka-
Zan/Sekka's Light, then Forbidden Droplet/Baronne de Fleur).

This round's 9-card seed is consistent with that same practice, not an
exception to it: these are not an algorithmic guess at scale, they are 9
specific, named values the human has now given **twice, explicitly, by
name** — which is exactly what "explicit, reviewed, human decision" means.
Nothing else was touched the same way: the 2015-2018 candidates stay
proposals (§4), Premature Burial stays a review item (§5), and the full
catalog's rarity/eligibility stays NOT RUN until you have DB access to
review the real output first.

---

## 8. Files changed this session (both rounds)

**Round 1:**
- `lib/valuation-engine.mjs` — 4 bug fixes
- `lib/valuation-engine.regression.test.mjs` — 9 calibration fixtures + comparison tests
- `scripts/audit-mechanic-text-dependency.mjs` — new
- `supabase/migrations/202608300900_duelist_circle_classic_format.sql` — new

**Round 2 (this update):**
- `lib/valuation-engine.mjs` — added `classifyCardContext()` (additive, does not change scoring)
- `lib/valuation-engine.d.mts` — type declarations for the new function
- `lib/valuation-engine.regression.test.mjs` — 9 new context-classification assertions (now 40 tests total)
- `scripts/audit-mechanic-text-dependency.mjs` — exported `classifyCardText`, guarded its self-run entry point so it's safely importable
- `scripts/audit-duelist-circle-classic.mjs` — new, full pipeline orchestrator
- `scripts/apply-manual-rarity-overrides.mjs` — new, the live enforcement of `rarity_manually_overridden`
- `supabase/migrations/202608301000_seed_manual_rarity_overrides.sql` — new, seeds the 9 approved values
- `docs/cardpool-classic-format-audit-2026-08-30.md` — this file (rewritten)

Not committed: `scripts/_scratch-stats.mjs`, a leftover investigation script
from confirming the network limitation at the start of round 1 (this
sandbox could not delete it from the device — `rm: Operation not
permitted`). It does nothing on its own without Supabase credentials; safe
to delete manually, or ignore.
