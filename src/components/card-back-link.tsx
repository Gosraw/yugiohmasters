"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  House,
} from "lucide-react";

type CardBackLinkProps = {
  returnTo?: string;
};

export function CardBackLink({
  returnTo,
}: CardBackLinkProps) {
  const router = useRouter();

  function handleBack() {
    if (
      returnTo &&
      returnTo.startsWith("/") &&
      !returnTo.startsWith("//")
    ) {
      router.push(returnTo);
      return;
    }

    if (
      typeof window !== "undefined" &&
      window.history.length > 1
    ) {
      router.back();
      return;
    }

    router.push("/cards/collection");
  }

  return (
    <nav className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={handleBack}
        className="
          inline-flex cursor-pointer items-center gap-2
          rounded-xl border border-amber-300/20
          bg-amber-300/5 px-3 py-2
          text-sm font-bold text-amber-300
          transition-all duration-150
          hover:-translate-x-0.5
          hover:border-amber-300/40
          hover:bg-amber-300/10
          hover:text-amber-200
          active:scale-95
        "
      >
        <ArrowLeft size={17} />
        Back
      </button>

      <Link
        href="/"
        className="
          inline-flex cursor-pointer items-center gap-2
          rounded-xl border border-white/10
          bg-white/[0.025] px-3 py-2
          text-sm font-bold text-zinc-400
          transition-all duration-150
          hover:-translate-y-0.5
          hover:border-white/20
          hover:bg-white/[0.06]
          hover:text-zinc-100
          active:scale-95
        "
      >
        <House size={16} />
        Home
      </Link>
    </nav>
  );
}