"use server";

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/supabase/queries";

// =========================================================
// CARD / COLLECTION ACTIONS
//
// Same pattern as the rest of src/app/actions: on any failure,
// redirect back with ?error=... rather than throwing, so the
// calling <form> always resolves through a normal navigation.
// =========================================================

function readString(
  formData: FormData,
  key: string
): string {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

export async function setCardForTrade(
  formData: FormData
) {
  const { supabase } = await requireUser();

  const cardInstanceId = readString(
    formData,
    "card_instance_id"
  );

  const forTrade =
    readString(formData, "for_trade") === "true";

  const returnTo = readString(formData, "return_to");

  const fallback = returnTo || "/cards/collection";

  if (!cardInstanceId) {
    redirect(
      `${fallback}${fallback.includes("?") ? "&" : "?"}error=${encodeURIComponent(
        "Missing card."
      )}`
    );
  }

  const { error } = await supabase.rpc("set_card_for_trade", {
    target_card_instance_id: cardInstanceId,
    target_for_trade: forTrade,
  });

  if (error) {
    redirect(
      `${fallback}${fallback.includes("?") ? "&" : "?"}error=${encodeURIComponent(
        error.message
      )}`
    );
  }

  redirect(
    `${fallback}${fallback.includes("?") ? "&" : "?"}success=${encodeURIComponent(
      forTrade
        ? "Card marked as For Trade."
        : "Card removed from your Trade Binder."
    )}`
  );
}
