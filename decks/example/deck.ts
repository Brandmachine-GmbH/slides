/* The deck that ships with the engine.
 *
 * It is about the engine itself, which keeps it honest: there is no invented client to write
 * plausible-sounding copy for, and every claim on a slide is checkable against the code next to
 * it. It is also the build's fixture. It uses one of every slide kind that needs no photography,
 * so a change that quietly breaks a kind fails here before it reaches anybody's deck.
 *
 * Comments like this one are safe. The build minifies deck.ts into the bundle, which strips
 * them, and that is why the reasoning behind a deck belongs here rather than in a separate file
 * somebody has to remember to look at. `job` is the exception: it is data, so a Vite plugin
 * blanks it before bundling and check-leaks.mjs greps dist/ afterwards to prove it.
 */
import type { Deck } from "@engine/types";

const deck: Deck = {
  // Any of these opens the deck; matching ignores case, spaces and punctuation. A real deck
  // usually lists the client's brand, which is what they are told.
  passcodes: ["example"],

  title: {
    eyebrow: "Slides",
    headingHtml: "A deck is a file,<br/>not a document.",
    sub: "The slideshow engine behind client decks that live at a secret URL.",
    job: "Land the one idea the whole engine rests on: slides are data under version control.",
  },

  agenda: {
    eyebrow: "Overview",
    heading: "What you get.",
  },

  sections: [
    {
      id: "what",
      title: "What this is",
      tagline: "One file in, one private link out.",
      // An opening beat rather than a chapter, so it does not announce itself with a divider.
      // It still appears in the overview and the bottom bar, which jump to its first slide.
      divider: false,
      slides: [
        {
          eyebrow: "The shape of it",
          headline: "Write the deck. Build it. Send the link.",
          paragraph:
            "Every deck is a folder: one TypeScript file holding the words, a folder of media, " +
            "and a UUID that becomes its address. Nothing about a deck lives in a database.",
          job: "Make it concrete before any of the machinery shows up.",
        },
        {
          stack: true,
          eyebrow: "How it runs",
          title: "Three steps, and the last one is the whole privacy model.",
          handout:
            "Each deck builds to its own bundle at its own unguessable URL. The passcode screen " +
            "is a courtesy; the slug is what actually keeps a deck private.",
          blocks: [{ figure: "images/figures/pipeline.svg" }],
          job: "Show that the privacy story is one sentence long, so nobody goes looking for more.",
        },
      ],
    },
    {
      id: "authoring",
      title: "Writing one",
      short: "Authoring",
      tagline: "The parts you actually touch.",
      slides: [
        {
          plan: true,
          eyebrow: "Three things to know",
          headline: "Most of a deck is three fields.",
          steps: [
            { tag: "eyebrow", title: "The small label", note: "A signpost. Plain nouns, not a second headline." },
            { tag: "headline", title: "The claim", note: "One idea, written for a three-second glance." },
            { tag: "handout", title: "The rest", note: "Prints in the PDF, never on screen." },
          ],
          job: "Answer the first question anyone asks, which is where the words go.",
        },
        {
          scene: "chain",
          eyebrow: "When a picture has to move",
          title: "A drawing the deck can drive.",
          steps: [
            { tag: "Figure", title: "A file", note: "An SVG in the deck's images/. Anyone can draw one." },
            { tag: "Scene", title: "A component", note: "Lives beside the deck, in its own scenes/ folder." },
            { tag: "Mockup", title: "Real software", note: "A driven embed of another interface." },
          ],
          claim: { text: "Both of these are authored per deck, so one client's drawing never ships in another's bundle", from: 0, to: 1 },
          job: "Show the escape hatch exists without making it sound like the normal route.",
        },
        {
          eyebrow: "Presenting",
          headline: "Space plays. The arrows move.",
          paragraph:
            "A remote sends PageDown, so it performs. The arrows always move a whole slide, on " +
            "every slide, so a demo mid-play never traps you.",
          job: "The one thing worth knowing before standing up with it.",
        },
      ],
    },
  ],

  job: "Show what the engine does by being a deck built with it, not a page describing it.",
};

export default deck;
