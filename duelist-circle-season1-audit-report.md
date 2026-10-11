# Duelist Circle — Season 1 Audit & Repair Report (CORRECTED)
**Date:** 2026-09-02 | **Repo:** `yugioh-friends-league` (device-linked, not this session's own filesystem) | **Status:** ALL items resolved, including the machina duplicate-grant finding and the Harpie real passcode — see §14. Global 20-route overlap audit: zero remaining. All pre-commit assertions pass. `npx tsc --noEmit` / `npx eslint .` / `npm run check:sql` all clean. **Committed** as `1a4b395e97dc000c2764deb8c3e66c5081342302` — **NOT deployed** to any live database; this is a local git commit on the device-linked repo only.

---

## 0. What changed since the rejected commit `5824a54`

The previous version of this report and its commit were rejected. The rejection was correct: §4's Boss Route table labeled 17 of 20 routes "Confirmed correct" based only on internal structural consistency (no duplicate rows, valid foreign keys) — it was never actually diffed against the authoritative "FINAL 20 BOSS STAGE IDENTITIES" list. This version corrects that by re-deriving the original spec verbatim from this session's own pre-compaction transcript (the spec text had been lost to an earlier compaction) and diffing all 20 routes against it, card by card, with every target card name checked for an exact `card_catalog.name` match — no substitutions.

Three other things were reverted from `5824a54` on explicit instruction:
- A Stage 3 support grant for plain "Dark Magician" that was invented, not specified.
- "Crimson Nova Trinity the Dark Cubic Lord" as a substitute for the spec's actual 4th Cubic Stage 4 support card ("Crimson Nova Boss EX") — not approved, and the substitute was never verified against the catalog either.
- The Shop/Draft Boss-Route exclusion clause, which excluded a card if it was the evolution monster for **any** stage (1-4) of a route — the authoritative rule only excludes **Stage 4** monsters plus explicitly `is_route_exclusive`-flagged support.

This version also corrects the Special Pack section: the 15-pack proposal in the rejected commit was too narrow (single-Type/single-archetype pools capped at ~175-290 cards via `order by name limit N`, not real curation) and is replaced below with a broader, multi-archetype "booster set" proposal — **still pending approval**, not implemented as pool data.

**No git commit has been made this pass.** Everything below describes migrations written to the repo but not committed, per explicit instruction to wait for approval of the new 15-pack proposal first.

---

## 1. Executive summary (updated)

Of the 20 Boss Routes: **1 was already correct** (Dark Magician — fixed earlier this session, before this correction round), **1 needed no evolution-chain change** (Cubic — its Stage 4 support gap remains unresolved, not fixed), **1 is explicitly left untouched** (Dinosaur, per "verify before changing, do not guess"), **1 is blocked entirely** (Harpie — its Stage 4 card does not exist in the catalog under the spec'd name, so the whole route stops per the "do not substitute" rule), and **16 required real stage-identity corrections**, now applied in one new migration (§4). The Shop and Draft Boss-Route exclusion clauses were both over-broad (excluded every stage, not just Stage 4) and are now fixed to the Stage-4-only rule, consistently, across Draft, Shop, and Special Packs (§6). The welcome-bonus backfill is scoped to exactly the three already-live players and is proven, by code path, to add zero vouchers for them (§7). The Special Pack pool architecture (tables, pool-membership pull logic) is built and safe to deploy empty; the actual 15 pack identities and their card pools are a **new proposal in §5, awaiting approval**, not yet implemented.

Everything unrelated to Boss Routes/Welcome Bonus/Boss Exclusion/Special Packs from the original audit (onboarding gate fix, Home dashboard boss-identity fix, the open `format_eligible` live-verification item, the documentation corrections, the dead-code inventory) was not revisited this pass and is carried forward unchanged from the original report — see §11 for a summary list; the original per-item detail is still accurate for those items.

---

## 2. What was wrong in `5824a54` (item A)

| # | What the rejected commit claimed | What was actually wrong | Root cause |
|---|---|---|---|
| 1 | 17/20 Boss Routes "Confirmed correct" | Diffed against nothing — the authoritative final-stage-identity spec had been lost to an earlier compaction and was never actually re-checked. 16 of those 17 do not match the real spec. | No verification step existed; "no structural bugs" was conflated with "matches spec." |
| 2 | Dark Magician Stage 3 support: added plain "Dark Magician" | Never specified anywhere in the spec (only 5 named Stage 1 support cards are specified for this route). Invented. | Reasoning "it was the old Stage 3 evolution card, so it must still belong somewhere" — an assumption, not a requirement. |
| 3 | Cubic Stage 4 support: added "Crimson Nova Trinity the Dark Cubic Lord" | Not the spec's actual card ("Crimson Nova Boss EX"), and never checked against the catalog itself. | Substituted a plausible-sounding real card instead of stopping and reporting the missing one. |
| 4 | Shop pack exclusion (`202609020930` as first drafted) mirrored Draft's existing clause | Draft's own clause (`202609011700`, already deployed) excludes a card if it's the evolution monster for **any** stage, not just Stage 4 — copying it forward just propagated the same over-broad rule into Shop. | The authoritative rule ("Stage 4 monsters + `is_route_exclusive` grants only") was never diffed against the deployed Draft code before reusing its shape. |
| 5 | Special Pack: 15 packs proposed and pool-seeded via `order by card_catalog.name limit N` | Not real curation — an alphabetical slice of whichever cards matched a broad filter, with 2 packs already flagged under the 200-card floor and several others effectively single-archetype ("Golden Age Archetypes" was 5 archetypes crammed into one pack; several "Type-wide" packs were really one dominant archetype plus filler). | Treated "reaches a count above 12/200" as sufficient design work; never asked whether the resulting pack felt like a deliberate booster set. |

---

## 3. Corrected 20-route Boss Route table (item C)

Re-derived by extracting every route's **current** stage identities directly from `supabase/migrations/202609011900_seed_boss_routes.sql` (the deployed seed) and diffing against the recovered "FINAL 20 BOSS STAGE IDENTITIES" spec, card by card. Every "Final" name below was checked for an **exact** match against `card_catalog.name` (verified against the local card-valuation snapshot, `reports/card-valuation/2026-08-25T12-39-31-069Z/full-proposal.csv`) — no substitutions were made for a name that didn't resolve.

| Route | Current source (seed) | Final (spec) | Needs migration? |
|---|---|---|---|
| chaos_bls | Chaos Command Magician → Black Luster Soldier - Envoy of the Beginning → Chaos Sorcerer → Chaos Emperor Dragon - Envoy of the End | D.D. Warrior → D.D. Warrior Lady → Chaos Sorcerer → Black Luster Soldier - Envoy of the Beginning | **Yes** — Stage 1, 2, 4 (§4) |
| dark_magician | Apprentice Magician → Dark Magician Girl → Dark Magician → Dark Magician of Chaos | Berry Magician Girl → Dark Magician Girl → Dark Magician of Chaos → The Dark Magicians | Already fixed (`202609020910`, corrected this pass to remove the invented Stage 3 grant) |
| elemental_hero | Elemental HERO Sparkman → Flame Wingman → Great Tornado → The Shining | Elemental HERO Bubbleman → Blazeman → The Shining → Absolute Zero | **Yes** — all 4 stages (§4) |
| blue_eyes | The White Stone of Legend → Blue-Eyes White Dragon → Blue-Eyes Ultimate Dragon → Blue-Eyes Shining Dragon | Kaibaman → Blue-Eyes White Dragon → Blue-Eyes Alternative White Dragon → Blue-Eyes Jet Dragon | **Yes** — Stage 1, 3, 4 (§4) |
| cyber_dragon | Cyber Dragon → Cyber Twin Dragon → Cyber End Dragon → Chimeratech Fortress Dragon | Proto-Cyber Dragon → Cyber Dragon → Cyber Dragon Nova → Cyber Dragon Infinity | **Yes** — all 4 stages (§4) |
| jinzo | Jinzo #7 → Jinzo → Jinzo - Lord → Jinzo - Returner | Jinzo - Returner → Jinzo - Jector → Jinzo → Jinzo the Machine Menace | **Yes** — all 4 stages (§4) |
| armed_dragon_ojama | Armed Dragon LV3 → LV5 → LV7 → Armed Dragon LV10 | Armed Dragon LV3 → LV5 → LV7 → **Armed Dragon Thunder LV10** | **Yes** — Stage 4 only (§4) |
| crystal_beast | Ruby Carbuncle → Sapphire Pegasus → Amber Mammoth → Rainbow Dragon | Ruby Carbuncle → Sapphire Pegasus → Rainbow Dragon → Rainbow Overdragon | **Yes** — Stage 3, 4 (§4) |
| red_eyes | Red-Eyes Black Dragon → Red-Eyes Wyvern → Red-Eyes Darkness Metal Dragon → Red-Eyes Slash Dragon | Black Metal Dragon → Red-Eyes Black Dragon → Red-Eyes Flare Metal Dragon → Meteor Black Comet Dragon | **Yes** — all 4 stages (§4) |
| zombie | Pyramid Turtle → Zombie Master → Ryu Kokki → Despair from the Dark | Pyramid Turtle → Zombie Master → Red-Eyes Zombie Dragon → Doomking Balerdroch | **Yes** — Stage 3, 4 (§4) |
| dinosaur | Babycerasaurus → Kabazauls → Super Conductor Tyranno → Ultimate Conductor Tyranno | Babycerasaurus → Souleating Oviraptor → Ultimate Conductor Tyranno → *(spec: "verify Stage 4 against project history, do not guess")* | **No — explicitly not touched.** Flagged, unresolved. |
| legendary_fisherman | The Legendary Fisherman → II → III → Levia-Dragon - Daedalus | Warrior of Atlantis → The Legendary Fisherman → II → III | **Yes** — all 4 stages (§4) |
| machina | Machina Soldier → Sniper → Fortress → Force | Machina Gearframe → Fortress → Citadel → Ruinforce | **Yes** — all 4 stages (§4) |
| toon | Toon Goblin Attack Force → Toon Mermaid → Toon Dark Magician Girl → Toon Summoned Skull | Toon Mermaid → Toon Dark Magician Girl → Toon Dark Magician → Toon Black Luster Soldier | **Yes** — all 4 stages (§4) |
| harpie | Harpie Lady → Harpie Lady Sisters → Harpie Queen → Harpie's Pet Dragon | Harpie Lady → Harpie Channeler → Harpie's Pet Phantasmal Dragon → **"Harpie's Pet Dragon - Fearsome Fire Blast" — does NOT exist in `card_catalog`** (only the plain "Harpie's Pet Dragon" exists, a different, non-equivalent card) | **STOPPED — whole route, not just Stage 4.** Left completely untouched pending your decision. Stages 1-3 resolve fine on their own, but the rule is "stop the route, don't substitute," so nothing was changed. |
| ancient_gear | Ancient Gear → Ancient Gear Soldier → Ancient Gear Golem → Ancient Gear Reactor Dragon | Ancient Gear Hunting Hound → Ancient Gear Golem → Ultimate Ancient Gear Golem → Chaos Ancient Gear Giant | **Yes** — all 4 stages (§4) |
| galaxy_photon | Photon Thrasher → Galaxy-Eyes Photon Dragon → Galaxy-Eyes Cipher Dragon → Number 62: Galaxy-Eyes Prime Photon Dragon | Photon Thrasher → Galaxy-Eyes Photon Dragon → Number 62: Galaxy-Eyes Prime Photon Dragon → Number C62: Neo Galaxy-Eyes Prime Photon Dragon | **Yes** — Stage 3, 4 (§4) |
| destiny_hero | Destiny HERO - Malicious → Diamond Dude → Plasma → Dystopia | Destiny HERO - Diamond Dude → Plasma → Dystopia → Destroyer Phoenix Enforcer | **Yes** — all 4 stages (§4) |
| vampire | Vampire Sorcerer → Lord → Genesis → Fraulein | Vampire Familiar → Shadow Vampire → Dhampir Vampire Sheridan → The Zombie Vampire | **Yes** — all 4 stages (§4) |
| cubic | Dark Garnex the Cubic Beast → Duza the Meteor Cubic Vessel → Buster Gundil the Cubic Behemoth → Crimson Nova the Dark Cubic Lord | *(identical — no evolution-chain change)* | **No.** Only its Stage 4 support gap remains: "Crimson Nova Boss EX" does not exist in `card_catalog`. Not fixed, not substituted — flagged. |

**16 routes needed a migration; Dark Magician was already fixed; Cubic needs no evolution change; Dinosaur and Harpie are both explicitly untouched.**

---

## 4. New migration: 16-route stage-identity fix

**File:** `supabase/migrations/202609020960_fix_16_boss_route_stage_identities.sql`

Every one of the 53 changed (route, stage) cells listed in §3 is applied by **one single multi-row `UPDATE ... FROM (VALUES ...)`** statement, not 16 separate per-route statements and not 53 separate per-cell statements. This matters because `boss_route_stages` has a `UNIQUE (route_id, evolution_card_catalog_id)` constraint that is **not deferrable**, and several routes reassign a card that currently sits at a *different* stage of the *same* route to a new stage number — for example, `jinzo`'s card currently at Stage 2 ("Jinzo") needs to move to Stage 3, and `legendary_fisherman` rotates three cards down one stage each. Running these as separate statements (even in careful order for some routes) risks — and for several routes would guarantee — a transient uniqueness violation. A single UPDATE statement sourced from one VALUES list changes every affected row together, so Postgres evaluates the constraint only against the statement's final state and never sees an intermediate collision, regardless of ordering.

The migration ends with a `do $verify$` block (matching the style of the already-deployed `202609011700`) that: (1) re-derives the same 53-row VALUES list and confirms every one of those (route, stage) cells now points at the spec'd card by name; (2) explicitly re-confirms `dinosaur` Stage 4 and all four `harpie` stages still point at their original, unmodified cards — a hard failure (transaction rollback) if either was accidentally touched. `dp_cost_to_reach` is untouched everywhere; the spec doesn't redefine DP costs, only stage identities.

**One thing flagged, not fixed:** `chaos_bls`'s existing seed data grants "D.D. Warrior Lady" as a **Stage 1 support card** (`boss_route_stage_grants`) — and this fix now also makes D.D. Warrior Lady the route's **Stage 2 evolution card**. That means the same card is both a Stage 1 reward *and* the Stage 2 goal on the same route. This wasn't part of what was approved to fix this pass (the approval covers stage-identity corrections, not support-grant restructuring), so the grant row was left exactly as-is. Flagging it for a decision: should that Stage 1 support grant be removed now that D.D. Warrior Lady is also an evolution card on this route?

---

## 5. NEW Special Pack proposal — 15 packs (item F, NOT YET APPROVED)

Per your correction, this replaces the rejected narrow proposal. Every pack below combines multiple related archetypes/packages plus generic Type-wide support — none is a single narrow archetype with filler. Anchor counts are **real, verified** archetype-tag frequencies from the local card-valuation snapshot (`reports/card-valuation/2026-08-25T12-39-31-069Z/full-proposal.json`, filtered to cards flagged `format_eligible_proxy = true` as the closest local stand-in for the live `format_eligible` flag — there is no live DB connection from this environment to check the real flag). Two real limits of this local snapshot, both flagged rather than papered over: it has **no Attribute field** (so DARK-specific counts for pack 1 can't be verified locally, only its archetype anchors can), and its counts don't yet subtract Stage-4/`is_route_exclusive` cards (which will trim every pool slightly once applied live). "Generic support" pool contributions are described qualitatively, not counted card-by-card — the exact card list is a follow-up seeding step, not this proposal.

| # | Name | Theme concept | Main archetypes/packages | Secondary archetypes/packages | Generic support families | Est. pool size | Distinctiveness |
|---|---|---|---|---|---|---:|---|
| 1 | Chaos & Shadows | DARK/Chaos, banishment & graveyard attrition | Black Luster Soldier / Chaos (31 verified) | D.D. banish package (23 verified) | DARK/Fiend-aligned removal, banish, and GY-attrition Spells/Traps/monsters drawn from the 518-card Fiend Type pool | ~220-260 | The only pack built around banish-as-a-resource and Chaos-summoning rather than one monster Type; Attribute data unverifiable locally, flagged for live confirmation. |
| 2 | Arcane Circle | Spellcaster / classic magic-users | Dark Magician (42 verified) | Spellbook (32 verified), Gravekeeper's (30 verified) | Broad Spellcaster-Type monsters + spellcaster support Spells/Traps (442-card Spellcaster pool) | ~260-300 | The format's core "magic user" cluster, anchored by the route's own lineage. |
| 3 | Iron Legion | Machine, the format's single largest Type | Cyber Dragon (24), Ancient Gear (20), Machina (21) | Gadget (12), Geargia (12), Jinzo (14 verified) | Broad Machine-Type monsters + Machine support (643-card Machine pool, the largest of any Type) | ~280-320 (trim to fit) | Unites four separate Boss Route lineages in one Type. |
| 4 | Dragon's Roar | Dragon, plus Chazz's comedic supporting cast | Photon/Galaxy-Eyes (34+15 verified), Blue-Eyes/Red-Eyes support | Armed Dragon LV-line, Ojama (14 verified) | Broad Dragon-Type monsters + Fusion/Xyz Dragon enablers (372-card Dragon pool) | ~240-280 | Unites all four Dragon-line routes plus the Ojama package from Chazz's own route. |
| 5 | Elemental Vanguard | HERO archetypes (Warrior-Type) | Elemental HERO (93 verified), Destiny HERO (45 verified) | Evil HERO (9), Vision HERO (13), Masked HERO (7), Neo-Spacian (14) | Fusion-support Spells/Traps + generic Warrior-Type monsters (747-card Warrior pool) | ~230-260 | The single largest verified archetype cluster in the catalog (181 archetype cards before any generic top-up). |
| 6 | Zombie Uprising | Zombie, Type-wide | Broad Zombie-Type monsters (175 verified), including Vampire (25 verified — Zombie-Type in this format) | — | Zombie-Type recursion/GY support Spells/Traps | ~200-230 | Type-wide, not archetype-bound — spans every Zombie-Type archetype, not just the Zombie route's own cards. |
| 7 | Stone Age | Rock & Dinosaur | Broad Rock-Type (197 verified, incl. Crystal Beast 25, Cubic 14) + Dinosaur-Type (90 verified) | — | Rock/Dinosaur support Spells/Traps | ~230-260 | The format's two smallest major Types combined, covering three separate routes. |
| 8 | Winged Sovereigns | Winged Beast | Broad Winged Beast-Type (229 verified), including Harpie (28 verified) | Blackwing (53 verified), Simorgh (12 verified) | Wind-aligned generic support Spells/Traps | ~220-260 | Pairs the Harpie route with the format's other major Winged Beast archetypes instead of isolating Harpie alone. |
| 9 | Aqua Depths | Aqua / Fish / Sea Serpent | Broad Aqua (175), Fish (97), Sea Serpent (65) Type pool (337 combined) | Mermail (22), Atlantean (10) | WATER-aligned generic support Spells/Traps | ~260-300 (trim to fit) | The broadest multi-Type water pack in the format. |
| 10 | Beast Kingdom | Beast & Beast-Warrior | Broad Beast (269) + Beast-Warrior (191) Type pool | Naturia (35), Gladiator Beast (53), Amazoness (26) | Beast-aligned generic support Spells/Traps | ~250-300 (trim to fit) | No direct Boss Route tie-in — the format's largest non-route Type pairing. |
| 11 | Six Samurai & Warlords | Non-HERO Warrior | Six Samurai (52 verified) | Amazoness (26, non-overlapping slice from pack 10) | Generic Warrior-Type monsters not already drawn into Elemental Vanguard (747 total Warrior, ~566 remaining after pack 5's ~181) | ~240-280 | Deliberately separate from Elemental Vanguard's HERO focus — the format's classic Samurai/Amazoness decks get their own home. |
| 12 | Sanctuary of the Fairies | Fairy | Broad Fairy-Type (332 verified) | Madolche (24), Heraldic/Herald package (24), The Agent (9) | LIGHT-aligned generic support Spells/Traps | ~260-300 (trim to fit) | The format's largest Type with no Boss Route tie-in at all. |
| 13 | Verdant Swarm | Insect & Plant | Broad Insect (188) + Plant (161) Type pool (349 combined) | — | Insect/Plant support Spells/Traps | ~230-270 | The format's two most overlooked Types, given a dedicated home instead of scattered thinly elsewhere. |
| 14 | Fiend's Domain | Fiend | Broad Fiend-Type monsters (518 verified — the single largest Type in the whole catalog) | Ghostrick (29), Fabled (22) | Fiend-aligned generic support Spells/Traps | ~260-300 (trim to fit) | The format's single largest Type, given its own dedicated pack rather than only a supporting slice of pack 1. |
| 15 | Psychic Frontier | Psychic & Cyberse | Broad Psychic (110) + Cyberse (121) Type pool (231 combined, before exclusions) | — | Psychic/Cyberse support Spells/Traps | ~200-240 | The tightest pool of the 15 and the most modern/underrepresented Types — flagged as the one pack to re-verify most carefully live, with Thunder (98) or Pyro (106) as a ready broadening option if the live count lands under 200. |

None of the 15 is centered on a single Boss Route archetype in isolation — every route-adjacent pack (1-9) draws in at least one other archetype family or a full Type-wide pool alongside its route's own cards, and packs 10-15 have no Boss Route tie-in at all. Overlap between packs (e.g. Fiend appears as a secondary layer in pack 1 and as the main Type in pack 14; Gladiator Beast anchors part of pack 10 and Amazoness anchors part of both 10 and 11) is allowed per your spec and does not require the underlying cards to be different — it means two curated slices of the same eligible pool, decided at actual seeding time.

**This proposal is not implemented as data.** `shop_special_pack_definitions` and `shop_special_pack_pool_cards` exist as empty tables (`202609020940`) and `pick_shop_pack_card` already handles an empty/unassigned pool correctly (§6). Waiting for approval before writing the actual 15 `INSERT`s and their pool memberships.

---

## 6. Boss-Route exclusion — exact corrected SQL logic (item E)

**Authoritative rule, applied identically everywhere:** exclude a card if (A) it is the evolution monster for **Stage 4** of any Boss Route, OR (B) it has any `boss_route_stage_grants` row with `is_route_exclusive = true`. A Stage 1-3 evolution monster, or a non-exclusive support grant, is an ordinary card and is never automatically excluded.

```sql
and not exists (
  select 1
  from public.boss_route_stages brs
  where brs.evolution_card_catalog_id = card.id
    and brs.stage_number = 4
)
and not exists (
  select 1
  from public.boss_route_stage_grants brg
  where brg.card_catalog_id = card.id
    and brg.is_route_exclusive = true
)
```

Applied to:
- **Draft** (`create_next_draft_offer`) — already deployed with the over-broad "any stage" version since `202609011700`. Fixed forward (not edited in place) by `supabase/migrations/202609020970_fix_draft_boss_route_stage4_only_exclusion.sql`, which `create or replace`s the function with the identical body plus `and brs.stage_number = 4` added to all 7 of its occurrences of this clause (6 per-rarity availability counts + 1 final card pick). A `do $verify$` block confirms the function still references both exclusion tables and contains exactly 7 occurrences of `brs.stage_number = 4`.
- **Normal/Premium/Deluxe Shop pulls** — `pick_shop_pack_card`, fixed in `202609020930` (this migration was never deployed, so it's edited directly rather than fixed forward) and then **reissued again** in `202609020950` for the Special Pack pool-membership rewrite (§5's architecture work) — the version that actually ships is `202609020950`'s, since it runs later; `202609020930`'s own version of this function is superseded the moment `202609020950` runs, though both apply the same Stage-4-only rule so the end state is correct either way. Flagging the redundancy for visibility, not fixing it — no functional difference in the deployed result.
- **Special Pack pools/pulls** — same clause, present in both tiers of `202609020950`'s rewritten `pick_shop_pack_card` (§7 of that file's own header comment), so a curated pool can never contain a Stage-4/exclusive card in the first place, and a pull can never step outside it either (see next section for why that's now structurally guaranteed).

---

## 7. Welcome bonus — proof of zero duplicate vouchers for bossg/samo/fardin (item D)

`supabase/migrations/202609020920_claim_welcome_packs.sql` now does two things in order: (1) creates `season1_welcome_bonus_claims` (profile_id primary key) and backfills it with `insert ... select id from public.profiles where lower(username) in ('bossg', 'samo', 'fardin') on conflict (profile_id) do nothing;`, then (2) defines `claim_welcome_packs()`.

**The proof is a code-path guarantee, not a live query** (no live DB access from this environment). `claim_welcome_packs()`'s body is:

```sql
insert into public.season1_welcome_bonus_claims (profile_id)
values (current_user_id)
on conflict (profile_id) do nothing;

claim_inserted := found;

if not claim_inserted then
  return false;   -- <-- exits here for bossg/samo/fardin, every single call
end if;

insert into public.reward_vouchers (...) values (... 3 rows ...);  -- never reached for them
```

Because the migration's backfill runs **before** `claim_welcome_packs()` is ever called for a real user (it's part of the same migration file, applied in one transaction before the function is even defined — but more importantly, it runs before deployment, i.e. before `proxy.ts` can call the function for anyone), bossg/samo/fardin's `season1_welcome_bonus_claims` rows already exist the first time the function runs for each of them. Their `insert ... on conflict do nothing` therefore always hits the conflict, PL/pgSQL's `FOUND` is `false`, and the function returns `false` before reaching the `reward_vouchers` insert — **zero vouchers granted, on this call or any future call, for these three specifically.** Every other current or future league member has no pre-existing claims row, so their first call proceeds normally and grants the real one-time bonus.

Read-only SQL to confirm this live, once deployed (does not require running anything, just observing):

```sql
-- Expect exactly 3 rows, all pre-dating any request these 3 players make after deploy.
select p.username, c.claimed_at
from public.season1_welcome_bonus_claims c
join public.profiles p on p.id = c.profile_id
where lower(p.username) in ('bossg', 'samo', 'fardin');

-- Expect zero rows for these 3 (they were granted vouchers manually, not through this function).
select p.username, v.voucher_type, v.source_type, v.created_at
from public.reward_vouchers v
join public.profiles p on p.id = v.profile_id
where lower(p.username) in ('bossg', 'samo', 'fardin')
  and v.source_type = 'season1_welcome_bonus';
```

---

## 8. Additional bugs found and fixed during this correction pass (not directly requested, but load-bearing)

1. **Unique-constraint ordering bug in `202609020910`** — the Dark Magician evolution-chain fix originally ran as 4 separate single-row `UPDATE` statements, in Stage 1→4 order. Stage 3's corrected card ("Dark Magician of Chaos") is the table's *current* Stage 4 card, so the Stage 3 statement would have hit `boss_route_stages`' `UNIQUE (route_id, evolution_card_catalog_id)` constraint — not deferrable — the moment it ran, since Stage 4 hadn't been updated away from that value yet. This would have made the migration **fail outright** on first deploy. Rewritten as one multi-row `UPDATE ... FROM (VALUES ...)`, the same technique used for §4's 16-route fix, which sidesteps the issue entirely.
2. **Stale, contradictory header comments** in `202609020920` (a paragraph said the migration deliberately does *not* backfill bossg/samo/fardin, directly under the backfill block that now does exactly that) and in `202609020940`/`202609020950` (top-of-file summaries still described the old, already-reverted 4-tier `pick_shop_pack_card` design and the rejected narrow 15-pack names like "Warrior's Code"/"Golden Age Archetypes" as if still current). All three rewritten to match what the files actually do now.
3. **`chaos_bls` support/evolution overlap** — flagged, not fixed. See §4's closing note.

---

## 9. Migrations touched or created this pass

| File | Status | What changed this correction round |
|---|---|---|
| `202609020910_fix_dark_magician_and_cubic_route_data.sql` | Edited (never deployed) | Reverted the invented Dark Magician Stage 3 grant and the Crimson Nova Trinity substitution; rewrote the Stage 1-4 UPDATEs as one multi-row statement (bug #1 above); corrected the top comment's description of that statement shape. |
| `202609020920_claim_welcome_packs.sql` | Edited (never deployed) | Added the bossg/samo/fardin backfill, scoped to exactly those 3 via `lower(username)`; corrected the stale comment that contradicted it. |
| `202609020930_fix_shop_pack_boss_route_exclusion.sql` | Edited (never deployed) | Scoped the exclusion clause to `stage_number = 4` in all 4 candidate tiers (previously excluded every stage). |
| `202609020940_special_pack_curated_pools_schema.sql` | Edited (never deployed) | Removed all unapproved seed data (the old 15-pack definitions and their pools); kept only the approved schema (2 new tables, 2 additive columns); corrected stale header text describing the removed content as current. |
| `202609020950_special_pack_curated_pools_functions.sql` | Edited (never deployed) | Same `stage_number = 4` scoping; **structurally rewrote** `pick_shop_pack_card` from 4 fallback tiers (2 of which were pool-agnostic) to 2 tiers where pool membership is mandatory in both — a Special Pack pull can no longer escape its curated pool under any fallback; corrected stale header text. |
| `202609020960_fix_16_boss_route_stage_identities.sql` | **New this pass** | The 16-route stage-identity fix, §4. |
| `202609020970_fix_draft_boss_route_stage4_only_exclusion.sql` | **New this pass** | Fixes forward the already-deployed `create_next_draft_offer`'s over-broad exclusion, §6. |

Deploy order: `202609020910` → `202609020920` → `202609020930` → `202609020940` → `202609020950` → `202609020960` → `202609020970`, then whatever future migration eventually seeds the approved 15 Special Pack pools.

---

## 10. Validation

| Check | Result |
|---|---|
| `npm run check:sql` (quote-balance + PL/pgSQL FOREACH/SLICE checks, all migrations + generated scripts) | **Clean** — every file, including the 2 new and 5 edited migrations, re-run after every edit in this pass. |
| `npx tsc --noEmit` | **Clean** — 0 errors, whole project. No TypeScript/UI files were touched this pass (SQL only), re-run anyway per instruction. |
| `npx eslint .` | **Clean** — 0 errors/warnings, whole project. |

---

## 11. Carried forward unchanged from the original audit (not revisited this pass)

These items are outside the scope of this correction round (Boss Routes / Welcome Bonus / Boss Exclusion / Special Packs) and were not re-examined; treat the original report's detail on them as still current: the onboarding-gate bootstrap fix (`proxy.ts`), the Home dashboard Boss-identity fix (reading `player_boss_paths` instead of the stale `boss_monster_option_id`), the **still-open** `format_eligible`/cardpool live-verification item (needs a live read before trusting the 6,181-card / rarity-distribution numbers — see the original report's read-only SQL for this), the `docs/GO_LIVE_TONIGHT.md` corrections, and the dead-code inventory (`shop_pack_pity`, legacy `league_settings`, `decks.*` keys, `scripts/reset-test-data.sql`).

---

## 12. Still open / needs your decision

1. **Dinosaur — entire route left untouched.** The spec's own text flags only Stage 4 ("verify the final approved Stage 4 against project history before changing, do NOT guess if source conflicts"), but since that one stage is unresolved, **no part of this route was changed this pass**, including Stage 2 (spec names "Souleating Oviraptor," current source has "Kabazauls" — a real, verified difference that was deliberately left alone rather than partially applying the route). Needs your call on what "project history" resolves Stage 4 to before any part of this route is touched.
2. **Harpie — entire route blocked.** Stage 4's spec'd card, "Harpie's Pet Dragon - Fearsome Fire Blast," is not in `card_catalog`. Only the plain "Harpie's Pet Dragon" exists. Per "stop the route, don't substitute," Stages 1-3 (which do resolve cleanly: Harpie Lady, Harpie Channeler, Harpie's Pet Phantasmal Dragon) were also left untouched. Needs either catalog confirmation that the exact card exists under a different name, or an explicit decision to use the plain "Harpie's Pet Dragon" instead.
3. **Cubic Stage 4 support** — "Crimson Nova Boss EX" is not in `card_catalog`. Support stays at 3 cards (Cubic Dharma, Cubic Causality, Cubic Mandala) until the real card is identified.
4. **`chaos_bls` D.D. Warrior Lady overlap** (§4, §8) — now both a Stage 1 support grant and the Stage 2 evolution card on the same route. Remove the support grant, or leave both?
5. **New 15 Special Pack proposal (§5)** — awaiting your approval before any pool data is written.

---

## 13. FINAL IMPLEMENTATION — Round 3 (this pass, 2026-09-02, post-approval)

This section implements the user's final decisions on every item §12 had left open, plus the approved (with 3 changes) 15 Special Pack pool data. **Nothing in this section has been committed or deployed.** All SQL below is written to the repo working tree only.

### 13.1 Final 20 Boss Routes (all resolved — supersedes §3)

| # | Route (code) | Display Name | Stage 1 | Stage 2 | Stage 3 | Stage 4 (Boss) |
|---|---|---|---|---|---|---|
| 1 | `chaos_bls` | Chaos / Black Luster Soldier | D.D. Warrior | D.D. Warrior Lady | Chaos Sorcerer | Black Luster Soldier - Envoy of the Beginning |
| 2 | `dark_magician` | Dark Magician / Magician Girl | Berry Magician Girl | Dark Magician Girl | Dark Magician of Chaos | The Dark Magicians |
| 3 | `elemental_hero` | Elemental HERO | Elemental HERO Bubbleman | Elemental HERO Blazeman | Elemental HERO The Shining | Elemental HERO Absolute Zero |
| 4 | `blue_eyes` | Blue-Eyes | Kaibaman | Blue-Eyes White Dragon | Blue-Eyes Alternative White Dragon | Blue-Eyes Jet Dragon |
| 5 | `cyber_dragon` | Cyber Dragon | Proto-Cyber Dragon | Cyber Dragon | Cyber Dragon Nova | Cyber Dragon Infinity |
| 6 | `jinzo` | Jinzo | Jinzo - Returner | Jinzo - Jector | Jinzo | Jinzo the Machine Menace |
| 7 | `armed_dragon_ojama` | Chazz / Armed Dragon / Ojama | Armed Dragon LV3 | Armed Dragon LV5 | Armed Dragon LV7 | Armed Dragon Thunder LV10 |
| 8 | `crystal_beast` | Crystal Beast | Crystal Beast Ruby Carbuncle | Crystal Beast Sapphire Pegasus | Rainbow Dragon | Rainbow Overdragon |
| 9 | `red_eyes` | Red-Eyes | Black Metal Dragon | Red-Eyes Black Dragon | Red-Eyes Flare Metal Dragon | Meteor Black Comet Dragon |
| 10 | `zombie` | Zombie | Pyramid Turtle | Zombie Master | Red-Eyes Zombie Dragon | Doomking Balerdroch |
| 11 | `dinosaur` | Dinosaur | Babycerasaurus | Souleating Oviraptor | Ultimate Conductor Tyranno | Transcendosaurus Gigantozowler |
| 12 | `legendary_fisherman` | Legendary Fisherman | Warrior of Atlantis | The Legendary Fisherman | The Legendary Fisherman II | The Legendary Fisherman III |
| 13 | `machina` | Machina | Machina Gearframe | Machina Fortress | Machina Citadel | Machina Ruinforce |
| 14 | `toon` | Toon | Toon Mermaid | Toon Dark Magician Girl | Toon Dark Magician | Toon Black Luster Soldier |
| 15 | `harpie` | Harpie | Harpie Lady | Harpie Channeler | Harpie's Pet Phantasmal Dragon | **Harpie's Pet Dragon - Fearsome Fire Blast** (newly imported, §13.3) |
| 16 | `ancient_gear` | Ancient Gear | Ancient Gear Hunting Hound | Ancient Gear Golem | Ultimate Ancient Gear Golem | Chaos Ancient Gear Giant |
| 17 | `galaxy_photon` | Galaxy / Photon | Photon Thrasher | Galaxy-Eyes Photon Dragon | Number 62: Galaxy-Eyes Prime Photon Dragon | Number C62: Neo Galaxy-Eyes Prime Photon Dragon |
| 18 | `destiny_hero` | Destiny HERO | Destiny HERO - Diamond Dude | Destiny HERO - Plasma | Destiny HERO - Dystopia | Destiny HERO - Destroyer Phoenix Enforcer |
| 19 | `vampire` | Vampire | Vampire Familiar | Shadow Vampire | Dhampir Vampire Sheridan | The Zombie Vampire |
| 20 | `cubic` | Cubic | Dark Garnex the Cubic Beast | Duza the Meteor Cubic Vessel | Buster Gundil the Cubic Behemoth | Crimson Nova the Dark Cubic Lord (support: Cubic Dharma, Cubic Causality, Cubic Mandala — closed, no 4th card) |

Independently re-derived (not just trusted from the migration files) by parsing `202609011900_seed_boss_routes.sql` plus every stage-identity fix migration in filename order and diffing the result against each fix's own header documentation — all 20 rows match.

### 13.2 chaos_bls duplicate-grant fix — applied

`_boss_route_grant_stage()` (`202609012000_boss_route_rpcs.sql`) inserts a stage's evolution card unconditionally, then separately loops every `boss_route_stage_grants` row for that stage — with **zero deduplication** between the two. D.D. Warrior Lady was both the `chaos_bls` Stage 2 evolution card and a Stage 1 support grant (qty 1, non-exclusive), so a player would receive two independent copies. `202609020980_remove_chaos_bls_dd_warrior_lady_duplicate_grant.sql` deletes that one Stage 1 support grant row, with a `do $verify$` block that hard-fails if any grant of that card on that route survives. D.D. Warrior Lady is now granted exactly once, as the Stage 2 evolution card, matching your approval exactly.

### 13.3 Harpie's Pet Dragon - Fearsome Fire Blast — imported

Verified as a real, officially printed card (independently confirmed via YGOPRODeck and the Konami card database, not taken on your word alone) — Effect Monster, WIND, Level 7, ATK 2000/DEF 2500, first printed in *Legendary Duelists: Season 3* (LDS3-EN138) and *Speed Duel: Battle City Finals* (SBC2-ENH01). `202609021000_import_harpies_pet_dragon_fearsome_fire_blast.sql` inserts it into `card_catalog` with:
- `format_eligible = false`, `format_exclusion_reason` explaining it's a Boss Route (Harpie) Stage 4 exclusive, unavailable through Draft/Shop/Special Packs — verified: it does **not** appear in any of the 15 Special Pack pools (§13.5).
- `game_rarity = null`, `rarity_needs_review = false` — this app's internal rarity calibration doesn't apply to a Boss-only card.
- **Known gap, flagged for your correction before deploy:** `external_card_id` is set to a deliberately out-of-range placeholder (`900000001`, 9 digits — real Konami passcodes are 8 digits) because the real passcode could not be confirmed after 7+ attempts across Yugipedia (403), yugioh.fandom.com (402), the Konami DB (only exposed an internal `cid`, not the passcode), CoolStuffInc, and Pojo. This does not block anything functionally (the app never looks up cards by `external_card_id` for boss-route logic) but should be corrected with the real passcode before this migration is deployed.

`202609021010_fix_harpie_stage_identities.sql` then sets the full 4-stage chain (Harpie Lady → Harpie Channeler → Harpie's Pet Phantasmal Dragon → the newly-imported card), gated to run after the import via filename ordering (1000 before 1010), with a verify block that names that ordering dependency explicitly if it ever fails.

### 13.4 ⚠ NEW finding, not yet fixed: machina has the same duplicate-grant bug as chaos_bls

Cross-checking all 20 final routes' evolution chains against every `is_route_exclusive = true` support grant (the same method that caught chaos_bls) found a second, previously unreported instance: **Machina Gearframe** is both `machina`'s Stage 1 evolution card *and* an existing Stage 4 support grant (`is_route_exclusive = true`, quantity 1) from the deployed seed. A player reaching Stage 4 gets a support-grant copy of Machina Gearframe on top of the copy they already received at Stage 1 — same double-grant mechanism as chaos_bls, just not part of the batch you approved this round. **No migration has been written for this** — flagging it here rather than silently fixing it, per the same discipline used for chaos_bls. Recommended fix, pending your approval, is identical in shape to `202609020980`: delete the `machina` Stage 4 support grant row for Machina Gearframe.

### 13.5 Final 15 Special Packs — approved with the 3 changes, pools constructed and verified

All 15 pools were built from explicit rules (named archetype/package inclusion, Type/Attribute families, generic support categories), never `ORDER BY name LIMIT N`, and trimmed only when over target using the local card-valuation snapshot's own `draftValue`/`power` scores. Every pool is 200-300+ cards (Chaos & Shadows sits at 240 after trimming from a raw pool of 563).

| # | Code | Name | Pool Size | Monster/Spell/Trap | Top Archetypes |
|---|---|---|---|---|---|
| 1 | `chaos_shadows` | Chaos & Shadows | 240 | 223/10/7 | Chaos(29), D.D.(23), Archfiend(15), Dark World(10), Burning Abyss(6) |
| 2 | `arcane_circle` | Arcane Circle | 280 | 237/35/8 | Dark Magician(38), Spellbook(32), Gravekeeper's(29), Charmer(7), Dogmatika(5) |
| 3 | `iron_legion` | Iron Legion | 300 | 267/23/10 | Cyber Dragon(23), Machina(19), Ancient Gear(18), Jinzo(13), Gadget(12) |
| 4 | `dragons_roar` | Dragon's Roar | 260 | 242/12/5 (+1 other) | Photon(34), Galaxy-Eyes(14), Rokket(11), Dragonmaid(9), Armed Dragon(8) |
| 5 | `elemental_vanguard` | Elemental Vanguard | 250 | 178/48/24 | Elemental HERO(89), Destiny HERO(42), Neo-Spacian(14), Vision HERO(13), Evil HERO(9) |
| 6 | `zombie_uprising` | Zombie Uprising | 250 | 247/2/1 | Worm(18), Vampire(15), Alien(15), Reptilianne(8), Shiranui(7) |
| 7 | `stone_age` | Stone Age | 260 | 259/0/0 (+1 other) | Jurrac(13), Dinowrestler(11), Chronomaly(11), Gem-(10), Megalith(7) |
| 8 | `winged_sovereigns` | Winged Sovereigns | 260 | 231/14/15 | Blackwing(53), Raidraptor(27), Harpie(24), Simorgh(12), Bujin(8) |
| 9 | `aqua_depths` | Aqua Depths | 280 | 274/4/2 | Gishki(14), Mermail(12), Frog(10), Atlantean(9), Shark(8) |
| 10 | `beast_kingdom` | Beast Kingdom | 280 | 263/10/7 | Gladiator Beast(28), Naturia(18), Amazoness(11), Fire Fist(11), Bujin(9) |
| 11 | `six_samurai_warlords` | Six Samurai & Warlords | 260 | 238/12/10 | Six Samurai(46), Destiny HERO(10), Noble Knight(9), Utopia(7), Gouki(7) |
| 12 | `sanctuary_fairies` | Sanctuary of the Fairies | 280 | 264/9/7 | Madolche(24), Heraldic(15), Darklord(10), Valkyrie(10), The Agent(9) |
| 13 | `verdant_swarm` | Verdant Swarm | 250 | 250/0/0 | Naturia(22), Predaplant(13), Sylvan(12), Inzektor(10), "C"(8) |
| 14 | `fiends_domain` | Fiend's Domain | 280 | 279/1/0 | Archfiend(22), Ghostrick(13), Dark World(11), Burning Abyss(9), Infernity(7) |
| 15 | `energy_frontier` | Energy Frontier | 250 | 249/0/0 (+1 other) | Watt(13), Volcanic(9), Flamvell(9), Batteryman(8), Mekk-Knight(8) |

**Total pool-card rows across all 15 packs: 3,980** (overlap between packs is allowed and expected, per your approval).

**The 3 approved changes, verified applied:**
- **Energy Frontier** (was "Psychic Frontier"): re-anchored to Psychic + Thunder + Pyro. Independently confirmed **zero** Cyberse-race cards in its 250-card pool.
- **Dragon's Roar**: Ojama is not an anchor. Its pool contains exactly 2 Ojama-named cards — Ojama Pajama and Ojamatch — and both were individually verified (official card text, not the local snapshot's flavor tag) to have a genuine mechanical Armed Dragon requirement: Ojamatch's core effect must fetch an Armed Dragon monster from Deck/GY to resolve, and Ojama Pajama's core effect specifically protects Armed Dragon monsters from destruction. No other Ojama card is present.
- **Stone Age**: Rock + Dinosaur, Type-wide. Independently confirmed **zero** Crystal Beast or Cubic named cards in its 260-card pool.

**Verification performed (independently, not just trusting the migration's own numbers):**
- All 3,980 pool-card references cross-checked against the exact card lists baked into `202609021020` — **exact match**, no transcription errors between the computed pool data and the SQL.
- All 3,980 references cross-checked against the 89-name exclusion set (20 Stage-4 evolution cards + 69 `is_route_exclusive = true` support-grant cards, re-derived independently from the seed + every fix migration) — **zero leaks**.
- All 3,980 references confirmed present in the local card-valuation snapshot with `format_eligible_proxy = true` — **zero exceptions, zero missing names**.
- The migration's own `do $verify$` block performs the same two leak checks again with live SQL joins against `boss_route_stages`/`boss_route_stage_grants`, and hard-fails the whole transaction if either check ever returns non-zero at actual deploy time — this is the authoritative, final safety net since no live DB is reachable from this environment to run it now.

**Known local-data limitation, not a bug:** Type-wide packs (Stone Age, Verdant Swarm, Energy Frontier, Zombie Uprising) show near-zero Spell/Trap counts because the local card-valuation snapshot has no reliable "generic Type-support Spell/Trap" tag — race-based filtering structurally only catches Monsters (Spells/Traps have `race = null` in this dataset). Reported honestly rather than padded with unverified heuristics; real `card_catalog` queries at deploy time may surface more Spell/Trap support than this snapshot shows.

### 13.6 Files changed this round

| File | Status | What it does |
|---|---|---|
| `202609020980_remove_chaos_bls_dd_warrior_lady_duplicate_grant.sql` | **New** | §13.2 |
| `202609020990_fix_dinosaur_stage_identities.sql` | **New** | Sets the 4-stage Dinosaur chain (§13.1 row 11) via one multi-row `UPDATE` (Stage 3's new value is the route's current Stage 4 value, so this must be one statement — same technique as `202609020960`). |
| `202609021000_import_harpies_pet_dragon_fearsome_fire_blast.sql` | **New** | §13.3 card import. |
| `202609021010_fix_harpie_stage_identities.sql` | **New** | §13.3 stage-chain fix, depends on `202609021000` running first. |
| `202609021020_special_pack_15_definitions_and_pools.sql` | **New** | §13.5 — 15 pack definitions, 3,980 pool-card rows, slot-rotation reassignment, verify block. |
| `202609020910`, `202609020920`, `202609020930`, `202609020940`, `202609020950` | Unchanged this round | Already corrected in the prior round (§9); re-confirmed still passing all 3 checks, no further edits needed. |
| `202609020960`, `202609020970` | Unchanged this round | Already implemented in the prior round (§4, §6); re-confirmed still passing. |

Cubic required **no file** — closed as-is per your decision (§13.1 row 20).

### 13.7 Verification results (this round)

| Check | Result |
|---|---|
| `npm run check:sql` (quote-balance + PL/pgSQL FOREACH/SLICE, all migrations incl. the 5 new files) | **Clean** |
| `npx tsc --noEmit` | **Clean**, 0 errors |
| `npx eslint .` | **Clean**, 0 errors/warnings |
| Independent re-derivation of final stage identities (§13.1) | Matches every fix migration's own documentation |
| Independent re-derivation of the 89-name exclusion set + zero-leak diff against all 3,980 pool rows (§13.5) | Zero leaks |
| Exact-match diff of pool card lists vs. the SQL actually written | Identical |
| format_eligible_proxy check on all 3,980 pool rows | All true, none missing from local snapshot |

### 13.8 Exact deployment order

```
202609020910_fix_dark_magician_and_cubic_route_data.sql
202609020920_claim_welcome_packs.sql
202609020930_fix_shop_pack_boss_route_exclusion.sql
202609020940_special_pack_curated_pools_schema.sql
202609020950_special_pack_curated_pools_functions.sql
202609020960_fix_16_boss_route_stage_identities.sql
202609020970_fix_draft_boss_route_stage4_only_exclusion.sql
202609020980_remove_chaos_bls_dd_warrior_lady_duplicate_grant.sql
202609020990_fix_dinosaur_stage_identities.sql
202609021000_import_harpies_pet_dragon_fearsome_fire_blast.sql   -- must precede 021010
202609021010_fix_harpie_stage_identities.sql
202609021020_special_pack_15_definitions_and_pools.sql
```
(Recommend fixing the machina duplicate grant, §13.4, as one more migration before this batch deploys — not included above since it is not yet approved.)

### 13.9 Commit status

**No new commit has been made.** `git log -1` on the device-linked repo still shows `5824a54` (the same commit §0 already covers) as HEAD. `git status` shows all 5 files from §13.6's "new" row as untracked and all 5 files from the prior round as modified-in-place relative to that commit — everything in this section exists only in the working tree, exactly as instructed ("do not deploy yet... wait for deployment approval"). Recommend a single commit covering all 10 changed/new migration files once you approve the machina fix and the Harpie `external_card_id` placeholder is either accepted as-is or corrected with the real passcode.


---

## 14. ROUND 4 — Final blockers resolved, global audit, commit

### 14.1 Machina Gearframe duplicate grant — fixed

Same bug class as chaos_bls, same fix shape: `202609021030_remove_machina_gearframe_duplicate_grant.sql` deletes the `machina` Stage 4 `is_route_exclusive = true` support grant for Machina Gearframe (qty 1), which duplicated the card a player already receives as the Stage 1 evolution card. Machina support is otherwise untouched — Machina Fortress and Machina Citadel's grants are unaffected.

### 14.2 Global overlap audit — zero remaining

The same migration ends with a `do $verify$` block that checks, for **all 20 routes**, whether any stage's `evolution_card_catalog_id` also appears anywhere in that route's `boss_route_stage_grants`, and hard-fails the transaction (naming every offending route/card/stage) if it ever finds one. Independently re-derived the same check in Python from the raw migration files (not just trusting the SQL I wrote) after both fixes:

```
A. 20 routes x 4 stages = 80 configured stage rows           -> 80 (pass)
B. every route has exactly stages 1,2,3,4                    -> 0 routes fail (pass)
C. zero duplicate evolution/support-grant overlaps           -> 0 overlaps (pass)
```

Zero overlaps remain. The exclusion set used by the Special Pack pool checks correspondingly shrank from 89 to 88 names (Machina Gearframe is no longer `is_route_exclusive`-flagged anywhere, and it was never a Stage 4 evolution card, so it drops out of the exclusion set entirely — same precedent as D.D. Warrior Lady, who is a normal, poolable card now that her only overlap is gone).

### 14.3 Harpie passcode — real value confirmed and applied

Independently re-verified (not taken on say-so) via YGOPRODeck's own card page, which surfaces the passcode field directly: **4991081** (the user's `04991081` with its leading zero dropped, matching how every other row in `card_catalog` stores `external_card_id` as a bigint). Cross-checked against the Konami Yu-Gi-Oh! Neuron database entry `cid=16622`, which matches this card's name and full metadata exactly. `202609021000_import_harpies_pet_dragon_fearsome_fire_blast.sql` was edited in place (never deployed, so no fix-forward needed) to replace the `900000001` placeholder with `4991081`, rewrite the explanatory comment to describe the real, resolved value instead of a pending gap, and add an explicit `external_card_id = 4991081` assertion to the migration's own verify block. Zero remaining occurrences of the placeholder value anywhere in the file, confirmed by direct search.

### 14.4 Harpie route — confirmed unchanged, confirmed exclusions hold

Route stays Harpie Lady → Harpie Channeler → Harpie's Pet Phantasmal Dragon → Harpie's Pet Dragon - Fearsome Fire Blast. The Stage 4 card's `format_eligible = false` (asserted by the import migration's verify block) keeps it out of normal Draft (`202609020930`/`202609020970` gate on `format_eligible` + the Stage-4/route-exclusive check) and out of every Special Pack pool — independently confirmed absent from all 15 pool lists in `202609021020`.

### 14.5 Final Special Pack re-check — all conditions still hold, packs not redesigned

Per instruction, the 15 packs' card lists were **not** touched this round. Re-verified against the current (post-fix) state:

| Condition | Result |
|---|---|
| Exactly 15 definitions | 15 (`chaos_shadows` … `energy_frontier`) |
| Exactly 3 active simultaneously | Yes — 3 rotation categories (`attribute`, `archetype`, `monster_type`), one active row each, per `202608311400`/`202609020950` (unchanged, pre-existing) |
| Deterministic 48h rotation | Yes — `shop_special_pack_slots` advances in fixed `slot_order` on a 48h refresh, no `random()` call anywhere in the refresh path |
| Every pool authoritative | Yes — `pick_shop_pack_card`'s pool-membership check is present unconditionally in both tiers |
| Rarity fallback never leaves pool | Yes — confirmed by re-reading `202609020950`'s function body: `v_pack_definition_id is null or exists(...)` appears in Tier 1 and Tier 2 identically; only rarity relaxes between tiers |
| No Stage 4 Boss leaks | 0 of 3,980 pool rows (re-checked against the updated 88-name exclusion set) |
| No is_route_exclusive leaks | 0 of 3,980 pool rows |
| Energy Frontier: zero Cyberse | 0 |
| Stone Age: no Crystal Beast/Cubic anchor | 0 named cards of either |
| Dragon's Roar: Ojama only where genuinely mechanical | Exactly 2 (Ojamatch, Ojama Pajama), both verified via official card text to require/protect Armed Dragon mechanically |
| No `ORDER BY name LIMIT N` curation | Confirmed — every pool built from explicit archetype/Type/support rules, trimmed only by `draftValue`/`power` score when over target |

Final 15 pool sizes (unchanged from §13.5, re-confirmed): chaos_shadows 240, arcane_circle 280, iron_legion 300, dragons_roar 260, elemental_vanguard 250, zombie_uprising 250, stone_age 260, winged_sovereigns 260, aqua_depths 280, beast_kingdom 280, six_samurai_warlords 260, sanctuary_fairies 280, verdant_swarm 250, fiends_domain 280, energy_frontier 250. **Total: 3,980.**

### 14.6 Final pre-commit audit — all assertions

| # | Assertion | Result |
|---|---|---|
| A | 20 routes x 4 stages = 80 configured stage rows | **80** |
| B | Every route has exactly stages 1,2,3,4 | **Pass**, 0 routes fail |
| C | Zero duplicate evolution/support grants within a route (unless approved) | **0 overlaps** (both approved fixes applied) |
| D | Zero Special Pack Stage-4 leaks | **0** of 3,980 |
| E | Zero Special Pack is_route_exclusive leaks | **0** of 3,980 |
| F | Exactly 15 Special Pack definitions | **15** |
| G | Exact pool size for all 15 packs | See §14.5 table — all confirmed |
| H | Exactly bossg/samo/fardin pre-marked for the Season 1 welcome bonus | Confirmed — `202609020920`'s backfill is scoped to `lower(username) in ('bossg','samo','fardin')`, no other player |
| I | Harpie Fearsome Fire Blast external/passcode = 04991081 | **4991081** (stored as bigint, matches) |
| J | Dinosaur Stage 4 = Transcendosaurus Gigantozowler | Confirmed |
| K | Dark Magician = Berry Magician Girl → Dark Magician Girl → Dark Magician of Chaos → The Dark Magicians | Confirmed |
| L | Cyber Dragon = Proto-Cyber Dragon → Cyber Dragon → Cyber Dragon Nova → Cyber Dragon Infinity | Confirmed |
| M | Chazz/Armed Dragon = Armed Dragon LV3 → LV5 → LV7 → Armed Dragon Thunder LV10 | Confirmed |

`npx tsc --noEmit`, `npx eslint .`, `npm run check:sql` all re-run after every edit in this round — all three clean, 0 errors.

**All assertions passed. Committed.**

### 14.7 Commit

**Commit hash:** `1a4b395e97dc000c2764deb8c3e66c5081342302` (branch `main`, 13 files changed, 7,448 insertions / 1,051 deletions). **Not deployed** — this is a local git commit on the device-linked repo only; nothing has been pushed or applied to the live Supabase instance, per "do not deploy."

Exact migration order (same as §13.8, now committed as one unit):
```
202609020910_fix_dark_magician_and_cubic_route_data.sql
202609020920_claim_welcome_packs.sql
202609020930_fix_shop_pack_boss_route_exclusion.sql
202609020940_special_pack_curated_pools_schema.sql
202609020950_special_pack_curated_pools_functions.sql
202609020960_fix_16_boss_route_stage_identities.sql
202609020970_fix_draft_boss_route_stage4_only_exclusion.sql
202609020980_remove_chaos_bls_dd_warrior_lady_duplicate_grant.sql
202609020990_fix_dinosaur_stage_identities.sql
202609021000_import_harpies_pet_dragon_fearsome_fire_blast.sql
202609021010_fix_harpie_stage_identities.sql
202609021020_special_pack_15_definitions_and_pools.sql
202609021030_remove_machina_gearframe_duplicate_grant.sql
```

### 14.8 Remaining non-blocking notes

- `tsconfig.tsbuildinfo` (tracked, TypeScript's own incremental-build cache) and 4 untracked files under `scripts/generated/phase1_sections/` (`04a`–`04d`, pre-existing archetype-registry seed data unrelated to Boss Routes/Special Packs/Welcome Bonus) were deliberately **left out of this commit** — neither is part of this audit/repair pass, and including them would blur the diff. They remain as-is in the working tree; no action needed unless you want them committed or cleaned up separately.
- No other warnings. `check:sql`, `tsc`, and `eslint` are silent (no warning-level output at all, not just "no errors").
- As always: this commit has not been deployed to the live Supabase instance, and nothing in this environment has live database access to deploy it. Deployment remains a separate, explicit step for you to take.


---

## 15. FINAL LIVE-SAFETY RECONCILIATION (pre-deploy dry-run review, 2026-09-02)

Commit `1a4b395` (§14) was audited a second time against **live production facts that cannot be derived from the repo**, disclosed directly for this review: bossg/samo/fardin are already league members and already manually received their Season 1 welcome bonus vouchers; Dark Magician's live route and Stage 1 grants already match the intended design, with Lemon Magician Girl and Chocolate Magician Girl already manually set `is_route_exclusive = true`; bossg already manually owns 1x Berry/Lemon/Chocolate Magician Girl as real `card_instances`; production has no `supabase_migrations` bookkeeping table and is missing `season1_welcome_bonus_claims`, `shop_special_pack_definitions`, `shop_special_pack_pool_cards`, and `claim_welcome_packs()`, but already has `pick_shop_pack_card()`; there is no Supabase CLI available, so deployment will be a manual paste into the Supabase SQL Editor.

This is a **dry-run review only**. Nothing in this section was deployed — this environment has never had live Supabase access at any point in this engagement.

### 15.A Migration-by-migration risk table

| # | Migration | Classification | Notes |
|---|---|---|---|
| 1 | `202609020910_fix_dark_magician_and_cubic_route_data.sql` | **SAFE TO RUN AS-IS** (after this round's fix) | Originally **NEEDS LIVE-GUARD** — hardcoded Lemon/Chocolate Magician Girl grants to `is_route_exclusive = false`, which its own `ON CONFLICT DO UPDATE` would have flipped the live `true` value back to `false`. Fixed in this round (see §15.C). |
| 2 | `202609020920_claim_welcome_packs.sql` | SAFE TO RUN AS-IS | Backfill inserts only into the new `season1_welcome_bonus_claims` marker table for bossg/samo/fardin, `on conflict do nothing`; zero `reward_vouchers` rows inserted for them. Verified against the live fact that all 3 already hold their vouchers. |
| 3 | `202609020930_fix_shop_pack_boss_route_exclusion.sql` | SAFE BUT REDUNDANT | `CREATE OR REPLACE FUNCTION public.pick_shop_pack_card` — fully superseded by #5 (`202609020950`) in the same deploy. Harmless to run, just transient. |
| 4 | `202609020940_special_pack_curated_pools_schema.sql` | SAFE TO RUN AS-IS | Pure additive DDL (`create table if not exists`, `add column if not exists`), zero DML. |
| 5 | `202609020950_special_pack_curated_pools_functions.sql` | SAFE TO RUN AS-IS | `CREATE OR REPLACE FUNCTION` only (×2) — no data mutation. This is the version of `pick_shop_pack_card` that ends up live after the deploy. |
| 6 | `202609020960_fix_16_boss_route_stage_identities.sql` | SAFE TO RUN AS-IS | Multi-row `UPDATE ... FROM (VALUES ...)` reassigning evolution cards between stages — non-deferrable-unique-safe by construction (single statement, no transient collision). |
| 7 | `202609020970_fix_draft_boss_route_stage4_only_exclusion.sql` | SAFE TO RUN AS-IS | `CREATE OR REPLACE FUNCTION public.create_next_draft_offer` — fix-forward function redefinition, zero data mutation, all `card_instances` references are read-only copy-limit subqueries (pre-existing behavior, unchanged). |
| 8 | `202609020980_remove_chaos_bls_dd_warrior_lady_duplicate_grant.sql` | SAFE TO RUN AS-IS | Narrowly-scoped `DELETE` targeting exactly one `(route, stage, card)` triple; idempotent (0 rows affected if already fixed). Covered by the pre-flight overlap check. |
| 9 | `202609020990_fix_dinosaur_stage_identities.sql` | SAFE TO RUN AS-IS | Same `UPDATE ... FROM (VALUES ...)` pattern as #6. |
| 10 | `202609021000_import_harpies_pet_dragon_fearsome_fire_blast.sql` | SAFE TO RUN AS-IS, DEPENDS ON PREVIOUS (feeds #11) | Inserts the real card (passcode 4991081) into `card_catalog`; #11 references the card this migration creates. |
| 11 | `202609021010_fix_harpie_stage_identities.sql` | DEPENDS ON PREVIOUS MIGRATION | Requires the card imported by #10 to already exist; correct only when run after it — guaranteed by this script's fixed section order. |
| 12 | `202609021020_special_pack_15_definitions_and_pools.sql` | **SAFE TO RUN AS-IS** (after this round's fix) | Originally would have leaked Lemon/Chocolate Magician Girl into the `arcane_circle` shop pool as if they were non-exclusive. Fixed in this round (see §15.C) — both removed, pool total corrected from 3,980 to 3,978. Also links `shop_special_pack_slots` rows to the new pack definitions via plain `UPDATE ... WHERE (theme_category, slot_order) = (...)`; if production doesn't yet have all 15 slot rows seeded, unmatched updates simply affect 0 rows (no error) — see §15.G. |
| 13 | `202609021030_remove_machina_gearframe_duplicate_grant.sql` | SAFE TO RUN AS-IS | Same narrowly-scoped, idempotent `DELETE` pattern as #8, plus a global 20-route overlap re-audit that hard-fails the whole script if any *other* unexpected overlap is found. |

### 15.B Verification of the 11 named safety properties

All 11 hold **by construction**, confirmed by exhaustive `grep` across all 13 files for `card_instances`, `league_members`, `player_boss_paths`, `drafts`, `draft_players`, `schema_migrations`, and `supabase_migrations`:

1. **No migration re-grants Berry/Lemon/Chocolate to existing bossg card_instances** — none of the 13 files perform any INSERT/UPDATE/DELETE against `card_instances` at all; the only references are read-only `SELECT` subqueries for copy-limit checks in #7, pre-existing and unchanged.
2. **No migration duplicates the manually-granted welcome vouchers** — #2 only ever inserts into the new marker table; `reward_vouchers` is never touched by any of the 13 files.
3. **No migration resets or re-runs initial drafts** — zero references to `drafts`/`draft_players` DML anywhere; #7 is a read-only function redefinition.
4. **No migration changes league memberships** — zero references to `league_members` DML anywhere.
5. **No migration resets selected boss routes** — zero references to `player_boss_paths` DML anywhere; all 13 files only touch route/stage/pack *configuration* tables.
6. **No migration re-grants already-completed boss-stage rewards to existing players** — card/voucher grants only ever happen via the `_boss_route_grant_stage()` and `purchase_shop_pack()` RPCs, triggered by real player actions, never by a config-table migration.
7. **No migration deletes legitimate current card_instances** — confirmed, see (1).
8. **No migration relies on supabase_migrations history** — none of the 13 files reference `schema_migrations`/`supabase_migrations` in any way; the combined script (§15.D) uses `to_regclass()` existence checks instead.
9. **No migration assumes a clean database** — every `CREATE TABLE`/`ALTER TABLE` uses `IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS`; every grant INSERT uses `ON CONFLICT`; every DELETE is scoped to an exact known row.
10. **No migration breaks current onboarding or player_boss_paths state** — see (5); zero writes to that table.
11. **No migration accidentally overwrites temp fixes that are now intended to remain** — this was the one property that was *not* already true — see §15.C for the one real defect found and fixed.

### 15.C Special checks — Dark Magician and Welcome Bonus

**Dark Magician (`202609020910`):** Not idempotent-safe against the live state as originally written. Production already has Lemon Magician Girl and Chocolate Magician Girl as Stage 1 grants with `is_route_exclusive = true`; the migration inserted both with `is_route_exclusive = false` and an `ON CONFLICT (stage_id, card_catalog_id) DO UPDATE SET is_route_exclusive = excluded.is_route_exclusive` clause — which would have silently flipped the live `true` back to `false` on deploy. This does **not** fail on uniqueness and does **not** touch `card_instances` or re-trigger stage-reward logic (the failure mode task item 3 asked about), but it does silently clobber an intentional live flag, with a cascading consequence: both cards had been curated into the `arcane_circle` Special Pack pool on the incorrect assumption that they were ordinary support cards. **Rewritten**: both inserts now use `is_route_exclusive = true`, and both cards were removed from `arcane_circle`'s pool in `202609021020`.

**Welcome Bonus (`202609020920`):** Reviewed in full, confirmed already safe, **not modified**. `claim_welcome_packs()` uses `INSERT ... ON CONFLICT (profile_id) DO NOTHING` into the marker table followed by `claim_inserted := found`, PL/pgSQL's implicit `FOUND` correctly reflecting whether a row was actually inserted — this is atomic and race-safe; a second concurrent call for the same player cannot double-grant. The backfill inserts only into the marker table for bossg/samo/fardin, `on conflict do nothing`, zero new `reward_vouchers` rows. Future (real) new players still receive exactly 1 normal + 1 premium + 1 deluxe pack voucher via the function's second `INSERT`, unaffected by the backfill.

### 15.D Temp-fix reconciliation

Searched git history and `docs/`/`scripts/manual-verification/` for any trace of temporary/manual fixes related to the Dark Magician route, onboarding, boss selection, `player_boss_paths`, the initial draft, the welcome bonus, or shop pack logic. Found two already-committed, already-superseded pieces of ordinary development history — `c32f63c` ("Draft: remove BossG test override, exclude Legendary, add fairness") and `4811b08` ("Correct Cubic Boss Route: restore real archetype, fix Vijam misclassification") — both predate and are unrelated to this reconciliation. `docs/GO_LIVE_TONIGHT.md` (dated 2026-09-01) independently corroborates the user's stated live Dark Magician chain, describing `202609020910` as correcting the route "to match the live manual fix (Berry Magician Girl → Dark Magician Girl → Dark Magician of Chaos → The Dark Magicians)" — consistent with, and independent confirmation of, the live-safety facts given for this review.

No other discoverable trace exists of the specific manual production patches described (the welcome vouchers, the Dark Magician Lemon/Chocolate exclusivity flag) — by their nature, pure database mutations never captured in any commit are not recoverable from this repo. **If manual patches exist beyond the ones named in this review, they cannot be surfaced from this environment** — this is a repo-side audit, not a live-database audit.

### 15.E Combined deployment script

**Path:** `supabase/manual_deploy/20260902_season1_release.sql` (8,791 lines).

Structure: one outer `begin;` / `commit;` (verified exactly one of each, at the top and bottom of the file — grep-checked), preceded by pre-flight assertions and a pre-deploy snapshot (temporary table, `on commit drop`, never persists), followed by the 13 migrations in exact dependency order with their own individual `begin;`/`commit;` stripped (each source file confirmed to have exactly one such pair before stripping) and a clear `-- SECTION: <filename>` header before each, followed by post-deploy assertions, followed by the final `commit;`. Confirmed no migration uses `CREATE INDEX CONCURRENTLY` or other transaction-incompatible DDL, so the single-transaction wrapping is safe. Independently verified: dollar-quote tags all balanced (19 distinct tags, all even counts); the only parenthesis-count imbalance in the whole file (-4) is pre-existing inside `202609020950` and identical before and after splicing — not introduced by concatenation. `node scripts/check-plpgsql-foreach-slice.mjs` and `node scripts/check-sql-quote-safety.mjs` both run directly against the combined file and pass clean. `npx tsc --noEmit`, `npx eslint .`, and the full `npm run check:sql` (covering all `supabase/migrations/*.sql` individually) were re-run after adding this file — all clean.

Pre-flight assertions (hard-fail before any mutation): all 13 core tables exist (`to_regclass`); exactly 20 `boss_routes` rows and `dark_magician` present; bossg/samo/fardin `profiles` present; **no unexpected evolution/support-grant overlap** beyond the two this deploy is designed to fix (chaos_bls/D.D. Warrior Lady, machina/Machina Gearframe) — any *other* overlap aborts before anything runs, since it would signal an undisclosed manual production change.

Post-deploy assertions (hard-fail if violated, rolling back the whole transaction): exactly 20 routes, 80 stages; exact 4-stage chains for Dark Magician, Cyber Dragon, Chazz/Armed Dragon, Dinosaur, Harpie; Harpie's real passcode (4991081); zero evolution/support overlaps anywhere; exactly 15 Special Pack definitions and 3,978 total pool rows with zero Stage-4 or route-exclusive leaks; **bossg still owns exactly 1 Berry/1 Lemon/1 Chocolate Magician Girl** (unchanged from the pre-deploy snapshot); the 3 welcome-bonus markers exist and **zero new welcome vouchers were created** for them (voucher row count compared against the pre-deploy snapshot); `league_members`, `player_boss_paths`, completed-draft count, `draft_players`, and total `card_instances` all unchanged from the pre-deploy snapshot.

### 15.F What this deploy preserves vs. changes

**Preserves (asserted, not just assumed):** all current league memberships; all current `player_boss_paths` (route selections/progress); all current draft completion state; bossg's existing manually-granted `card_instances` (Berry/Lemon/Chocolate Magician Girl); the 3 players' already-issued welcome bonus vouchers (zero duplicates created); every other player's existing card collection (`total_card_instances_count` unchanged).

**Intentionally changes:** adds the missing `season1_welcome_bonus_claims` table, `shop_special_pack_definitions`/`shop_special_pack_pool_cards` tables, and `claim_welcome_packs()` function; corrects the Dark Magician and Cubic route data (including making Lemon/Chocolate Magician Girl's `is_route_exclusive` flag match the already-live `true` value, rather than clobbering it); replaces `pick_shop_pack_card()` with its final 2-tier, pool-safe version; removes the chaos_bls/D.D. Warrior Lady and machina/Machina Gearframe duplicate support grants; corrects 16 (+ 2 more via #9/#11) boss-route stage identities; imports Harpie's Pet Dragon, Fearsome Fire Blast as a real card; seeds and links all 15 Special Pack definitions and their curated pools.

### 15.G Remaining blockers / open items

- **Undiscoverable manual patches**: this review can only account for the manual production changes explicitly disclosed for it. Any other undocumented live patch — for instance around onboarding or draft flow, per the user's mention of unspecified "temporary fixes yesterday" beyond the two named (Dark Magician grants, welcome vouchers) — cannot be found or accounted for from this repo-only environment.
- **`shop_special_pack_slots` seed state**: `202609021020`'s slot-linking step is 15 plain `UPDATE ... WHERE (theme_category, slot_order) = (...)` statements; if production doesn't yet have all 15 of those slot rows seeded, the unmatched updates simply affect 0 rows (no error, no exception) and `pick_shop_pack_card` degrades gracefully (an unlinked slot resolves `v_pack_definition_id` to null and bypasses the pool-membership check, per its own documented fallback) — worth a quick manual row-count check on `shop_special_pack_slots` before or after running the script, though it is not a hard blocker.
- **No live validation is possible from this environment.** Every check above is either a static/schema-level proof (grep, transaction-safety review) or an assertion embedded in the script itself, to be evaluated only when a human runs it against the real database. This environment has no Supabase network access at any point in this engagement and did not attempt any.

**This is a dry-run review only. No deployment was attempted or performed. Commit `43069ee53544b8bbbdff80a11f00195c7f0b6615` covers exactly the two migration edits (`202609020910`, `202609021020`) and the new combined deployment script — awaiting your approval before you run `supabase/manual_deploy/20260902_season1_release.sql` in the Supabase SQL Editor.**

---

## 16. ROUND 5 — Full production-readiness audit while deployment is paused (2026-09-02, this pass)

User instruction this round: deployment paused (user away), use remaining budget on the highest-value remaining production-readiness work. Constraints: no deploy, no changes to approved Boss Route stage identities, no redesign of the approved 15 Special Packs, no touching live user progress/data. Given fact: post-fix Special Pack pool total is 3978, not 3980. Worked an 11-item priority list in order; all static-analysis only (no live DB access, as in every prior round). **No deploy performed. No live data touched.** Everything below was independently re-verified this round, not just carried forward from prior-round claims.

### 16.1 Priority 1 (carried in from immediately before this round, verified committed this round)
`src/lib/boss-identity.ts` added; 7 pages (matches list/detail/new, league, trades, profile, AI companion `boss-context.ts`) fixed to read `player_boss_paths` instead of the stale `profiles.boss_monster_option_id`, matching the fix already applied to Home in an earlier round.

### 16.2 Boss progression audit — no bugs found
20 routes × 4 stages = 80 `boss_route_stages` rows, re-derived route-code regex independently (fixed a bug in my own first attempt at the regex before trusting the result). DP costs uniformly null/900/1400/2400 across all 20 routes, confirmed untouched by any fix-forward migration. 60 `boss_route_achievement_events` + 100 `boss_route_achievement_requirements` rows, all 20 routes covered for stages 2/3/4, zero orphans. All 20 routes' evolution chains proven correct at deploy time via each fix-forward migration's own self-verifying `do $verify$` block (not just assumed from source).

### 16.3 Shop + welcome voucher audit — no bugs found
`claim_welcome_packs()`'s idempotency (`insert ... on conflict (profile_id) do nothing` against `season1_welcome_bonus_claims`, `claim_inserted := found`, early return) confirmed intact and correct. `purchase_shop_pack` (final version in `202609011400_final_legendary_luck_pity_system.sql`) confirmed: DP charged exactly once, voucher consumed exactly once, per-card advisory-lock race safety, Legendary = league-wide max 1, all else = per-player max 3, luck/pity system self-verified via its own migration-embedded assertion.

### 16.4 Special Pack UI/rotation audit — no bugs found
Confirmed the Shop page's rendered pack name/description correctly prefer the curated `shop_special_pack_definitions` row (via `pack_definition_id`) over the cosmetic `SPECIAL_CATEGORY_META` fallback. Confirmed `ensure_shop_rotations_current()` is called lazily on page load, errors non-fatal. Confirmed the "Recent Purchases" section can't be broken by a synthetic manual-welcome-bonus purchase row (no join, no links).

### 16.5 Cardpool / format integrity audit — ⚠ MOST IMPORTANT FINDING THIS ROUND
The Duelist Circle Classic format engine (2014-12-31 cutoff, curated 2015-2018 whitelist, Fusion+Xyz-only Extra Deck, 6,181-card calibrated pool with matching rarity distribution) is fully built and fully calibrated, but **has never been activated** (`duelist_circle_formats.is_active = true` + `recompute_format_eligibility()`) in any committed migration or in the combined deploy script. This is documented project-wide (`docs/SEASON_1_RUNBOOK.md`) as a deliberate, manual, live-admin-only action, separate from the deploy pipeline, and `recompute_format_eligibility()` itself refuses to run without an authenticated admin caller — so it cannot have happened by accident. **This sandbox has no live DB access and cannot determine whether this activation step has already been performed against production.** Deliverable: `supabase/manual_deploy/verify_cardpool_format_state.sql` — a 5-section, read-only, always-safe-to-run script that answers this directly (activation state, eligible-card totals, rarity distribution, Extra Deck mechanic composition, Stage-4/route-exclusive leak checks).

### 16.6 Initial Draft audit — no bugs found
`create_next_draft_offer` (final version, `202609020970`) confirmed: exactly `options_per_pick` (3) cards of identical rolled rarity, no-Legendary rule, Stage-4-only Boss exclusion (this migration's own fix). `pick_draft_card` confirmed fully race-safe via sequential `for update` locks (offer, draft_player, chosen option, card_catalog row); unpicked options correctly released back to the pool; offer consumed exactly once.

### 16.7 Home/Collection/player identity audit — no bugs found beyond §16.1
`fetchOwnedCollection` (`src/lib/collection.ts`) confirmed as the single, correctly-scoped (`current_owner_id` + `league_id`) source of truth shared by Collection and Card Detail nav. `locked`/`for_trade` flags confirmed read directly and correctly. Zero occurrences anywhere of the legacy `owner_profile_id` field name.

### 16.8 Database schema-assumption audit — no bugs found
Repo-wide grep for every legacy field-name pattern the user flagged from manual live-DB checks (`route_key`, `boss_route_stage_id`, `owner_profile_id`, bare `owner_id` misuse): all either never existed as a live bug, or already fixed under §16.1.

### 16.9 Manual deploy script hardening + new smoke test — 2 deliverables
**3 patches applied to `supabase/manual_deploy/20260902_season1_release.sql`** (verified: single `begin;`/`commit;` transaction preserved throughout):
1. Special Pack pool seed-time check strengthened from "not empty" to an exact `v_pool_count <> 3978` abort — **honest correction**: a separate POST-DEPLOY section already correctly asserted 3978 (not 3980) from a prior round, so this is valid defense-in-depth (fails earlier, clearer message), not a fix for a genuine stale-3980 bug as initially suspected.
2. Pre-deploy snapshot strengthened with two new deterministic per-player signature columns for bossg/samo/fardin (`boss_progress_signature_for_the_3`, `draft_progress_signature_for_the_3`) capturing exact route_slot/route_id/current_stage/mastered_at and draft status/pick-counts, not just row counts (which can't detect one player's stage silently regressing while another's advances, net-zero count change).
3. Matching POST-DEPLOY comparison added, aborting the transaction if either signature changed.

**New deliverable: `supabase/manual_deploy/20260902_post_deploy_smoke_test.sql`** — a separate, independent, read-only, always-safe-to-run 19-check PASS/FAIL/INFO script (not part of the deploy transaction). Covers: 20 routes exact-code match, 80 stages no gaps, 15 Special Pack defs, 3978 pool rows exact, zero Stage-4/route-exclusive leaks into any pack pool, zero unexpected evolution/support-grant overlaps, format activation state (INFO reminder, never FAIL), welcome-bonus markers for the 3 named players, bossg's Berry/Lemon/Chocolate ownership (INFO), the exact evolution chain for all 6 named routes (Dark Magician, BLS, Cyber Dragon, Dinosaur, Harpie, Chazz — each independently re-derived from the real fix-forward migrations this round, not trusted from memory; two of the six, Dinosaur and Harpie, were explicitly *withheld* from the main 16-route fix migration and only resolved by later, dedicated migrations — confirmed and cross-checked), active Special Pack rotation count = 3, cardpool totals (INFO), and `player_boss_paths` exact signature (INFO). Static self-check on-device: parenthesis-balanced, exactly 19 top-level statements.

Also delivered this round: `supabase/manual_deploy/optional_cleanup_manual_welcome_purchase_rows.sql` (§16.3-adjacent, read-only diagnostic + a tightly-scoped, commented-out, opt-in DELETE for the synthetic manual-welcome-bonus purchase rows — not applied).

### 16.10 New regression tests — 2 suites, both written AND run+verified passing on-device
Discovered `npx vitest run` cannot execute in this sandbox (`Cannot find module @rollup/rollup-linux-arm64-gnu`, a known npm optional-dependency bug, unrelated to this repo) — confirmed this is why the repo already has 4 pre-existing root-level `*.regression.test.mjs` files (plain `node:assert/strict`, run via `node <file>`, NOT picked up by `vitest.config.ts`'s `include: ["src/**/*.test.ts"]` glob, NOT run by `npm test`). Followed the same established pattern rather than fighting the broken install.

- **`src/lib/boss-identity.regression.test.mjs`** (8/8 passing) — covers the §16.1 helper, which had zero prior coverage: single/batched resolution, the `route_slot = 1` filter specifically, null-on-unresolvable-data contract, de-duplication, partial-failure isolation, empty input, subtitle fallback.
- **`scripts/season1-release-invariants.regression.test.mjs`** (5/5 passing) — static-analysis suite over the real SQL files on disk (same pattern as the repo's own `scripts/check-sql-quote-safety.mjs`): Draft's and Shop's Stage-4-only exclusion clauses are still the narrow form (not a broadened `in (...)` variant — the exact bug `202609020970` fixed), `claim_welcome_packs()`'s idempotency guard intact, this round's 3978 patch still present, the Classic format's seed still inserts `is_active = false` and no deploy-script `UPDATE` flips it to `true`. One bug in my own first draft (miscounted 8 vs. 7 occurrences due to a header-comment mention) was caught and fixed by actually running the suite, not just writing it.

Orphaned-from-`npm test` observation (not fixed, flagged only): these 2 new suites plus the 4 pre-existing ones are invisible to anyone running the standard `npm test` command. Left as-is — widening `vitest.config.ts`'s include glob or reinstalling `node_modules` is an environment change outside this round's scope, not a logic fix.

### 16.11 What was committed this round
Git commit `de5b22a` (on top of `43069ee`, the last committed state): the 7 §16.1 page fixes + `boss-identity.ts`, the 3 deploy-script patches, the 3 new `manual_deploy/` scripts, and the 2 new regression test files. 14 files changed, no deploy, no live data touched. Left untouched and unstaged: `tsconfig.tsbuildinfo` (build artifact noise) and 4 untracked files under `scripts/generated/phase1_sections/` that appear to be unrelated, unfinished leftovers from a different, unrelated earlier feature (`git log` shows their originating commit is `1ae5ef0`, "split Phase 1 rollout into 9 standalone deployable SQL sections" — nothing to do with Season 1) — flagged for the user's awareness only, not investigated further as out of this round's scope.

### 16.12 Remaining open items after this round
- **§16.5 format-activation state is still unknown against live** — the single most important open question; `verify_cardpool_format_state.sql` answers it the moment someone runs it against production.
- Everything else audited this round (Boss progression, Shop/vouchers, Special Pack UI, Initial Draft, Home/Collection, schema assumptions) found **zero new bugs** — either already correct, or already fixed by migrations already in the release candidate.
- The stray `scripts/generated/phase1_sections/` files (§16.11) may be worth a separate look, unrelated to Season 1.
- As in every prior round: no live database access was available at any point; every finding above is a static/schema-level proof or a migration-embedded self-check, not a live validation.

**Still a dry-run review only. No deployment was attempted or performed this round either.**
