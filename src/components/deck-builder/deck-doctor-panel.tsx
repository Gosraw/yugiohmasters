"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  ChevronDown,
  LoaderCircle,
  Stethoscope,
} from "lucide-react";

import type {
  DeckDoctorFinding,
  DeckDoctorReport,
} from "@/lib/deck-doctor";

// =========================================================
// DECK DOCTOR (Phase 3)
//
// Deterministic analysis - no AI. Fetched from /decks/<id>/doctor
// only when the player opens this panel, and fetched again when the
// deck changed since (and every queued add/remove has been saved, so
// the report always describes the deck the database has).
// =========================================================

type DoctorResult = {
  report: DeckDoctorReport;
  mechanicsComputed: boolean;
};

const CONFIDENCE_LABEL: Record<
  DeckDoctorFinding["confidence"],
  string
> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

const SEVERITY_STYLE: Record<
  DeckDoctorFinding["severity"],
  string
> = {
  warning: "border-amber-300/20 bg-amber-300/[0.05]",
  notice: "border-cyan-300/15 bg-cyan-300/[0.04]",
  info: "border-emerald-300/15 bg-emerald-300/[0.04]",
};

function FindingRow({
  finding,
}: {
  finding: DeckDoctorFinding;
}) {
  const evidenceEntries =
    Object.entries(
      finding.evidence
    );

  return (
    <div
      className={`rounded-lg border p-3 ${SEVERITY_STYLE[finding.severity]}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold leading-5 text-zinc-200">
          {finding.summary}
        </p>

        <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[9px] font-black uppercase text-zinc-400">
          {CONFIDENCE_LABEL[finding.confidence]}
        </span>
      </div>

      {evidenceEntries.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-zinc-500 transition hover:text-zinc-300">
            Evidence
          </summary>
          <ul className="mt-1.5 space-y-1 border-l border-white/[0.06] pl-3">
            {evidenceEntries.map(
              ([key, value]) => (
                <li
                  key={key}
                  className="text-[11px] text-zinc-400"
                >
                  {key}: {String(value)}
                </li>
              )
            )}
          </ul>
        </details>
      )}
    </div>
  );
}

function FindingGroup({
  title,
  tone,
  findings,
}: {
  title: string;
  tone: string;
  findings: DeckDoctorFinding[];
}) {
  if (findings.length === 0) {
    return null;
  }

  return (
    <div>
      <p
        className={`text-[9px] font-black uppercase tracking-[.16em] ${tone}`}
      >
        {title}
      </p>
      <div className="mt-2 space-y-2">
        {findings.map(
          (finding, index) => (
            <FindingRow
              key={index}
              finding={finding}
            />
          )
        )}
      </div>
    </div>
  );
}

function DoctorReport({
  result,
}: {
  result: DoctorResult;
}) {
  if (!result.mechanicsComputed) {
    return (
      <p className="text-xs leading-5 text-zinc-400">
        This deck hasn&apos;t been analyzed yet - the card mechanics
        engine still needs to run. Check back later for a health check.
      </p>
    );
  }

  const {
    report,
  } = result;

  const attention =
    report.findings.filter(
      (finding) =>
        finding.severity === "warning" ||
        finding.severity === "notice"
    );

  const ownedImprovements =
    report.findings.filter(
      (finding) =>
        finding.type === "OWNED_IMPROVEMENT"
    );

  const otherNotes =
    report.findings.filter(
      (finding) =>
        finding.severity === "info" &&
        finding.type !== "OWNED_IMPROVEMENT"
    );

  const {
    summary,
  } = report;

  const strengths: string[] = [];

  if (summary.starterCount > 0) {
    strengths.push(`${summary.starterCount} starters`);
  }

  if (summary.extenderCount > 0) {
    strengths.push(`${summary.extenderCount} extenders`);
  }

  if (
    summary.gySetupCount > 0 &&
    summary.gyPayoffCount > 0 &&
    !report.findings.some(
      (finding) =>
        finding.type === "GY_PAYOFF_WITHOUT_SETUP" ||
        finding.type === "GY_SETUP_WITHOUT_PAYOFF"
    )
  ) {
    strengths.push("healthy GY setup/payoff relationship");
  }

  if (summary.removalCount > 0) {
    strengths.push(`${summary.removalCount} removal effects`);
  }

  return (
    <div className="space-y-4">
      {strengths.length > 0 && (
        <div>
          <p className="text-[9px] font-black uppercase tracking-[.16em] text-emerald-300/80">
            Strengths
          </p>
          <p className="mt-1.5 text-xs leading-5 text-zinc-300">
            {strengths.join(" · ")}
          </p>
        </div>
      )}

      <FindingGroup
        title="Attention"
        tone="text-amber-300/80"
        findings={attention}
      />

      <FindingGroup
        title="From your collection"
        tone="text-cyan-300/80"
        findings={ownedImprovements}
      />

      <FindingGroup
        title="Other"
        tone="text-zinc-400"
        findings={otherNotes}
      />

      {attention.length === 0 &&
        ownedImprovements.length === 0 &&
        otherNotes.length === 0 && (
          <p className="text-xs text-zinc-400">
            No issues found - this deck looks healthy on the checks
            Deck Doctor can run.
          </p>
        )}

      <p className="text-[10px] text-zinc-500">
        Deterministic analysis - no AI. For cards you don&apos;t own
        yet, see Duelist Insight on the card pages themselves.
      </p>
    </div>
  );
}

export function DeckDoctorPanel({
  deckId,
  deckSignature,
  saving,
}: {
  deckId: string;
  // Changes whenever the deck's contents change.
  deckSignature: string;
  // true while adds/removes are still being saved
  saving: boolean;
}) {
  const [open, setOpen] =
    useState(false);

  const [state, setState] =
    useState<{
      signature: string;
      result: DoctorResult | null;
      error: boolean;
    } | null>(null);

  const upToDate =
    state?.signature ===
    deckSignature;

  useEffect(() => {
    if (
      !open ||
      saving ||
      upToDate
    ) {
      return;
    }

    const controller =
      new AbortController();

    fetch(
      `/decks/${deckId}/doctor`,
      {
        signal:
          controller.signal,
        cache:
          "no-store",
      }
    )
      .then(
        async (response) => {
          if (!response.ok) {
            throw new Error(
              String(
                response.status
              )
            );
          }

          return (await response.json()) as DoctorResult;
        }
      )
      .then(
        (result) =>
          setState({
            signature:
              deckSignature,
            result,
            error: false,
          })
      )
      .catch(
        (error: unknown) => {
          if (
            (error as Error).name ===
            "AbortError"
          ) {
            return;
          }

          setState({
            signature:
              deckSignature,
            result: null,
            error: true,
          });
        }
      );

    return () =>
      controller.abort();
  }, [
    open,
    saving,
    upToDate,
    deckId,
    deckSignature,
  ]);

  const attentionCount =
    state?.result?.mechanicsComputed
      ? state.result.report.findings.filter(
          (finding) =>
            finding.severity === "warning" ||
            finding.severity === "notice"
        ).length
      : 0;

  return (
    <details
      className="panel group/doctor overflow-hidden p-0"
      onToggle={(event) =>
        setOpen(
          event.currentTarget.open
        )
      }
    >
      <summary className="flex min-h-14 cursor-pointer touch-manipulation list-none items-center justify-between gap-3 p-4 select-none sm:p-5">
        <span className="flex items-center gap-2 text-sm font-black text-zinc-100">
          <Stethoscope
            size={16}
            className="text-cyan-300"
          />
          Deck Doctor

          {attentionCount > 0 && (
            <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[9px] font-black uppercase text-amber-200">
              {attentionCount} to check
            </span>
          )}
        </span>

        <ChevronDown
          size={16}
          className="text-zinc-400 transition-transform group-open/doctor:rotate-180"
        />
      </summary>

      <div className="border-t border-white/5 p-4 sm:p-5">
        {state?.result && upToDate ? (
          <DoctorReport
            result={state.result}
          />
        ) : state?.error && upToDate ? (
          <p className="text-xs text-zinc-400">
            Deck Doctor is unavailable right now. Try again in a moment.
          </p>
        ) : (
          <p className="flex items-center gap-2 text-xs text-zinc-400">
            <LoaderCircle
              size={14}
              className="animate-spin"
            />
            {saving
              ? "Saving your last changes first..."
              : "Checking your deck..."}
          </p>
        )}
      </div>
    </details>
  );
}
