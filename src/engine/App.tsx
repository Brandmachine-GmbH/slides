import { useState } from "react";
import type { Deck } from "./types";
import { Gate } from "./Gate";
import { SlideShow } from "./SlideShow";
import { ExportView } from "./ExportView";
import { applyDeckTheme } from "./theme";

// Keyed by deck, because localStorage is per-ORIGIN and every deck on a site is served from
// that one origin. One shared key meant that a client who had ever opened any deck
// walked straight past the gate on every other deck's URL. The unguessable slug is what actually
// keeps a deck private, so this was never a way in, but a facade that silently stops existing is
// worse than no facade: you would demo the gate to one client and it would not be there for the
// next. BASE_URL is "/<slug>/" in a deck build.
const AUTH_KEY = `bm-deck-auth:${import.meta.env.BASE_URL}`;

export function App({ deck }: { deck: Deck }) {
  applyDeckTheme(deck);
  // Export/PDF builds render the whole deck as stacked print pages, no gate. __EXPORT__ is
  // replaced at build time (vite.config.ts define); it is false for every live deck build.
  if (__EXPORT__) return <ExportView deck={deck} />;

  const [authed, setAuthed] = useState(() => {
    try { return localStorage.getItem(AUTH_KEY) === "1"; } catch { return false; }
  });

  if (!authed) {
    return (
      <Gate
        passcodes={deck.passcodes}
        onUnlock={() => {
          try { localStorage.setItem(AUTH_KEY, "1"); } catch { /* ignore */ }
          setAuthed(true);
        }}
      />
    );
  }
  return <SlideShow deck={deck} />;
}
