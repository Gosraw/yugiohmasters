import type {
  requireUser,
} from "@/lib/supabase/queries";

type SupabaseClient =
  Awaited<
    ReturnType<typeof requireUser>
  >["supabase"];

// =========================================================
// BOSS PATH PRICES (2.0: DP only, prices are configuration)
//
// Migration 202610120130 moved every Boss price into the database:
//   * evolving INTO a stage: boss_route_stages.dp_cost_to_reach
//   * unlocking route slot 2 / 3: league_economy_defaults
//     .boss_route_slot_2_unlock_dp / .boss_route_slot_3_unlock_dp
// evolve_boss_stage / unlock_second_third_boss_path charge exactly
// these numbers, so the pages read them from the same place instead
// of hardcoding copies that drift.
// =========================================================

export type BossSlot =
  | 1
  | 2
  | 3;

/** null = free (slot 1) or not configured. */
export type BossSlotPrices =
  Record<
    BossSlot,
    number | null
  >;

export async function getBossSlotPrices(
  supabase: SupabaseClient
): Promise<BossSlotPrices> {
  const {
    data,
    error,
  } = await supabase
    .from("league_economy_defaults")
    .select(
      "boss_route_slot_2_unlock_dp,boss_route_slot_3_unlock_dp"
    )
    .eq(
      "id",
      true
    )
    .maybeSingle();

  if (error) {
    throw new Error(
      error.message
    );
  }

  const row = data as {
    boss_route_slot_2_unlock_dp: number | null;
    boss_route_slot_3_unlock_dp: number | null;
  } | null;

  return {
    1: null,
    2: row?.boss_route_slot_2_unlock_dp ?? null,
    3: row?.boss_route_slot_3_unlock_dp ?? null,
  };
}

export type RouteStagePrice = {
  route_id: string;
  stage_number: number;
  dp_cost_to_reach: number | null;
};

/**
 * Evolution prices per route: stage number -> DP to evolve into it
 * (stage 1 is the free starting stage, so it has no price).
 */
export async function getRouteStagePrices(
  supabase: SupabaseClient,
  routeIds: string[]
): Promise<Map<string, Map<number, number>>> {
  const prices =
    new Map<
      string,
      Map<number, number>
    >();

  if (routeIds.length === 0) {
    return prices;
  }

  const {
    data,
    error,
  } = await supabase
    .from("boss_route_stages")
    .select(
      "route_id,stage_number,dp_cost_to_reach"
    )
    .in(
      "route_id",
      routeIds
    );

  if (error) {
    throw new Error(
      error.message
    );
  }

  for (const row of (data ?? []) as RouteStagePrice[]) {
    if (row.dp_cost_to_reach == null) {
      continue;
    }

    const routePrices =
      prices.get(row.route_id) ??
      new Map<number, number>();

    routePrices.set(
      row.stage_number,
      row.dp_cost_to_reach
    );

    prices.set(
      row.route_id,
      routePrices
    );
  }

  return prices;
}

/** DP still needed to go from `currentStage` to stage 4. */
export function dpToMaster(
  stagePrices: Map<number, number> | undefined,
  currentStage: number
) {
  let total = 0;

  for (let stage = currentStage + 1; stage <= 4; stage += 1) {
    total += stagePrices?.get(stage) ?? 0;
  }

  return total;
}
