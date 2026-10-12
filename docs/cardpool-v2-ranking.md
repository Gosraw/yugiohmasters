# Card pool 2.0: ranking + group vote (2026-10-12)

## Samenvatting voor de eigenaar (Nederlands)

**Wat is er gedaan?**
Elke speelbare kaart in de nieuwe "Classic"-pool (6.136 kaarten) heeft een voorstel-zeldzaamheid gekregen. De computer heeft dat eerst zelf berekend. Daarna hebben we jouw regels erop gelegd:

- Kaarten die het hele bord van de tegenstander leegvegen (Raigeki, Dark Hole, Mirror Force …) worden **Legendary**. Daarvan bestaat maar 1 exemplaar in de hele league.
- Verboden kaarten doen niet mee.
- Kaarten die in 2014 "limited" waren, worden minstens **Ultra Rare**.
- Kaarten die in 2014 "semi-limited" waren, worden minstens **Super Rare**.
- Kaarten waar jullie eerder zelf een oordeel over gaven (63 kaarten), krijgen dat oordeel.

**Hoeveel van elk?** Ongeveer dezelfde verdeling als seizoen 1:

| Zeldzaamheid | Aantal | Doel |
|---|---|---|
| Legendary | 45 | 45–55 |
| Secret Rare | 200 | 180–220 |
| Ultra Rare | 1.145 | 1.000–1.200 |
| Super Rare | 1.193 | 1.100–1.300 |
| Rare | 1.509 | 1.400–1.650 |
| Normal | 2.044 | de rest |

**Wat was er mis met de computer, en wat is er verbeterd?**
De computer onderschatte "hand traps": kaarten die je vanuit je hand gebruikt in de beurt van de tegenstander, zoals Effect Veiler en Maxx "C". Hij onderschatte ook kaarten die je redden als je achterstaat, zoals Gorz en Battle Fader.
We hebben een kleine correctie toegevoegd. Die herkent zulke kaarten aan hun tekst en geeft ze een klein duwtje omhoog.
Bij de 9 bekende testkaarten zat de computer eerst 4 keer goed. Na de correctie zit hij 5 keer goed, en daarna nooit meer dan 1 stap ernaast.

Andersom overschat de computer grote eindbaas-monsters. Een voorbeeld: Nikitama krijgt van de computer "Legendary", maar jullie vonden "Ultra Rare". Daarom tellen jullie eigen oordelen altijd, en daarom stemmen jullie nu.

**Het stem-scherm**
In de app staat nu een stemscherm: **Profile → Card Vote**. Op Home zie je het ook bij "waiting on you" zolang je nog niet klaar bent.
Je ziet steeds één kaart, met plaatje, het voorstel en de reden. Daaronder staan drie grote knoppen:

- **Agree**: het voorstel klopt.
- **Too strong**: de kaart is sterker dan het voorstel. Hij wordt dan zeldzamer, of verboden.
- **Too weak**: de kaart is zwakker. Hij wordt dan gewoner, of mag weer meedoen.

Er zijn 411 kaarten om over te stemmen, verdeeld over 25 lijsten:

- het verbod-voorstel (38),
- "max 1 per deck" (10),
- de Legendary-bordwissers (13),
- alle andere Legendaries (32),
- de twijfelgevallen rond Secret Rare (44),
- per Boss Route de sterkste kaarten van dat thema (12–15 per route).

Elke kaart komt maar één keer voorbij. De meeste stemmen winnen. Staat het gelijk, dan beslis jij. Als jij zelf gestemd hebt, telt jouw stem. Je kunt ook op de resultatenpagina een knop "Owner tie-break" kiezen.

**Vragen voor jou (Boss Routes)**
Een paar Boss Routes geven kaarten die nu verboden of "1 per league" zijn. Mijn advies: Boss-evolutiemonsters en route-kaarten tellen **niet** mee voor de pool-regels, omdat alleen de eigenaar van die route ze krijgt. Maar dat is jouw keuze. Zie de vragen V1–V6 hieronder.

---

## Technical detail (English)

### Files

| File | What |
|---|---|
| `scripts/cardpool/rank-pool.mjs` | Main script. Engine → correction layer → policy → tier sizing. Writes both JSON outputs and prints the calibration report. Offline: it only needs `data/external/ygoprodeck-cardinfo.json`. |
| `scripts/cardpool/rank-corrections.mjs` | The correction layer (tags + bonuses), documented in-file. |
| `scripts/cardpool/rank-themes.mjs` | Boss-route theme relevance, used only for the vote lists and never for scoring. |
| `scripts/cardpool/seed-vote-items.mjs` | Loads the vote lists into `card_vote_items` for one league. Local DB only. |
| `data/cardpool/ranking-v2.json` | `summary` (distribution, targets, versions, calibration tables + per-card detail) and `cards[]`. Each card has `rank`, `id`, `name`, `type`, `status`, `proposed_rarity`, `engine_rarity`, `context`, `scores`, `correction_tags`, `human_calibration` and `reasons[]`. Also `excluded[]` (100 forbidden). |
| `data/cardpool/ranking-vote-lists.json` | 25 lists, 451 entries, 411 votes. An entry has `vote_here: false` when its card is already voted in an earlier list. |
| `supabase/migrations/202610120500_card_votes.sql` | Vote tables, RLS and RPCs. |
| `src/app/(app)/vote/page.tsx`, `src/components/vote-deck.tsx` | Phone-first voting screen. |
| `src/app/(app)/vote/results/page.tsx` | Results and owner tie-break. |
| `src/app/actions/vote.ts` | `castCardVote` (called from the client, no redirect) and `setVoteTiebreak` (form). |
| `src/lib/attention-items.ts` | `getPendingCardVoteCount` + "Card vote waiting" item. It shows on Home, `/attention` and the nav badge. |

Rerun:

```
node lib/valuation-engine.regression.test.mjs    # engine pin check (see below)
node scripts/cardpool/rank-pool.mjs              # ranking + vote lists
node scripts/devstack/db.mjs migrate             # local DB
node scripts/cardpool/seed-vote-items.mjs        # local DB, keeps existing votes; --prune drops stale items
```

### Pipeline

1. **Engine**: `lib/valuation-engine.mjs` (version `2026-09-01.2`), **unchanged**. Every playable pool card is scored with `extractValuationSignals` → `scoreCard` → `proposeRarity`. Catalog rows are mapped from YGOPRODeck exactly like `scripts/devstack/seed-catalog.mjs` does.
2. **Correction layer**: `rank-corrections.mjs` (`2026-10-12.1`). Four text tags, each a phrase match on the card's own text:

   | Tag | Bonus | Cards | Matches |
   |---|---|---|---|
   | `hand_trap` | +0.45 | 62 | Main Deck monster; one sentence has hand use ("discard this card", "send this card from your hand", "Special Summon this card from your hand", …) **and** reactive timing (opponent's turn, Quick Effect, "when you take damage", attack declaration, damage calculation). |
   | `comeback` | +0.25 | 101 | Took damage, direct attack declared, you control no cards, opponent controls more monsters, lower LP. |
   | `generic_revive` | +0.35 | 8 | Special Summon any monster from a GY, with no Type/Attribute/Level/quoted-name lock. |
   | `generic_removal` | +0.30 | 84 | Spell/Trap: target 1 opposing card + destroy/banish/bounce/steal/flip, or negate a Summon/activation, with no lock. |

   - **Guards.** No tag applies when the engine's own text-based `dependency` is above 3.0, or when the text quotes another specific card's name (own-name "once per turn" quotes are ignored).
   - **No archetype logic.** There is no archetype-tag or archetype-substring check anywhere.
   - **Total.** The total bonus is capped at +0.7. It is added to `draftValue` and `floor`, and doubled on `ceiling`, because the engine's Secret gate also needs ceiling ≥ 6.0.
   - **Why not inside the engine.** The engine's regression suite pins its exact current output. A post-layer keeps those pins meaningful and lets this be tuned per pool.
3. **Policy** (owner concept + banlists):
   - Proposal `legendary_unique` (13 board wipes) → Legendary, fixed.
   - Forbidden (2014 list or proposal, 100 cards) → not ranked; listed in `excluded[]`.
   - 2014 Limited and proposal 1-per-deck → at least Ultra Rare. 2014 Semi-Limited → at least Super Rare. Result: all 70 Limited / 1-per-deck cards are Ultra or Secret, except 1 Super Rare (Rescue Rabbit, a human override); all 15 Semi-Limited are Super Rare or higher.
   - Human calibration → override. That covers `docs/human-calibration-round2-2026-08-30.json` (53 pool cards) and the 9 approved cards from the engine regression suite, which is the same doctrine as `scripts/apply-final-season1-rarities.mjs`.
     - For a borderline call, the engine's own value is kept when it is one of the two allowed values; otherwise the nearer one is used.
     - The owner's newer concept wins over older calibration. Giant Trunade was calibrated Ultra Rare but is a proposal `legendary_unique` → Legendary.
4. **Tier sizing**:
   - **Legendary.** Fixed cards first. Then engine-gate passers by corrected draftValue, up to 50. Then a "near gate" fill: ceiling ≥ 9, genericUtility ≥ 4, dependency ≤ 4, accessibility ≥ 4.5, and no quoted reference to another card. That fill excludes counters to one named card, such as Anti Raigeki and Gryphon Wing. Final count: 45, because the fill ran out of qualifying cards.
   - **Secret.** 200, best corrected draftValue among cards with the engine's Secret structure (ceiling ≥ 6, genericUtility ≥ 3).
   - **Ultra / Super / Rare.** Cut by rank to 1,100 / 1,200 / 1,525. The banlist floors then lift a few cards, so Ultra ends at 1,145.

### Result

| Rarity | Engine alone | Final |
|---|---|---|
| Legendary | 49 | 45 |
| Secret Rare | 181 | 200 |
| Ultra Rare | 1,070 | 1,145 |
| Super Rare | 1,471 | 1,193 |
| Rare | 1,446 | 1,509 |
| Normal | 1,919 | 2,044 |

**Legendary by card type:** Effect 21, Spell 11, Trap 7, Spirit 3, Xyz 2, Fusion 1.

### Calibration agreement

An "exact" match on a borderline card means either allowed value.

**Approved 9** (Maxx "C", Effect Veiler, Tragoedia, Gorz, Battle Fader, Swift Scarecrow, D.D. Crow, Giant Trunade, Rescue Rabbit):

| Variant | Exact | Within 1 tier | Under | Over |
|---|---|---|---|---|
| Engine only | 4/9 | 8/9 | 3 | 2 |
| Engine + correction layer | **5/9** | **9/9** | **1** | 3 |
| Engine + policy + tier sizing (no corrections, no human) | 3/9 | 7/9 | 3 | 3 |
| Engine + corrections + policy + sizing (no human) | 4/9 | 8/9 | 1 | 4 |
| Final (with human overrides) | 8/9 | 8/9 | 0 | 1 |

- The correction layer fixes the under-rating: Effect Veiler and Gorz now come out Secret, and Tragoedia goes from 2 under to 1 under.
- It slightly over-rates Battle Fader (Secret vs Ultra).
- The one "over" in the final row is Giant Trunade, which is Legendary because of the owner's board-wipe concept.

**Round 2** (53 of 54 cards are in the pool; Fossil Dyna Pachycephalo is forbidden):

| Variant | Exact | Within 1 tier | Under | Over |
|---|---|---|---|---|
| Engine only | 19/53 | 38/53 | 5 | 29 |
| Engine + correction layer | 19/53 | 38/53 | 5 | 29 |
| Engine + corrections + policy + sizing (no human) | 19/53 | 42/53 | 5 | 29 |
| Final (with human overrides) | 53/53 | 53/53 | 0 | 0 |

- **Why the correction layer doesn't move round 2.** None of these cards are hand traps or removal spells.
- **What the round-2 set really shows.** On the v2 pool the engine **over**-rates big boss monsters: 29 of 53 come out too high.
  - Nikitama, Rosaria, Ancient Gear Beast, Van'Dalgyon, Steelswarm Hercules and Dark Ruler Ha Des get engine Legendary against a human Ultra or Super.
  - A few Fusions are under-rated because their named materials count as dependency: Elemental HERO Storm Neos and Chaos Neos (human Ultra/Secret, engine Normal).
- **Not fixed here.** The over-rating is not something to fix with another tag; it is the gate itself. That's exactly why the group vote exists.

### Engine regression suite (before = after, engine untouched)

`node lib/valuation-engine.regression.test.mjs`: **35 passed, 9 failed (of 44)**, both before and after this work.

The 9 failures are pre-existing. The 2026-09-01.2 "flattening pass" changed `proposeRarity()` without updating the suite's pins. Examples:

- Absolute Verdict / Light and Darkness Dragon fixtures expect Legendary and get Secret.
- Ancient Gear Beast expects Ultra and gets Secret.
- The Maxx "C" pin expects Rare and gets Super.

Not fixed here, because it is out of scope and the pins need a human decision on which value is right. Worth a follow-up.

### Vote lists (`ranking-vote-lists.json`)

Order = vote priority. A card is voted once, in the first list it appears in.

| List | Entries | Votes |
|---|---|---|
| `proposal_forbidden` | 38 | 38 |
| `proposal_limited` (1 per deck) | 10 | 10 |
| `proposal_legendary` (board wipes) | 13 | 13 |
| `legendary` (all other Legendaries) | 45 | 32 |
| `secret_border` | 45 | 44 |
| `route_<code>` × 20 (top 15 per theme) | 300 | 274 |
| **Total** | 451 | **411** |

- **Secret border.** Gate passers just under the Legendary count, the 20 weakest free Secret Rares, the 20 strongest free Ultra Rares with Secret structure, and the human borderline Secret calls.
- **Route lists.** The 15 highest corrected-draftValue pool cards matching the theme:
  - route card,
  - archetype tag,
  - name,
  - Type (Zombie, Dinosaur, Fish/Sea Serpent, Rock),
  - quoted support text.
- **Missing route cards.** Route cards that are not in the pool (era gaps, forbidden) cannot appear.

### Vote model (`202610120500_card_votes.sql`)

**Tables:**

- `card_vote_items`: id, league_id, list_key, list_title, list_order, card_catalog_id, proposed_verdict, context, sort_order, created_at. Unique per (league, card).
  - `proposed_verdict` ∈ Legendary / Secret Rare / Ultra Rare / Super Rare / Rare / Normal / `limited_1` / `forbidden`.
- `card_votes`: (item_id, profile_id) is the primary key; also vote and created_at/updated_at.
  - `vote` ∈ `agree` | `too_strong` | `too_weak`, the same three for every item.
  - `too_strong` = one step stricter: rarer, and Legendary or 1-per-deck → forbidden.
  - `too_weak` = one step looser: more common, 1-per-deck → 3 per deck, forbidden → allowed.
  - A trigger rejects `too_strong` on a forbidden item and maintains `updated_at`.
- `card_vote_tiebreaks`: item_id (primary key), vote, decided_by, decided_at.

**RLS:**

- League members read items, votes and tie-breaks of their league.
- A member can insert or update only a row with `profile_id = auth.uid()` on an item of their own league. There are no deletes.
- Items and tie-breaks are never written from the browser.
- `anon` has no access.

**RPCs:**

- `cast_card_vote(item, vote)`: SECURITY INVOKER upsert, so RLS is the permission check.
- `set_vote_tiebreak(item, vote|null)`: SECURITY DEFINER, admin-only (`league_members.role = 'admin'`).
- `get_vote_results(league)`: SECURITY INVOKER plus a membership check. Per item it returns the counts, member_count, my_vote, tiebreak_vote, `outcome`, `decided_by` and `resolved_verdict` (via `card_vote_resolve`). `decided_by` is one of:
  - `majority`
  - `owner_tiebreak`: tied, and the admin's tie-break is one of the tied options
  - `owner_vote`: tied, and an admin's own vote is one of the tied options
  - `tied`
  - `no_votes`

The migration is additive only.

**Verified on the local DB:**

- samo cannot write bossg's vote (RLS error).
- A forbidden item rejects `too_strong`.
- samo cannot set a tie-break.
- A 1–1 tie resolves to the owner's vote, and an explicit tie-break overrides it.
- anon gets "permission denied".

### Owner questions

**Boss-route clashes** (from `docs/cardpool-v2-foundation.md` / `classic-v2-summary.json`, 17 blocking cases).

**General recommendation (owner decision):** Boss evolution monsters and exclusive route grants are **exempt from pool rules**. Only the route's owner ever gets them, so they never reach the draft/shop pool or other players. Non-exclusive support grants that are forbidden or league-unique should be swapped for a legal equivalent.

- **V1 – Chaos Emperor Dragon - Envoy of the End.** It is the Chaos/BLS stage-4 **boss**, but you want it out of the game (proposal: forbidden). Options:
  - (a) exempt it as the route boss (only the Chaos owner has it, 1 copy);
  - (b) replace the stage-4 boss, for example with Black Luster Soldier - Envoy of the Evening Twilight, which is currently proposed Legendary.
  - Recommendation: (b) if you want CED gone everywhere, otherwise (a).
- **V2 – Dark Magician of Chaos.** It is the DM route stage-4 **boss**, but it is forbidden on the 2014 list. Recommendation: exempt it as the route boss.
- **V3 – Harpie's Feather Duster** (Harpie stage 1 grant) and **Torrential Tribute** (Fisherman stage 3 grant). These are Legendary = 1 per league, so a route grant would mint an extra copy. Recommendation:
  - either the route grant *is* the league's single copy, so it's removed from packs/shop/draft;
  - or swap the grants, for example Harpie's Feather Duster → Harpies' Hunting Ground (already exclusive) or Hysteric Sign, and Torrential Tribute → Bottomless Trap Hole.
- **V4 – 2014-forbidden support grants:**
  - Dimension Fusion and Return from the Different Dimension (Chaos, exclusive);
  - Card of Safe Return (Chaos, Zombie, Vampire);
  - Ring of Destruction (Jinzo, Toon);
  - Card Destruction (Ojama, Toon);
  - Pot of Avarice (Machina, Vampire);
  - Fishborg Blaster (Fisherman).

  Recommendation: keep the **exclusive** ones, since only the route owner has them; swap the non-exclusive ones for legal cards.
- **V5 – Fossil Dyna Pachycephalo** (Dinosaur stage 2 grant). Proposal: forbidden (floodgate). Recommendation: swap it, because it's a floodgate even for one player.
- **V6 – 38 era gaps.** Route cards from after 2014 are not in the pool. The worst cases:
  - the whole Cubic route;
  - the Legendary Fisherman II and III evolutions;
  - Galaxy-Eyes Cipher Dragon;
  - Red-Eyes Slash Dragon;
  - Ancient Gear Reactor Dragon;
  - Destiny HERO - Dystopia.

  Should route cards automatically join the pool as route-exclusive cards? Recommendation: yes, as exclusive (not in packs/draft), same reasoning as V1.

**Other things to look at during the vote:**

- **"Near gate" Legendaries.** Strike of the Monarchs, Rebound, Retort, Slacker Magician, Moon Dance Ritual and The Monarchs Erupt only filled empty Legendary slots. Expect "too weak" votes here.
- **Odd engine Legendaries.** Kinka-byo, Great Dezard, Tualatin, Gishki Emilia and Exodia Necross came straight from the engine and look like engine artifacts.
- **Vote volume.** 411 votes per player is a lot. The lists are ordered so the most important ones come first (ban list, Legendaries, Secret border); the route lists can wait.
