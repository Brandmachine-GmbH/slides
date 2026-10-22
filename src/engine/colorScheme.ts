import { useSyncExternalStore } from "react";

/** The presenter's light/dark switch, and the one place that knows how it is stored and applied.
 *
 *  What the switch MEANS is "the other ground" (see ground.ts): dark on a light slide, light on a
 *  slide in a dark-first theme. So what is stored is whether this viewer has flipped, and the
 *  scheme applied is worked out per slide from that.
 *
 *  It is a VIEWER setting, not a deck setting, and that split is deliberate. A theme (`theme` on
 *  a deck or a slide) is decided when the deck is written; this is decided in the room, by
 *  whoever is presenting, because the right answer depends on the room (a dark conference hall, a
 *  bright client office) and not on the deck. So it lives in the browser and not in deck.ts, and
 *  nothing about it can change what a client who opens the link sees until they press it.
 *
 *  Only SlideShow applies the presenter's choice. The PDF (ExportView) and the admin editor's
 *  thumbnails draw every slide on its own theme's ground, so the leave-behind is the deck as
 *  written unless an export asks for one ground on purpose (`slides pdf --scheme`). */

export type ColorScheme = "light" | "dark";

// Keyed by deck for the same reason AUTH_KEY in App.tsx is: localStorage is per origin and every
// deck lives on one origin, so a shared key would carry one presenter's choice into another
// client's deck. BASE_URL is "/<slug>/" in a deck build.
const SCHEME_KEY = `bm-deck-scheme:${import.meta.env.BASE_URL}`;

/** Whether this viewer has flipped this deck to its other ground. Not flipped when nothing is
 *  stored, and deliberately NOT prefers-color-scheme: a presenter whose laptop happens to be in
 *  dark mode must get the deck exactly as it was sent until they ask for otherwise.
 *
 *  The switch now writes "flip". A "dark" stored by 0.2 and earlier is honoured only on a deck
 *  whose base is light, where it meant the same thing. On a dark-first deck it is ignored: there
 *  it only ever darkened the nav around slides that were already black, and reading it as a flip
 *  would open a live black deck white, passcode screen included, with nobody having pressed
 *  anything since. `base` is the deck's own ground (ground.ts baseGround of the deck's theme). */
export function readStoredFlip(base: ColorScheme): boolean {
  try {
    const v = localStorage.getItem(SCHEME_KEY);
    return v === "flip" || (v === "dark" && base === "light");
  } catch { return false; }
}

export function storeFlip(flipped: boolean) {
  // Not flipped removes the key rather than writing a value, so the default state leaves no trace.
  try {
    if (flipped) localStorage.setItem(SCHEME_KEY, "flip");
    else localStorage.removeItem(SCHEME_KEY);
  } catch { /* private mode or blocked storage: the switch still works, it just is not remembered */ }
}

/** The ground of the slide on screen, on the root, for what surrounds the slide: the nav and the
 *  Contents panel follow it, and so does useColorScheme. The slide's own ground element carries
 *  the same value (SlideShow), which is what the slide itself is drawn from. Removed outright for
 *  light rather than set to "light", so a light deck's root is exactly what it was before. */
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
 *  Falls back to the literal the drawing used before tokens, which is also what a slide whose
 *  theme does not define the token (the engine's own look has no --mist in light) should get. */
export function cssToken(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}
