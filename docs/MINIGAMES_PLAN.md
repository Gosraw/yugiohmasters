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
