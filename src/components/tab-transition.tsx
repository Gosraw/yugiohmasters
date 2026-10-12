"use client";

import {
  ViewTransition,
} from "react";

import type {
  ReactNode,
} from "react";

// =========================================================
// TAB TRANSITION (2.0)
//
// A soft cross-fade + small rise when switching bottom-nav
// sections. Progressive enhancement through React's
// <ViewTransition>: only navigations tagged "nav-tab" (the
// bottom-nav links pass transitionTypes) animate. Everything
// else - form actions, ?success clean-ups, background refreshes
// and the browser back/forward swipe (no transition type) -
// resolves to "none" and swaps instantly. Browsers without the
// View Transitions API just navigate as before. CSS lives in
// globals.css (::view-transition-*(.dc-tab)).
// =========================================================

export function TabTransition({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ViewTransition
      default="none"
      update={{
        "nav-tab": "dc-tab",
        default: "none",
      }}
    >
      <div>
        {children}
      </div>
    </ViewTransition>
  );
}
