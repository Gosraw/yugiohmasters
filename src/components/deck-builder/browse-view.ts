// =========================================================
// BROWSE VIEW (grid / list)
//
// "grid" = card pictures only (the old look). "list" = a smaller
// picture with the name, type line and effect text next to it in
// normal, readable type. The choice is a per-device convenience, kept
// in localStorage (wrapped in try/catch: private mode can throw);
// read through useSyncExternalStore so the server render and the
// first browser render both start as "grid".
// =========================================================

export type BrowseView =
  | "grid"
  | "list";

const STORAGE_KEY =
  "dc-deck-browse-view";

const listeners =
  new Set<() => void>();

let current: BrowseView | null =
  null;

export function getBrowseView(): BrowseView {
  if (current === null) {
    try {
      current =
        window.localStorage.getItem(
          STORAGE_KEY
        ) === "list"
          ? "list"
          : "grid";
    } catch {
      current =
        "grid";
    }
  }

  return current;
}

export function getServerBrowseView(): BrowseView {
  return "grid";
}

export function subscribeBrowseView(
  listener: () => void
) {
  listeners.add(
    listener
  );

  return () => {
    listeners.delete(
      listener
    );
  };
}

export function setBrowseView(
  next: BrowseView
) {
  current =
    next;

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      next
    );
  } catch {
    // Still switches for this visit.
  }

  listeners.forEach(
    (listener) =>
      listener()
  );
}
