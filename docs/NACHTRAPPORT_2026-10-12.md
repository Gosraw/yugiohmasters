# Nachtrapport — 12 oktober 2026

Goedemorgen! Dit is wat er vannacht aan Duelist Circle 2.0 is gebouwd.
Alles staat op de **v2**-branch op GitHub. Er is **niets** live gezet en
de echte database van je vrienden is **niet aangeraakt**.

## In één oogopslag

| Onderdeel | Status |
|---|---|
| Plan vastgelegd (`docs/V2_PLAN.md`) | ✅ |
| Test-database (zonder Docker, eigen mini-Supabase) | ✅ werkt, app draait erop |
| 1.000-kaarten-fout | ✅ opgelost |
| Kaartenpool + 2014-banlist + "oneerlijk"-voorstel | ✅ klaar voor stemming |
| Kaartrangschikking opnieuw + stem-scherm in de app | ✅ |
| Beloningen gerepareerd + getest | ✅ |
| Seizoen-simulator met voorstel-cijfers | ✅ wacht op jouw OK |
| Millennium-stijl: 3 ontwerpen, voorlopig **B — Night Temple** | ✅ jij mag nog wisselen |
| Nieuw menu (Home · Play · Cards · Shop · Profile) + opruimen | ✅ |
| Nieuwe deck builder (telefoon eerst, slim zoeken) | ✅ |
| Duels: tik op de winnaar + "This Round"-scherm + seizoenscompetitie | ✅ |
| Belonings-pop-ups + wallet met uitleg | ✅ |
| Weekdoelen (voorlopig), Seizoenspad, premie & inhaalbonus | ✅ |
| Nieuw Home-scherm | ✅ |
| Binder toont alle kaarten | ✅ |
| Klimspel (Pyramid Climb) — dagelijks + weekranglijst, server controleert scores | ✅ (Play → Mini Games) |
| Auto battler (Shadow Arena) — 78 monsters, 20 Boss-golven, server controleert | ✅ (Play → Mini Games) |
| Testbots (Playwright): start, 17 pagina's × 3 spelers, economie, shop | ✅ **132/132 groen** (telefoon + desktop) |
| 20 Boss-arena's, seizoensposter/banner, 6 emblemen (fal.ai) | ✅ |
| Beweging: Millennium pack-opening, Boss-evolutie-filmpje, tab-overgangen | ✅ (nog op echte iPhone testen) |
| Video's + omroeper (ElevenLabs) | ❌ nog niet (ElevenLabs niet gekoppeld) |

**Eindcontrole (04:40):** typecheck schoon, lint schoon, 271 unit-tests
groen, 13 SQL-testbestanden groen, testbots 132/132 groen, productie-build
slaagt (05:00).

Ook gedaan na de eerste versie van dit rapport:
- Nieuwe kaartenpool + onze banlist + Classic v2 staan klaar in de database
  (nog uit), plus het lanceer-resetscript en het draaiboek
  `docs/LAUNCH_2_0_RUNBOOK.md` (stap voor stap, in het Nederlands).
- Master Duel-regel aangepast: alleen kaarten die niet in Master Duel
  bestaan gaan eruit (jullie spelen Unlimited).
- Deck builder toont onze limieten (Verboden / Max 1 / Max 2).
- Perk-maximum 600 DP per week (instelbaar), titels op je profiel.
- ~90 Nederlandse teksten vertaald naar Engels. Het Samo-paaseitje heb ik
  bewust in het Nederlands gelaten — jij beslist.
- Fout opgelost: nieuwe spelers kwamen na inloggen op Home in plaats van
  bij Boss kiezen.

## ⚠️ Belangrijk om te weten

1. **Mogelijke fout in de live app.** De rondebeloning (na een volledige
   ronde) crasht in de huidige code: een eerdere fix liet één verwijzing
   staan (`reward_reason`). Als dit in productie zo is toegepast, mislukt
   het invoeren van de laatste uitslag van elke ronde. Ik heb productie
   niet bekeken (afspraak). In 2.0 is het opgelost. **Wil je dat ik dit
   eerder fix op de live site?** (Je zei eerder: alles wacht op 2.0.)
2. **Schijf van je Mac is bijna vol** (~2–6 GB vrij). Docker paste niet,
   daarom heb ik een lichtere test-database gebouwd. Ruim je wat op
   (bijv. Downloads), dan gaat alles sneller.
3. **Ik heb geïnstalleerd:** Postgres 17, PostgREST, Colima/Docker en
   Supabase CLI (via Homebrew) en `postgres` + Playwright in het project.
   npm-cache en Homebrew-downloadcache leeggemaakt voor ruimte.
4. **fal.ai:** ~$2,50 uitgegeven (3 stijlproeven + 28 beelden). Budget was $10.
5. **Nog een fout in de live app (gevonden door de testbots):** het bestand
   dat nieuwe spelers door de start leidt (Boss kiezen → draft →
   welkomstpacks) en je inlog ververst, stond op de verkeerde plek en werd
   **nooit** uitgevoerd. In 2.0 opgelost (`src/proxy.ts`). Gevolg nu live:
   nieuwe spelers kunnen de draft overslaan en krijgen geen welkomstpacks.
6. **Seizoen-1 "welkomstpacks al gehad"-vinkjes** worden door de reset niet
   gewist → bij de 2.0-reset moeten die mee (staat in het lanceerscript).
7. **Mini-games:** een handige speler kan de score-controle omzeilen door de
   database direct aan te roepen. Volledig dichtzetten kan pas als er een
   geheime server-sleutel in Vercel staat (jij moet die instellen).

## Wat jij moet beslissen

1. **Stijl:** open `docs/design/v2-style-options.html` — A, **B** of C?
2. **Cijfers** (`docs/season-sim-report.md`): Boss 1.800 / 3.200 / 5.500,
   2e/3e route 3.000 / 5.500, rondeplaatsen 350/200/100, weekdoelen,
   Seizoenspad, premie 75 / inhaal 50, mini-games, perk-limiet 600/week.
   Alles staat in instel-tabellen; jouw OK = één script draaien.
3. **Boss-routes vs. concept** (`docs/cardpool-v2-ranking.md`, V1–V6):
   Chaos Emperor Dragon is de eindbaas van de Chaos-route maar staat op
   de verboden-lijst; Dark Magician of Chaos was verboden in 2014; Cubic-
   route is helemaal van na 2014. Mijn voorstel: Boss-kaarten tellen niet
   mee voor de poolregels (alleen de eigenaar krijgt ze).
4. **"Legacy kaarten"** = Master Duel's gratis Legacy Pack. Die kun je
   gewoon gebruiken in Unlimited, dus géén reden om ze te weren. Alleen
   23 kaarten die helemaal niet in Master Duel bestaan gaan eruit. Klopt
   dat met wat je bedoelde?
5. **Weekdoelen**: staan er voorlopig in (10 soorten); jij wilde ze nog
   uitgebreider ontwerpen.

## Hoe bekijk je het zelf?

In een terminal in de projectmap:

```
node scripts/devstack/db.mjs start
node scripts/devstack/gateway.mjs
node scripts/devstack/dev.mjs
```

Open dan http://localhost:3100 en log in als `bossg` (testwachtwoord in
`scripts/devstack/test-users.json`). Dit is de **test**-omgeving, niet de
echte app.

## Details per onderdeel (voor wie wil lezen)

- Kaartenpool: `docs/cardpool-v2-foundation.md`
- Rangschikking + stemmen: `docs/cardpool-v2-ranking.md`
- Simulator: `docs/season-sim-report.md`
- Test-database: `scripts/devstack/` (README in de code)
- Plan: `docs/V2_PLAN.md`
