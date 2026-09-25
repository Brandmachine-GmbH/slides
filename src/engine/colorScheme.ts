import { useSyncExternalStore } from "react";

/** The presenter's light/dark switch, and the one place that knows how it is stored and applied.
 *
 *  It is a VIEWER setting, not a deck setting, and that split is deliberate. `Deck.theme` is the
 *  deck's register and is decided when the deck is written; this is decided in the room, by
 *  whoever is presenting, because the right answer depends on the room (a dark conference hall, a
 *  bright client office) and not on the deck. So it lives in the browser and not in deck.ts, and
 *  nothing about it can change what a client who opens the link sees until they press it.
 *
 *  Only SlideShow applies it. The PDF (ExportView) and the admin editor's thumbnails never set the
 *  attribute, so they cannot come out dark, which is the guarantee the leave-behind depends on. */

export type ColorScheme = "light" | "dark";

// Keyed by deck for the same reason AUTH_KEY in App.tsx is: localStorage is per origin and every
// deck lives on one origin, so a shared key would carry one presenter's choice into another
// client's deck. BASE_URL is "/<slug>/" in a deck build.
const SCHEME_KEY = `bm-deck-scheme:${import.meta.env.BASE_URL}`;

/** What this viewer last chose for this deck. Light when nothing is stored, and deliberately NOT
 *  prefers-color-scheme: a presenter whose laptop happens to be in dark mode must get the deck
 *  exactly as it was sent until they ask for otherwise. */
export function readStoredScheme(): ColorScheme {
  try { return localStorage.getItem(SCHEME_KEY) === "dark" ? "dark" : "light"; } catch { return "light"; }
}

export function storeScheme(scheme: ColorScheme) {
  // Light removes the key rather than writing "light", so the default state leaves no trace.
  try {
    if (scheme === "dark") localStorage.setItem(SCHEME_KEY, "dark");
    else localStorage.removeItem(SCHEME_KEY);
  } catch { /* private mode or blocked storage: the switch still works, it just is not remembered */ }
}

/** On the root, like the deck theme (see theme.ts), because the stage ground and the tokens are
 *  read by ancestors of everything a slide renders. Removed outright for light rather than set to
 *  "light", so a light deck's root is exactly what it was before this existed. */
export function applyColorScheme(scheme: ColorScheme) {
  const root = document.documentElement;
  if (scheme === "dark") root.dataset.colorScheme = "dark";
  else delete root.dataset.colorScheme;
}

function currentScheme(): ColorScheme {
  return document.documentElement.dataset.colorScheme === "dark" ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-color-scheme"] });
  return () => mo.disconnect();
}

/** The scheme on screen, re-rendering when it flips. For a scene that draws on <canvas>: a canvas
 *  keeps the pixels it was given, so unlike CSS it does not repaint itself when the tokens change,
 *  and a scene has to redraw on this. Watches the attribute rather than taking a prop, so a scene
 *  needs no wiring and the editor, which never sets it, simply always reads light. */
export function useColorScheme(): ColorScheme {
  return useSyncExternalStore(subscribe, currentScheme, () => "light");
}

/** A token's resolved value, for drawing code that cannot use var(). Read from the element being
 *  drawn into rather than from the root, so a token overridden further down the tree still wins.
 *  Falls back to the literal the drawing used before tokens, which is also what a register that
 *  does not define the token (the classic one has no --mist) should get. */
export function cssToken(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}
