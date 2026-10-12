"use server";

import {
  redirect,
} from "next/navigation";

import {
  requireUser,
} from "@/lib/supabase/queries";

// =========================================================
// CARD VOTE ACTIONS (2.0 card pool vote)
//
// castCardVote is called straight from the /vote client
// component (no redirect), so tapping through 400 cards never
// reloads the page. Permission checks live in the database:
// cast_card_vote() is SECURITY INVOKER, so the card_votes RLS
// policies decide (own vote only, own league only).
//
// setVoteTiebreak is a normal <form> action for the league
// admin on /vote/results, redirecting with ?success= / ?error=.
// =========================================================

const VOTES = [
  "agree",
  "too_strong",
  "too_weak",
] as const;

type Vote =
  (typeof VOTES)[number];

function isVote(
  value: unknown
): value is Vote {
  return (
    typeof value === "string" &&
    (VOTES as readonly string[]).includes(value)
  );
}

export async function castCardVote(
  itemId: string,
  vote: string
): Promise<
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    }
> {
  if (!itemId || !isVote(vote)) {
    return {
      ok: false,
      error: "Unknown vote.",
    };
  }

  const {
    supabase,
  } = await requireUser();

  const {
    error,
  } = await supabase.rpc(
    "cast_card_vote",
    {
      target_item_id: itemId,
      vote_value: vote,
    }
  );

  if (error) {
    return {
      ok: false,
      error: error.message,
    };
  }

  return {
    ok: true,
  };
}

function readString(
  formData: FormData,
  key: string
): string {
  const value =
    formData.get(key);

  return typeof value === "string"
    ? value.trim()
    : "";
}

export async function setVoteTiebreak(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const itemId =
    readString(
      formData,
      "item_id"
    );

  const vote =
    readString(
      formData,
      "vote"
    );

  const returnTo =
    readString(
      formData,
      "return_to"
    ) || "/vote/results";

  const join =
    returnTo.includes("?")
      ? "&"
      : "?";

  if (!itemId || (vote !== "clear" && !isVote(vote))) {
    redirect(
      `${returnTo}${join}error=${encodeURIComponent(
        "Unknown tie-break."
      )}`
    );
  }

  const {
    error,
  } = await supabase.rpc(
    "set_vote_tiebreak",
    {
      target_item_id: itemId,
      vote_value:
        vote === "clear"
          ? null
          : vote,
    }
  );

  if (error) {
    redirect(
      `${returnTo}${join}error=${encodeURIComponent(
        error.message
      )}`
    );
  }

  redirect(
    `${returnTo}${join}success=${encodeURIComponent(
      vote === "clear"
        ? "Tie-break cleared."
        : "Tie-break saved."
    )}`
  );
}
