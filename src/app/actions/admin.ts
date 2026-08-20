"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/queries";

async function requireAdmin() {
  const { supabase, userId } = await requireUser();
  const { data } = await supabase
    .from("league_members")
    .select("role")
    .eq("profile_id", userId)
    .eq("role", "admin")
    .limit(1);

  if (!data?.length) throw new Error("Unauthorized");
  return { supabase, userId };
}

export async function updateSetting(formData: FormData) {
  const parsed = z.object({
    key: z.string().min(1).max(120),
    value: z.string().min(1).max(1000),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const { supabase, userId } = await requireAdmin();
  let jsonValue: unknown;
  try { jsonValue = JSON.parse(parsed.data.value); } catch { return; }

  const { data: membership } = await supabase
    .from("league_members")
    .select("league_id")
    .eq("profile_id", userId)
    .eq("role", "admin")
    .limit(1)
    .single();

  if (!membership) return;
  await supabase.from("settings").upsert({
    league_id: membership.league_id,
    key: parsed.data.key,
    value: jsonValue,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "league_id,key" });

  revalidatePath("/admin");
}
