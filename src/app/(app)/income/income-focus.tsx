"use client";

import { createContext, useContext, useMemo, useState } from "react";

import type { IsoMonth } from "@/lib/dates";

/**
 * Which month the page should be showing, when something outside the list has
 * just changed it.
 *
 * The Record income button lives in the header and the list lives below it, so
 * "open the month this record landed in and scroll to it" has to cross between
 * two sibling trees. A context rather than lifting the accordion's whole state
 * up: expansion is the most-pressed thing on this page and belongs next to the
 * rows it expands, and only this one nudge comes from elsewhere.
 *
 * The nonce is what makes recording two records into the same month scroll
 * twice. Without it the second request is indistinguishable from the first and
 * nothing moves.
 */

interface Focus {
  readonly month: IsoMonth;
  readonly nonce: number;
}

const FocusContext = createContext<{
  focus: Focus | null;
  focusMonth: (month: IsoMonth) => void;
} | null>(null);

export function IncomeFocusProvider({ children }: { children: React.ReactNode }) {
  const [focus, setFocus] = useState<Focus | null>(null);

  const value = useMemo(
    () => ({
      focus,
      focusMonth: (month: IsoMonth) =>
        setFocus((previous) => ({ month, nonce: (previous?.nonce ?? 0) + 1 })),
    }),
    [focus],
  );

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

export function useIncomeFocus() {
  const value = useContext(FocusContext);
  if (!value) throw new Error("useIncomeFocus used outside IncomeFocusProvider");
  return value;
}
