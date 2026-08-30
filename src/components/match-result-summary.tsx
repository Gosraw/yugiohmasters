import {
  Crown,
  Package,
  Sparkles,
  Trophy,
} from "lucide-react";

import type {
  MatchSettlementSummary,
} from "@/lib/match-settlement-summary";

// =========================================================
// MATCH RESULT SUMMARY
//
// The one reusable "what just happened" panel for a submitted
// match result. Everything it renders comes straight from
// MatchSettlementSummary, which is itself read back from the
// database AFTER the settlement RPCs already ran - this component
// never computes or invents a reward, it only displays what the
// backend already granted (or renders nothing for a section that
// didn't happen this call, e.g. no round-reward block when the
// round isn't complete yet).
//
// Three tiers, shown together when they all apply to the same
// submission:
//   1. MATCH COMPLETE - always shown - score + per-player match DP.
//   2. ROUND COMPLETE - only when this result was the one that
//      finished the round AND round rewards were actually granted.
//   3. COMPETITION COMPLETE - only when this result auto-finalized
//      the competition AND placement rewards were actually granted.
// =========================================================

const VOUCHER_LABEL: Record<string, string> = {
  normal_pack: "Standard Pack",
  premium_pack: "Premium Pack",
  deluxe_pack: "Deluxe Pack",
  special_pack: "Special Pack",
};

function voucherLabel(voucherType: string) {
  return VOUCHER_LABEL[voucherType] ?? voucherType;
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

type PlayerRewardTotal = {
  profileId: string;
  profileName: string;
  duelPoints: number;
  vouchers: { voucherType: string; voucherQuantity: number }[];
};

function combineByProfile(
  rewards: {
    profileId: string;
    profileName: string;
    duelPoints: number;
    voucherType: string | null;
    voucherQuantity: number;
  }[]
): PlayerRewardTotal[] {
  const byProfile = new Map<string, PlayerRewardTotal>();

  for (const reward of rewards) {
    const existing = byProfile.get(reward.profileId) ?? {
      profileId: reward.profileId,
      profileName: reward.profileName,
      duelPoints: 0,
      vouchers: [],
    };

    existing.duelPoints += reward.duelPoints;

    if (reward.voucherType && reward.voucherQuantity > 0) {
      existing.vouchers.push({
        voucherType: reward.voucherType,
        voucherQuantity: reward.voucherQuantity,
      });
    }

    byProfile.set(reward.profileId, existing);
  }

  return Array.from(byProfile.values());
}

export function MatchResultSummary({
  summary,
}: {
  summary: MatchSettlementSummary;
}) {
  const {
    playerOneName,
    playerTwoName,
    playerOneWins,
    playerTwoWins,
    winnerId,
    playerOneId,
    matchDp,
    roundNumber,
    roundMatchesCompleted,
    roundMatchesTotal,
    roundJustCompleted,
    roundRewards,
    competitionJustCompleted,
    competitionRewards,
    championName,
  } = summary;

  const roundRewardTotals = combineByProfile(
    roundRewards.map((r) => ({
      profileId: r.profileId,
      profileName: r.profileName,
      duelPoints: r.duelPoints,
      voucherType: r.voucherType,
      voucherQuantity: r.voucherQuantity,
    }))
  );

  const competitionRewardTotals = combineByProfile(competitionRewards);

  return (
    <div className="mt-3 space-y-2.5 rounded-xl border border-emerald-300/25 bg-emerald-300/[0.04] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
          Match Complete
        </span>

        {roundNumber !== null && (
          <span className="text-[10px] font-bold text-zinc-500">
            Round {roundNumber}: {roundMatchesCompleted}/{roundMatchesTotal}{" "}
            done
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 text-sm font-black">
        <span
          className={
            winnerId === playerOneId ? "text-emerald-200" : "text-zinc-400"
          }
        >
          {playerOneName}
        </span>
        <span className="font-mono text-zinc-300">
          {playerOneWins} – {playerTwoWins}
        </span>
        <span
          className={
            winnerId && winnerId !== playerOneId
              ? "text-emerald-200"
              : "text-zinc-400"
          }
        >
          {playerTwoName}
        </span>
      </div>

      {matchDp.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {matchDp.map((award) => (
            <span
              key={award.profileId}
              className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-bold text-zinc-300"
            >
              {award.profileName}{" "}
              <span className="text-amber-300">+{award.amount} DP</span>
            </span>
          ))}
        </div>
      )}

      {roundJustCompleted && roundRewardTotals.length > 0 && (
        <div className="rounded-lg border border-amber-300/25 bg-amber-300/[0.06] p-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-300">
            <Sparkles size={12} />
            Round {roundNumber} Complete
          </div>

          <ul className="mt-1.5 space-y-1">
            {roundRewardTotals.map((total) => (
              <li
                key={total.profileId}
                className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-300"
              >
                <span className="font-bold">{total.profileName}</span>
                {total.duelPoints > 0 && (
                  <span className="text-amber-200">
                    +{total.duelPoints} DP
                  </span>
                )}
                {total.vouchers.map((v, i) => (
                  <span
                    key={`${v.voucherType}-${i}`}
                    className="inline-flex items-center gap-1 text-zinc-400"
                  >
                    <Package size={11} />+{v.voucherQuantity}{" "}
                    {voucherLabel(v.voucherType)}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {competitionJustCompleted && (
        <div className="rounded-lg border border-purple-300/30 bg-purple-300/[0.06] p-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-purple-300">
            <Trophy size={12} />
            Competition Complete
          </div>

          {championName && (
            <div className="mt-1 flex items-center gap-1.5 text-sm font-black text-purple-200">
              <Crown size={14} />
              Champion: {championName}
            </div>
          )}

          {competitionRewardTotals.length > 0 && (
            <ul className="mt-1.5 space-y-1">
              {competitionRewardTotals
                .sort((a, b) => a.profileId.localeCompare(b.profileId))
                .map((total) => {
                  const placement = competitionRewards.find(
                    (r) => r.profileId === total.profileId
                  )?.placement;

                  return (
                    <li
                      key={total.profileId}
                      className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-300"
                    >
                      <span className="font-bold">
                        {placement ? `${ordinal(placement)} · ` : ""}
                        {total.profileName}
                      </span>
                      {total.duelPoints > 0 && (
                        <span className="text-amber-200">
                          +{total.duelPoints} DP
                        </span>
                      )}
                      {total.vouchers.map((v, i) => (
                        <span
                          key={`${v.voucherType}-${i}`}
                          className="inline-flex items-center gap-1 text-zinc-400"
                        >
                          <Package size={11} />+{v.voucherQuantity}{" "}
                          {voucherLabel(v.voucherType)}
                        </span>
                      ))}
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
