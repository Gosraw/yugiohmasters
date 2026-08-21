import type {
  BossContext,
} from "@/lib/ai/boss-context";

import {
  formatBossContext,
} from "@/lib/ai/boss-context";

// =========================================================
// BOSS COMPANION - AI PROVIDER LAYER
//
// Everything provider-specific lives in callAiProvider() below.
// Swapping to a different AI provider later means changing only
// that one function - the rest of the app (route, context
// builder, chat UI) never needs to know which provider is used.
//
// SECURITY: this file never receives Supabase credentials, never
// builds or runs SQL, and only ever sends the small plain-text
// BossContext snapshot (see boss-context.ts) plus the player's
// own typed question. It has no access to any other player's
// data beyond what's already baked into that context server-side.
//
// ENV VARS (set these later in Vercel / .env.local, never commit
// the value):
//   ANTHROPIC_API_KEY - a Claude API key from console.anthropic.com.
//     Without it, askBossCompanion() below returns a graceful,
//     rule-based local answer instead of calling any AI provider -
//     the app never crashes or errors just because this is unset.
// =========================================================

const ANTHROPIC_MODEL = "claude-sonnet-4-5";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MAX_OUTPUT_TOKENS = 300;

export type BossPersonality =
  | "sarcastic"
  | "arrogant"
  | "ruthless"
  | "honorable"
  | "chaotic"
  | "supportive"
  | null;

const PERSONALITY_VOICE: Record<
  Exclude<BossPersonality, null>,
  string
> = {
  sarcastic:
    "Dry, sardonic, quietly amused by the duelist's mistakes but never actually cruel. Short, cutting one-liners.",
  arrogant:
    "Supremely confident, a little condescending, treats every duel as beneath the Boss Monster's dignity - but is still loyal to its duelist.",
  ruthless:
    "Blunt, competitive, no patience for excuses. Talks like a rival, not a friend - pushes the duelist to be better.",
  honorable:
    "Formal, respectful, speaks like an old-school duelist bound by a code of honor. Encouraging but dignified.",
  chaotic:
    "Unpredictable, playful, a little unhinged, enjoys chaos and gambles. Energetic and irreverent.",
  supportive:
    "Warm, encouraging, genuinely invested in the duelist's growth. The most straightforwardly kind of the six.",
};

function systemPrompt(
  personality: BossPersonality
): string {
  const voice =
    personality && personality in PERSONALITY_VOICE
      ? PERSONALITY_VOICE[personality]
      : "Confident, competitive, and helpful - a classic dueling companion.";

  return [
    "You are the player's Boss Monster and dueling companion in Duelist Circle, ",
    "a private Yu-Gi-Oh! league for a small group of friends who play physical, ",
    "in-person duels and use this app to track results, decks, trades and a card ",
    "collection.\n\n",
    `Personality: ${voice}\n\n`,
    "Rules:\n",
    "- Answer ONLY using the CONTEXT block you are given below. Never invent ",
    "stats, matches, cards, or people that aren't in it.\n",
    "- Keep answers SHORT: 1-3 sentences, occasionally a short list if genuinely ",
    "helpful. This is a quick companion chat, not an essay.\n",
    "- Stay in character with the personality above, but prioritize being ",
    "genuinely useful over being funny.\n",
    "- Never invent duel mechanics that don't exist in this app - there is no ",
    "per-card play tracking, no turn logs, no simulated dueling. You only know ",
    "about league standing, decks, pending actions, rivalries and card pulls.\n",
    "- If the context doesn't contain the answer, say so briefly instead of ",
    "guessing.",
  ].join("");
}

export type AskBossResult = {
  message: string;
  source: "ai" | "fallback";
};

// ---------------------------------------------------------
// RATE LIMITING
//
// Lightweight, in-memory, per-server-instance cooldown. This is
// not a durable/cross-instance limiter (a serverless cold start
// resets it), but it's enough to stop accidental rapid-fire
// double-sends and keep a single session from hammering the API,
// without needing a new database table just for this.
// ---------------------------------------------------------

const COOLDOWN_MS = 4000;
const lastRequestAt = new Map<string, number>();

export function isRateLimited(
  userId: string
): boolean {
  const last = lastRequestAt.get(userId);
  const now = Date.now();

  if (last && now - last < COOLDOWN_MS) {
    return true;
  }

  lastRequestAt.set(userId, now);

  // Keep the map from growing forever in a long-lived process.
  if (lastRequestAt.size > 500) {
    const cutoff = now - COOLDOWN_MS * 10;
    for (const [id, ts] of lastRequestAt) {
      if (ts < cutoff) lastRequestAt.delete(id);
    }
  }

  return false;
}

// ---------------------------------------------------------
// PROVIDER CALL
// ---------------------------------------------------------

async function callAiProvider(
  personality: BossPersonality,
  contextText: string,
  question: string
): Promise<string | null> {
  const apiKey =
    process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch(
      ANTHROPIC_API_URL,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: systemPrompt(personality),
          messages: [
            {
              role: "user",
              content: `CONTEXT:\n${contextText}\n\nQUESTION: ${question}`,
            },
          ],
        }),
        // Keep this reasonably tight - a chat companion reply
        // should never leave the user staring at a spinner.
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const text = data?.content?.[0]?.text;

    return typeof text === "string" && text.trim().length > 0
      ? text.trim()
      : null;
  } catch {
    // Network error, timeout, malformed response, etc. - fall
    // through to the local fallback rather than surfacing an
    // error to the player.
    return null;
  }
}

// ---------------------------------------------------------
// LOCAL FALLBACK (no AI key configured, or the call failed)
//
// Covers the quick-prompt questions with honest, context-real
// answers built from plain template strings - no AI involved.
// ---------------------------------------------------------

function localFallback(
  context: BossContext,
  question: string
): string {
  const q = question.toLowerCase();
  const name = context.bossName ?? "Your Boss Monster";

  if (q.includes("next") || q.includes("do now") || q.includes("moet ik")) {
    if (context.pendingActions.length > 0) {
      return `${name}: You have ${context.pendingActions.length} thing${
        context.pendingActions.length === 1 ? "" : "s"
      } waiting - starting with "${context.pendingActions[0].label}".`;
    }
    if (!context.activeDeck) {
      return `${name}: Nothing urgent is waiting on you, but you don't have an active deck set yet - that's worth fixing before your next duel.`;
    }
    return `${name}: Nothing urgent right now. Go find someone to duel.`;
  }

  if (q.includes("league") || q.includes("standing") || q.includes("rank")) {
    if (context.league) {
      return `${name}: You're rank ${context.league.rank ?? "?"} of ${
        context.league.memberCount
      }, with a ${context.league.wins}-${context.league.losses} record.`;
    }
    return `${name}: You're not in a league yet.`;
  }

  if (q.includes("rival")) {
    if (context.topRival) {
      return `${name}: Your biggest rival is ${context.topRival.name} - you're ${context.topRival.wins}-${context.topRival.losses} against them.`;
    }
    return `${name}: You don't have a real rivalry yet - play a few duels first.`;
  }

  if (q.includes("deck")) {
    if (context.activeDeck) {
      return `${name}: Your active deck "${context.activeDeck.name}" has ${context.activeDeck.mainCount} Main and ${context.activeDeck.extraCount} Extra Deck cards.`;
    }
    return `${name}: You don't have an active deck set right now.`;
  }

  if (q.includes("pull") || q.includes("gekregen") || q.includes("pack")) {
    if (context.recentPulls.length > 0) {
      const best = [...context.recentPulls].sort((a, b) => {
        const rank = ["Normal", "Rare", "Super Rare", "Ultra Rare", "Secret Rare", "Legendary"];
        return rank.indexOf(b.rarity ?? "") - rank.indexOf(a.rarity ?? "");
      })[0];
      return `${name}: Your most recent pull was ${best.name}${
        best.rarity ? ` (${best.rarity})` : ""
      }.`;
    }
    return `${name}: No recent pulls on record.`;
  }

  return `${name}: I can't reach my full thoughts right now (no AI connection configured), but I can tell you your league standing, active deck, pending actions, rivalries, or recent pulls if you ask about one of those directly.`;
}

// ---------------------------------------------------------
// PUBLIC ENTRY POINT
// ---------------------------------------------------------

export async function askBossCompanion(
  context: BossContext,
  question: string
): Promise<AskBossResult> {
  const trimmedQuestion =
    question.trim().slice(0, 400);

  const contextText =
    formatBossContext(context);

  const aiAnswer = await callAiProvider(
    context.bossPersonality as BossPersonality,
    contextText,
    trimmedQuestion
  );

  if (aiAnswer) {
    return {
      message: aiAnswer,
      source: "ai",
    };
  }

  return {
    message: localFallback(context, trimmedQuestion),
    source: "fallback",
  };
}

export const QUICK_PROMPTS = [
  "What should I do now?",
  "How is my league going?",
  "Who is my biggest rival?",
  "How's my deck looking?",
  "What did I recently get?",
];
