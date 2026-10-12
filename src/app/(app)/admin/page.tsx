import Link from "next/link";
import { ShieldAlert, Settings2 } from "lucide-react";
import { updateConfigValue } from "@/app/actions/admin";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

// The REAL config tables (2026-10-12): every value below is what the
// database actually uses. Saved one at a time through
// admin_set_config_value() (202610121630_admin_config_editor.sql).
// Voucher types / categories are shown read-only.

type Field = {
  key: string;
  label: string;
  hint?: string;
  value: number | null;
  nullable?: boolean;
  suffix?: string;
};

type Section = {
  title: string;
  description: string;
  fields: Field[];
  notes?: string[];
};

type Row = Record<string, unknown>;

function num(row: Row | null | undefined, column: string): number | null {
  const value = row?.[column];
  return typeof value === "number" ? value : null;
}

function voucherLabel(value: unknown, quantity?: unknown): string {
  if (typeof value !== "string" || !value) return "no voucher";
  const name = value.replace("_pack", "").replace(/^\w/, (c) => c.toUpperCase());
  return `${typeof quantity === "number" ? `${quantity}x ` : ""}${name} Pack voucher`;
}

export default async function AdminPage() {
  const { supabase, userId } = await requireUser();
  const { data: membership } = await supabase
    .from("league_members")
    .select("league_id,role")
    .eq("profile_id", userId)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <EmptyState
          icon={<ShieldAlert size={28} className="text-amber-300" />}
          title="Admins only"
          description="League settings can only be changed by the league admin. Ask them if a number looks wrong."
          action={<Link href="/" className="primary-button px-4 py-2 text-sm">Back to Home</Link>}
        />
      </main>
    );
  }

  const [economyRes, stagesRes, weeklyRes, bonusRes, miniRes, perkRes] = await Promise.all([
    supabase.from("league_economy_defaults").select("*").limit(1).maybeSingle(),
    supabase.from("boss_route_stages").select("stage_number,dp_cost_to_reach").gt("stage_number", 1),
    supabase.from("weekly_goal_config").select("*").limit(1).maybeSingle(),
    supabase.from("season_bonus_config").select("*").limit(1).maybeSingle(),
    supabase.from("mini_game_reward_config").select("game,period,place,dp,voucher_pack_code").order("game").order("period").order("place"),
    supabase.from("perk_config").select("weekly_dp_cap").limit(1).maybeSingle(),
  ]);

  const economy = economyRes.data as Row | null;
  const weekly = weeklyRes.data as Row | null;
  const bonus = bonusRes.data as Row | null;
  const perk = perkRes.data as Row | null;
  const stages = (stagesRes.data ?? []) as { stage_number: number; dp_cost_to_reach: number | null }[];
  const miniRewards = (miniRes.data ?? []) as { game: string; period: string; place: number; dp: number; voucher_pack_code: string | null }[];

  // A stage price is the same on every route; show "mixed" if not.
  function stagePrice(stage: number): { value: number | null; mixed: boolean } {
    const prices = [...new Set(stages.filter((row) => row.stage_number === stage).map((row) => row.dp_cost_to_reach))];
    return { value: prices[0] ?? null, mixed: prices.length > 1 };
  }

  const stageFields: Field[] = [2, 3, 4].map((stage) => {
    const price = stagePrice(stage);
    return {
      key: `boss.stage_${stage}_dp`,
      label: `Evolve to Stage ${stage}`,
      hint: price.mixed ? "Routes have different prices now - saving sets this price for every route." : "Same price on every Boss Route.",
      value: price.value,
      suffix: "DP",
    };
  });

  const gameName = (game: string) => (game === "auto_battler" ? "Shadow Arena" : game === "pyramid_climb" ? "Pyramid Climb" : game);

  const sections: Section[] = [
    {
      title: "Duels & rounds",
      description: "DP paid out by competition matches and round finishes.",
      fields: [
        { key: "economy.match_win_dp", label: "Match win", value: num(economy, "match_win_dp"), suffix: "DP" },
        { key: "economy.match_draw_dp", label: "Match draw", value: num(economy, "match_draw_dp"), suffix: "DP" },
        { key: "economy.match_loss_dp", label: "Match loss", value: num(economy, "match_loss_dp"), suffix: "DP" },
        { key: "economy.round_participation_dp", label: "Round participation", value: num(economy, "round_participation_dp"), suffix: "DP" },
        { key: "economy.round_first_dp", label: "Round 1st place", value: num(economy, "round_first_dp"), suffix: "DP" },
        { key: "economy.round_second_dp", label: "Round 2nd place", value: num(economy, "round_second_dp"), suffix: "DP" },
        { key: "economy.round_third_dp", label: "Round 3rd place", value: num(economy, "round_third_dp"), suffix: "DP" },
      ],
      notes: [
        `Round participation also gives: ${voucherLabel(economy?.round_participation_voucher_type, economy?.round_participation_voucher_quantity)}.`,
        `Round winner also gets: ${voucherLabel(economy?.round_first_voucher_type, economy?.round_first_voucher_quantity)}.`,
      ],
    },
    {
      title: "Boss Routes",
      description: "What it costs to unlock extra Boss Route slots and to evolve.",
      fields: [
        { key: "economy.boss_route_slot_2_unlock_dp", label: "Unlock slot 2", value: num(economy, "boss_route_slot_2_unlock_dp"), suffix: "DP" },
        { key: "economy.boss_route_slot_3_unlock_dp", label: "Unlock slot 3", value: num(economy, "boss_route_slot_3_unlock_dp"), suffix: "DP" },
        ...stageFields,
      ],
    },
    {
      title: "Weekly goals & season bonuses",
      description: "Weekly goal reward and the bounty / catch-up bonuses.",
      fields: [
        { key: "weekly_goal.goal_dp", label: "Each weekly goal", value: num(weekly, "goal_dp"), suffix: "DP" },
        { key: "season_bonus.bounty_dp", label: "Bounty for beating #1", value: num(bonus, "bounty_dp"), suffix: "DP", hint: bonus?.bounty_enabled === false ? "Bounty is switched off." : undefined },
        { key: "season_bonus.catch_up_dp", label: "Catch-up bonus", value: num(bonus, "catch_up_dp"), suffix: "DP", hint: bonus?.catch_up_enabled === false ? "Catch-up is switched off." : undefined },
        { key: "season_bonus.catch_up_min_win_gap", label: "Catch-up starts at a gap of", value: num(bonus, "catch_up_min_win_gap"), suffix: "wins" },
      ],
      notes: [
        `All weekly goals done: ${voucherLabel(weekly?.all_done_voucher_type, weekly?.all_done_voucher_quantity)}.`,
        `Weekly goal categories: ${Array.isArray(weekly?.categories) ? (weekly.categories as string[]).join(", ") : "-"}.`,
      ],
    },
    {
      title: "Mini games",
      description: "Leaderboard rewards per game.",
      fields: miniRewards.map((row) => ({
        key: `mini_game.${row.game}.${row.period}.${row.place}`,
        label: `${gameName(row.game)} - ${row.period === "day" ? "daily" : "weekly"} #${row.place}`,
        hint: row.voucher_pack_code ? `Plus ${voucherLabel(row.voucher_pack_code)}.` : undefined,
        value: row.dp,
        suffix: "DP",
      })),
    },
    {
      title: "Perks",
      description: "Real-life achievement (perk) DP.",
      fields: [
        { key: "perk.weekly_dp_cap", label: "Weekly perk DP cap", hint: "Leave empty for no cap.", value: num(perk, "weekly_dp_cap"), nullable: true, suffix: "DP" },
      ],
    },
  ];

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <PageHeader
        eyebrow="Admin mode"
        title="League settings"
        description="The numbers the game really uses. Changes apply right away for everyone."
        icon={<Settings2 size={22} className="text-amber-300" />}
      />

      <div className="mt-6 space-y-6">
        {sections.map((section) => (
          <section key={section.title} className="panel p-4 sm:p-5">
            <h2 className="text-lg font-black text-white">{section.title}</h2>
            <p className="mt-1 text-sm text-zinc-400">{section.description}</p>

            {section.fields.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">Nothing configured yet.</p>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {section.fields.map((field) => (
                  <form key={field.key} action={updateConfigValue} className="rounded-2xl border border-white/10 bg-black/30 p-3">
                    <input type="hidden" name="key" value={field.key} />
                    {field.nullable && <input type="hidden" name="nullable" value="1" />}
                    <label htmlFor={field.key} className="text-sm font-bold text-zinc-200">{field.label}</label>
                    {field.hint && <p className="mt-0.5 text-xs text-zinc-500">{field.hint}</p>}
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        id={field.key}
                        name="value"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        required={!field.nullable}
                        defaultValue={field.value ?? ""}
                        className="field w-full font-mono text-sm"
                      />
                      {field.suffix && <span className="text-xs font-bold text-zinc-500">{field.suffix}</span>}
                      <SubmitButton pendingLabel="Saving..." className="primary-button shrink-0 px-3 py-2 text-sm">Save</SubmitButton>
                    </div>
                  </form>
                ))}
              </div>
            )}

            {section.notes && (
              <ul className="mt-3 space-y-1 text-xs text-zinc-500">
                {section.notes.map((note) => <li key={note}>{note}</li>)}
              </ul>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
