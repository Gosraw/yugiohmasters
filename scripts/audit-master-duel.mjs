import { createClient } from "@supabase/supabase-js";

/*
  Master Duel audit script (V1.2, 2026-08-22).

  Dit script bepaalt PER KAART of hij momenteel in Master Duel
  zit, en zet card_catalog.master_duel_status dienovereenkomstig.

  BELANGRIJKE EERLIJKHEIDSNOTITIE (niet verbergen):

  YGOPRODeck's ?format=master%20duel parameter is deze sessie
  geverifieerd als betrouwbaar voor de simpele JA/NEE-vraag
  "zit deze kaart uberhaupt in Master Duel". Dat is alles wat dit
  script met vertrouwen kan schrijven:

    - unlimited      -> kaart zit in Master Duel volgens YGOPRODeck
    - not_available  -> kaart zit NIET in Master Duel

  De fijnmazige Master Duel banlist (Forbidden / Limited /
  Semi-Limited) kon deze sessie NIET betrouwbaar bevestigd worden.
  YGOPRODeck's eigen Master Duel banlist-pagina rendert client-side
  in JavaScript en was niet uit te lezen met de tooling die deze
  sessie beschikbaar had. Dit script schrijft daarom NOOIT
  'forbidden', 'semi_limited' of 'limited' - die drie statussen
  bestaan wel al in het schema (zie de 202608220020-migratie) en
  zijn te zetten via set_card_master_duel_status(), maar alleen
  handmatig door een admin die een betrouwbare banlist-bron heeft
  geraadpleegd. Dit script overschrijft een kaart die al op
  'forbidden', 'semi_limited' of 'limited' staat NIET - die
  handmatige beslissing blijft staan totdat een admin hem zelf
  wijzigt.

  Draait met dezelfde service-role sleutel als sync-cards.mjs
  (bypassed RLS, dus bewust alleen lokaal/door de eigenaar te
  draaien - niet door Claude deze sessie, en niet automatisch).
*/
const YGOPRODECK_MASTER_DUEL_URL =
  "https://db.ygoprodeck.com/api/v7/cardinfo.php?format=master%20duel";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;

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

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SECRET_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

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

async function getAuditableCards() {
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
        "id,external_card_id,master_duel_status"
      )
      /*
        We laten kaarten die al handmatig op forbidden/
        semi_limited/limited staan met rust - zie de
        eerlijkheidsnotitie bovenaan dit bestand.
      */
      .not(
        "master_duel_status",
        "in",
        "(forbidden,semi_limited,limited)"
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

async function writeStatuses(
  cards,
  masterDuelIds
) {
  const batchSize = 250;

  let completed = 0;

  let unlimitedCount = 0;

  let notAvailableCount = 0;

  for (
    let i = 0;
    i < cards.length;
    i += batchSize
  ) {
    const batch =
      cards.slice(
        i,
        i + batchSize
      );

    const rows =
      batch.map(
        (card) => {
          const inMasterDuel =
            masterDuelIds.has(
              Number(
                card.external_card_id
              )
            );

          if (inMasterDuel) {
            unlimitedCount += 1;
          } else {
            notAvailableCount += 1;
          }

          return {
            id: card.id,

            master_duel_status:
              inMasterDuel
                ? "unlimited"
                : "not_available",

            master_duel_checked_at:
              new Date().toISOString(),
          };
        }
      );

    const { error } =
      await supabase
        .from(
          "card_catalog"
        )
        .upsert(
          rows,
          {
            onConflict:
              "id",
          }
        );

    if (error) {
      throw new Error(
        `Supabase fout rond kaart ${
          i + 1
        }: ${error.message}`
      );
    }

    completed +=
      batch.length;

    console.log(
      `✅ ${completed} / ${cards.length} kaarten bijgewerkt`
    );
  }

  return {
    unlimitedCount,
    notAvailableCount,
  };
}

async function main() {
  const masterDuelIds =
    await downloadMasterDuelIds();

  console.log(
    `📊 ${masterDuelIds.size} kaarten gevonden in Master Duel.`
  );

  console.log("");
  console.log(
    "📚 Auditbare kaarten uit card_catalog ophalen (forbidden/semi_limited/limited overgeslagen)..."
  );

  const cards =
    await getAuditableCards();

  console.log(
    `📚 ${cards.length} kaarten te controleren.`
  );

  console.log("");
  console.log(
    "💾 Master Duel status wegschrijven..."
  );

  const {
    unlimitedCount,
    notAvailableCount,
  } = await writeStatuses(
    cards,
    masterDuelIds
  );

  console.log("");
  console.log(
    "✅ Klaar."
  );

  console.log(
    `   unlimited (in Master Duel):     ${unlimitedCount}`
  );

  console.log(
    `   not_available (niet in Master Duel): ${notAvailableCount}`
  );

  console.log("");
  console.log(
    "ℹ️  Forbidden / Semi-Limited / Limited zijn NIET automatisch gezet."
  );

  console.log(
    "   Dat vereist een betrouwbare Master Duel banlist-bron en"
  );

  console.log(
    "   moet handmatig via set_card_master_duel_status() gebeuren."
  );
}

main().catch(
  (error) => {
    console.error(
      "❌ Master Duel audit mislukt:",
      error.message
    );

    process.exit(1);
  }
);
