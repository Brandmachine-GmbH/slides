/* What this deck is for, who it is for, and what it deliberately does not say. Comments here are
 * stripped from the bundle, so this is the place for the reasoning behind a deck.
 *
 * Shape and every optional field: node_modules/@brandmachine/slides/src/engine/types.ts.
 */
import type { Deck } from "@brandmachine/slides";

const deck: Deck = {
  // What the client types to open it. Matching ignores case, spaces and punctuation.
  passcodes: ["__NAME__"],

  title: { eyebrow: "__NAME__", headingHtml: "One idea,<br/>on two lines.", sub: "A subtitle." },
  agenda: { eyebrow: "Overview", heading: "What we'll cover." },

  sections: [
    {
      id: "one",
      title: "First section",
      tagline: "A short line under the chapter heading.",
      slides: [
        { plan: true, eyebrow: "Label", headline: "A claim, not a topic.",
          steps: [{ tag: "Step 1", title: "The first thing" }, { tag: "Step 2", title: "The second" }] },
      ],
    },
  ],
};

export default deck;
