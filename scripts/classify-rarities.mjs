import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("❌ Supabase instellingen ontbreken in .env.local.");
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

const RARITY_BANDS = [
  { name: "Legendary", maxPercentile: 0.01 },
  { name: "Secret Rare", maxPercentile: 0.05 },
  { name: "Ultra Rare", maxPercentile: 0.15 },
  { name: "Super Rare", maxPercentile: 0.35 },
  { name: "Rare", maxPercentile: 0.65 },
  { name: "Normal", maxPercentile: 1 },
];

const REVIEW_BOUNDARIES = [
  0.01,
  0.05,
  0.15,
  0.35,
  0.65,
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function containsAny(text, phrases) {
  return phrases.some((phrase) =>
    text.includes(phrase)
  );
}

function countMatches(text, phrases) {
  return phrases.filter((phrase) =>
    text.includes(phrase)
  ).length;
}

function getBanlistValues(card) {
  const banlist =
    card.raw_data?.banlist_info ?? {};

  return Object.values(banlist)
    .filter(Boolean)
    .map((value) =>
      String(value).toLowerCase()
    );
}

function getImpactScore(card) {
  const text =
    String(card.description ?? "").toLowerCase();

  const type =
    String(card.card_type ?? "").toLowerCase();

  let score = 0;
  let evidence = 0;
  const reasons = [];

  /*
    DRAW
  */

  if (
    containsAny(text, [
      "draw 1 card",
      "draw 1",
    ])
  ) {
    score += 9;
    evidence += 2;
    reasons.push("draw 1");
  }

  if (
    containsAny(text, [
      "draw 2 cards",
      "draw 2",
    ])
  ) {
    score += 22;
    evidence += 5;
    reasons.push("draw 2");
  }

  if (
    containsAny(text, [
      "draw 3 cards",
      "draw 3",
    ])
  ) {
    score += 28;
    evidence += 5;
    reasons.push("draw 3");
  }

  /*
    SEARCH / CONSISTENCY
  */

  const searchCount = countMatches(
    text,
    [
      "from your deck to your hand",
      "from the deck to your hand",
      "add 1",
      "add up to",
      "add that card to your hand",
      "add it to your hand",
    ]
  );

  if (searchCount > 0) {
    score += Math.min(
      15,
      7 + searchCount * 2
    );

    evidence += 3;
    reasons.push("search / consistency");
  }

  /*
    NEGATION
  */

  if (
    containsAny(text, [
      "negate the activation",
      "negate its effects",
      "negate that effect",
      "negate the effect",
      "negate the effects",
      "activation is negated",
    ])
  ) {
    score += 14;
    evidence += 4;
    reasons.push("negation");
  }

  /*
    FLOODGATE / RESTRICTION
  */

  if (
    containsAny(text, [
      "cannot be activated",
      "cannot activate",
      "neither player can",
      "your opponent cannot",
      "players cannot",
    ])
  ) {
    score += 12;
    evidence += 4;
    reasons.push("floodgate / restriction");
  }

  /*
    SINGLE REMOVAL
  */

  if (
    containsAny(text, [
      "destroy 1",
      "destroy that",
      "destroy those",
    ])
  ) {
    score += 7;
    evidence += 2;
    reasons.push("destruction");
  }

  if (
    containsAny(text, [
      "banish 1",
      "banish that",
      "banish those",
      "banish it",
      "return it to the hand",
      "return that card",
      "shuffle it into the deck",
      "shuffle that card into the deck",
      "send that card to the gy",
    ])
  ) {
    score += 10;
    evidence += 3;
    reasons.push("strong removal");
  }

  /*
    BOARD WIPES
  */

  if (
    containsAny(text, [
      "destroy all monsters your opponent controls",
      "destroy all face-up monsters your opponent controls",
    ])
  ) {
    score += 24;
    evidence += 5;
    reasons.push("opponent monster board wipe");
  }

  if (
    containsAny(text, [
      "destroy all spells and traps your opponent controls",
      "destroy all spell and trap cards your opponent controls",
    ])
  ) {
    score += 24;
    evidence += 5;
    reasons.push("opponent spell/trap board wipe");
  }

  if (
    containsAny(text, [
      "destroy all monsters on the field",
      "destroy all cards on the field",
    ])
  ) {
    score += 18;
    evidence += 4;
    reasons.push("full board wipe");
  }

  /*
    MASS NON-DESTRUCTION REMOVAL
  */

  if (
    containsAny(text, [
      "banish all monsters your opponent controls",
      "banish all cards your opponent controls",
      "shuffle all cards your opponent controls",
      "return all monsters your opponent controls",
    ])
  ) {
    score += 26;
    evidence += 5;
    reasons.push("mass non-destruction removal");
  }

  /*
    REVIVAL
  */

  if (
    containsAny(text, [
      "special summon 1 monster from either gy",
      "special summon 1 monster from either player's gy",
    ])
  ) {
    score += 22;
    evidence += 5;
    reasons.push("generic revive");
  } else if (
    containsAny(text, [
      "special summon 1 monster from your gy",
      "special summon 1 monster from your graveyard",
    ])
  ) {
    score += 13;
    evidence += 3;
    reasons.push("revive");
  }

  /*
    SPECIAL SUMMON / EXTENDER
  */

  if (
    containsAny(text, [
      "special summon this card",
      "special summon 1",
      "special summon up to",
      "special summon that",
      "special summon those",
    ])
  ) {
    score += 7;
    evidence += 2;
    reasons.push("special summon utility");
  }

  /*
    QUICK INTERACTION
  */

  if (
    containsAny(text, [
      "(quick effect)",
      "during either player's turn",
      "when your opponent activates",
      "if your opponent activates",
      "during your opponent's turn",
    ])
  ) {
    score += 10;
    evidence += 3;
    reasons.push("quick interaction");
  }

  /*
    PROTECTION
  */

  if (
    containsAny(text, [
      "cannot be destroyed by battle",
    ])
  ) {
    score += 5;
    evidence += 2;
    reasons.push("battle protection");
  }

  if (
    containsAny(text, [
      "cannot be destroyed by card effects",
      "cannot be destroyed by your opponent's card effects",
    ])
  ) {
    score += 8;
    evidence += 2;
    reasons.push("effect destruction protection");
  }

  if (
    containsAny(text, [
      "cannot be targeted by card effects",
      "cannot be targeted by your opponent's card effects",
    ])
  ) {
    score += 8;
    evidence += 2;
    reasons.push("targeting protection");
  }

  if (
    containsAny(text, [
      "unaffected by other cards' effects",
      "unaffected by your opponent's card effects",
      "unaffected by card effects",
    ])
  ) {
    score += 15;
    evidence += 4;
    reasons.push("effect immunity");
  }

  /*
    GRAVEYARD VALUE
  */

  if (
    containsAny(text, [
      "if this card is sent to the gy",
      "if this card is in your gy",
      "banish this card from your gy",
      "from your gy",
    ])
  ) {
    score += 5;
    evidence += 1;
    reasons.push("GY utility");
  }

  /*
    EXTRA DECK
  */

  if (
    type.includes("fusion") ||
    type.includes("synchro") ||
    type.includes("xyz") ||
    type.includes("link")
  ) {
    score += 4;
    evidence += 1;
    reasons.push("extra deck utility");
  }

  return {
    score,
    evidence,
    reasons,
  };
}

function getPlayabilityScore(card) {
  const text =
    String(card.description ?? "").toLowerCase();

  const type =
    String(card.card_type ?? "").toLowerCase();

  let score = 0;
  let evidence = 0;
  const reasons = [];

  /*
    DIRECT SPEELBAAR

    Normal Spells zijn vaak direct inzetbaar.
  */

  if (type === "spell card") {
    score += 8;
    evidence += 2;
    reasons.push("easy to activate");
  }

  /*
    QUICK-PLAY / TRAPS / HAND INTERACTION
  */

  if (
    type.includes("quick-play")
  ) {
    score += 7;
    evidence += 2;
    reasons.push("quick-play");
  }

  if (
    containsAny(text, [
      "from your hand",
      "(quick effect)",
      "during your opponent's turn",
    ])
  ) {
    score += 7;
    evidence += 2;
    reasons.push("fast interaction");
  }

  /*
    SELF-SUMMON
  */

  if (
    containsAny(text, [
      "you can special summon this card",
      "special summon this card from your hand",
    ])
  ) {
    score += 6;
    evidence += 2;
    reasons.push("easy self-summon");
  }

  /*
    GEEN SETUP
  */

  if (
    type.includes("spell") &&
    !containsAny(text, [
      "if you control",
      "if your opponent controls",
      "while you control",
      "must first",
      "must be",
      "tribute",
      "discard",
    ])
  ) {
    score += 5;
    evidence += 2;
    reasons.push("low setup");
  }

  return {
    score,
    evidence,
    reasons,
  };
}

function getRestrictionPenalty(card) {
  const text =
    String(card.description ?? "").toLowerCase();

  let penalty = 0;
  let evidence = 0;
  const reasons = [];

  /*
    SPECIFIEKE SUMMON CONDITIONS
  */

  if (
    containsAny(text, [
      "must be special summoned",
      "must first be special summoned",
      "cannot be normal summoned/set",
    ])
  ) {
    penalty += 12;
    evidence += 3;
    reasons.push("special summon requirement");
  }

  /*
    TRIBUTE
  */

  if (
    containsAny(text, [
      "tribute 1",
      "tribute 2",
      "tribute this card",
      "by tributing",
    ])
  ) {
    penalty += 8;
    evidence += 2;
    reasons.push("tribute cost");
  }

  /*
    SPECIFIEKE KAART / ARCHETYPE VEREIST
  */

  if (
    containsAny(text, [
      "by tributing 1 \"",
      "if you control \"",
      "while you control \"",
      "if you have \"",
      "send 1 \"",
    ])
  ) {
    penalty += 10;
    evidence += 3;
    reasons.push("specific card requirement");
  }

  /*
    DISCARD / HAND COST
  */

  if (
    containsAny(text, [
      "discard 1 card",
      "discard 1",
      "discard this card",
    ])
  ) {
    penalty += 5;
    evidence += 2;
    reasons.push("discard cost");
  }

  /*
    LIFE POINT COST
  */

  if (
    containsAny(text, [
      "pay 1000 lp",
      "pay 2000 lp",
      "pay half your lp",
      "pay half your life points",
    ])
  ) {
    penalty += 4;
    evidence += 2;
    reasons.push("LP cost");
  }

  /*
    BOARD STATE CONDITIONS
  */

  if (
    containsAny(text, [
      "if you control no cards",
      "if you control no face-up cards",
      "if your opponent controls a monster and you control no monsters",
      "if your opponent controls more cards than you do",
    ])
  ) {
    penalty += 6;
    evidence += 2;
    reasons.push("board-state condition");
  }

  /*
    ONCE PER TURN

    Kleine penalty; dit is normaal in modern Yu-Gi-Oh.
  */

  if (
    containsAny(text, [
      "once per turn",
      "you can only use this effect of",
      "you can only activate 1",
    ])
  ) {
    penalty += 2;
    evidence += 1;
    reasons.push("usage limit");
  }

  /*
    EXTRA DECK / MATERIAL REQUIREMENTS
  */

  if (
    containsAny(text, [
      "fusion summon",
      "synchro summon",
      "xyz summon",
      "link summon",
    ])
  ) {
    penalty += 3;
    evidence += 1;
    reasons.push("summoning setup");
  }

  return {
    penalty,
    evidence,
    reasons,
  };
}

function getGenericUtilityScore(card) {
  const text =
    String(card.description ?? "").toLowerCase();

  const archetype =
    String(card.archetype ?? "").toLowerCase();

  let score = 0;
  let evidence = 0;
  const reasons = [];

  /*
    GENERIEKE TERMINOLOGIE
  */

  if (
    containsAny(text, [
      "1 monster",
      "1 card",
      "your opponent controls",
      "either gy",
      "either player's gy",
    ])
  ) {
    score += 5;
    evidence += 2;
    reasons.push("generic utility");
  }

  /*
    ARCHETYPE-AFHANKELIJK
  */

  if (
    archetype &&
    text.includes(archetype)
  ) {
    score -= 5;
    evidence += 2;
    reasons.push("archetype dependent");
  }

  /*
    QUOTED SPECIFIC CARD NAMES

    Veel quoted namen betekent vaak meer setup.
  */

  const quotedNames =
    text.match(/"[^"]+"/g) ?? [];

  if (quotedNames.length >= 2) {
    score -= 6;
    evidence += 2;
    reasons.push("specific named-card dependency");
  } else if (quotedNames.length === 1) {
    score -= 2;
  }

  return {
    score,
    evidence,
    reasons,
  };
}

function calculatePower(card) {
  const text =
    String(card.description ?? "").toLowerCase();

  const type =
    String(card.card_type ?? "").toLowerCase();

  const impact =
    getImpactScore(card);

  const playability =
    getPlayabilityScore(card);

  const restrictions =
    getRestrictionPenalty(card);

  const generic =
    getGenericUtilityScore(card);

  let score =
    15 +
    impact.score +
    playability.score +
    generic.score -
    restrictions.penalty;

  let evidence =
    impact.evidence +
    playability.evidence +
    restrictions.evidence +
    generic.evidence;

  const reasons = [
    ...impact.reasons,
    ...playability.reasons,
    ...generic.reasons,
    ...restrictions.reasons.map(
      (reason) => `penalty: ${reason}`
    ),
  ];

  /*
    NORMAL MONSTERS
  */

  if (
    type.includes("normal monster")
  ) {
    score -= 10;
    evidence += 2;
    reasons.push("normal monster");
  }

  /*
    EFFECT CARDS
  */

  if (
    type.includes("effect") &&
    !type.includes("normal monster")
  ) {
    score += 5;
    evidence += 1;
  }

  /*
    STATS

    Slechts kleine invloed.
  */

  const atk = Number(card.atk);

  if (Number.isFinite(atk)) {
    if (atk >= 4000) {
      score += 4;
    } else if (atk >= 3000) {
      score += 3;
    } else if (atk >= 2500) {
      score += 2;
    }
  }

  /*
    BANLIST
  */

  const banValues =
    getBanlistValues(card);

  if (
    banValues.some((value) =>
      value.includes("banned")
    )
  ) {
    score += 12;
    evidence += 4;
    reasons.push("forbidden on banlist");
  } else if (
    banValues.some((value) =>
      value.includes("limited")
    )
  ) {
    score += 7;
    evidence += 3;
    reasons.push("limited on banlist");
  }

  /*
    ZEER KLEINE TIE-BREAKER
  */

  score += Math.min(
    text.length / 1500,
    1
  );

  score =
    clamp(
      score,
      0,
      100
    );

  return {
    powerScore:
      Math.round(score * 100) / 100,

    impactScore:
      Math.round(
        impact.score * 100
      ) / 100,

    playabilityScore:
      Math.round(
        playability.score * 100
      ) / 100,

    restrictionPenalty:
      Math.round(
        restrictions.penalty * 100
      ) / 100,

    genericScore:
      Math.round(
        generic.score * 100
      ) / 100,

    evidence,

    reasons:
      reasons.length > 0
        ? reasons
        : ["no major gameplay signals"],
  };
}

function rarityForPercentile(percentile) {
  return (
    RARITY_BANDS.find(
      (band) =>
        percentile <=
        band.maxPercentile
    )?.name ??
    "Normal"
  );
}

function distanceToRarityBoundary(
  percentile
) {
  return Math.min(
    ...REVIEW_BOUNDARIES.map(
      (boundary) =>
        Math.abs(
          percentile -
          boundary
        )
    )
  );
}

function buildClassification(
  card,
  rank,
  total
) {
  const percentile =
    total <= 1
      ? 0
      : rank / total;

  const rarity =
    rarityForPercentile(
      percentile
    );

  const boundaryDistance =
    distanceToRarityBoundary(
      percentile
    );

  const closeToBoundary =
    boundaryDistance <= 0.003;

  const suspiciousHighResult =
    card.evidence <= 2 &&
    (
      rarity === "Legendary" ||
      rarity === "Secret Rare" ||
      rarity === "Ultra Rare"
    );

  const needsReview =
    closeToBoundary ||
    suspiciousHighResult;

  let confidence =
    0.72 +
    Math.min(
      card.evidence * 0.02,
      0.16
    ) +
    Math.min(
      boundaryDistance * 5,
      0.09
    );

  if (closeToBoundary) {
    confidence -= 0.15;
  }

  if (suspiciousHighResult) {
    confidence -= 0.12;
  }

  confidence =
    clamp(
      confidence,
      0.5,
      0.97
    );

  confidence =
    Math.round(
      confidence * 100
    ) / 100;

  const topPercent =
    Math.max(
      0.01,
      percentile * 100
    );

  return {
    game_rarity:
      rarity,

    rarity_score:
      card.powerScore,

    rarity_confidence:
      confidence,

    rarity_needs_review:
      needsReview,

    rarity_reason:
      [
        `Power ${card.powerScore}`,
        `Impact ${card.impactScore}`,
        `Playability ${card.playabilityScore}`,
        `Generic ${card.genericScore}`,
        `Restriction penalty ${card.restrictionPenalty}`,
        `Top ${topPercent.toFixed(2)}%`,
        ...card.reasons,
      ].join(", "),
  };
}

async function getCards() {
  console.log(
    "📚 Kaarten ophalen uit Duelist Circle..."
  );

  const pageSize = 1000;
  let from = 0;
  const cards = [];

  while (true) {
    const { data, error } =
      await supabase
        .from("card_catalog")
        .select(
          [
            "id",
            "external_card_id",
            "name",
            "card_type",
            "monster_type",
            "archetype",
            "atk",
            "description",
            "raw_data",
            "rarity_manually_overridden",
          ].join(",")
        )
        .order("id")
        .range(
          from,
          from + pageSize - 1
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

    cards.push(...data);

    if (
      data.length < pageSize
    ) {
      break;
    }

    from += pageSize;
  }

  return cards;
}

async function saveClassifications(
  cards
) {
  const automaticCards =
    cards.filter(
      (card) =>
        card.rarity_manually_overridden !==
        true
    );

  const skipped =
    cards.length -
    automaticCards.length;

  console.log(
    `🤖 ${automaticCards.length} kaarten worden automatisch beoordeeld.`
  );

  if (skipped > 0) {
    console.log(
      `🔒 ${skipped} handmatig beoordeelde kaarten blijven onaangeraakt.`
    );
  }

  const scored =
    automaticCards.map(
      (card) => ({
        ...card,
        ...calculatePower(card),
      })
    );

  scored.sort((a, b) => {
    if (
      b.powerScore !==
      a.powerScore
    ) {
      return (
        b.powerScore -
        a.powerScore
      );
    }

    if (
      b.evidence !==
      a.evidence
    ) {
      return (
        b.evidence -
        a.evidence
      );
    }

    return (
      Number(a.external_card_id) -
      Number(b.external_card_id)
    );
  });

  const rarityCounts = {
    Normal: 0,
    Rare: 0,
    "Super Rare": 0,
    "Ultra Rare": 0,
    "Secret Rare": 0,
    Legendary: 0,
  };

  let reviewCount = 0;

  const classified =
    scored.map(
      (card, index) => {
        const classification =
          buildClassification(
            card,
            index,
            scored.length
          );

        rarityCounts[
          classification.game_rarity
        ] += 1;

        if (
          classification.rarity_needs_review
        ) {
          reviewCount += 1;
        }

        return {
          id: card.id,
          external_card_id:
            card.external_card_id,
          name:
            card.name,
          card_type:
            card.card_type,
          ...classification,
        };
      }
    );

  const batchSize = 200;

  for (
    let i = 0;
    i < classified.length;
    i += batchSize
  ) {
    const batch =
      classified.slice(
        i,
        i + batchSize
      );

    const { error } =
      await supabase
        .from("card_catalog")
        .upsert(
          batch,
          {
            onConflict: "id",
          }
        );

    if (error) {
      throw new Error(
        `Opslaan mislukt rond kaart ${
          i + 1
        }: ${error.message}`
      );
    }

    console.log(
      `✅ ${Math.min(
        i + batchSize,
        classified.length
      )} / ${classified.length}`
    );
  }

  console.log("");
  console.log(
    "🎉 Automatische rarity-classificatie voltooid."
  );

  console.log("");
  console.log("Verdeling:");

  console.log(
    `Normal: ${rarityCounts.Normal}`
  );

  console.log(
    `Rare: ${rarityCounts.Rare}`
  );

  console.log(
    `Super Rare: ${
      rarityCounts["Super Rare"]
    }`
  );

  console.log(
    `Ultra Rare: ${
      rarityCounts["Ultra Rare"]
    }`
  );

  console.log(
    `Secret Rare: ${
      rarityCounts["Secret Rare"]
    }`
  );

  console.log(
    `Legendary: ${
      rarityCounts.Legendary
    }`
  );

  console.log("");

  console.log(
    `🧐 ${reviewCount} kaarten staan op de reviewlijst.`
  );
}

async function main() {
  try {
    const cards =
      await getCards();

    console.log(
      `📦 ${cards.length} kaarten gevonden.`
    );

    if (
      cards.length === 0
    ) {
      throw new Error(
        "Geen kaarten gevonden in card_catalog."
      );
    }

    await saveClassifications(
      cards
    );
  } catch (error) {
    console.error("");
    console.error(
      "❌ Classificatie mislukt."
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