// One add-meal popup for the whole app, and the handle that opens it.
//
// The popup used to be Today's own state, which was fine while Today's header
// was the only thing that opened it. It isn't any more: mobile web's bottom bar
// carries the ＋ in its center (`app-tabs.web.tsx`) and native carries it as a
// FAB, both of which live *above* the tab content and cannot reach into a
// screen's state. Rather than mounting a second copy of the sheet in the shell
// — two popups that could both be open, seeded differently — the sheet is
// mounted once here, above the tabs, and everything that wants it calls
// `useAddMeal().open()`.
//
// `open(section)` is the whole API. The per-section add tiles on Today pass
// their section so the picker lands on it; the ＋ passes nothing and the picker
// falls back to the time-of-day guess.
import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react';

import { AddMealSheet } from '@/components/add-meal-sheet';
import type { Section } from '@/data/types';

type AddMealContextValue = {
  /** Open the popup, optionally pre-set to a section. */
  open: (section?: Section) => void;
};

const AddMealContext = createContext<AddMealContextValue | null>(null);

export function AddMealProvider({ children }: { children: ReactNode }) {
  // `null` is closed. A non-null value is one open session, carrying the
  // section it was opened for (`undefined` = "let the clock decide").
  const [session, setSession] = useState<{ section?: Section } | null>(null);

  const open = useCallback((section?: Section) => setSession({ section }), []);
  const value = useMemo(() => ({ open }), [open]);

  return (
    <AddMealContext value={value}>
      {children}
      {/* Mounted only while open, so "which section" is resolved at the moment
          the popup appears. Kept mounted, it seeded its picker once from the
          clock at app start and then never moved — open the app at breakfast
          and every meal you logged all day defaulted to breakfast. */}
      {session ? (
        <AddMealSheet
          visible
          initialSection={session.section}
          onRequestClose={() => setSession(null)}
        />
      ) : null}
    </AddMealContext>
  );
}

export function useAddMeal(): AddMealContextValue {
  const value = use(AddMealContext);
  if (!value) throw new Error('useAddMeal must be used inside <AddMealProvider>');
  return value;
}
