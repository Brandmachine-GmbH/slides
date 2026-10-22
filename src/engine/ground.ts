import { DARK_FIRST } from "@site-themes";
import type { ColorScheme } from "./colorScheme";

/** Which ground a slide is drawn on, light or dark, and the one place that decides it.
 *
 *  Every theme has a ground of its own: light, unless its base rule declares `color-scheme: dark`
 *  (see darkFirstThemes in vite.config.ts), and the engine's own look is light. The presenter's
 *  switch (`d`) does not mean "dark": it means THE OTHER GROUND. On a light slide that is dark, as
 *  it always was; on a slide in a dark-first theme it is that theme's light variant. A switch
 *  that meant "dark" would do nothing on a deck that is already black, which is exactly what a
 *  presenter in a bright room needed it for.
 *
 *  The result goes on the slide's own ground element as `data-color-scheme`, beside
 *  `data-deck-theme` (tokens.css, THEMES), so a mixed deck turns each slide to its own other
 *  ground, the PDF can print every page on its own, and a theme's variant is written as
 *  [data-deck-theme="x"][data-color-scheme="light"|"dark"] on that one element. */

/** The ground a theme is designed on, before the presenter's switch. */
export function baseGround(theme?: string): ColorScheme {
  return theme !== undefined && DARK_FIRST.includes(theme) ? "dark" : "light";
}

/** The ground actually drawn: the base, or the other one when the presenter has flipped. */
export function groundOf(base: ColorScheme, flipped: boolean): ColorScheme {
  return flipped ? (base === "dark" ? "light" : "dark") : base;
}
