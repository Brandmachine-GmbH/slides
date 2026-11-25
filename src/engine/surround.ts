/** The presenter's surround switch: the colour around the slide when the window is not 16:9 and
 *  the slide is letterboxed.
 *
 *  Near-black is right for a dark room and a projector, where the bars should disappear. On a
 *  laptop in a bright office, or on a white deck shown in a browser window, the black bars frame
 *  the slide like a screen inside a screen, and a grey or white surround lets it sit on the page
 *  instead. The right answer depends on where the deck is shown, not on what is in it.
 *
 *  A VIEWER setting, like the colour scheme (see colorScheme.ts): it lives in the browser and
 *  never in deck.ts, and a client opening the link sees black until they press `b`. Only
 *  SlideShow applies it. The PDF, the passcode screen and the admin editor draw their own ground.
 */

export type Surround = "black" | "grey" | "white";

/** In the order the switch steps through them, black first because it is the default. */
export const SURROUNDS: readonly Surround[] = ["black", "grey", "white"];

// Keyed by deck, like the colour scheme and for the same reason: it is about the room a deck is
// shown in, and localStorage is per origin, so a shared key would carry one presenter's choice
// into another client's deck. BASE_URL is "/<slug>/" in a deck build.
const SURROUND_KEY = `bm-deck-surround:${import.meta.env.BASE_URL}`;

/** Black unless this viewer chose otherwise. Anything unrecognised reads as black, so a value
 *  from a future version that drops an option cannot leave the page without a background. */
export function readStoredSurround(): Surround {
  try {
    const v = localStorage.getItem(SURROUND_KEY);
    return v === "grey" || v === "white" ? v : "black";
  } catch { return "black"; }
}

export function storeSurround(v: Surround) {
  // Black removes the key rather than writing a value, so the default state leaves no trace.
  try {
    if (v === "black") localStorage.removeItem(SURROUND_KEY);
    else localStorage.setItem(SURROUND_KEY, v);
  } catch { /* private mode or blocked storage: the switch still works, it just is not remembered */ }
}

/** On the root, because the surround is the page background itself (tokens.css), which is also
 *  what shows through a slide transition. Removed for black so a default page is exactly what it
 *  was before the switch existed. */
export function applySurround(v: Surround) {
  const root = document.documentElement;
  if (v === "black") delete root.dataset.surround;
  else root.dataset.surround = v;
}

export function nextSurround(v: Surround): Surround {
  return SURROUNDS[(SURROUNDS.indexOf(v) + 1) % SURROUNDS.length];
}
