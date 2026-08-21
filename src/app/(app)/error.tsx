"use client";

import Link from "next/link";

import {
  Home,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";

import {
  useEffect,
} from "react";

// =========================================================
// APP-WIDE ERROR BOUNDARY
//
// Catches any error thrown while rendering a page or running
// a Server Action under (app) — including the "throw new
// Error(...)" validation failures used throughout the action
// files — and shows a readable message with a way back in,
// instead of Next's generic crash screen.
// =========================================================

export default function AppError({
  error,
  reset,
}: {
  error: Error & {
    digest?: string;
  };

  reset: () => void;
}) {
  useEffect(() => {
    console.error(
      error
    );
  }, [error]);

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="panel w-full max-w-md p-6 text-center sm:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-red-400/25 bg-red-400/10">
          <ShieldAlert
            size={24}
            className="text-red-300"
          />
        </div>

        <h1 className="mt-5 text-xl font-black text-zinc-100">
          Something went wrong
        </h1>

        <p className="mt-2 text-sm leading-6 text-zinc-500">
          {error.message ||
            "That action couldn't be completed. Nothing was lost — you can try again."}
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() =>
              reset()
            }
            className="primary-button inline-flex items-center gap-2"
          >
            <RotateCcw
              size={15}
            />
            Try again
          </button>

          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-black text-zinc-300 transition hover:border-amber-300/20 hover:text-amber-200"
          >
            <Home
              size={15}
            />
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
