import {
  CheckCircle2,
  Hourglass,
  Scale,
  Undo2,
  XCircle,
} from "lucide-react";

import {
  acceptMatchResultProposal,
  rejectMatchResultProposal,
  withdrawMatchResultProposal,
} from "@/app/actions/matches";

import {
  ConfirmSubmitButton,
} from "@/components/confirm-submit-button";

import {
  SubmitButton,
} from "@/components/submit-button";

import {
  describeProposal,
  proposalKindLabel,
  type OpenProposal,
} from "@/lib/match-proposals";

// =========================================================
// RESULT PROPOSALS PANEL (202610152010)
//
// A league admin who plays in a duel only PROPOSES a correction /
// tiebreak result / dispute decision. This panel shows the open
// proposals on the round screen, the competition page and the duel
// page:
//   - the opponent: what would change + Accept / Reject
//   - the admin who proposed it: "waiting for ..." + Withdraw
//   - everyone else: who is waiting on whom
// All checks live in the database; the buttons only call the RPCs.
// =========================================================

type MatchProposalPanelProps = {
  proposals: OpenProposal[];
  currentUserId: string;
  nameOf: (profileId: string) => string;
  // Where the actions send the player back to (this page).
  returnTo: string;
  className?: string;
};

export function MatchProposalPanel({
  proposals,
  currentUserId,
  nameOf,
  returnTo,
  className,
}: MatchProposalPanelProps) {
  if (proposals.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Result changes waiting for an answer"
      data-testid="match-proposals"
      className={`space-y-3 ${className ?? ""}`}
    >
      {proposals.map(
        (proposal) => {
          const proposer =
            nameOf(
              proposal.proposed_by
            );

          const opponent =
            nameOf(
              proposal.respond_by
            );

          const change =
            describeProposal(
              proposal,
              nameOf
            );

          const duel =
            proposal.match
              ? `${nameOf(
                  proposal.match.player_one_id
                )} vs ${nameOf(
                  proposal.match.player_two_id
                )}`
              : "this duel";

          const mine =
            proposal.respond_by ===
            currentUserId;

          const sentByMe =
            proposal.proposed_by ===
            currentUserId;

          return (
            <div
              key={proposal.id}
              data-testid="match-proposal"
              className="arena-frame panel relative overflow-hidden border-amber-300/35 p-4"
            >
              <p className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[.2em] text-amber-300">
                <Scale
                  size={12}
                />
                {proposalKindLabel(
                  proposal.kind
                )}{" "}
                · {duel}
              </p>

              <p className="mt-2 text-base font-black leading-snug text-zinc-100">
                {mine
                  ? `${proposer} wants to change your duel: ${change}.`
                  : sentByMe
                    ? `You proposed: ${change}.`
                    : `${proposer} proposed: ${change}.`}
              </p>

              {proposal.reason && (
                <p className="mt-1 text-xs leading-5 text-zinc-400">
                  Reason: {proposal.reason}
                </p>
              )}

              <p className="mt-1 text-xs leading-5 text-zinc-500">
                {mine
                  ? `${proposer} plays in this duel, so it only counts if you accept it.`
                  : `Waiting for ${opponent} to accept it. Nothing changes until then.`}
              </p>

              {mine && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <form
                    action={
                      acceptMatchResultProposal
                    }
                  >
                    <input
                      type="hidden"
                      name="proposal_id"
                      value={
                        proposal.id
                      }
                    />

                    <input
                      type="hidden"
                      name="return_to"
                      value={
                        returnTo
                      }
                    />

                    <SubmitButton
                      pendingLabel="Accepting..."
                      className="primary-button inline-flex min-h-12 w-full items-center justify-center gap-2 text-sm"
                    >
                      <CheckCircle2
                        size={16}
                      />
                      Accept
                    </SubmitButton>
                  </form>

                  <form
                    action={
                      rejectMatchResultProposal
                    }
                  >
                    <input
                      type="hidden"
                      name="proposal_id"
                      value={
                        proposal.id
                      }
                    />

                    <input
                      type="hidden"
                      name="return_to"
                      value={
                        returnTo
                      }
                    />

                    <ConfirmSubmitButton
                      confirmMessage={`Reject ${proposer}'s proposal? The result stays as it is.`}
                      pendingLabel="Rejecting..."
                      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-red-400/25 bg-red-400/[0.06] px-4 text-sm font-black text-red-200 transition hover:border-red-400/45"
                    >
                      <XCircle
                        size={16}
                      />
                      Reject
                    </ConfirmSubmitButton>
                  </form>
                </div>
              )}

              {sentByMe && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-200/80">
                    <Hourglass
                      size={13}
                    />
                    Waiting for {opponent}
                  </span>

                  <form
                    action={
                      withdrawMatchResultProposal
                    }
                  >
                    <input
                      type="hidden"
                      name="proposal_id"
                      value={
                        proposal.id
                      }
                    />

                    <input
                      type="hidden"
                      name="return_to"
                      value={
                        returnTo
                      }
                    />

                    <ConfirmSubmitButton
                      confirmMessage="Withdraw this proposal?"
                      pendingLabel="Withdrawing..."
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-black text-zinc-400 transition hover:text-zinc-200"
                    >
                      <Undo2
                        size={13}
                      />
                      Withdraw
                    </ConfirmSubmitButton>
                  </form>
                </div>
              )}
            </div>
          );
        }
      )}
    </section>
  );
}
