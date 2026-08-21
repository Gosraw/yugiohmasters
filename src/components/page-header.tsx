import {
  ReactNode,
} from "react";

// =========================================================
// PAGE HEADER
//
// Shared hero-style header for top-level pages: eyebrow label,
// title, optional description and a right-side action slot.
// Keeps page tops visually consistent across the app.
// =========================================================

type PageHeaderProps = {
  eyebrow?: string;

  title: string;

  description?: string;

  icon?: ReactNode;

  action?: ReactNode;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  icon,
  action,
}: PageHeaderProps) {
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-amber-300/15 bg-gradient-to-br from-white/[0.04] via-black/40 to-violet-500/[0.05] p-6 sm:p-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-amber-400/[0.06] blur-[110px]" />
      </div>

      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          {eyebrow && (
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/[0.07] px-3 py-1.5 text-[9px] font-black uppercase tracking-[.2em] text-amber-200">
              {icon}
              {eyebrow}
            </div>
          )}

          <h1
            className={`gold-text text-3xl font-black sm:text-4xl ${eyebrow ? "mt-4" : ""}`}
          >
            {title}
          </h1>

          {description && (
            <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">
              {description}
            </p>
          )}
        </div>

        {action && (
          <div className="flex shrink-0 items-center gap-3">
            {action}
          </div>
        )}
      </div>
    </section>
  );
}
