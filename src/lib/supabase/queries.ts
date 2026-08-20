import { redirect } from "next/navigation";

import {
  createClient,
} from "./server";

export async function requireUser() {
  const supabase =
    await createClient();

  const {
    data,
    error,
  } =
    await supabase.auth.getClaims();

  const sub =
    data?.claims?.sub;

  if (
    error ||
    !sub
  ) {
    redirect(
      "/login"
    );
  }

  return {
    supabase,
    userId: sub,
  };
}

export async function getCurrentProfile() {
  const {
    supabase,
    userId,
  } = await requireUser();

  const {
    data,
    error,
  } = await supabase
    .from("profiles")
   .select(
  `
    id,
    username,
    duelist_name,
    avatar_url,
    custom_title,
    catchphrase,
    bio,
    favorite_play_style,
    favorite_card_type,
    favorite_attribute,
    favorite_monster_type,
    boss_monster_option_id,
    accent_theme,
    signature_quote,
    profile_banner_url,
    boss_personality,
    duel_points
  `
)
    .eq(
      "id",
      userId
    )
    .single();

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data;
}