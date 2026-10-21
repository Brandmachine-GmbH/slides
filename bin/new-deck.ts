/* What this deck is for, who it is for, and what it deliberately does not say. Comments here are
 * stripped from the bundle, so this is the place for the reasoning behind a deck.
 *
 * Shape and every optional field: node_modules/@brandmachine/slides/src/engine/types.ts.
 */
import type { Deck } from "@brandmachine/slides";

// `satisfies` rather than `const deck: Deck`, so a mistake is reported on the slide that has it
// and each slide keeps its own literal type. Every slide says what it is with `type`; type
// `type: "` in an editor to see them all.
const deck = {
  // What the client types to open it. Matching ignores case, spaces and punctuation.
  passcodes: ["__NAME__"],

  // The deck, in order. A title, a table of contents and an end slide are slides like any
  // other: place them where you want them, or leave them out.
  slides: [
    { type: "title", eyebrow: "__NAME__", headingHtml: "One idea,<br/>on two lines.", sub: "A subtitle." },
    { type: "toc", eyebrow: "Overview", heading: "What we'll cover." },
    {
      type: "section",
      id: "one",
      title: "First section",
      tagline: "A short line under the chapter heading.",
      slides: [
        { type: "plan", eyebrow: "Label", headline: "A claim, not a topic.",
          steps: [{ tag: "Step 1", title: "The first thing" }, { tag: "Step 2", title: "The second" }] },
      ],
    },
    { type: "end" },
  ],
} satisfies Deck;

export default deck;
