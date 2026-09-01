"use server";

import { redirect } from "next/navigation";

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

  const fallback = returnTo || "/cards";

  if (!cardCatalogId) {
    redirect(
      `${fallback}${fallback.includes("?") ? "&" : "?"}error=${encodeURIComponent(
        "Missing card."
      )}`
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
      `${fallback}${fallback.includes("?") ? "&" : "?"}error=${encodeURIComponent(
        error.message
      )}`
    );
  }

  redirect(
    `${fallback}${fallback.includes("?") ? "&" : "?"}success=${encodeURIComponent(
      nowWished
        ? "Added to your Wishlist."
        : "Removed from your Wishlist."
    )}`
  );
}
