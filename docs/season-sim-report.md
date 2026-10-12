# Season 2 economy: simulator report

> **STATUS: PROPOSAL, waiting for the owner's approval.** None of these
> numbers are live or in a migration yet. Everything below comes from the
> simulator in `scripts/season-sim/` (500 simulated seasons per scenario,
> seed 12345). Re-run it with:
> `node scripts/season-sim/run.mjs --config proposed` (or `--config current`).

---

## Samenvatting (Nederlands, voor de eigenaar)

**Wat we voorstellen, in één zin:** Boss-evolutie wordt duurder
(1.800 / 3.200 / 5.500 DP), een 2e Boss-route wordt juist goedkoper
(3.000 DP), en spelers verdienen iets meer per ronde plus extra DP uit de
nieuwe systemen (weekdoelen, Season Path, minigames, bounty). Daardoor
heeft een gemiddelde actieve speler na 13 weken **precies 2 Bosses volledig
geëvolueerd**, en is de 3e route alleen haalbaar voor de beste/meest
actieve speler.

**Waarom niet de huidige getallen?** Met de huidige prijzen (900 / 1.400 /
2.400) is je eerste Boss al in **week 3** klaar. Daarna spaar je vier weken
lang voor het 2e slot van 7.000 DP en gebeurt er niks. Het 3e slot
(10.000 DP) haalt **niemand**, zelfs de beste speler niet. Jij wilde
evolutie duurder dan 1.500 / 3.000 / 5.000, dus dat klopt nu niet.

**Wat betekent het per week voor een gemiddelde speler** (gemiddelde
skill, normaal actief)?

- Je verdient ongeveer **3.400 DP per week** (nu ~2.650):
  - wedstrijden ~520, ronde-beloning ~1.550, weekdoelen ~360,
    Season Path ~300, P2W-perks ~325, minigames ~240, bounty/inhaalbonus ~90.
- Je opent ongeveer **7 à 8 packs per week**: 3 Premium-vouchers uit de
  rondes, plus vouchers uit weekdoelen/Season Path/minigames, plus
  **ruim 1 pack per week die je zelf koopt**.
- Je Boss gaat ongeveer **elke 1 à 2 weken een stap omhoog**:

| Week | Boss (gemiddelde speler) |
|---|---|
| 1-2 | Route 1, stage 2 |
| 3 | Route 1, stage 3 |
| 6 | Route 1, stage 4 (eerste Boss klaar) |
| 7 | 2e route ontgrendeld (stage 1) |
| 8 | Route 2, stage 2 |
| 10 | Route 2, stage 3 |
| 12 | Route 2, stage 4 (tweede Boss klaar) |
| 13 | Season Path compleet (20/20) |

**De 3e route** (5.500 DP voor het slot) haalt de gemiddelde speler
**niet** (0% van de seizoenen). Een sterke speler die ook veel perks,
weekdoelen en minigames doet, haalt hem in **ongeveer 2 van de 3
seizoenen**, rond de laatste week. Volledig evolueren van de 3e Boss lukt
niemand. Precies het "stretch goal" dat je wilde.

**Geen weglopende koploper:** de zwakste speler verdient **97%** van wat de
sterkste speler verdient (nu 92%), omdat:

- **Bounty:** wie de huidige koploper verslaat, krijgt +75 DP.
- **Inhaalbonus:** wie onderaan staat, en minstens 3 overwinningen achter
  de koploper, krijgt +50 DP per ronde.
- Weekdoelen, Season Path en minigames hangen niet af van winnen.

Winnen blijft wel belangrijk: de winnaar van een ronde krijgt +350 DP en
een Normal-voucher. Nummer 2 krijgt +200 en nummer 3 krijgt +100.

**Packs blijven de kern:** packprijzen, kansen en het Legendary-Luck-systeem
blijven **ongewijzigd**. Per seizoen vallen er ongeveer 5 van de ~50
Legendaries in de hele groep (p90: 9). Ze blijven dus zeldzaam en de pool
raakt niet op.

**Twee keuzes voor jou:**

1. **Perk-plafond van 600 DP per week** (nieuw). Zonder plafond kan iemand
   die elke week alle perks claimt (1.150 DP/week) bijna drie Bosses
   halen. Met plafond blijft de 3e route een echte uitdaging. Wil je dit
   niet, dan kan het plafond weg (het effect staat hieronder in de
   Engelse tabel).
2. **Aanname over uitgaven:** we gaan ervan uit dat spelers ongeveer
   **35% van hun DP aan packs** besteden, 5% aan losse kaarten en de rest
   sparen voor hun Boss. Kopen spelers in de praktijk veel minder packs,
   dan halen ze de 3e route makkelijker. Kopen ze veel meer, dan blijft
   route 2 op stage 3 steken. Het slot-3-bedrag is de knop om dit later
   bij te stellen.

**Let op:** als jullie maar **2 rondes per week** spelen in plaats van 3,
eindigt een gemiddelde speler op route 2, stage 3. Het doel van 2 volle
Bosses wordt dan niet gehaald. Spelen jullie structureel minder, laat het
weten, dan stellen we de ronde-beloning bij.

---

## English details

### 1. What the simulator models

- **League:** 3 players, 13 weeks, 3 rounds per week (Mon/Wed/Fri) = 39
  rounds. One round = each pair plays once (3 matches).
- **Season start (light reset):** 0 DP, Initial Draft (no Legendaries, so
  not modelled), welcome vouchers 1 Normal + 1 Premium + 1 Deluxe opened
  immediately, Boss route 1 at stage 1.
- **Matches:** Elo-style win chance. Base rating: skilled 1570,
  average 1500, weak 1430. A 70-point gap is about 60%. **Card power
  feedback** adds +6 Elo per Boss step owned and +8 per Legendary owned,
  so richer players win more and runaway pressure is modelled.
  `--no-feedback` turns this off; the results barely change.
- **Round placement:** by round wins. A 1-1-1 cycle is broken randomly;
  live breaks it by duel diff.
- **Packs:** exact live peak-rarity odds (one peak roll per pack) and
  Legendary Luck (+0.25/1/1.25/2, guaranteed Legendary at 100, reset on
  any Legendary). The league-wide pool is assumed to be 50 Legendaries,
  1 copy each. If the pool runs out, the peak is downgraded; the live RPC
  would error in that case, but it never happened in any simulated season.
- **Activity profiles** (perks + weekly goals + mini games):

  | Profile | Perk claim chance per week (Clean/Snack/Home/Fast/Deliv/Fine) | Expected perk DP/wk | Weekly goal completion | Daily mini game played | Weekly-board tries |
  |---|---|---|---|---|---|
  | low | 30/30/10/10/5/2 % | ~140 | 55% | 25% of days | 2 |
  | typical | 60/60/25/30/20/8 % | ~340 | 80% | 55% of days | 5 |
  | high | 90/90/50/60/50/25 % | ~640 | 95% | 90% of days | 12 |
  | max (stress) | 100% of all | 1,150 | 100% | every day | 25 |

  Mini-game skill is a random per-player trait, independent of duel skill.
- **Spending model (stated assumption).** Every DP credited is split:
  **35% to the pack fund, 5% to the shop-singles fund, 60% to the Boss
  fund.** The Boss fund buys the next Boss step as soon as it can, in
  order: route 1 to stage 4, unlock route 2, route 2 to stage 4, unlock
  route 3, and so on. The pack fund buys a pack as soon as it covers the
  next pick (Normal 25% / Premium 40% / Special 20% / Deluxe 15%). The
  singles fund buys R/SR/UR/ScR singles (20/40/30/10%). Shop Legendary
  singles are not modelled. After all Boss steps are done, the Boss share
  goes to packs.
- **Not modelled:** trades, wagers, ad-hoc duels (0 DP in 2.0), missed
  rounds, Boss-route card grants, the card value of what you pull.

### 2. All tunable numbers: current vs proposed

"Current" is the live season-1 economy as it would run inside 2.0: no
ad-hoc DP, Boss evolution DP-only, one round = one full cycle.

| Area | Item | Current | **Proposed** | Why |
|---|---|---|---|---|
| Boss | Stage 1 → 2 | 900 | **1,800** | Owner: pricier than 1,500/3,000/5,000 |
| Boss | Stage 2 → 3 | 1,400 | **3,200** | ″ |
| Boss | Stage 3 → 4 | 2,400 | **5,500** | ″ |
| Boss | Full route (stage 1 → 4) | 4,700 | **10,500** | First Boss done in week 6 instead of week 3 |
| Boss | Route slot 1 | free pick | free pick | unchanged |
| Boss | Route slot 2 (stage 1 granted) | 7,000 | **3,000** | Removes the 4-week dead zone after route 1 |
| Boss | Route slot 3 (stage 1 granted) | 10,000 | **5,500** | Reachable by the top/very active player only |
| Boss | 2 full routes total | 16,400 | **24,000** | |
| Match | Win / loss DP (competition only) | 100 / 75 | **100 / 75** | unchanged; a high loss reward keeps #3 in it |
| Match | Ad-hoc duel DP | 0 in 2.0 | 0 | per V2 plan |
| Round | Participation (everyone) | 300 DP + Premium voucher | **300 DP + Premium voucher** | unchanged |
| Round | #1 | +400 DP + Normal voucher | **+350 DP + Normal voucher** | |
| Round | #2 | +300 DP | **+200 DP** | |
| Round | #3 | +200 DP | **+100 DP** | Clear reward for winning; catch-up comes from bounty/catch-up instead |
| Packs | Normal / Premium / Special / Deluxe price | 300 / 900 / 1,200 / 1,500 | **unchanged** | Packs are the core fun; no reason to touch |
| Packs | Cards per pack | 7 / 10 / 10 / 14 | **unchanged** | |
| Packs | Peak odds Leg/Sec/Ultra/Super | N 0.5/4/12/34, P 2.25/15/32/43, S 1.75/13/30/44, D 6.5/35/44/14.5 | **unchanged** | |
| Packs | Legendary Luck per pack / threshold | 0.25 / 1 / 1.25 / 2, at 100 | **unchanged** | |
| Shop | Singles per day / prices | 6/day; 40/80/160/320/640/1,500 | **unchanged** | |
| Perks | Cleaning / Snack / Home-cooked / Fast food / Delivery / Fine dining | 150 / 150 / 100 / 200 / 250 / 300 | **unchanged** | |
| Perks | Weekly cap per player | none (max 1,150) | **600 DP/week** (owner's choice, see §4) | Stops perks alone from buying a 3rd Boss |
| Weekly goals | Goals per week / DP each | — (new) | **3 × 150 DP** (+15 Season Path XP each) | Provisional; owner will design the goals |
| Weekly goals | All 3 done | — | **Premium voucher** | |
| Bounty | Beat the sole season leader | — | **+75 DP** to the winner | Leader = most season wins before the match; no bounty while tied |
| Catch-up | Sole last place, ≥3 wins behind the leader | — | **+50 DP per round** | Paid at round settlement |
| Mini games | Daily winner (per game, 2 games) | — | **+30 DP** | Daily challenge, same seed, 1 attempt |
| Mini games | Weekly winner (per game) | — | **+150 DP + Normal voucher** | Weekly board, best score |
| Season Path | XP sources | — | **10 XP per match played, +5 per win, 10 per round completed, 15 per weekly goal** | No XP from mini games; it cannot be bought |
| Season Path | Tiers | — | **20 tiers, 85 XP each (1,700 XP)** | Typical players finish in week 12-13 |
| Season Path | Total rewards | — | **3,900 DP + 5 Normal + 5 Premium + 1 Deluxe voucher + title** | see table below |
| Season end | Placement rewards | 0 DP (title only) | **0 DP, champion title/badge** | per V2 plan |

**Season Path tiers (proposed):**

| Tier | Reward | Tier | Reward |
|---|---|---|---|
| 1 | 100 DP | 11 | 200 DP |
| 2 | Normal voucher | 12 | Normal voucher |
| 3 | 150 DP | 13 | 300 DP |
| 4 | Normal voucher | 14 | Premium voucher |
| 5 | Premium voucher | 15 | 400 DP |
| 6 | 200 DP | 16 | Normal voucher |
| 7 | Normal voucher | 17 | 500 DP |
| 8 | 250 DP | 18 | Premium voucher |
| 9 | Premium voucher | 19 | 600 DP |
| 10 | 400 DP + Premium voucher (halfway chest) | **20** | **800 DP + Deluxe voucher + season-2 title "Pharaoh's Ascendant" + card frame** |

The title name and frame are placeholders. In total, 11 tiers pay DP
(3,900) and 10 tiers pay vouchers, plus the Deluxe on tier 20.

### 3. Results (500 seasons per scenario, seed 12345)

Boss notation: `R2S4` = route 2 at stage 4. "2 done" = share of seasons
that end with 2 routes at stage 4. "3rd unl" = share that unlocked route
3. "R1/R2 done" = median week that route 1/2 reached stage 4. Packs are
counted for the whole season, vouchers included.

#### Proposed: season end (week 13)

| Scenario | Player | DP earned p10 / **p50** / p90 | Packs opened p50 (bought) | Legendaries p50 | Boss p10 / **p50** / p90 | 2 done | 3rd unl | R1 done | R2 done |
|---|---|---|---|---|---|---|---|---|---|
| baseline | skilled-typical | 42,685 / **44,595** / 46,720 | 103 (17) | 2 | R2S4 / **R2S4** / R2S4 | 100% | 0% | wk6 | wk12 |
| baseline | **average-typical** | 41,705 / **43,860** / 46,145 | 97 (16) | 2 | R2S4 / **R2S4** / R2S4 | 100% | 0% | wk6 | wk12 |
| baseline | weak-typical | 41,185 / **43,250** / 45,655 | 92 (16) | 2 | R2S4 / **R2S4** / R2S4 | 99% | 0% | wk6 | wk13 |
| top | **skilled-high** | 47,325 / **49,615** / 52,140 | 113 (19) | 2 | R2S4 / **R3S1** / R3S2 | 100% | **65%** | wk5 | wk11 |
| top | average-typical | 41,140 / 43,325 / 45,680 | 95 (16) | 2 | R2S4 / R2S4 / R2S4 | 99% | 0% | wk6 | wk12 |
| top | weak-typical | 40,385 / 42,545 / 45,140 | 90 (16) | 2 | R2S4 / R2S4 / R2S4 | 96% | 0% | wk6 | wk13 |
| perksLow | skilled-low | 38,235 / 40,010 / 41,705 | 97 (15) | 1 | R2S3 / R2S4 / R2S4 | 56% | 0% | wk6 | wk13 |
| perksLow | average-low | 36,925 / 38,890 / 40,965 | 91 (15) | 1 | R2S3 / R2S3 / R2S4 | 29% | 0% | wk7 | — |
| perksLow | weak-low | 35,690 / 37,720 / 40,130 | 84 (14) | 1 | R2S3 / R2S3 / R2S4 | 15% | 0% | wk7 | — |
| perksHigh | skilled-high | 45,760 / 48,165 / 50,925 | 109 (18) | 2 | R2S4 / R2S4 / R3S1 | 100% | 37% | wk5 | wk11 |
| perksHigh | average-high | 45,080 / 47,555 / 50,530 | 103 (18) | 2 | R2S4 / R2S4 / R3S1 | 100% | 29% | wk5 | wk11 |
| perksHigh | weak-high | 44,495 / 46,865 / 49,810 | 98 (18) | 2 | R2S4 / R2S4 / R3S1 | 100% | 20% | wk6 | wk12 |
| mixed | skilled-low | 37,010 / 38,755 / 40,690 | 92 (15) | 1 | R2S3 / R2S3 / R2S4 | 23% | 0% | wk7 | — |
| mixed | average-typical | 41,475 / 43,545 / 46,035 | 96 (16) | 2 | R2S4 / R2S4 / R2S4 | 99% | 0% | wk6 | wk12 |
| mixed | weak-high | 46,705 / 49,050 / 51,440 | 104 (18) | 2 | R2S4 / R3S1 / R3S1 | 100% | 55% | wk5 | wk11 |
| runaway | skilled-high | 48,260 / 50,435 / 52,525 | 115 (19) | 2 | R2S4 / R3S1 / R3S2 | 100% | 81% | wk5 | wk11 |
| runaway | average-typical | 41,600 / 43,725 / 45,990 | 97 (17) | 2 | R2S4 / R2S4 / R2S4 | 100% | 0% | wk6 | wk12 |
| runaway | weak-low | 34,640 / 36,505 / 38,450 | 79 (14) | 1 | R2S3 / R2S3 / R2S3 | 3% | 0% | wk7 | — |
| maxPerks | average-max | 48,595 / 50,825 / 53,480 | 112 (19) | 2 | R2S4 / R3S1 / R3S2 | 100% | 87% | wk5 | wk11 |
| even | avg-A/B/C | ~41,950 / **~44,000** / ~46,200 | 96-98 (16-17) | 2 | R2S4 / **R2S4** / R2S4 | 100% | 0% | wk6 | wk12 |
| lightSchedule (2 rounds/wk) | average-typical | 30,635 / 32,625 / 35,050 | 74 (12) | 1 | R2S2 / R2S3 / R2S3 | 0% | 0% | wk8 | — |

League Legendaries pulled per season (baseline): p10 3, **p50 5**, p90 9
of 50. The pool never ran out.

#### Proposed: average-typical player, week by week (cumulative; p10 / p50 / p90)

| Week | DP earned | Packs opened | Bought (p50) | Legendaries | Boss | Path tier (p50) |
|---|---|---|---|---|---|---|
| 1 | 2,685 / 3,120 / 3,530 | 7 / 9 / 11 | 1 | 0 / 0 / 1 | R1S1 / R1S2 / R1S2 | 1 |
| 2 | 5,705 / 6,345 / 6,955 | 13 / 16 / 19 | 2 | 0 / 0 / 1 | R1S2 / R1S2 / R1S2 | 3 |
| 3 | 8,660 / 9,445 / 10,170 | 20 / 24 / 28 | 3 | 0 / 0 / 1 | R1S3 / R1S3 / R1S3 | 4 |
| 4 | 11,775 / 12,730 / 13,695 | 27 / 31 / 36 | 4 | 0 / 0 / 2 | R1S3 / R1S3 / R1S3 | 6 |
| 5 | 14,825 / 15,975 / 17,135 | 34 / 38 / 44 | 6 | 0 / 1 / 2 | R1S3 / R1S3 / R1S3 | 8 |
| 6 | 17,950 / 19,280 / 20,690 | 40 / 46 / 53 | 7 | 0 / 1 / 2 | R1S4 / R1S4 / R1S4 | 9 |
| 7 | 21,420 / 22,765 / 24,090 | 47 / 53 / 60 | 8 | 0 / 1 / 2 | R1S4 / R2S1 / R2S1 | 11 |
| 8 | 24,625 / 26,110 / 27,705 | 54 / 61 / 68 | 9 | 0 / 1 / 3 | R2S1 / R2S2 / R2S2 | 13 |
| 9 | 27,735 / 29,425 / 31,240 | 61 / 68 / 76 | 11 | 0 / 1 / 3 | R2S2 / R2S2 / R2S3 | 14 |
| 10 | 31,025 / 32,860 / 34,625 | 68 / 75 / 84 | 12 | 0 / 1 / 3 | R2S3 / R2S3 / R2S3 | 16 |
| 11 | 34,455 / 36,360 / 38,250 | 74 / 82 / 92 | 14 | 0 / 1 / 3 | R2S3 / R2S3 / R2S3 | 18 |
| 12 | 38,060 / 40,250 / 42,635 | 80 / 90 / 100 | 15 | 0 / 1 / 3 | R2S3 / R2S4 / R2S4 | 19 |
| 13 | 41,705 / 43,860 / 46,145 | 88 / 97 / 108 | 16 | 0 / 2 / 4 | R2S4 / R2S4 / R2S4 | 20 |

Mean DP by source over the season (average-typical): match 6,816,
round participation 11,700, round placement 8,387, bounty 910,
catch-up 226, weekly goals 4,662, Season Path 3,897, mini games 3,077,
perks 4,231. Total about 43,900, or about 3,380 per week.

#### Current config, for comparison (same model, same seed)

| Player (baseline) | DP earned p50 | Packs opened p50 (bought) | Boss p50 | R1 done | R2 done | 3rd unl |
|---|---|---|---|---|---|---|
| skilled-typical | 36,125 | 75 (14) | R2S4 | wk3 | wk10 | 0% |
| average-typical | 34,650 | 67 (13) | R2S4 | wk3 | wk11 | 0% |
| weak-typical | 33,175 | 62 (12) | R2S4 | wk4 | wk11 | 0% |
| top: skilled-high | 39,975 | 76 (15) | R2S4 | wk3 | wk9 | **0%** |

On current numbers, route 1 is maxed in week 3. The average player then
sits on R1S4 from week 4 to week 7 while saving for the 7,000 slot. The
3rd route (10,000) is unreachable for everyone, and weak earns 92% of
skilled. Current numbers meet 12 of 13 targets; the miss is that the 3rd
route is never reachable. They also contradict the owner's explicit wish
for pricier evolution.

### 4. Target check (proposed: 13/13 PASS)

| Target | Result |
|---|---|
| Average typical player: median 2 routes at stage 4 by week 13 | PASS (R2S4; p10 is also R2S4) |
| Average typical: 2 routes done in ≥ 60% of seasons | PASS (100%) |
| Average typical: route 2 not done before week 10 (median) | PASS (week 12) |
| Average typical: 3rd route unlocked in ≤ 25% of seasons | PASS (0%) |
| Even group (3 × average): median R2S4 | PASS |
| Top player (skilled + high activity): 3rd route unlocked in ≥ 50% | PASS (65%) |
| Top player: 3rd route fully evolved in ≤ 25% | PASS (0%) |
| Weak typical: median at least R2S3 | PASS (R2S4) |
| Weak typical earns ≥ 85% of skilled typical (median DP) | PASS (97%) |
| Runaway case: weak+low earns ≥ 70% of skilled+high | PASS (72%) |
| Average typical buys ≥ 1 pack/week with DP | PASS (16 in 13 weeks) |
| Average typical opens ≥ 4 packs/week incl. vouchers | PASS (~7.5/week) |
| League Legendaries p90 ≤ 60% of pool | PASS (9 of 50) |

**Sensitivity (what could break the targets):**

| Change | Average typical, end of season | Top player, 3rd route unlocked | Verdict |
|---|---|---|---|
| Spend 25% on packs instead of 35% | R3S1 (90% unlock route 3) | 100% | 3rd route too easy; raise slot 3 if players hoard |
| Spend 45% on packs | R2S3 (2% finish route 2) | 0% | Too hard; lower stage 4 cost if players buy lots of packs |
| No card-power feedback (`--no-feedback`) | R2S4 | 66% | Unchanged; results are not sensitive to this |
| Different seed (`--seed 999`) | R2S4 | 69% | Unchanged |
| No perk cap (cap removed) | R2S4 | 86% | Everyone-high-activity group: 56% unlock route 3 (29% with cap); max-perk player reaches R3S3 |
| Only 2 rounds per week | R2S3 | — | Misses target; raise round participation DP if this is the real rhythm |

Re-run these with `--pack-share 0.25`, `--pack-share 0.45`,
`--no-feedback` and `--seed 999`. The no-cap row needs
`weeklyCapDp: null` in `config.mjs`.

**Biggest assumption:** the 35/5/60 spending split. The proposal
is tuned so that "buy roughly one pack a week on top of your vouchers,
save the rest for your Boss" lands exactly on 2 Bosses. The slot-3 price
is the single best knob to retune after the first few weeks of real data.

### 5. Files

- `scripts/season-sim/config.mjs`: CURRENT and PROPOSED configs,
  player profiles, the spending model and the scenarios.
- `scripts/season-sim/sim.mjs`: seeded deterministic simulator
  (mulberry32), Monte Carlo runner and percentile summary.
- `scripts/season-sim/run.mjs`: CLI.
  `node scripts/season-sim/run.mjs [--config proposed|current] [--runs 500] [--seed N] [--scenario baseline|top|perksLow|perksHigh|mixed|runaway|maxPerks|even|lightSchedule|all] [--pack-share 0.35] [--no-feedback] [--summary-only]`
- `scripts/season-sim/sim.test.mjs`: `node scripts/season-sim/sim.test.mjs`
  checks determinism, ledger accounting (DP in − DP out = balance =
  envelopes, for every config × scenario), the round rule book, the
  Boss price ladder, Legendary pool and pity, Season Path payouts and the
  perk cap.
