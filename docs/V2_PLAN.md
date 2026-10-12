# Duelist Circle 2.0 — plan

Decided with the owner in a grilling session on 2026-10-12 (Q1–Q81).
This is the source of truth for 2.0 scope. Owner-facing language is
Dutch; the app itself becomes fully English.

## Release model

- Everything ships **at once** on a launch night (big bang). Nothing
  from 2.0 goes to `main` / production before that — not even bug
  fixes (owner's explicit choice, Q26).
- Work on branch `v2`. Pushing `v2` to GitHub is allowed; never push
  to `main`, never touch the production Supabase database.
- Build and test against a **separate test database** (local Supabase).
- **Test bots** (Playwright, 3–4 fake players) replay full rounds incl.
  phone viewport, and assert every DP/pack grant is exact. Owner does a
  final check on their phone.
- No hard date yet.

## Core concept (most important rule)

Strong cards are fine; **unfair cards are not**.

- Out: lock/stall cards (Yata-lock, Imperial Order-style floodgates,
  endless locks), one-turn-win combo engines (FTK/OTK loops, burn
  loops), Chaos Emperor Dragon - Envoy of the End (full board + hand
  wipe).
- Allowed: alternate win conditions (Exodia, Final Countdown, Destiny
  Board…).
- One-sided board wipes (Raigeki, Dark Hole, Harpie's Feather Duster)
  become **Legendary** = 1 copy in the whole league.
- Concept = Classic old-school feel + scarcity + Boss-centric.

## Card pool & ranking (redo properly)

- Pool: **Duelist Circle Classic** — core cutoff 2014-12-31, curated
  2015–2018 whitelist, Extra Deck Fusion + Xyz only. Remove the
  Synchro-dependent leaks (e.g. Junk Synchron, Synchro Barrier).
- Banlist base: **official TCG Forbidden & Limited list in force at end
  of 2014**, plus our own "unfair" list on top. Cards can be forbidden
  or limited.
- Master Duel: the group plays **unlimited** rooms, so the MD banlist
  does NOT apply. Only exclude cards that don't exist in MD and
  "legacy" cards (exact meaning: research item). Current code blocks
  MD-forbidden cards — change that.
- Re-run the valuation engine on the real catalog, fix eligibility
  (text-dependency layer, release_stage, unknown dates), then the
  **whole group votes in-app** (stem-scherm on the test site): per Boss
  theme top lists + all Legendaries + the proposed forbidden/limited
  list: "klopt / te sterk / te zwak"; majority wins, owner breaks ties.
- Weak Boss routes get extra/better support cards (don't nerf strong
  ones).

## Rewards

- Fully automatic. Reward pop-up at the moment it happens + wallet
  always shows the reason. Admin "corrigeer beloning" button with reason
  for exceptions.
- Fix: corrections don't re-settle round grants; shop singles can sell
  Boss-exclusive/stage-4 cards; `install_default_round_rewards_v2` is
  callable by anyone + writes DP directly instead of
  `_credit_duel_points`; stale TS reward models/verify scripts.
- Ad-hoc (non-competition) duels give **no DP** anymore (wagers stay as
  an option).

## Balance (season simulator)

- Rhythm: ~3 rounds per week on different days; 1 round = everyone
  plays everyone once (3 players → 3 matches). Season ≈ 3 months ≈ ~39
  rounds.
- Target: after 3 months **2 Boss routes fully evolved, 3rd is a
  stretch goal**.
- A season simulator plays the season with fake players and proposes
  Boss stage prices, slot prices, pack prices/odds, round rewards, P2W
  perk amounts, Season Path, bounty/catch-up and mini-game rewards.
  Owner approves the numbers. Boss evolution = DP only (achievement
  questions removed). Owner wants it pricier than 1,500/3,000/5,000 —
  simulator decides.

## Simplicity & navigation

- Bottom menu: **Home · Play · Cards · Shop · Profile**.
  - Play = season competition, current round, practice duels, LP
    counter, mini games.
  - Cards = collection, decks, trades.
  - Profile = Boss Path, wallet, perks, Stats (rivalries + records +
    badges), season titles.
- Remove: Market (empty placeholder), Activity feed.
- Home: weekly goals, "waiting on you" (challenges, trade offers),
  current round. Nothing else.

## Duels & competition

- Record a result by **tapping the winner**. Practice duels: opponent +
  winner on one screen; wager as optional add-on.
- **One long season competition**; a "This round" screen shows who
  plays whom with winner buttons and the standings below.
- Boss achievement questions after duels: **removed entirely**.
- Season end (~3 months): champion gets a permanent title/badge.

## Cards & decks

- New **phone-first deck builder**: no jumping (no redirect per tap),
  fast (paginated/virtualised, no full re-render), big tap targets.
- Smart search: "dark warrior level 4" → recognised words become
  removable filter chips; rest searches name + effect text.
- Filters: monster type (Warrior, Spellcaster…), attribute,
  level/rank, ATK/DEF range, card kind (Effect/Normal/Fusion/Xyz/
  Ritual/Tuner/Flip; Quick-Play/Continuous/Field/Equip/Counter).
- Fix the Supabase 1000-row cap everywhere (cards vanish in trades,
  binder, deck builder).
- Binder shows **all** of a friend's cards; "for trade" ones labelled.

## Engagement

- **Weekly goals** (play / collect / trade): provisional 3 per week,
  +150 DP each, all 3 = Premium Pack. 📌 Owner wants to design weekly
  goals in more depth later — do not finalise.
- **Season Path**: one free reward track across the season.
- **Bounty on #1 + catch-up bonus for #3.**
- Owner declined: chapters, Legendary hunt, sealed night, wrapped,
  Legendary ante, weekly special missions, set collection, shop teaser,
  push notifications, daily login reward.

## Mini games (under Play)

- Must be **AI-proof** (skill/reflex/strategy, not lookup-able).
- **Climber** (Doodle Jump-like): your Boss climbs the Millennium
  pyramid; platforms = cards, power-ups = spells (Monster Reborn = extra
  life), obstacles = traps. Highest climb wins.
- **Auto battler**: shared shop pool per run (Battlegrounds-like), vs
  computer Bosses only; leaderboard = how far you get.
- Daily challenge: same seed for everyone, 1 attempt. Weekly board:
  unlimited practice, best score counts.
- Rewards **only via leaderboard placement** (daily/weekly winners).
  Server-side score validation.
- Both games ship at launch.

## Look & feel

- New **Millennium / Egypt** style for season 2 (old gold, sandstone,
  hieroglyphs, mysterious light). **Decided 2026-10-12: option B
  "Night Temple"** (obsidian/lapis + glowing gold; see
  docs/design/v2-style-options.html). A and C are not built.
- Whole app should feel impressive: smooth motion everywhere, big
  moments for pack opening, Legendary pulls, Boss evolution, results,
  champion reveal.
- fal.ai: Boss arenas, season poster/theme, short videos, player
  avatars/titles. Original art only — never imitate Konami card art.
  Overnight budget 2026-10-12: max ~$10.
- ElevenLabs: English arena announcer + SFX, sound toggle (not
  connected yet).
- App language: English.

## New season at launch

- Light reset (accounts stay; cards, DP, decks, Boss progress → 0).
- Activate Classic pool. Same onboarding as season 1: Boss Path →
  Initial Draft → 3 welcome packs.

## Work order

1. Test database + test bots
2. Speed + 1000-row fix
3. Card pool, banlist, ranking + voting screen
4. Reward fixes + season simulator
5. Millennium style designs
6. New menu + cleanup
7. Deck builder + filters
8. Duels, "This round", season competition
9. Boss prices, weekly goals, binder, Season Path, bounty
10. Climber game
11. Auto battler
12. Art, video, announcer, animations
13. Reset, final bot test, owner phone check, launch

## Open

- ~~Research: what "legacy cards" means~~ → "Legacy" = MD's free Legacy
  Pack (~4,000 cards, can't be dismantled) — fully playable in
  Unlimited rooms, so NOT an exclusion. Only "not in Master Duel"
  excludes (23 Classic cards). See docs/cardpool-v2-foundation.md.
- Owner decisions: Boss-route clashes with the concept (Chaos Emperor
  Dragon is the Chaos/BLS stage-4 boss; Dark Magician of Chaos was
  forbidden in 2014; board-wipe support grants vs "1 per league"; the
  Cubic route is all post-2014). Proposal: Boss evolution monsters and
  exclusive route grants are exempt from pool rules.
- Owner approval: season simulator numbers (docs/season-sim-report.md).
- Connect ElevenLabs.
- Weekly goals deep-dive with owner.
