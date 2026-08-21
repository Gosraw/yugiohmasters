import Link from "next/link";

import {
  Compass,
  Home,
} from "lucide-react";

// =========================================================
// 404
// =========================================================

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-amber-400/[0.06] blur-[150px]" />

        <div className="absolute -right-40 top-20 h-[480px] w-[480px] rounded-full bg-violet-500/[0.06] blur-[150px]" />
      </div>

      <div className="panel relative w-full max-w-md p-6 text-center sm:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-amber-300/20 bg-amber-300/[0.06]">
          <Compass
            size={24}
            className="text-amber-300"
          />
        </div>

        <p className="mt-5 text-xs font-black tracking-[.3em] text-amber-300">
          404
        </p>

        <h1 className="mt-1 text-xl font-black text-zinc-100">
          Nothing here
        </h1>

        <p className="mt-2 text-sm leading-6 text-zinc-500">
          This card isn&apos;t in anyone&apos;s deck. The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>

        <Link
          href="/"
          className="primary-button mt-6 inline-flex items-center gap-2"
        >
          <Home
            size={15}
          />
          Back to Home
        </Link>
      </div>
    </main>
  );
}
