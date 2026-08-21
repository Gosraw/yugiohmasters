"use client";

import {
  AlertTriangle,
  CheckCircle2,
  X,
} from "lucide-react";

import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";

import {
  Suspense,
  useEffect,
  useState,
} from "react";

// =========================================================
// ACTION FEEDBACK BANNER
//
// Reads ?success=... / ?error=... from the URL (the pattern
// already used by the Shop actions) and shows it as a clear
// banner at the top of the page instead of a plain query
// string. Mounted once in the (app) layout so every action
// across the app gets the same visible confirmation/error
// treatment "for free", without every page needing its own
// success/error block. Auto-clears the query param from the
// URL after a few seconds so refreshing the page doesn't
// re-show a stale message.
// =========================================================

function ActionFeedbackBannerInner() {
  const searchParams =
    useSearchParams();

  const router = useRouter();
  const pathname = usePathname();

  const success =
    searchParams.get(
      "success"
    );

  const error =
    searchParams.get(
      "error"
    );

  // Tracks which exact message the player dismissed, instead
  // of a plain boolean — that way a *new* success/error value
  // shows up again automatically just by not matching the
  // dismissed one, with no effect needed to "reset" anything
  // (avoids the react-hooks/set-state-in-effect pitfall this
  // codebase has hit before).
  const messageKey =
    error
      ? `error:${error}`
      : success
        ? `success:${success}`
        : null;

  const [
    dismissedKey,
    setDismissedKey,
  ] = useState<
    string | null
  >(null);

  const dismissed =
    messageKey !== null &&
    messageKey ===
      dismissedKey;

  useEffect(() => {
    if (!success && !error) {
      return;
    }

    const timer =
      setTimeout(() => {
        const next =
          new URLSearchParams(
            searchParams.toString()
          );

        next.delete("success");
        next.delete("error");

        const query =
          next.toString();

        router.replace(
          query
            ? `${pathname}?${query}`
            : pathname,
          {
            scroll: false,
          }
        );
      }, 5000);

    return () =>
      clearTimeout(timer);
  }, [
    success,
    error,
    pathname,
    router,
    searchParams,
  ]);

  if (
    (!success && !error) ||
    dismissed
  ) {
    return null;
  }

  const isError = Boolean(
    error
  );

  return (
    <div
      role="status"
      className={`mx-auto mb-4 flex max-w-[1500px] items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-md ${
        isError
          ? "border-red-400/30 bg-red-400/10 text-red-200"
          : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
      }`}
    >
      {isError ? (
        <AlertTriangle
          size={18}
          className="mt-0.5 shrink-0"
        />
      ) : (
        <CheckCircle2
          size={18}
          className="mt-0.5 shrink-0"
        />
      )}

      <p className="flex-1 text-sm font-bold leading-6">
        {error || success}
      </p>

      <button
        type="button"
        onClick={() =>
          setDismissedKey(
            messageKey
          )
        }
        aria-label="Dismiss"
        className="shrink-0 rounded-lg p-1 opacity-70 transition hover:opacity-100"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export function ActionFeedbackBanner() {
  return (
    <Suspense fallback={null}>
      <div className="px-4 pt-4 sm:px-6 lg:px-8">
        <ActionFeedbackBannerInner />
      </div>
    </Suspense>
  );
}
