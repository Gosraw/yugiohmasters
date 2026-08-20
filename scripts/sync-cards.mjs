import { createClient } from "@supabase/supabase-js";

/*
  Alleen kaarten die een TCG-release hebben.

  YGOPRODeck geeft standaard Engelse kaartdata terug.
  format=tcg verwijdert onder andere OCG-only kaarten
  uit onze Duelist Circle kaartpool.
*/
const YGOPRODECK_URL =
  "https://db.ygoprodeck.com/api/v7/cardinfo.php?format=tcg";

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

function getImages(card) {
  const image =
    card.card_images?.[0];

  return {
    image_url:
      image?.image_url ?? null,

    image_url_small:
      image?.image_url_small ?? null,

    image_url_cropped:
      image?.image_url_cropped ?? null,
  };
}

function getLevels(card) {
  const type =
    card.type ?? "";

  return {
    level:
      type.includes("XYZ") ||
      type.includes("Link")
        ? null
        : card.level ?? null,

    rank:
      type.includes("XYZ")
        ? card.level ?? null
        : null,

    link_rating:
      type.includes("Link")
        ? card.linkval ?? null
        : null,

    link_markers:
      Array.isArray(
        card.linkmarkers
      )
        ? card.linkmarkers
        : [],
  };
}

function normalizeCard(card) {
  const images =
    getImages(card);

  const levels =
    getLevels(card);

  return {
    external_card_id:
      card.id,

    name:
      card.name,

    card_type:
      card.type ?? "Unknown",

    frame_type:
      card.frameType ?? null,

    monster_type:
      card.typeline?.join(
        " / "
      ) ?? null,

    race:
      card.race ?? null,

    attribute:
      card.attribute ?? null,

    level:
      levels.level,

    rank:
      levels.rank,

    link_rating:
      levels.link_rating,

    link_markers:
      levels.link_markers,

    atk:
      card.atk ?? null,

    def:
      card.def ?? null,

    description:
      card.desc ?? null,

    archetype:
      card.archetype ?? null,

    image_url:
      images.image_url,

    image_url_small:
      images.image_url_small,

    image_url_cropped:
      images.image_url_cropped,

    set_information:
      card.card_sets ?? [],

    raw_data:
      card,

    source:
      "ygoprodeck",

    updated_at:
      new Date().toISOString(),
  };
}

async function downloadCards() {
  console.log(
    "📡 Engelse TCG-kaartdatabase ophalen..."
  );

  const response =
    await fetch(
      YGOPRODECK_URL,
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

  return json.data;
}

async function saveCards(cards) {
  const batchSize = 250;

  let completed = 0;

  for (
    let i = 0;
    i < cards.length;
    i += batchSize
  ) {
    const batch =
      cards
        .slice(
          i,
          i + batchSize
        )
        .map(
          normalizeCard
        );

    /*
      We sturen de rarity-kolommen hier expres NIET mee.

      Daardoor blijven onze eerder berekende
      Duelist Circle rarities intact.
    */
    const { error } =
      await supabase
        .from(
          "card_catalog"
        )
        .upsert(
          batch,
          {
            onConflict:
              "external_card_id",
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
      `✅ ${completed} / ${cards.length} TCG-kaarten opgeslagen`
    );
  }
}

async function getExistingCards() {
  const pageSize = 1000;

  let from = 0;

  const existing = [];

  while (true) {
    const {
      data,
      error,
    } = await supabase
      .from("card_catalog")
      .select(
        "id,external_card_id,source"
      )
      .eq(
        "source",
        "ygoprodeck"
      )
      .range(
        from,
        from +
          pageSize -
          1
      );

    if (error) {
      throw new Error(
        `Bestaande kaarten ophalen mislukt: ${error.message}`
      );
    }

    if (
      !data ||
      data.length === 0
    ) {
      break;
    }

    existing.push(
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

  return existing;
}

async function removeNonTcgCards(
  tcgCards
) {
  console.log("");
  console.log(
    "🧹 OCG-only / niet-TCG kaarten zoeken..."
  );

  const tcgIds =
    new Set(
      tcgCards.map(
        (card) =>
          Number(card.id)
      )
    );

  const existing =
    await getExistingCards();

  const toDelete =
    existing.filter(
      (card) =>
        !tcgIds.has(
          Number(
            card.external_card_id
          )
        )
    );

  if (
    toDelete.length === 0
  ) {
    console.log(
      "✅ Geen niet-TCG kaarten gevonden."
    );

    return 0;
  }

  console.log(
    `🗑️ ${toDelete.length} niet-TCG kaarten worden verwijderd.`
  );

  const batchSize = 200;

  let deleted = 0;

  for (
    let i = 0;
    i <
    toDelete.length;
    i += batchSize
  ) {
    const ids =
      toDelete
        .slice(
          i,
          i +
            batchSize
        )
        .map(
          (card) =>
            card.id
        );

    const {
      error,
    } = await supabase
      .from(
        "card_catalog"
      )
      .delete()
      .in(
        "id",
        ids
      );

    if (error) {
      throw new Error(
        `Verwijderen mislukt: ${error.message}`
      );
    }

    deleted +=
      ids.length;

    console.log(
      `🗑️ ${deleted} / ${toDelete.length} verwijderd`
    );
  }

  return deleted;
}

async function main() {
  try {
    const cards =
      await downloadCards();

    console.log(
      `📦 ${cards.length} Engelse TCG-kaarten gevonden.`
    );

    await saveCards(
      cards
    );

    const removed =
      await removeNonTcgCards(
        cards
      );

    console.log("");
    console.log(
      "🎉 TCG-kaartdatabase synchronisatie voltooid."
    );

    console.log(
      `✅ ${cards.length} TCG-kaarten aanwezig.`
    );

    console.log(
      `🗑️ ${removed} niet-TCG kaarten verwijderd.`
    );

    console.log("");
    console.log(
      "ℹ️ Duelist Circle rarity-velden zijn behouden."
    );
  } catch (error) {
    console.error("");
    console.error(
      "❌ Synchronisatie mislukt."
    );

    console.error(
      error instanceof Error
        ? error.message
        : error
    );

    process.exit(1);
  }
}

main();