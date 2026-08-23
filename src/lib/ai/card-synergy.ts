// =========================================================
// CARD SYNERGY - AI EXPLANATION LAYER (STEP 3)
//
// Takes the ALREADY-RANKED, ALREADY-JUSTIFIED candidates from
// card-synergy-candidates.ts (real card_catalog data + structured
// mechanic facts, computed deterministically with zero AI
// involvement) and, only for the small top-N list, asks an AI
// provider to turn the structured reasons into a short, natural
// human explanation. This is deliberately the OPPOSITE of "send
// the whole catalog to Anthropic and ask" - the AI never sees more
// than a handful of cards and never decides which cards are
// synergistic, only how to phrase why (a decision already made by
// deterministic code).
//
// Mirrors the provider-isolation/fallback pattern in
// boss-companion.ts: everything provider-specific lives in
// callAiProvider() below, and askBossCompanion's "no key / call
// fails -> local fallback, never crash" contract is preserved here
// too - explainSynergyCandidates() ALWAYS resolves, and every
// candidate always gets *some* explanation (AI phrasing when
// available, the deterministic reason text otherwise).
//
// ANTI-HALLUCINATION CONTRACT:
// - The AI is given ONLY the target card's real fields, each
//   candidate's real fields, and the reason strings already
//   computed by card-synergy-candidates.ts (which are themselves
//   built only from real card_catalog fields).
// - The system prompt explicitly forbids citing any effect not in
//   the supplied text, inventing rulings, or claiming a combo
//   "works" beyond what the supplied reasons state.
// - AI output is parsed per-card by an explicit CARD_ID marker; any
//   candidate the AI didn't return an explanation for (or whose
//   marker doesn't match a card we actually sent) silently falls
//   back to the deterministic reason text for that one card, rather
//   than failing the whole request or accepting unrelated text.
//
// ENV VARS: same as boss-companion.ts - ANTHROPIC_API_KEY. Missing
// key (or any fetch failure) -> pure deterministic fallback, no
// error ever surfaces to the caller.
// =========================================================

import type {
  SynergyCandidate,
  SynergyCatalogCard,
} from "@/lib/ai/card-synergy-candidates";

const ANTHROPIC_MODEL = "claude-sonnet-4-5";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MAX_OUTPUT_TOKENS = 500;
const REQUEST_TIMEOUT_MS = 12000;

export type SynergyExplanation = {
  cardId: string;
  cardName: string;
  explanation: string;
  source: "ai" | "fallback";
};

function systemPrompt(): string {
  return [
    "You are explaining Yu-Gi-Oh! card synergy suggestions inside Duelist Circle, ",
    "a card-tracking app for a small private league. A deterministic system has ",
    "ALREADY decided which candidate cards synergize with a target card and WHY - ",
    "your only job is to phrase each already-computed reason as one short, natural ",
    "sentence a duelist would actually say.\n\n",
    "STRICT RULES:\n",
    "- Use ONLY the CARD DATA and REASONS given below. Never mention an effect, ",
    "stat, or ruling that isn't explicitly present in the supplied text.\n",
    "- Never invent combo steps, turn sequences, or outcomes beyond what the ",
    "REASONS literally state.\n",
    "- If a reason is uncertain or partial, say so plainly rather than overstating it.\n",
    "- One short sentence per card, plain language, no hype, no emoji.\n",
    "- Output format is REQUIRED and MUST be followed exactly: for each card, a ",
    "line reading exactly `CARD_ID: <id>` followed by your one-sentence ",
    "explanation on the next line, then a blank line before the next card. Do not ",
    "add any other text, headers, or commentary.",
  ].join("");
}

function formatCardFacts(card: SynergyCatalogCard): string {
  const parts: string[] = [`Name: ${card.name}`];
  if (card.card_type) parts.push(`Type: ${card.card_type}`);
  if (card.monster_type) parts.push(`Monster type: ${card.monster_type}`);
  if (card.attribute) parts.push(`Attribute: ${card.attribute}`);
  if (card.archetype) parts.push(`Archetype: ${card.archetype}`);
  if (card.level !== null) parts.push(`Level: ${card.level}`);
  if (card.rank !== null) parts.push(`Rank: ${card.rank}`);
  if (card.link_rating !== null) parts.push(`Link Rating: ${card.link_rating}`);
  if (card.description) parts.push(`Text: ${card.description}`);
  return parts.join(" | ");
}

function buildUserMessage(
  target: SynergyCatalogCard,
  candidates: SynergyCandidate[]
): string {
  const blocks = candidates.map((c) => {
    const reasonLines = c.reasons
      .map((r) => `  - ${r.detail}`)
      .join("\n");
    return [
      `CARD_ID: ${c.card.id}`,
      `CARD DATA: ${formatCardFacts(c.card)}`,
      "REASONS (already computed, do not add to these):",
      reasonLines,
    ].join("\n");
  });

  return [
    `TARGET CARD DATA: ${formatCardFacts(target)}`,
    "",
    "CANDIDATES:",
    "",
    blocks.join("\n\n"),
  ].join("\n");
}

type ParsedBlock = {
  cardId: string;
  explanation: string;
};

function parseAiResponse(text: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const lines = text.split("\n");

  let currentId: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (currentId && currentLines.length > 0) {
      const explanation = currentLines.join(" ").trim();
      if (explanation.length > 0) {
        blocks.push({ cardId: currentId, explanation });
      }
    }
    currentId = null;
    currentLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const match = /^CARD_ID:\s*(.+)$/.exec(line);

    if (match) {
      flush();
      currentId = match[1].trim();
      continue;
    }

    if (line.length === 0) {
      continue;
    }

    if (currentId) {
      currentLines.push(line);
    }
  }

  flush();

  return blocks;
}

async function callAiProvider(
  target: SynergyCatalogCard,
  candidates: SynergyCandidate[]
): Promise<Map<string, string> | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: systemPrompt(),
        messages: [
          {
            role: "user",
            content: buildUserMessage(target, candidates),
          },
        ],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const text = data?.content?.[0]?.text;

    if (typeof text !== "string" || text.trim().length === 0) {
      return null;
    }

    const parsed = parseAiResponse(text);

    if (parsed.length === 0) {
      return null;
    }

    // Only keep explanations for cards we actually sent - never
    // trust an AI-invented card id, even if the format is well-formed.
    const validIds = new Set(candidates.map((c) => c.card.id));
    const result = new Map<string, string>();

    for (const block of parsed) {
      if (validIds.has(block.cardId)) {
        result.set(block.cardId, block.explanation);
      }
    }

    return result.size > 0 ? result : null;
  } catch {
    return null;
  }
}

/**
 * Deterministic, no-AI explanation built directly from the
 * highest-weighted reason already computed by
 * card-synergy-candidates.ts. Always available, always accurate to
 * the underlying mechanic match (it IS the mechanic match, just
 * the pre-written detail string) - this is the "genuinely supported
 * by a structured mechanic match" fallback text the product spec
 * requires rather than a generic "no AI available" message.
 */
function fallbackExplanation(candidate: SynergyCandidate): string {
  const topReason = candidate.reasons[0];
  return topReason
    ? topReason.detail
    : `${candidate.card.name} has a mechanical connection to this card.`;
}

/**
 * Public entry point. ALWAYS resolves with one explanation per
 * candidate (AI phrasing when available and valid, deterministic
 * reason text otherwise) - never throws, never leaves a candidate
 * unexplained.
 */
export async function explainSynergyCandidates(
  target: SynergyCatalogCard,
  candidates: SynergyCandidate[],
  maxCandidates = 3
): Promise<SynergyExplanation[]> {
  const top = candidates.slice(0, maxCandidates);

  if (top.length === 0) {
    return [];
  }

  const aiExplanations = await callAiProvider(target, top);

  return top.map((c) => {
    const aiText = aiExplanations?.get(c.card.id);

    if (aiText) {
      return {
        cardId: c.card.id,
        cardName: c.card.name,
        explanation: aiText,
        source: "ai" as const,
      };
    }

    return {
      cardId: c.card.id,
      cardName: c.card.name,
      explanation: fallbackExplanation(c),
      source: "fallback" as const,
    };
  });
}
