// Turning a Deck (what a deck author writes) into the flat list of slides the deck actually
// shows, plus the table of contents. The engine renders that list; nothing else decides what a
// deck contains.
//
// This lives on its own, away from React, because more than one caller needs it and not all of
// them are components: SlideShow and ExportView render from it, and the editor numbers slides
// from it so that a slide's number means the same thing on screen, in the PDF and in an edit.
// Reimplementing the flattening anywhere else would be another place to forget a slide kind.
import type { Deck, FlatSlide, TocSection } from "./types";

/** `baseUrl` prefixes every asset path a slide points at. It defaults to the build's own base,
 *  which is "/<slug>/" in a deck build and what SlideShow and ExportView both want. The admin
 *  editor is the exception: it is served from /_admin/ but renders another deck's slides, so it
 *  passes that deck's base explicitly. */
export function buildSlides(deck: Deck, baseUrl?: string): { flat: FlatSlide[]; toc: TocSection[] } {
  const base = baseUrl ?? import.meta.env?.BASE_URL ?? "";
  const flat: FlatSlide[] = [];
  const toc: TocSection[] = [];

  /** The number the slide about to be pushed should carry, or undefined for none.
   *
   *  Counted from the position in `flat`, so it is the slide's page in the PDF, and so hiding
   *  one number never renumbers the ones after it: slide 7 stays slide 7 whether or not slide 3
   *  prints its own. Read before the push, which is why it is called inline in the literal.
   *
   *  `show !== false` rather than `show === true`: the default is on, and an authored slide that
   *  says nothing about numbers gets one. */
  const num = (show?: boolean) =>
    deck.numbers !== false && show !== false ? flat.length + 1 : undefined;

  flat.push({ kind: "title", images: deck.title.images?.map((img) => base + img),
              number: num(deck.title.number), handout: deck.title.handout });
  // The overview lists the deck's sections. On a single-section deck that is one row that just
  // repeats the section divider that follows it, so skip the overview there.
  if (deck.sections.length > 1) flat.push({ kind: "agenda", number: num(deck.agenda.number), handout: deck.agenda.handout });

  deck.sections.forEach((sec, n) => {
    const dividerIndex = flat.length;
    // "Section 3" is the right kicker for a deck of topics and the wrong one for a deck of
    // arguments, so `short` replaces it when the deck sets one. A section with divider:false
    // gets none at all, and dividerIndex then lands on its first slide, which is what the
    // overview and the nav should jump to.
    if (sec.divider !== false) {
      flat.push({ kind: "divider", idx: sec.short ?? `Section ${n + 1}`, title: sec.title,
                  tagline: sec.tagline, number: num(sec.number), handout: sec.handout });
    }
    const items: { label: string; index: number }[] = [];
    sec.slides.forEach((c) => {
      if ("divider" in c) {
        items.push({ label: c.title, index: flat.length });
        flat.push({ kind: "groupdivider", eyebrow: c.eyebrow, title: c.title, tagline: c.tagline,
                    number: num(c.number), handout: c.handout });
        return;
      }
      if ("plan" in c) {
        items.push({ label: c.headline, index: flat.length });
        flat.push({ kind: "plan", eyebrow: c.eyebrow, headline: c.headline, steps: c.steps, cost: c.cost,
                    footnote: c.footnote, number: num(c.number), handout: c.handout });
        return;
      }
      if ("viewer" in c) {
        items.push({ label: c.title, index: flat.length });
        flat.push({
          kind: "viewer", eyebrow: c.eyebrow, title: c.title, note: c.note,
          images: c.images.map((im) => ({ ...im, src: base + im.src })),
          previews: c.previews ?? 2, number: num(c.number), handout: c.handout,
          // Resolved here rather than in the inspector so there is one place that knows the
          // rule: the deck has to opt in, and then a slide can opt back out.
          download: deck.downloads === true && c.download !== false,
        });
        return;
      }
      if ("mockup" in c) {
        items.push({ label: c.title ?? "Live demo", index: flat.length });
        flat.push({
          kind: "mockup", mockup: c.mockup, assets: base + c.assets,
          eyebrow: c.eyebrow, title: c.title, number: num(c.number), handout: c.handout,
        });
        return;
      }
      if ("stack" in c) {
        // A stack has no single required headline, so the Contents row falls back to the
        // eyebrow and then to the section title rather than showing an empty row.
        items.push({ label: c.title ?? c.eyebrow ?? sec.title, index: flat.length });
        flat.push({
          kind: "stack", eyebrow: c.eyebrow, title: c.title, note: c.note,
          // band and figure are both deck-relative paths and both need the base prefix.
          blocks: c.blocks.map((b) =>
            "band" in b ? { ...b, band: base + b.band }
            : "figure" in b ? { ...b, figure: base + b.figure }
            : b),
          number: num(c.number), handout: c.handout,
        });
        return;
      }
      if ("scene" in c) {
        // The drawing is code, but a step may carry a picture of what it produces, and that is a
        // deck asset like any other.
        items.push({ label: c.title ?? c.eyebrow ?? sec.title, index: flat.length });
        flat.push({
          kind: "scene", scene: c.scene, eyebrow: c.eyebrow, title: c.title, note: c.note,
          // A scene whose whole content is one played act authors no steps, so the empty array
          // is substituted here rather than in every scene that maps over it.
          steps: (c.steps ?? []).map((st) => (st.image ? { ...st, image: base + st.image } : st)),
          claim: c.claim, answer: c.answer, months: c.months,
          number: num(c.number), handout: c.handout,
        });
        return;
      }
      if ("film" in c) {
        items.push({ label: "Film", index: flat.length });
        flat.push({ kind: "film", src: base + c.video, number: num(c.number), handout: c.handout });
        return;
      }
      if ("showcase" in c) {
        items.push({ label: c.title, index: flat.length });
        flat.push({
          kind: "showcase", layout: c.layout ?? "split", images: c.images.map((img) => base + img),
          eyebrow: c.eyebrow, title: c.title, note: c.note, imageSide: c.imageSide ?? "right",
          focus: c.focus, number: num(c.number), handout: c.handout,
        });
        return;
      }
      items.push({ label: c.headline, index: flat.length });
      flat.push({
        kind: "content", eyebrow: c.eyebrow, headline: c.headline, paragraph: c.paragraph, bullets: c.bullets,
        src: c.video ? base + c.video : undefined,
        images: c.images?.map((img) => base + img),
        number: num(c.number), handout: c.handout,
      });
    });
    toc.push({ title: sec.title, short: sec.short, tagline: sec.tagline,
               thumb: sec.thumb ? base + sec.thumb : undefined, dividerIndex, items });
  });
  flat.push({ kind: "outro", number: num() });
  return { flat, toc };
}
