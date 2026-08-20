"use server";

import {
  revalidatePath,
} from "next/cache";

import {
  redirect,
} from "next/navigation";

import {
  requireUser,
} from "@/lib/supabase/queries";

// =========================================================
// HELPERS
// =========================================================

function safeMessage(
  value:
    | string
    | undefined
) {
  return encodeURIComponent(
    value ??
      "Something went wrong."
  );
}

// =========================================================
// BUY ROTATION CARD
// =========================================================

export async function purchaseRotationCard(
  formData: FormData
) {
  const rotationCardId =
    String(
      formData.get(
        "rotation_card_id"
      ) ?? ""
    ).trim();

  if (!rotationCardId) {
    redirect(
      `/shop?error=${safeMessage(
        "Shop card ontbreekt."
      )}`
    );
  }

  const {
    supabase,
  } = await requireUser();

  const {
    error,
  } = await supabase.rpc(
    "purchase_shop_rotation_card",
    {
      target_rotation_card_id:
        rotationCardId,
    }
  );

  if (error) {
    redirect(
      `/shop?error=${safeMessage(
        error.message
      )}`
    );
  }

  revalidatePath("/");
  revalidatePath("/shop");
  revalidatePath(
    "/cards/collection"
  );
  revalidatePath(
    "/achievements"
  );

  redirect(
    `/shop?success=${safeMessage(
      "Kaart gekocht en toegevoegd aan je Collection."
    )}`
  );
}

// =========================================================
// BUY PACK WITH DP
// =========================================================

export async function purchasePack(
  formData: FormData
) {
  const packCode =
    String(
      formData.get(
        "pack_code"
      ) ?? ""
    ).trim();

  if (
    ![
      "normal",
      "premium",
      "deluxe",
      "special",
    ].includes(
      packCode
    )
  ) {
    redirect(
      `/shop?error=${safeMessage(
        "Ongeldig pack."
      )}`
    );
  }

  const {
    supabase,
  } = await requireUser();

  const {
    data:
      openingId,

    error,
  } = await supabase.rpc(
    "purchase_shop_pack",
    {
      target_pack_code:
        packCode,

      target_voucher_id:
        null,
    }
  );

  if (
    error ||
    !openingId
  ) {
    redirect(
      `/shop?error=${safeMessage(
        error?.message ??
          "Pack kon niet worden geopend."
      )}`
    );
  }

  revalidatePath("/");
  revalidatePath("/shop");
  revalidatePath(
    "/cards/collection"
  );
  revalidatePath(
    "/profile"
  );
  revalidatePath(
    "/achievements"
  );

  redirect(
    `/shop/opening/${openingId}`
  );
}

// =========================================================
// REDEEM PACK VOUCHER
// =========================================================

export async function redeemPackVoucher(
  formData: FormData
) {
  const packCode =
    String(
      formData.get(
        "pack_code"
      ) ?? ""
    ).trim();

  const voucherId =
    String(
      formData.get(
        "voucher_id"
      ) ?? ""
    ).trim();

  if (
    !voucherId ||
    ![
      "normal",
      "premium",
      "deluxe",
      "special",
    ].includes(
      packCode
    )
  ) {
    redirect(
      `/shop?error=${safeMessage(
        "Voucher is ongeldig."
      )}`
    );
  }

  const {
    supabase,
  } = await requireUser();

  const {
    data:
      openingId,

    error,
  } = await supabase.rpc(
    "purchase_shop_pack",
    {
      target_pack_code:
        packCode,

      target_voucher_id:
        voucherId,
    }
  );

  if (
    error ||
    !openingId
  ) {
    redirect(
      `/shop?error=${safeMessage(
        error?.message ??
          "Voucher kon niet worden gebruikt."
      )}`
    );
  }

  revalidatePath("/");
  revalidatePath("/shop");
  revalidatePath(
    "/cards/collection"
  );
  revalidatePath(
    "/profile"
  );
  revalidatePath(
    "/achievements"
  );

  redirect(
    `/shop/opening/${openingId}`
  );
}