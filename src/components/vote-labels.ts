// =========================================================
// CARD VOTE - shared labels
//
// Mirrors public.card_vote_resolve() / get_vote_results() in
// supabase/migrations/202610121900_card_votes_live.sql: "too
// strong" is always one step stricter, "too weak" one step
// looser. On a forbidden card "too weak" is "Allow it", and that
// vote also picks the rarity the card gets if it is allowed.
// =========================================================

export type VoteValue =
  | "agree"
  | "too_strong"
  | "too_weak";

export const RARITY_LADDER = [
  "Normal",
  "Rare",
  "Super Rare",
  "Ultra Rare",
  "Secret Rare",
  "Legendary",
] as const;

export type Rarity =
  (typeof RARITY_LADDER)[number];

// One player's vote on one card.
export type MyVote = {
  vote: VoteValue;
  allowRarity: Rarity | null;
};

export function isRarity(
  value: unknown
): value is Rarity {
  return (
    typeof value === "string" &&
    (RARITY_LADDER as readonly string[]).includes(value)
  );
}

export function verdictLabel(
  verdict: string
): string {
  if (verdict === "forbidden") return "Forbidden";
  if (verdict === "limited_1") return "Max 1 per deck";
  if (verdict === "unlimited") return "3 per deck";
  if (verdict === "allowed") return "Allowed";

  return verdict;
}

export function resolveVerdict(
  verdict: string,
  vote: VoteValue,
  allowRarity: string | null = null
): string {
  if (vote === "agree") return verdict;

  if (verdict === "forbidden") {
    return vote === "too_weak"
      ? allowRarity ?? "allowed"
      : "forbidden";
  }

  if (verdict === "limited_1") {
    return vote === "too_strong"
      ? "forbidden"
      : "unlimited";
  }

  if (verdict === "Legendary") {
    return vote === "too_strong"
      ? "forbidden"
      : "Secret Rare";
  }

  const index = RARITY_LADDER.indexOf(
    verdict as Rarity
  );

  if (index < 0) return verdict;

  const next =
    vote === "too_strong"
      ? Math.min(index + 1, RARITY_LADDER.length - 1)
      : Math.max(index - 1, 0);

  return RARITY_LADDER[next];
}

export function voteOptions(
  verdict: string
): VoteValue[] {
  return verdict === "forbidden"
    ? ["agree", "too_weak"]
    : ["agree", "too_strong", "too_weak"];
}

export function voteButtonLabel(
  verdict: string,
  vote: VoteValue
): {
  title: string;
  hint: string;
} {
  if (verdict === "forbidden") {
    return vote === "agree"
      ? {
          title: "Keep it out",
          hint: "Agree: this card stays forbidden",
        }
      : {
          title: "Allow it",
          hint: "Let it into the pool, then pick its rarity",
        };
  }

  const result = verdictLabel(
    resolveVerdict(verdict, vote)
  );

  if (vote === "agree") {
    return {
      title: "Agree",
      hint: `Keep it at ${verdictLabel(verdict)}`,
    };
  }

  if (vote === "too_strong") {
    return {
      title: "Too strong",
      hint: result === "Forbidden"
        ? "Ban it"
        : `Make it ${result}`,
    };
  }

  return {
    title: "Too weak",
    hint: `Make it ${result}`,
  };
}

// Short label for a vote, worded for the card's proposal
// ("Allow it" instead of "Too weak" on a forbidden card).
export function voteShortLabel(
  vote: VoteValue | null | undefined,
  verdict?: string,
  allowRarity?: string | null
): string {
  if (verdict === "forbidden") {
    if (vote === "agree") return "Keep it out";
    if (vote === "too_weak") {
      return allowRarity
        ? `Allow: ${allowRarity}`
        : "Allow it";
    }
  }

  if (vote === "agree") return "Agree";
  if (vote === "too_strong") return "Too strong";
  if (vote === "too_weak") return "Too weak";

  return "Not voted";
}

// Tailwind classes for a verdict / rarity badge.
export function verdictBadgeClass(
  verdict: string
): string {
  switch (verdict) {
    case "Legendary":
      return "border-amber-300/60 bg-amber-300/15 text-amber-100";
    case "Secret Rare":
      return "border-fuchsia-300/50 bg-fuchsia-400/10 text-fuchsia-100";
    case "Ultra Rare":
      return "border-sky-300/50 bg-sky-400/10 text-sky-100";
    case "Super Rare":
      return "border-emerald-300/45 bg-emerald-400/10 text-emerald-100";
    case "forbidden":
      return "border-red-400/55 bg-red-500/15 text-red-100";
    case "limited_1":
      return "border-orange-300/50 bg-orange-400/10 text-orange-100";
    default:
      return "border-zinc-400/30 bg-white/[0.04] text-zinc-200";
  }
}
