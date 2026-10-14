# Mini games — round 2 (owner away, everything pre-approved, 2026-10-14)

Goal from the owner: 3 new mini games that work great on iPhone AND PC,
are addictive (instant "one more try"), simple to understand but need
skill, and look good. Inspiration: hyper-casual classics (Stack,
Knife Hit, Timberman — one tap/two-side timing, instant restart).

All three follow the Pyramid Climb / Shadow Arena pattern:
deterministic engine (60 ticks/s, seeded prng), inputs recorded as
tick-stamped taps, server replays and saves only the replayed score,
Daily (same seed, 1 attempt) + Practice (weekly best), leaderboards,
rewards only via existing settlement, Night Temple / Millennium look,
centred portrait column on wide screens.

1. **Pyramid Stack** (`pyramid_stack`) — Stack clone: sandstone blocks
   slide in, tap to drop, overhang sliced, PERFECT keeps size + combo,
   3 perfects regrow. Built together with the shared infra
   (`mini_game_catalog` table + `src/lib/games/registry.ts`) so new
   games only add a catalog row + a registry entry.
2. **Millennium Strike** (`millennium_strike`) — Knife Hit clone: throw
   cards at a rotating Millennium wheel; hitting a stuck card ends the
   run; stages with N cards to clear; Boss wheels (Millennium Items)
   every 5th stage with tricky rotation (reverse, speed bursts);
   bonus "Eye" targets.
3. **Obelisk Rush** (`obelisk_rush`) — Timberman clone: tap left/right
   (or arrow keys) to move to that side and strike the obelisk; avoid
   blade segments on your side; a draining time bar refilled by each
   strike; speed ramps.

Order: (1) first (infra), then (2) and (3) in parallel, then a QA pass
on all three + final commit and report (docs/NACHTRAPPORT update).

## QA pass (2026-10-14, local devstack)

Played all three in headless Chromium at iPhone 13 (touch), 1440x900
(mouse/keyboard) and 844x390 landscape: practice runs, pause/resume,
reload + resume, game over, instant restart, Daily (one attempt, hub
shows it as used), leaderboards, a tampered score (rejected: "Score
does not match the replay"). No console errors; JS per frame < 1 ms.
Scripted players (same engine, many seeds) for the difficulty curve:

| Game | casual | decent | expert | mash |
|---|---|---|---|---|
| Stack (blocks / run length) | 29 / 30 s | 46 / 43 s | 79 / 63 s | 0 |
| Strike (pts / run length) | 78 / 19 s | 83 / 14 s | 180 / 24 s | 1 (was 33) |
| Rush (pts / run length) | 65 / 14 s | 129 / 21 s | 212 / 25 s | 4 |

Decisions:
- **Strike engine v2**: steady wheels capped at 1.12 deg/tick, so
  throwing as fast as possible lands cards 8.96 deg apart (< the 10 deg
  clash gap) and mashing dies on the 2nd card; every normal stage
  after the first has a shadow card; first-lap bosses turn at 0.85x
  (still a full turn within 20 s). Open v1 runs are refused with
  "Game version changed".
- Daily runs no longer say "New best this week" (the weekly board is
  practice only): they say "Beats your practice best".
- Leaderboard units: Stack "blocks", Strike/Rush "pts".
- /games: one art tile per game (`mini-game-art.tsx`), one-line
  taglines, a Daily status chip and today's leader.
- Landscape phones: side labels hide when the column is < 300 px and
  the "Tap to start" card is compact on short screens.

# Round 3 — three STRATEGY mini games (2026-10-14, pre-approved)

Same rules as round 2 (iPhone + PC, addictive, simple to learn / skill
to master, premium Night Temple look, deterministic engine + server
replay, Daily + Practice boards, catalog + registry, instant restart).
More thinking, less reflex:

4. **Merge of Ra** (`merge_ra`) — 2048-like: swipe/arrow keys slide a
   4x4 board of Millennium tiles that merge up a ladder (Ankh → Scarab
   → Eye → … → Ra); seeded spawns; score = merge values.
5. **Tomb Blocks** (`tomb_blocks`) — Block Blast / 1010!-like: place 3
   offered sandstone shapes on an 8x8 grid (drag on phone, drag/click
   on PC), full rows/columns clear with combos; game over when no
   piece fits.
6. **Giza Peaks** (`giza_peaks`) — TriPeaks solitaire with Duel
   Monster-style cards: play cards one higher/lower than the waste
   card, chains multiply, clearing the peaks deals the next round;
   run ends when a deal can't be finished (stock + moves exhausted).

Order: build all three in parallel (each only adds its own files,
migration via register_mini_game, one registry entry), then one QA +
polish pass, then commit + report.
