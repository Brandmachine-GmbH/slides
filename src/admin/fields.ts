import type { Deck } from "@engine/types";

// Which strings on a slide are copy, and where each one lives in deck.ts.
//
// The path is the whole point: "sections[1].slides[0].title" is unambiguous, survives a
// reorder, and is what the edit payload carries back so a change can be applied to exactly
// one field. Everything else about a slide (image paths, video paths, the slide kind) is
// deliberately absent, because those are moves rather than edits and are shown, not typed.

export interface Field {
  path: string;
  label: string;
  value: string;
  multiline?: boolean;
}

/** One card in the editor: a flat slide, plus where its copy lives. Indexes match the flat
 *  list buildSlides produces, one for one. */
export interface Card {
  origin: number;          // 1-based position in the deck as generated. The payload's identity.
  kind: string;
  label: string;
  /** Title, overview, section dividers and the outro: the engine puts these where it wants
   *  them, so they can be retyped but not dragged. */
  fixed: boolean;
  fields: Field[];

  /* Below here is story mode's half of a card. It rides on walkCards rather than getting its own
     walk, because the one thing that must never happen is two views numbering the same deck
     differently: EditApp checks this list against buildSlides and refuses to render if they
     disagree, and a second walk would sit outside that check. */

  /** Index into deck.sections, or undefined for the title, the overview and the outro. */
  sec?: number;
  /** This card is a section's divider. It has no job of its own; the chapter's job is its job,
   *  and story mode draws it as the chapter heading. See Section.job. */
  isDivider?: boolean;
  /** Where this card's job lives in deck.ts. Absent on a section divider, and on the outro,
   *  which nothing in deck.ts describes. */
  jobPath?: string;
  /** What this slide says on screen today, for the line under its job. Always derived, never
   *  typed: an authored summary is a third copy of the headline and starts rotting the moment
   *  somebody rewrites one of the other two. */
  says: string;
}

/** deck.title.headingHtml carries markup, and story mode wants the sentence. */
function plain(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function getPath(obj: unknown, path: string): unknown {
  return path.split(/[.[\]]+/).filter(Boolean)
    .reduce<unknown>((o, k) => (o == null ? o : (o as Record<string, unknown>)[k]), obj);
}

/** Set one field, returning a new deck. The object is a few kilobytes of plain data, so a
 *  clone per keystroke is cheaper than the machinery needed to avoid one. */
export function setPath(deck: Deck, path: string, value: string): Deck {
  const next = structuredClone(deck) as unknown as Record<string, unknown>;
  const keys = path.split(/[.[\]]+/).filter(Boolean);
  let cur: Record<string, unknown> = next;
  for (const k of keys.slice(0, -1)) cur = cur[k] as Record<string, unknown>;
  cur[keys[keys.length - 1]] = value;
  return next as unknown as Deck;
}

function textFields(slide: Record<string, unknown>, base: string): Field[] {
  const f: Field[] = [];
  const add = (key: string, label: string, multiline = false) => {
    if (typeof slide[key] === "string") f.push({ path: `${base}.${key}`, label, value: slide[key] as string, multiline });
  };
  add("eyebrow", "Label");
  add("headline", "Headline", true); add("title", "Headline", true);
  add("paragraph", "Body", true); add("note", "Body", true); add("tagline", "Tagline", true);

  ((slide.steps as Record<string, string>[]) ?? []).forEach((st, i) => {
    f.push({ path: `${base}.steps[${i}].tag`, label: `Card ${i + 1} label`, value: st.tag });
    f.push({ path: `${base}.steps[${i}].title`, label: `Card ${i + 1} heading`, value: st.title, multiline: true });
    if (typeof st.note === "string") f.push({ path: `${base}.steps[${i}].note`, label: `Card ${i + 1} body`, value: st.note, multiline: true });
  });
  // A scene's answer is one more card of copy, and the editor should reach it like any other.
  const ans = slide.answer as Record<string, string> | undefined;
  if (ans) {
    f.push({ path: `${base}.answer.tag`, label: "Answer label", value: ans.tag });
    f.push({ path: `${base}.answer.title`, label: "Answer", value: ans.title });
  }
  if (typeof (slide.claim as Record<string, string>)?.text === "string") {
    f.push({ path: `${base}.claim.text`, label: "Closing line",
             value: (slide.claim as Record<string, string>).text, multiline: true });
  }

  ((slide.blocks as Record<string, unknown>[]) ?? []).forEach((b, bi) => {
    ((b.tiles as Record<string, string>[]) ?? []).forEach((t, ti) => {
      const p = `${base}.blocks[${bi}].tiles[${ti}]`;
      f.push({ path: `${p}.value`, label: `Tile ${ti + 1} figure`, value: t.value });
      f.push({ path: `${p}.label`, label: `Tile ${ti + 1} label`, value: t.label });
      if (typeof t.note === "string") f.push({ path: `${p}.note`, label: `Tile ${ti + 1} body`, value: t.note, multiline: true });
    });
    ((b.legend as Record<string, string>[]) ?? []).forEach((l, li) =>
      f.push({ path: `${base}.blocks[${bi}].legend[${li}].label`, label: `Legend ${li + 1}`, value: l.label }));
    if (typeof b.capLeft === "string") f.push({ path: `${base}.blocks[${bi}].capLeft`, label: "Caption left", value: b.capLeft });
    if (typeof b.capRight === "string") f.push({ path: `${base}.blocks[${bi}].capRight`, label: "Caption right", value: b.capRight });
  });
  ((slide.images as unknown[]) ?? []).forEach((im, i) => {
    if (typeof im === "string") return;                     // showcase images are bare paths
    const v = im as Record<string, string>;
    f.push({ path: `${base}.images[${i}].label`, label: `Tab ${i + 1}`, value: v.label });
    if (typeof v.sub === "string") f.push({ path: `${base}.images[${i}].sub`, label: `Tab ${i + 1} sub`, value: v.sub });
  });
  ((slide.bullets as string[]) ?? []).forEach((b, i) =>
    f.push({ path: `${base}.bullets[${i}]`, label: `Bullet ${i + 1}`, value: b, multiline: true }));
  return f;
}

/** Walk the deck the way buildSlides does, so card N describes flat slide N.
 *
 *  buildSlides emits: title, [overview], then per section [divider] + one card per authored
 *  slide, then outro. The per-slide part is strictly one for one, so the only rule this has to
 *  mirror is whether a section announces itself. EditApp asserts the two lists came out the
 *  same length rather than trusting that. */
export function walkCards(deck: Deck): Card[] {
  const cards: Card[] = [];
  cards.push({
    origin: 0, kind: "title", label: "Title", fixed: true,
    says: plain(deck.title.headingHtml), jobPath: "title.job",
    fields: [
      { path: "title.eyebrow", label: "Label", value: deck.title.eyebrow },
      { path: "title.headingHtml", label: "Headline", value: deck.title.headingHtml, multiline: true },
      { path: "title.sub", label: "Body", value: deck.title.sub, multiline: true },
    ],
  });
  if (deck.sections.length > 1) {
    cards.push({
      origin: 0, kind: "overview", label: "Overview", fixed: true,
      says: deck.agenda.heading, jobPath: "agenda.job",
      fields: [
        { path: "agenda.eyebrow", label: "Label", value: deck.agenda.eyebrow },
        { path: "agenda.heading", label: "Headline", value: deck.agenda.heading, multiline: true },
      ],
    });
  }
  deck.sections.forEach((sec, n) => {
    if (sec.divider !== false) {
      cards.push({
        origin: 0, kind: "divider", label: `Section: ${sec.short ?? sec.title}`, fixed: true,
        sec: n, isDivider: true, says: sec.title,
        fields: [
          { path: `sections[${n}].title`, label: "Section title", value: sec.title, multiline: true },
          { path: `sections[${n}].short`, label: "Short name (nav)", value: sec.short ?? "" },
          { path: `sections[${n}].tagline`, label: "Tagline", value: sec.tagline, multiline: true },
        ],
      });
    }
    sec.slides.forEach((sl, m) => {
      const s = sl as unknown as Record<string, unknown>;
      const kind = ["divider", "plan", "viewer", "mockup", "stack", "scene", "film", "showcase"].find((k) => k in s) ?? "content";
      cards.push({
        origin: 0, kind,
        label: (s.title ?? s.headline ?? s.eyebrow ?? s.group ?? "(untitled)") as string,
        fixed: false,
        sec: n,
        jobPath: `sections[${n}].slides[${m}].job`,
        // A film carries no type at all and a mockup's heading is the software's, so both would
        // otherwise show an empty line where every other slide shows what it says.
        says: (s.title ?? s.headline ?? s.eyebrow ?? s.group ?? "") as string,
        fields: textFields(s, `sections[${n}].slides[${m}]`),
      });
    });
  });
  cards.push({ origin: 0, kind: "outro", label: "Outro", fixed: true, says: "", fields: [] });
  cards.forEach((c, i) => { c.origin = i + 1; });
  return cards;
}
