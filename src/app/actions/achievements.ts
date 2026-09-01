"use server";

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/supabase/queries";

// =========================================================
// PAY-TO-WIN v1 ACTIONS (P1C)
//
// Same shape as src/app/actions/wishlist.ts: on any failure,
// redirect back with ?error=... rather than throwing, so every
// calling <form> always resolves through a normal navigation.
// All the actual rules (weekly/one-time cap, "not yourself",
// idempotent approve/reject, THE CREATOR eligibility) live in
// the three RPCs from 202609012400_p2w_achievements.sql - these
// actions are thin wrappers that just forward the FormData and
// surface whatever message the database sends back.
// =========================================================

function readString(
  formData: FormData,
  key: string
): string {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function redirectWith(
  fallback: string,
  kind: "error" | "success",
  message: string
): never {
  redirect(
    `${fallback}${fallback.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(
      message
    )}`
  );
}

export async function requestAchievementClaim(
  formData: FormData
) {
  const { supabase } = await requireUser();

  const achievementKey = readString(
    formData,
    "achievement_key"
  );

  const returnTo = readString(formData, "return_to");

  const fallback = returnTo || "/perks";

  if (!achievementKey) {
    redirectWith(
      fallback,
      "error",
      "Missing achievement."
    );
  }

  const { error } = await supabase.rpc(
    "request_achievement_claim",
    {
      target_achievement_key: achievementKey,
    }
  );

  if (error) {
    redirectWith(
      fallback,
      "error",
      error.message
    );
  }

  redirectWith(
    fallback,
    "success",
    "Claim submitted - waiting on another duelist to approve it."
  );
}

export async function approveAchievementClaim(
  formData: FormData
) {
  const { supabase } = await requireUser();

  const claimId = readString(formData, "claim_id");

  const returnTo = readString(formData, "return_to");

  const fallback = returnTo || "/perks";

  if (!claimId) {
    redirectWith(
      fallback,
      "error",
      "Missing claim."
    );
  }

  const { error } = await supabase.rpc(
    "approve_achievement_claim",
    {
      target_claim_id: claimId,
    }
  );

  if (error) {
    redirectWith(
      fallback,
      "error",
      error.message
    );
  }

  redirectWith(
    fallback,
    "success",
    "Claim approved - Duel Points credited."
  );
}

export async function rejectAchievementClaim(
  formData: FormData
) {
  const { supabase } = await requireUser();

  const claimId = readString(formData, "claim_id");

  const returnTo = readString(formData, "return_to");

  const fallback = returnTo || "/perks";

  if (!claimId) {
    redirectWith(
      fallback,
      "error",
      "Missing claim."
    );
  }

  const { error } = await supabase.rpc(
    "reject_achievement_claim",
    {
      target_claim_id: claimId,
    }
  );

  if (error) {
    redirectWith(
      fallback,
      "error",
      error.message
    );
  }

  redirectWith(
    fallback,
    "success",
    "Claim rejected."
  );
}
