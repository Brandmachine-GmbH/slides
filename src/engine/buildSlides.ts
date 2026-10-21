// Turning a Deck (what a deck author writes) into the flat list of slides the deck actually
// shows, plus the table of contents. The engine renders that list; nothing else decides what a
// deck contains.
//
// This lives on its own, away from React, because more than one caller needs it and not all of
// them are components: SlideShow and ExportView render from it, and the editor numbers slides
// from it so that a slide's number means the same thing on screen, in the PDF and in an edit.
// Reimplementing the flattening anywhere else would be another place to forget a slide kind.
import type { Deck, FlatSlide, LooseSlide, Section, Slide, TocSection } from "./types";

/** `baseUrl` prefixes every asset path a slide points at. It defaults to the build's own base,
 *  which is "/<slug>/" in a deck build and what SlideShow and ExportView both want. The admin
 *  editor is the exception: it is served from /_admin/ but renders another deck's slides, so it
 *  passes that deck's base explicitly.
 *
 *  Nothing is added that deck.ts does not place. The engine used to inject a title, an overview
 *  and an outro around the sections; a deck now places each of those itself, where it wants them
 *  or not at all, and the only slide still generated is a section's divider. */
export function buildSlides(deck: Deck, baseUrl?: string): { flat: FlatSlide[]; toc: TocSection[]; loose: LooseSlide[] } {
  const base = baseUrl ?? import.meta.env?.BASE_URL ?? "";
  const flat: FlatSlide[] = [];
  const toc: TocSection[] = [];
  const loose: LooseSlide[] = [];

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

  /** A slide's own theme replaces the deck's; it is never layered on top of it (SlideMeta.theme). */
  const themeOf = (own?: string) => own ?? deck.theme;

  /** What the Contents panel and the bottom nav call a slide. `fallback` is the section's title,
   *  for a stack or a scene with neither a title nor a label of its own. */
  const labelOf = (c: Slide, fallback: string): string => {
    switch (c.type) {
      case "title":    return "Title";
      case "toc":      return "Contents";
      case "end":      return "End";
      case "film":     return "Film";
      case "mockup":   return c.title ?? "Live demo";
      case "content":
      case "plan":     return c.headline;
      case "stack":
      case "scene":    return c.title ?? c.eyebrow ?? fallback;
      default:         return c.title;
    }
  };

  /** One authored slide onto `flat`. Exhaustive over Slide["type"], so a kind added to the union
   *  and forgotten here is a type error rather than a slide that silently never renders. */
  const push = (c: Slide) => {
    const meta = { number: num(c.number), handout: c.handout, theme: themeOf(c.theme) };
    switch (c.type) {
      case "title":
        flat.push({ kind: "title", eyebrow: c.eyebrow, headingHtml: c.headingHtml, sub: c.sub,
                    images: c.images?.map((img) => base + img), ...meta });
        return;
      case "toc":
        flat.push({ kind: "toc", eyebrow: c.eyebrow, heading: c.heading, ...meta });
        return;
      case "end":
        flat.push({ kind: "end", ...meta });
        return;
      case "divider":
        flat.push({ kind: "divider", eyebrow: c.eyebrow, title: c.title, tagline: c.tagline, ...meta });
        return;
      case "plan":
        flat.push({ kind: "plan", eyebrow: c.eyebrow, headline: c.headline, steps: c.steps, cost: c.cost,
                    footnote: c.footnote, ...meta });
        return;
      case "viewer":
        flat.push({
          kind: "viewer", eyebrow: c.eyebrow, title: c.title, note: c.note,
          images: c.images.map((im) => ({ ...im, src: base + im.src })),
          previews: c.previews ?? 2, ...meta,
          // Resolved here rather than in the inspector so there is one place that knows the
          // rule: the deck has to opt in, and then a slide can opt back out.
          download: deck.downloads === true && c.download !== false,
        });
        return;
      case "mockup":
        flat.push({ kind: "mockup", name: c.name, assets: base + c.assets, eyebrow: c.eyebrow, title: c.title, ...meta });
        return;
      case "stack":
        flat.push({
          kind: "stack", eyebrow: c.eyebrow, title: c.title, note: c.note,
          // band and figure are both deck-relative paths and both need the base prefix.
          blocks: c.blocks.map((b) =>
            "band" in b ? { ...b, band: base + b.band }
            : "figure" in b ? { ...b, figure: base + b.figure }
            : b),
          ...meta,
        });
        return;
      case "scene":
        flat.push({
          kind: "scene", name: c.name, eyebrow: c.eyebrow, title: c.title, note: c.note,
          // A scene whose whole content is one played act authors no steps, so the empty array
          // is substituted here rather than in every scene that maps over it. A step may carry
          // a picture of what it produces, and that is a deck asset like any other.
          steps: (c.steps ?? []).map((st) => (st.image ? { ...st, image: base + st.image } : st)),
          claim: c.claim, answer: c.answer, months: c.months, ...meta,
        });
        return;
      case "film":
        flat.push({ kind: "film", src: base + c.video, ...meta });
        return;
      case "showcase":
        flat.push({
          kind: "showcase", layout: c.layout ?? "split", images: c.images.map((img) => base + img),
          eyebrow: c.eyebrow, title: c.title, note: c.note, imageSide: c.imageSide ?? "right",
          focus: c.focus, ...meta,
        });
        return;
      case "content":
        flat.push({
          kind: "content", eyebrow: c.eyebrow, headline: c.headline, paragraph: c.paragraph, bullets: c.bullets,
          src: c.video ? base + c.video : undefined,
          images: c.images?.map((img) => base + img), ...meta,
        });
        return;
      default: {
        const never: never = c;
        throw new Error(`unknown slide type ${JSON.stringify((never as { type?: unknown }).type)}`);
      }
    }
  };

  const section = (sec: Section, n: number) => {
    const dividerIndex = flat.length;
    // "Section 3" is the right kicker for a deck of topics and the wrong one for a deck of
    // arguments, so `short` replaces it when the deck sets one. A section with divider:false
    // gets none at all, and dividerIndex then lands on its first slide, which is what the
    // table of contents and the nav should jump to.
    if (sec.divider !== false) {
      flat.push({ kind: "section", idx: sec.short ?? `Section ${n + 1}`, title: sec.title,
                  tagline: sec.tagline, number: num(sec.number), handout: sec.handout, theme: themeOf(sec.theme) });
    }
    const items: { label: string; index: number }[] = [];
    for (const c of sec.slides) {
      items.push({ label: labelOf(c, sec.title), index: flat.length });
      push(c);
    }
    toc.push({ title: sec.title, short: sec.short, tagline: sec.tagline,
               thumb: sec.thumb ? base + sec.thumb : undefined, listed: sec.toc !== false,
               dividerIndex, items });
  };

  // Sections are counted for the "Section N" kicker in deck order, ignoring the loose slides
  // between them, so placing a title or a toc never renumbers a chapter.
  let n = 0;
  for (const item of deck.slides) {
    if (item.type === "section") section(item, n++);
    else {
      loose.push({ index: flat.length, kind: item.type, label: labelOf(item, "") });
      push(item);
    }
  }
  return { flat, toc, loose };
}
