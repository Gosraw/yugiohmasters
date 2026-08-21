import {
  ReactNode,
} from "react";

// =========================================================
// EMPTY STATE
//
// Shared "nothing here yet" panel with an icon, message and
// optional call-to-action, so empty screens feel intentional
// instead of broken/bare.
// =========================================================

type EmptyStateProps = {
  icon: ReactNode;

  title: string;

  description?: string;

  action?: ReactNode;
};

export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="panel flex flex-col items-center gap-3 border-dashed p-8 text-center sm:p-10">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-zinc-500">
        {icon}
      </div>

      <p className="text-base font-black text-zinc-200">
        {title}
      </p>

      {description && (
        <p className="max-w-sm text-sm leading-6 text-zinc-500">
          {description}
        </p>
      )}

      {action && (
        <div className="mt-2">
          {action}
        </div>
      )}
    </div>
  );
}
