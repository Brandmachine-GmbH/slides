import type { Deck } from "./types";

/** Puts the deck's visual register on the root element, where tokens.css picks it up.
 *
 *  On the root rather than on a wrapper div because the slide ground is painted by the stage's
 *  ::before (SlideShow) and by the print page (export.css), both ancestors of anything a slide
 *  renders, and a token they read has to be set above them. Its own module so the admin editor,
 *  which renders one deck per page, can apply it without pulling in the slideshow. */
export function applyDeckTheme(deck: Deck) {
  const root = document.documentElement;
  if (deck.theme) root.dataset.deckTheme = deck.theme;
  else delete root.dataset.deckTheme;
}
