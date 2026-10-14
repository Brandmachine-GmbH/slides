import { createContext } from "react";

/** The presenter's steps switch: whether a staged slide plays its beats one press at a time, or
 *  arrives with every beat already shown.
 *
 *  It exists for rehearsing versus browsing. Practising a deck, the beats are the point. Jumping
 *  around one you are not performing, they are a surprise on every slide: a press you meant as
 *  "next slide" reveals one box instead, and the deck stutters. Off, Space and a click move a
 *  whole slide like the arrows do, and BuildTrack draws no dots.
 *
 *  Only the beats. A slide's own entrance animation still plays, and a mockup still plays its
 *  demo chapter by chapter: a live demo has no "everything at once" state to show instead, so it
 *  does not use useBuildStages and is not affected.
 *
 *  A VIEWER setting, like the colour scheme (see colorScheme.ts), so it lives in the browser and
 *  never in deck.ts, and a client opening the link gets the beats until they press `s`.
 */

// NOT keyed by deck, unlike the colour scheme. The scheme is about the room a deck is shown in,
// so one deck's choice must not leak into another client's. This is about the presenter's mode
// of work ("I am browsing today"), which is the same across every deck they open, and having to
// switch it off again per deck is exactly the friction it is meant to remove.
const STEPS_KEY = "bm-deck-steps";

/** On unless this viewer turned it off. */
export function readStoredSteps(): boolean {
  try { return localStorage.getItem(STEPS_KEY) !== "off"; } catch { return true; }
}

export function storeSteps(on: boolean) {
  // On removes the key rather than writing "on", so the default state leaves no trace.
  try {
    if (on) localStorage.removeItem(STEPS_KEY);
    else localStorage.setItem(STEPS_KEY, "off");
  } catch { /* private mode or blocked storage: the switch still works, it just is not remembered */ }
}

/** Read by useBuildStages. True outside a SlideShow, which only matters for the PDF and the
 *  editor's contact sheet, and those show every beat anyway because they pass no controllerRef. */
export const StepsCtx = createContext(true);
