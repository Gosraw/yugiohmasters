import { createClient } from "@supabase/supabase-js";

/*
  Master Duel audit script (V1.2, hardening pass 2026-08-22).

  Dit script bepaalt PER KAART of hij momenteel in Master Duel
  zit, en zet card_catalog.master_duel_status dienovereenkomstig.

  DRY RUN IS DE STANDAARD. Dit script schrijft NIETS naar
  Supabase tenzij je --apply meegeeft:

    npm run audit:master-duel          -> alleen analyseren + rapport
    npm run audit:master-duel:apply    -> daadwerkelijk wegschrijven

  VERPLICHTE DEPLOYVOLGORDE (zie ook de migratie-header van
  202608220020_master_duel_compatibility.sql):
    A. migratie uitvoeren
    B. onmiddellijk `npm run audit:master-duel:apply` draaien
    C. de statuscounts in de rapportage controleren
    D. pas daarna Draft/Shop weer laten gebruiken
  is_master_duel_offerable() is CONSERVATIEF: alleen unlimited/
  semi_limited/limited zijn aanbiedbaar. Elke kaart begint op
  'unknown' (niet aanbiedbaar) tot dit script stap B heeft
  gedraaid - de pool is dus expres leeg tussen A en B.

  EERLIJKHEIDSNOTITIE (niet verbergen):
  YGOPRODeck's ?format=master%20duel parameter is betrouwbaar
  voor de simpele JA/NEE-vraag "zit deze kaart uberhaupt in
  Master Duel". Dat is alles wat dit script met vertrouwen kan
  schrijven:

    - unlimited      -> kaart zit in Master Duel volgens YGOPRODeck
    - not_available  -> kaart zit NIET in Master Duel

  De fijnmazige Master Duel banlist (Forbidden / Limited /
  Semi-Limited) kon deze sessie NIET betrouwbaar bevestigd worden
  (YGOPRODeck's eigen banlist-pagina rendert client-side in
  JavaScript). Dit script schrijft daarom NOOIT 'forbidden',
  'semi_limited' of 'limited' - die drie bestaan wel in het schema
  en zijn te zetten via set_card_master_duel_status(), maar alleen
  handmatig door een admin met een betrouwbare banlist-bron. Een
  kaart die al op 'forbidden'/'semi_limited'/'limited' staat wordt
  door dit script NOOIT overschreven - die handmatige beslissing
  blijft staan.

  Draait met dezelfde service-role sleutel als sync-cards.mjs
  (bypassed RLS) - bewust alleen lokaal/door de eigenaar te
  draaien, nooit automatisch.
*/
const YGOPRODECK_MASTER_DUEL_URL =
  "https://db.ygoprodeck.com/api/v7/cardinfo.php?format=master%20duel";

/*
  Mortilux Heruvur - vaste steekproef.

  Deze specifieke passcode wordt bij elke run apart gerapporteerd
  als handmatige sanity-check: is deze kaart uberhaupt in onze
  catalogus, wat is zijn huidige status, en wat zou hij worden.
  Geen speciale logica - gewoon dezelfde classificatie als elke
  andere kaart, maar altijd zichtbaar in het rapport zodat een
  mens het in een oogopslag kan controleren.
*/
const MORTILUX_HERUVUR_PASSCODE = 15415552;

const APPLY_MODE =
  process.argv.includes(
    "--apply"
  );

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;

/*
  isValidExternalId()

  external_card_id is in het schema `bigint not null` met een
  `> 0`-check-constraint, dus in theorie kan een rij in
  card_catalog nooit een missende/negatieve id hebben. Dit is
  desondanks een expliciete, defensieve check: als er ooit toch
  een rare/onverwachte waarde binnenkomt (bijvoorbeeld via een
  toekomstige schemawijziging, of corrupte data), MAG dit script
  zo'n kaart NOOIT stilzwijgend op not_available zetten - dat zou
  "geen data" verwarren met "bevestigd niet in Master Duel". Zulke
  kaarten blijven op 'unknown' staan en worden apart gerapporteerd
  als audit-probleem dat een mens moet bekijken.
*/
function isValidExternalId(
  externalCardId
) {
  const asNumber =
    Number(
      externalCardId
    );

  return (
    externalCardId !==
      null &&
    externalCardId !==
      undefined &&
    Number.isFinite(
      asNumber
    ) &&
    asNumber > 0
  );
}

const MANUAL_STATUSES =
  new Set([
    "forbidden",
    "semi_limited",
    "limited",
  ]);

/*
  classifyCards()

  Pure functie, geen netwerk/database-aanroepen - dit is bewust
  gescheiden van fetchCatalogCards()/downloadMasterDuelIds() zodat
  de classificatielogica los te testen is met synthetische data.

  Geeft per kaart een classificatie terug plus een geaggregeerd
  rapport. Kaarten die al handmatig op forbidden/semi_limited/
  limited staan worden nooit aangeraakt. Kaarten met een missende/
  ongeldige external_card_id worden nooit not_available - die
  blijven altijd 'unknown' en komen apart in het rapport.
*/
function classifyCards(
  catalogCards,
  masterDuelIds
) {
  const toWrite = [];

  let wouldBecomeUnlimited = 0;

  let wouldBecomeNotAvailable = 0;

  let preservedManualForbidden = 0;

  let preservedManualLimited = 0;

  let preservedManualSemiLimited = 0;

  let missingOrInvalidExternalId = 0;

  const missingOrInvalidExternalIdSamples =
    [];

  for (const card of catalogCards) {
    if (
      card.master_duel_status ===
      "forbidden"
    ) {
      preservedManualForbidden += 1;

      continue;
    }

    if (
      card.master_duel_status ===
      "semi_limited"
    ) {
      preservedManualSemiLimited += 1;

      continue;
    }

    if (
      card.master_duel_status ===
      "limited"
    ) {
      preservedManualLimited += 1;

      continue;
    }

    if (
      !isValidExternalId(
        card.external_card_id
      )
    ) {
      missingOrInvalidExternalId += 1;

      if (
        missingOrInvalidExternalIdSamples.length <
        20
      ) {
        missingOrInvalidExternalIdSamples.push(
          {
            id: card.id,
            name:
              card.name ??
              null,
            external_card_id:
              card.external_card_id ??
              null,
          }
        );
      }

      /*
        Bewust GEEN entry in toWrite - deze kaart blijft
        precies zoals hij was (meestal 'unknown'). Zie de
        isValidExternalId()-comment hierboven.
      */
      continue;
    }

    const inMasterDuel =
      masterDuelIds.has(
        Number(
          card.external_card_id
        )
      );

    const nextStatus =
      inMasterDuel
        ? "unlimited"
        : "not_available";

    if (inMasterDuel) {
      wouldBecomeUnlimited += 1;
    } else {
      wouldBecomeNotAvailable += 1;
    }

    toWrite.push({
      id: card.id,
      master_duel_status:
        nextStatus,
    });
  }

  return {
    toWrite,

    report: {
      totalCardCatalog:
        catalogCards.length,

      masterDuelIdsFromSource:
        masterDuelIds.size,

      wouldBecomeUnlimited,
      wouldBecomeNotAvailable,
      preservedManualForbidden,
      preservedManualLimited,
      preservedManualSemiLimited,
      missingOrInvalidExternalId,
      missingOrInvalidExternalIdSamples,
    },
  };
}

/*
  buildMortiluxReport()

  Losstaande, altijd-getoonde steekproef voor passcode
  MORTILUX_HERUVUR_PASSCODE. masterDuelIds mag null zijn (als de
  bron onbereikbaar was) - dan wordt dat expliciet gerapporteerd
  in plaats van geraden.
*/
function buildMortiluxReport(
  catalogCards,
  masterDuelIds
) {
  const card =
    catalogCards.find(
      (c) =>
        Number(
          c.external_card_id
        ) ===
        MORTILUX_HERUVUR_PASSCODE
    ) ??
    null;

  if (!card) {
    return {
      passcode:
        MORTILUX_HERUVUR_PASSCODE,

      foundInCatalog: false,

      card: null,

      foundInMasterDuelSource:
        null,

      wouldBecome: null,
    };
  }

  const foundInSource =
    masterDuelIds
      ? masterDuelIds.has(
          MORTILUX_HERUVUR_PASSCODE
        )
      : null;

  const isManual =
    MANUAL_STATUSES.has(
      card.master_duel_status
    );

  return {
    passcode:
      MORTILUX_HERUVUR_PASSCODE,

    foundInCatalog: true,

    card: {
      id: card.id,
      name: card.name,
      currentStatus:
        card.master_duel_status,
    },

    foundInMasterDuelSource:
      foundInSource,

    wouldBecome: isManual
      ? `preserved (manual ${card.master_duel_status})`
      : foundInSource === null
        ? "unknown - source unreachable"
        : foundInSource
          ? "unlimited"
          : "not_available",
  };
}

function printReport(
  report,
  mortilux,
  applyMode
) {
  console.log("");

  console.log(
    applyMode
      ? "💾 APPLY MODE - onderstaande wijzigingen zijn weggeschreven."
      : "🔍 DRY RUN - er is NIETS weggeschreven. Draai met --apply om echt te schrijven."
  );

  console.log("");

  console.log(
    `📚 Totaal card_catalog:              ${report.totalCardCatalog}`
  );

  console.log(
    `📡 Master Duel IDs van bron:         ${report.masterDuelIdsFromSource}`
  );

  console.log(
    `✅ Would become unlimited:           ${report.wouldBecomeUnlimited}`
  );

  console.log(
    `🚫 Would become not_available:       ${report.wouldBecomeNotAvailable}`
  );

  console.log(
    `🔒 Preserved manual forbidden:       ${report.preservedManualForbidden}`
  );

  console.log(
    `🔒 Preserved manual limited:         ${report.preservedManualLimited}`
  );

  console.log(
    `🔒 Preserved manual semi_limited:    ${report.preservedManualSemiLimited}`
  );

  console.log(
    `⚠️  Missing/invalid external_card_id: ${report.missingOrInvalidExternalId} (blijft unknown, NIET auto not_available)`
  );

  if (
    report.missingOrInvalidExternalIdSamples
      .length > 0
  ) {
    console.log(
      "   Voorbeelden (max 20):"
    );

    for (const sample of report.missingOrInvalidExternalIdSamples) {
      console.log(
        `   - ${sample.id} | ${sample.name ?? "(geen naam)"} | external_card_id=${sample.external_card_id}`
      );
    }
  }

  console.log("");

  console.log(
    "🃏 Mortilux Heruvur-steekproef (passcode 15415552):"
  );

  console.log(
    `   In catalogus:        ${mortilux.foundInCatalog}`
  );

  if (mortilux.card) {
    console.log(
      `   Naam:                 ${mortilux.card.name}`
    );

    console.log(
      `   Huidige status:       ${mortilux.card.currentStatus}`
    );
  }

  console.log(
    `   In Master Duel-bron:  ${mortilux.foundInMasterDuelSource}`
  );

  console.log(
    `   Zou worden:           ${mortilux.wouldBecome}`
  );

  console.log("");
}

async function downloadMasterDuelIds() {
  console.log(
    "📡 Master Duel kaartenlijst ophalen van YGOPRODeck..."
  );

  const response =
    await fetch(
      YGOPRODECK_MASTER_DUEL_URL,
      {
        headers: {
          "User-Agent":
            "Duelist-Circle/1.0",

          "Accept-Language":
            "en-US,en;q=0.9",
        },
      }
    );

  if (!response.ok) {
    throw new Error(
      `YGOPRODeck API gaf HTTP ${response.status}`
    );
  }

  const json =
    await response.json();

  if (
    !Array.isArray(
      json.data
    )
  ) {
    throw new Error(
      "Onverwacht antwoord van YGOPRODeck."
    );
  }

  return new Set(
    json.data.map(
      (card) =>
        Number(card.id)
    )
  );
}

async function getAllCatalogCards(
  supabase
) {
  const pageSize = 1000;

  let from = 0;

  const cards = [];

  while (true) {
    const {
      data,
      error,
    } = await supabase
      .from("card_catalog")
      .select(
        "id,name,external_card_id,master_duel_status"
      )
      .range(
        from,
        from +
          pageSize -
          1
      );

    if (error) {
      throw new Error(
        `Kaarten ophalen mislukt: ${error.message}`
      );
    }

    if (
      !data ||
      data.length === 0
    ) {
      break;
    }

    cards.push(
      ...data
    );

    if (
      data.length <
      pageSize
    ) {
      break;
    }

    from += pageSize;
  }

  return cards;
}

/*
  writeStatuses()

  Gebruikt bewust update() per rij, NIET upsert(). Getest tegen
  een wegwerpbare Postgres-kopie van het echte card_catalog-schema:
  een upsert() die alleen {id, master_duel_status,
  master_duel_checked_at} meestuurt faalt met "null value in
  column external_card_id violates not-null constraint" - Postgres
  bouwt bij ON CONFLICT alsnog de volledige voorgestelde INSERT-rij
  op en valideert die VOORDAT het conflict wordt afgehandeld, dus
  ontbrekende NOT NULL-kolommen (name/card_type/external_card_id,
  geen default) laten de hele aanroep klappen, zelfs als de rij al
  bestaat. Een plain update() op alleen de twee doelkolommen heeft
  dat probleem niet en is bovendien veiliger: het kan nooit per
  ongeluk een nieuwe rij aanmaken of andere kolommen overschrijven.
*/
async function writeStatuses(
  supabase,
  toWrite
) {
  const concurrency = 10;

  let completed = 0;

  let failed = 0;

  const checkedAt =
    new Date().toISOString();

  for (
    let i = 0;
    i < toWrite.length;
    i += concurrency
  ) {
    const batch =
      toWrite.slice(
        i,
        i + concurrency
      );

    const results =
      await Promise.all(
        batch.map(
          (row) =>
            supabase
              .from(
                "card_catalog"
              )
              .update(
                {
                  master_duel_status:
                    row.master_duel_status,

                  master_duel_checked_at:
                    checkedAt,
                }
              )
              .eq(
                "id",
                row.id
              )
        )
      );

    for (const result of results) {
      if (result.error) {
        failed += 1;

        console.error(
          `❌ Update mislukt voor kaart: ${result.error.message}`
        );
      } else {
        completed += 1;
      }
    }

    console.log(
      `💾 ${completed + failed} / ${toWrite.length} kaarten verwerkt (${failed} mislukt)`
    );
  }

  return {
    completed,
    failed,
  };
}

async function main() {
  if (!SUPABASE_URL) {
    console.error(
      "❌ NEXT_PUBLIC_SUPABASE_URL ontbreekt."
    );

    process.exit(1);
  }

  if (!SUPABASE_SECRET_KEY) {
    console.error(
      "❌ SUPABASE_SECRET_KEY ontbreekt. Voeg deze toe aan .env.local."
    );

    process.exit(1);
  }

  const supabase =
    createClient(
      SUPABASE_URL,
      SUPABASE_SECRET_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

  console.log(
    APPLY_MODE
      ? "💾 APPLY MODE - dit schrijft echt naar Supabase."
      : "🔍 DRY RUN - er wordt niets geschreven. Gebruik --apply om echt te schrijven."
  );

  const masterDuelIds =
    await downloadMasterDuelIds();

  console.log(
    `📊 ${masterDuelIds.size} kaarten gevonden in Master Duel.`
  );

  console.log("");

  console.log(
    "📚 Volledige card_catalog ophalen..."
  );

  const catalogCards =
    await getAllCatalogCards(
      supabase
    );

  console.log(
    `📚 ${catalogCards.length} kaarten in card_catalog.`
  );

  const {
    toWrite,
    report,
  } = classifyCards(
    catalogCards,
    masterDuelIds
  );

  const mortilux =
    buildMortiluxReport(
      catalogCards,
      masterDuelIds
    );

  printReport(
    report,
    mortilux,
    APPLY_MODE
  );

  if (!APPLY_MODE) {
    console.log(
      "ℹ️  Dit was een dry run. Draai `npm run audit:master-duel:apply` om deze wijzigingen echt te schrijven."
    );

    return;
  }

  console.log(
    `💾 ${toWrite.length} kaarten daadwerkelijk bijwerken...`
  );

  const {
    completed,
    failed,
  } = await writeStatuses(
    supabase,
    toWrite
  );

  console.log("");

  console.log(
    `✅ Klaar. ${completed} kaarten bijgewerkt, ${failed} mislukt.`
  );

  if (failed > 0) {
    process.exitCode = 1;
  }
}

/*
  Alleen automatisch draaien als dit bestand direct is aangeroepen
  (`node scripts/audit-master-duel.mjs`) - niet wanneer een ander
  bestand (bijvoorbeeld een testscript) de pure functies hieronder
  importeert. Zonder deze guard zou elke import ook meteen de
  echte YGOPRODeck-fetch + Supabase-call + process.exit triggeren.
*/
const isDirectlyExecuted =
  import.meta.url ===
  `file://${process.argv[1]}`;

if (isDirectlyExecuted) {
  main().catch(
    (error) => {
      console.error(
        "❌ Master Duel audit mislukt:",
        error.message
      );

      process.exit(1);
    }
  );
}

export {
  isValidExternalId,
  classifyCards,
  buildMortiluxReport,
  MORTILUX_HERUVUR_PASSCODE,
};
