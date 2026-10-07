import type { Deck } from "@engine/types";
import type { Card } from "./fields";
import { getPath } from "./fields";

// Review comments: a numbered dot on a slide with a sentence attached, handed to Claude in the
// COMMENTS block of the payload.
//
// Everything else the editor emits is a finished change (this order, this cut, this exact new
// string). A comment is the opposite, a request somebody still has to turn into a change, which
// is why it gets its own block and is never folded into EDIT: "make this card bigger" has no
// field to diff against.
//
// The dot alone is not enough for that. Claude reads text, not the screenshot, so a dot at
// (34%, 61%) is a coordinate on a picture it has never seen. Each comment therefore records what
// was under the pointer at the moment it was placed (the text, or the image or video path) and,
// where it can be found, the deck.ts path that text came from. That description is taken once at
// placement and stored, not recomputed, because its job is to survive the deck changing: a later
// build can move a different slide under the same number, and the quoted text is what lets
// somebody notice.
//
// Editor-only by construction. This module lives in src/admin, which only the /_admin/ bundle
// imports, and the comments themselves live in the reviewer's localStorage and nowhere else, so
// there is no path by which one reaches a client bundle or dist/.

export interface Comment {
  id: string;
  /** Creation time. Numbering within a slide follows it, so a dot keeps its number while
   *  others are added after it. */
  at: number;
  /** The slide's ORIGINAL number, the same identity the CUT and EDIT lines use, so a comment
   *  and a reorder in one session cannot be confused for each other. */
  origin: number;
  /** Card.path and Card.says as they were at placement. See the header for why these are
   *  stored rather than looked up again. */
  slide: string;
  says: string;
  /** Percent of the 1280x720 stage from its top left. Percent rather than pixels so the dot
   *  stays on the same spot at every thumbnail width, and because it is the unit that means
   *  something to a reader of the payload who has no idea how big the thumbnail was. */
  x: number;
  y: number;
  /** What the dot is on: a quoted string of text, "image <path>", "video <path>", or "". */
  target: string;
  /** The deck.ts path that produced it, when one could be found. */
  field?: string;
  text: string;
  /** The commit and a hash of the deck the comment was placed on. The commit alone is not
   *  enough: `make serve` builds an uncommitted deck.ts under the same commit, which is exactly
   *  the state the deck is in while comments are being applied. */
  base: string;
  print: string;
}

/** A hash of the deck as the page was built from it. Not cryptographic and not meant to be:
 *  its only job is to change when deck.ts does. */
export function fingerprint(deck: Deck): string {
  const str = JSON.stringify(deck);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ------------------------------------------------------------------------------- persistence
//
// localStorage, keyed by deck name. The editor has no server side it can write to (the edge
// function only reads), and edits are deliberately not persisted: a retyped headline is cheap
// to retype, while a review pass of twenty dots is an afternoon. The consequence worth knowing
// is that comments live in the one browser that placed them, per origin, so localhost:8888 and
// the live /admin keep separate sets and a colleague sees none of yours.
//
// Every access is wrapped: Safari in private mode and a full quota both throw, and a review
// tool that crashes the editor on load is worse than one that forgets.

const key = (deck: string) => `bmx-comments:${deck}`;

function isComment(v: unknown): v is Comment {
  const c = v as Comment;
  return !!c && typeof c.id === "string" && typeof c.origin === "number"
    && typeof c.x === "number" && typeof c.y === "number" && typeof c.text === "string";
}

export function loadComments(deck: string): Comment[] {
  try {
    const raw = localStorage.getItem(key(deck));
    if (!raw) return [];
    const v = JSON.parse(raw) as { comments?: unknown };
    return Array.isArray(v.comments)
      ? v.comments.filter(isComment).map((c) => ({
        ...c, at: c.at ?? 0, slide: c.slide ?? "", says: c.says ?? "", target: c.target ?? "",
        base: c.base ?? "unknown", print: c.print ?? "",
      }))
      : [];
  } catch {
    return [];
  }
}

export function saveComments(deck: string, list: Comment[]) {
  try {
    if (list.length) localStorage.setItem(key(deck), JSON.stringify({ v: 1, comments: list }));
    else localStorage.removeItem(key(deck));
  } catch { /* see above: forgetting beats crashing */ }
}

/** Calls `fn` with the stored list whenever ANOTHER tab changes it. Each tab reads storage once
 *  and then writes its whole list back on every change, so without this an old editor tab left
 *  open after a rebuild silently erased what the new tab had added. The storage event never fires
 *  in the tab that wrote, and not for a write that leaves the value unchanged, so adopting the
 *  list here cannot start the two tabs echoing each other. */
export function watchComments(deck: string, fn: (list: Comment[]) => void): () => void {
  const on = (e: StorageEvent) => { if (e.key === key(deck)) fn(loadComments(deck)); };
  window.addEventListener("storage", on);
  return () => window.removeEventListener("storage", on);
}

/** Per-slide numbers, 1 upward in placement order. The dots and the payload both read this one
 *  map, so the "2" on a thumbnail is always the "2" in the paste. */
export function numberComments(list: Comment[]): Map<string, number> {
  const byOrigin = new Map<number, Comment[]>();
  for (const c of list) byOrigin.set(c.origin, [...(byOrigin.get(c.origin) ?? []), c]);
  const n = new Map<string, number>();
  for (const cs of byOrigin.values()) {
    cs.slice().sort((a, b) => a.at - b.at).forEach((c, i) => n.set(c.id, i + 1));
  }
  return n;
}

// ------------------------------------------------------------------------- what is under it

export function clip(text: string, max = 80): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Comparable form of a field value and of rendered text. Values can carry markup
 *  (title.headingHtml) and entities; rendered text carries neither. */
function norm(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

// Keys whose strings are never drawn on the slide. `slides` matters most: a divider's path is its
// section, and without skipping it every string on every slide of that chapter would be a
// candidate for a click on the divider.
const UNDRAWN = new Set(["slides", "job", "handout", "passcodes", "id"]);

function leaves(obj: unknown, path: string, out: { path: string; value: string }[]) {
  if (typeof obj === "string") out.push({ path, value: obj });
  else if (Array.isArray(obj)) obj.forEach((v, i) => leaves(v, `${path}[${i}]`, out));
  else if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) if (!UNDRAWN.has(k)) leaves(v, `${path}.${k}`, out);
  }
}

/** The strings this slide can draw, each with its deck.ts path. Card.fields first, since that is
 *  the editor's own map of what is copy; then every other string on the slide, which is what
 *  catches an image path, a scene's own field, or a kind fields.ts has not been taught yet. */
function candidates(card: Card, deck: Deck) {
  const seen = new Set<string>();
  const out: { path: string; value: string }[] = [];
  for (const f of card.fields) {
    seen.add(f.path);
    out.push({ path: f.path, value: String(getPath(deck, f.path) ?? "") });
  }
  const rest: { path: string; value: string }[] = [];
  leaves(getPath(deck, card.path), card.path, rest);
  for (const r of rest) if (!seen.has(r.path)) out.push(r);
  return out.filter((c) => c.value.trim());
}

function mediaOf(el: Element): { kind: "image" | "video"; src: string } | null {
  if (el instanceof HTMLImageElement) return { kind: "image", src: el.getAttribute("src") || el.currentSrc };
  if (el instanceof HTMLVideoElement) {
    const src = el.getAttribute("src") || el.querySelector("source")?.getAttribute("src") || el.currentSrc;
    return src ? { kind: "video", src } : null;
  }
  if (el instanceof SVGImageElement) return { kind: "image", src: el.href.baseVal };
  const bg = /url\(["']?([^"')]+)/.exec(getComputedStyle(el).backgroundImage);
  return bg ? { kind: "image", src: bg[1] } : null;
}

const ownsText = (el: Element) =>
  [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());

/** Describe what is under a point inside a rendered slide.
 *
 *  Geometry rather than elementsFromPoint, because the stage is pointer-events: none (it is a
 *  picture of a slide, and nothing in it may react to the pointer), so the browser's own hit
 *  test cannot see anything inside it. The smallest box that contains the point and either holds
 *  text directly or draws a picture is taken as the thing being pointed at. Z-order is ignored,
 *  which is right for the case that matters (a caption over a photograph is the smaller box) and
 *  only wrong for overlaps a slide does not have. */
export function describePoint(
  stage: HTMLElement, cx: number, cy: number, card: Card, deck: Deck, mediaBase: string,
): { target: string; field?: string } {
  let best: { el: Element; area: number; media: ReturnType<typeof mediaOf> } | null = null;
  for (const el of stage.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) continue;
    const area = r.width * r.height;
    if (best && area >= best.area) continue;
    const media = mediaOf(el);
    if (!media && !ownsText(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.opacity === "0") continue;
    best = { el, area, media };
  }
  if (!best) return { target: "" };
  const pool = candidates(card, deck);

  if (best.media) {
    let rel = best.media.src;
    try {
      const p = decodeURIComponent(new URL(rel, location.href).pathname);
      rel = p.startsWith(mediaBase) ? p.slice(mediaBase.length) : p;
    } catch { /* keep the raw src */ }
    if (best.media.src.startsWith("data:") || best.media.src.startsWith("blob:")) rel = "(inline)";
    // Exact first; then a folder the deck names as a whole, which is how a mockup's `assets` is
    // written.
    const hit = pool.find((c) => c.value === rel) ?? pool.find((c) => rel.startsWith(`${c.value.replace(/\/$/, "")}/`));
    return { target: `${best.media.kind} ${rel}`, field: hit?.path };
  }

  // Climb from the clicked text to the element whose whole text IS one field. A headline split
  // into spans by a <br/> or an emphasis is one field drawn as several boxes, and the field is
  // what a reader of the payload can act on.
  for (let el: Element | null = best.el; el && el !== stage; el = el.parentElement) {
    const t = norm(el.textContent ?? "");
    if (!t) continue;
    const hit = pool.find((c) => norm(c.value) === t);
    if (hit) return { target: JSON.stringify(clip(el.textContent ?? "")), field: hit.path };
  }
  const own = norm(best.el.textContent ?? "");
  const inside = pool.filter((c) => own.length > 1 && norm(c.value).includes(own))
    .sort((a, b) => a.value.length - b.value.length)[0];
  return { target: JSON.stringify(clip(best.el.textContent ?? "")), field: inside?.path };
}

// ---------------------------------------------------------------------------------- payload

/** The COMMENTS block, or nothing at all when there are no comments, so a session that placed
 *  none pastes exactly what it pasted before this existed. */
export function commentLines(list: Comment[], print: string): string[] {
  if (!list.length) return [];
  const num = numberComments(list);
  const stale = list.filter((c) => c.print !== print);
  const L = ["COMMENTS  (requests, not edits: work out the change each asks for; (x%, y%) is from the slide's top left)"];
  if (stale.length) {
    L.push(`  ${stale.length} of these were placed on an earlier build of this deck, marked [earlier build]. `
      + "The slide number may now name a different slide; find those by their quoted text.");
  }
  const groups = new Map<string, Comment[]>();
  for (const c of list.slice().sort((a, b) => a.origin - b.origin || a.at - b.at)) {
    const k = `${c.origin}|${c.slide}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  for (const cs of groups.values()) {
    const head = cs[0];
    L.push(`  ${head.origin}  ${head.slide || "(unknown slide)"}${head.says ? `  ${JSON.stringify(clip(head.says))}` : ""}`);
    for (const c of cs) {
      const n = String(num.get(c.id) ?? "?");
      const on = c.target ? `on ${c.target}${c.field ? ` [${c.field}]` : ""}` : "on empty space";
      const pad = " ".repeat(5 + n.length + 2);
      const text = c.text.trim().split("\n").map((l) => l.trim()).join(`\n${pad}`);
      const old = c.print !== print ? `  [earlier build, base ${c.base}]` : "";
      L.push(`     ${n}  (${Math.round(c.x)}%, ${Math.round(c.y)}%) ${on}: ${text}${old}`);
    }
  }
  L.push("");
  return L;
}
