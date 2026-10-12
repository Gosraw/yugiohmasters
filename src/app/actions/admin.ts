"use server";

import {
  revalidatePath,
} from "next/cache";

import {
  redirect,
} from "next/navigation";

import {
  withFeedback,
} from "@/lib/safe-return-to";

import {
  requireUser,
} from "@/lib/supabase/queries";

// =========================================================
// ADMIN CONFIG
//
// Saves one value of the REAL config tables (league economy,
// Boss prices, weekly goals, season bonuses, mini game rewards,
// perk cap) through admin_set_config_value() - see
// 202610121630_admin_config_editor.sql. The database checks that
// the caller is a league admin, which keys exist, and each
// table's own value limits.
// =========================================================

export async function updateConfigValue(
  formData: FormData
) {
  const {
    supabase,
  } = await requireUser();

  const key =
    String(
      formData.get(
        "key"
      ) ?? ""
    ).trim();

  const raw =
    String(
      formData.get(
        "value"
      ) ?? ""
    ).trim();

  const nullable =
    formData.get(
      "nullable"
    ) === "1";

  if (
    !key ||
    key.length > 120
  ) {
    redirect(
      withFeedback(
        "/admin",
        "error",
        "Unknown setting."
      )
    );
  }

  let value: number | null =
    null;

  if (raw === "") {
    if (!nullable) {
      redirect(
        withFeedback(
          "/admin",
          "error",
          "Enter a number."
        )
      );
    }
  } else {
    value =
      Number(raw);

    if (
      !Number.isInteger(
        value
      ) ||
      value < 0 ||
      value > 1_000_000
    ) {
      redirect(
        withFeedback(
          "/admin",
          "error",
          "Enter a whole number of 0 or more."
        )
      );
    }
  }

  const {
    error,
  } = await supabase.rpc(
    "admin_set_config_value",
    {
      p_key: key,
      p_value: value,
    }
  );

  if (error) {
    redirect(
      withFeedback(
        "/admin",
        "error",
        error.message.includes("check constraint")
          ? "That value is not allowed for this setting."
          : error.message
      )
    );
  }

  revalidatePath("/admin");

  redirect(
    withFeedback(
      "/admin",
      "success",
      "Setting saved."
    )
  );
}
