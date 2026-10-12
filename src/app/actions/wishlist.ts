"use server";

import { redirect } from "next/navigation";

import { safeReturnTo, withFeedback } from "@/lib/safe-return-to";
import { requireUser } from "@/lib/supabase/queries";

// =========================================================
// WISHLIST ACTIONS (P0E)
//
// Same shape as src/app/actions/cards.ts's setCardForTrade: on
// any failure, redirect back with ?error=... rather than
// throwing, so the calling <form> always resolves through a
// normal navigation.
// =========================================================

function readString(
  formData: FormData,
  key: string
): string {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

export async function toggleWishlist(
  formData: FormData
) {
  const { supabase } = await requireUser();

  const cardCatalogId = readString(
    formData,
    "card_catalog_id"
  );

  const returnTo = readString(formData, "return_to");

  const fallback = safeReturnTo(returnTo, "/cards");

  if (!cardCatalogId) {
    redirect(
      withFeedback(
        fallback,
        "error",
        "Missing card."
      )
    );
  }

  const {
    data: nowWished,
    error,
  } = await supabase.rpc("toggle_card_wishlist", {
    target_card_catalog_id: cardCatalogId,
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
      nowWished
        ? "Added to your Wishlist."
        : "Removed from your Wishlist."
    )
  );
}
