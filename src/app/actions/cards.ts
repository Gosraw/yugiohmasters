"use server";

import { redirect } from "next/navigation";

import { safeReturnTo, withFeedback } from "@/lib/safe-return-to";
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

  const fallback = safeReturnTo(returnTo, "/cards/collection");

  if (!cardInstanceId) {
    redirect(
      withFeedback(
        fallback,
        "error",
        "Missing card."
      )
    );
  }

  const { error } = await supabase.rpc("set_card_for_trade", {
    target_card_instance_id: cardInstanceId,
    target_for_trade: forTrade,
  });

  if (error) {
    redirect(
      withFeedback(
        fallback,
        "error",
        error.message
      )
    );
  }

  redirect(
    withFeedback(
      fallback,
      "success",
      forTrade
        ? "Card marked as For Trade."
        : "Card removed from your Trade Binder."
    )
  );
}
