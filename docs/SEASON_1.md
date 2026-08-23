# Duelist Circle — Season 1: Reset, Format & Card Rebalance

This document explains, in plain language, what Season 1 changes, what it
keeps, and how the new systems fit together. It's written for the league
owner, not just developers — if a term needs a developer to understand it,
there's an explanation next to it.

For the exact step-by-step commands to actually run any of this, see
**[`SEASON_1_RUNBOOK.md`](./SEASON_1_RUNBOOK.md)** in this same folder.
This document is the "what and why"; the runbook is the "how, in order."

---

## 1. What a Season Reset wipes, and what it keeps

A Season Reset is for starting completely fresh — new draft, new
collections, new decks, same league.

**Wiped:** every account's real login and profile, league membership,
draft progress, owned cards, decks, matches and their wagers, trades, shop
purchase/pack-opening history, pity counters, reward vouchers, and
competitions (including their results and reward grants).

**Kept:** the card catalog (every card and its data), app-wide settings,
Boss Monster options, shop pack types and rotation configuration, the new
Duelist Circle format configuration, and the audit log. The league itself
(its name, its row in the database) is also kept — only its *members* are
cleared, so the same "Friends League" is still there for people to rejoin.

One consequence of keeping the league but clearing its members: **nobody
has the admin role right after a reset.** When players register again,
they automatically rejoin the *existing* league as a normal player, not as
admin (that's just how the app's own registration logic works — it only
hands out admin when it creates a brand-new league). The runbook's last
step covers restoring admin access; it's a deliberate one-command fix, not
something forgotten.

Usernames and duelist names genuinely free up — once an old account is
gone, a new account can reuse the same name, including names like
"Bossg" that were used by test/ghost accounts before.

## 2. How the reset actually runs (safety design)

The reset is not a script that just deletes things. It's two database
functions plus a small command-line tool:

- **`season_reset_preview()`** — read-only. Shows exactly how many rows
  in each affected table would be touched. Changes nothing. Safe to run
  as often as you like.
- **`season_reset_apply(...)`** — the real, destructive step. It only
  runs for a league admin, and it requires you to type the exact phrase
  `RESET DUELIST CIRCLE SEASON` — get that wrong and nothing happens.
  Every delete happens inside one database transaction, so if anything
  goes wrong partway through, the *entire* reset rolls back automatically
  — there's no "half-reset" state.
- **`scripts/season-reset.mjs`** — the command you actually run. It shows
  you the preview first, always, then asks you to confirm before doing
  anything real, then (if you didn't skip it) removes the old login
  accounts too.

Nothing in this reset touches `card_catalog` (your card data), your app
settings, or the league itself.

## 3. Backup before you reset

There is no automatic backup built into this tooling. **Before running a
real reset, export a backup of your Supabase project yourself**: Supabase
Dashboard → your project → Database → Backups (or use `pg_dump` if you're
comfortable with that). The preview step (`season_reset_preview()`) also
gives you an exact count of everything about to disappear, so you know
precisely what a restore would need to bring back.

## 4. The Duelist Circle Format

Previously, "which cards are allowed" was a single yes/no flag per card
(`format_eligible`) set once and never really explained. Season 1 replaces
*how that flag gets set* with a proper, versioned system — the flag itself
still exists and Draft/Shop/Deckbuilder still just read it, so nothing
about those existing systems needed to change.

A **format** (`duelist_circle_formats` table) is a named, versioned
ruleset: a release cutoff date, which mechanics are allowed (Synchro,
Xyz, Link, Pendulum, Fusion, Illusion), an optional power ceiling, and a
"current release stage" (see §5 below). Only one format can be active at
a time.

A card is eligible for the active format if, in order:

1. **Master Duel status isn't a hard block.** Forbidden, not-available,
   or never-checked cards are excluded no matter what else is true — this
   check always wins, even over a manual include.
2. **No manual exclusion** exists for this card in this format.
3. **Manual include** exists for this card in this format → eligible
   (skips the mechanic/cutoff/stage checks below, but never the Master
   Duel check above).
4. **Mechanic is allowed** (e.g. a Synchro Monster is only eligible if
   the format's `allow_synchro` is true).
5. **Released before the cutoff** — or the release date simply isn't
   known yet, which is never treated as a reason to exclude a card.
6. **Power ceiling**, if the format sets one.
7. **Release stage** — the card's own stage must be at or below the
   format's current stage (see §5).

A seeded, **inactive** "Season 1" format already exists in the database
(cutoff 2020-12-31, Synchro/Link/Pendulum/Illusion off, Fusion/Xyz on) —
deliberately chosen to match today's live exclusions, so turning it on
doesn't silently change anything beyond what this document describes.
Activating it is a manual decision (Phase D+ in the runbook), not
something this run did for you.

## 5. Progressive release stages

Some cards are strong enough that they shouldn't be available on day one,
but they also shouldn't be *deleted* — they should show up later, once
the format has matured. `card_catalog.release_stage` is that mechanism: a
card with `release_stage = 2` simply isn't offered while the format's
`current_release_stage` is `1`. Raising the format's stage later makes
those cards available with no schema changes and no data loss. This run
sets up the columns and the eligibility check; it does not assign real
stage numbers to your real catalog or advance any stage automatically —
that's a decision for whenever you're ready (see the card audit in §7).

## 6. Card valuation & rarity

The old rarity system was a one-shot, keyword-heuristic script with real,
demonstrable mistakes (a few examples: **Fuh-Rin-Ka-Zan** and **Sekka's
Light** were both misclassified as Legendary despite being narrow,
heavily-conditional cards with modest standalone value). A first rebuild
(engine version `2026-08-23.1`) replaced that with seven explainable
scores, but a real run against the live catalog found it had its own
real mistakes — it inferred "this card needs archetype X" too eagerly
from a database archetype tag rather than what the card's own text
actually requires, most visibly on **Forbidden Droplet** (a fully
generic Spell, wrongly treated as needing "Forbidden" support) and
**Baronne de Fleur** (a Fusion Monster with completely generic Fusion
Materials, wrongly treated as needing "Fleur" support). It also let a
handful of superficially-similar "negate" cards converge to nearly
identical scores.

The engine was rebuilt again (`lib/valuation-engine.mjs`, version
`2026-08-23.2`) specifically to fix the ROOT CAUSE, not just those two
cards: dependency is now built entirely from classifying what a card's
own text actually requires (a real "mandatory requirement" clause vs. a
"mandatory Fusion/Synchro/Xyz/Link material" vs. an "optional bonus" vs.
a "search target" vs. just a thematic name/archetype tag with no
functional link) — a database archetype tag is never, by itself, a
reason to penalize a card. Eight explainable scores are now produced per
card: **Power**, **Accessibility**, **Dependency**, **Generic Utility**,
**Consistency**, **Floor** (guaranteed value with zero synergy), **Ceiling**
(best-case value fully supported), and **Oppressiveness** — plus a
combined **Draft Value**, each with a plain-language reason, never just a
number. Archetype/build-around cards are explicitly allowed a high
Ceiling even with real Dependency — dependency penalizes Draft Value, it
is not a death sentence on how good a card can be in the right deck.
Oppressiveness is deliberately kept OUT of Draft Value entirely: a card
can be both highly desirable (a high rarity) and unsuitable for a small
Season 1 pool (a high oppressiveness, handled via `release_stage`) at
the same time — those are two separate questions.

A regression suite (`lib/valuation-engine.regression.test.mjs`, 12 named
cards including Forbidden Droplet and Baronne de Fleur) verifies the
fix — see the session report for the full account, including what could
and could not be verified without a live database in this sandbox.

`scripts/audit-card-valuation.mjs` runs this engine against your real
catalog and produces a full **proposal** — nothing is changed until you
explicitly ask it to be (see §9, and the runbook's Phase C/D). It never
touches your live `game_rarity` unless you pass `--write-scores`, and
even then only the new "proposed" columns — never the live rarity or
format columns.

## 7. Oppressiveness

Separately from raw power, every card is flagged green / orange / red
for how oppressive it would be in an early, small-pool format —
repeatable removal, floodgates, hard-to-answer locks, and so on. This is
about *summon ease and repeatability*, not any single keyword — for
example "cannot be destroyed by battle" alone is explicitly **not**
treated as a red flag; it's a completely normal, common mechanic. Nothing
is auto-deleted for being red — it's a recommendation to consider a later
release stage, always with a plain-language reason attached.

## 8. Master Duel status vs. Duelist Circle format

These are two separate, independent things: a card can be legal in real
Master Duel but not yet released in your format (still coming in a later
stage), or in principle format-eligible while being forbidden or
unavailable in Master Duel (which always excludes it regardless of
format settings — see §4, step 1). The Master Duel status
(`unlimited` / `semi_limited` / `limited` / `forbidden` / `not_available`
/ `unknown`) is tracked per card and never assumed — `unknown` is treated
as unsafe, not as "probably fine."

## 9. Nothing changes in production without your review

Every one of the analysis tools this run produced (card valuation,
format-cutoff comparison, draft simulation) works the same way: it writes
a **report** you can read, never a silent database change. The only
things that actually write to your live data are two explicit,
opt-in steps — `--write-scores` on the valuation audit (and even that
only touches new "proposed" columns, never the live rarity), and
`recompute_format_eligibility()` (only touches the existing
`format_eligible` column, and only after you've activated a format on
purpose). Nothing else in this run is capable of changing your real data.

## 10. Master Duel deck export

Researched directly (see the commit message on this feature, and
`src/lib/master-duel-export.ts`'s own header comment, for the sources):
Konami does not offer a way for a third-party app like this one to push a
deck directly into Master Duel. The two things that genuinely work are
importing a deck that's already public in the Official TCG Card Database,
or one that's public in the NEURON app — and even the well-known
community tools that make this easier don't bypass that; they automate
getting your deck onto the TCG Database, then use Konami's own import.

So the deck page now offers two honest things instead: a plain-text
checklist to manually rebuild your deck in the TCG Database or NEURON
(with each card's real Master Duel legality shown next to it), and a
standard `.ydk` file most *other* deck-building tools can read. Neither
one is described anywhere as "importing to Master Duel," because it
isn't.

## 11. What still needs a real database to finish

A few pieces of tooling were built and tested as much as this sandboxed
session allowed, but genuinely need to run against your real Supabase
project to produce real numbers — this is called out explicitly rather
than pretended away:

- **`scripts/audit-card-valuation.mjs`** — logic verified against real,
  individually-sourced cards; needs a real run for full-catalog numbers.
- **`scripts/sync-card-release-dates.mjs`** and
  **`scripts/audit-format-cutoffs.mjs`** — the 2019/2020/2021 cutoff
  comparison needs real release dates backfilled first, which needs
  network access this session didn't have.
- **`scripts/simulate-draft-value.mjs`** — the roll mechanism itself is
  verified (20,000 rounds reproduce the configured odds almost exactly);
  real "average value per rarity" numbers need a real catalog export.

See the runbook for exactly when and how to run each of these.
