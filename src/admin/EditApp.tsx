import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Deck } from "@engine/types";
import { buildSlides } from "@engine/buildSlides";
import { SlideBody } from "@engine/SlideBody";
import { applyDeckTheme } from "@engine/theme";
import { walkCards, setPath, getPath } from "./fields";
import { Story } from "./Story";
import {
  type Comment, fingerprint, loadComments, saveComments, watchComments, numberComments, describePoint, commentLines, clip,
} from "./comments";
import { DotLayer, Popover, type Draft } from "./Dots";
import s from "./edit.module.css";

// The per-deck editor at /admin/edit/<deck>.
//
// Thumbnails are the real slide components, not screenshots, which is what makes this worth
// hosting rather than generating: a card re-renders as you type, so you watch the headline
// wrap instead of guessing. It also means there is nothing to keep in sync and nothing to
// rebuild when a deck changes.
//
// It cannot write to the repo. The deck's copy is compiled into the client bundle, so changing
// it is a commit; what this produces instead is a diff to paste into Claude Code, and the
// diff's whole job is to say what changed and nothing else. See PAYLOAD below.

interface Boot { name: string; slug: string; sha: string; deck: Deck }

// The rows view's slide size. Per browser rather than per deck: it follows the screen and the
// task (S for retyping copy, L for judging a layout), not the deck. Stored the same guarded way
// as comments, since a preference is never worth an editor that will not load.
type Size = "s" | "m" | "l";
const SIZES: Size[] = ["s", "m", "l"];
const SIZE_KEY = "bmx-rows-size";
function loadSize(): Size {
  try {
    const v = localStorage.getItem(SIZE_KEY);
    return SIZES.includes(v as Size) ? (v as Size) : "s";
  } catch { return "s"; }
}

const DOT = " · ";

/** Slides mount only once they are near the viewport. A deck of thirty would otherwise start
 *  thirty videos at once, since ContentSlide's video autoplays. */
function Lazy({ children, className }: { children: React.ReactNode; className: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || on) return;
    const io = new IntersectionObserver(
      (es) => { if (es.some((e) => e.isIntersecting)) { setOn(true); io.disconnect(); } },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [on]);
  return <div ref={ref} className={className}>{on ? children : null}</div>;
}

/** A 1280x720 slide drawn inside whatever width the card is.
 *
 *  `transform` rather than `zoom`, and for a thumbnail that is not a close call: a card is around
 *  a quarter size, and `zoom` gets there by rewriting computed font sizes, which WebKit then
 *  floors at 9px. Measured in Safari before this changed, at a fit of 0.26: a 12px eyebrow came
 *  back as 34.7px. That is worse here than anywhere else in the repo, because the promise this
 *  view makes is that the thumbnails ARE the slides, so a headline re-wraps under you as you type
 *  it. Type drawn at three times its size wraps somewhere else, so the preview was quietly lying
 *  about the one thing it exists to show. A transform leaves the layout at 1280x720 and scales the
 *  drawing, so the wrap is the real one. Same reasoning as TRANSFORM_BELOW in SlideShow.tsx, which is
 *  why that one is 1: no reduction is small enough to be safe. */
function Thumb({ children, layer }: { children: React.ReactNode; layer?: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0.235);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setK(e.contentRect.width / 1280));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className={s.thumb} ref={box}>
      <div className={s.stage} data-stage style={{ transform: `scale(${k})` }}>{children}</div>
      {layer}
    </div>
  );
}

export function EditApp({ boot }: { boot: Boot }) {
  const base = `/${boot.slug}/`;
  const original = useMemo(() => structuredClone(boot.deck), [boot.deck]);
  const originalCards = useMemo(() => walkCards(original), [original]);

  const [deck, setDeck] = useState<Deck>(boot.deck);
  applyDeckTheme(boot.deck);
  const [order, setOrder] = useState<number[]>(() => originalCards.map((_, i) => i));
  const [cut, setCut] = useState<Set<number>>(new Set());
  const [view, setView] = useState<"sheet" | "rows" | "story">("sheet");
  const [shown, setShown] = useState(false);
  const [size, setSize] = useState<Size>(loadSize);
  useEffect(() => {
    try { localStorage.setItem(SIZE_KEY, size); } catch { /* see loadSize */ }
  }, [size]);

  // The rows view pins each thumbnail under the header, and the header's height is not fixed:
  // it wraps on a narrow window and grows a line in comment mode. A hard-coded offset would park
  // the thumbnail underneath it in exactly those cases, so it is measured.
  const head = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = head.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      document.documentElement.style.setProperty("--bmx-head", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Undo covers structural moves — a whole drag, a cut, a restore — not keystrokes. One entry
  // per gesture, taken before it starts, so undo reverses "what I just did" rather than
  // replaying every card the pointer passed over on the way.
  const [history, setHistory] = useState<{ order: number[]; cut: Set<number> }[]>([]);
  const snapshot = useCallback(() => {
    setHistory((h) => [...h, { order, cut: new Set(cut) }]);
  }, [order, cut]);
  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setOrder(prev.order);
      setCut(prev.cut);
      return h.slice(0, -1);
    });
  }, []);

  const { flat, toc } = useMemo(() => buildSlides(deck, base), [deck, base]);
  const cards = useMemo(() => walkCards(deck), [deck]);

  // If these ever disagree the cards are labelling the wrong slides, which is worse than not
  // rendering at all: every number in the payload would be off by one.
  const consistent = cards.length === flat.length && cards.length === originalCards.length;

  // Read the current value the same way everywhere, and normalise before comparing. An optional
  // field that a deck never set reads back as undefined while walkCards recorded it as "", and
  // undefined !== "" reported three edits on a page nobody had touched, each of them '- ""  + ""'.
  // A payload that invents changes is worse than no payload, since the whole promise is that
  // anything listed is something you did.
  const edits = useMemo(
    () => originalCards.flatMap((c, i) =>
      c.fields
        .map((f) => ({ origin: i + 1, path: f.path, from: f.value, to: String(getPath(deck, f.path) ?? "") }))
        .filter((e) => e.to !== e.from)),
    [deck, originalCards],
  );
  const moved = order.some((o, i) => o !== i);

  // Jobs are tracked separately from `edits` on purpose. They are not slide copy: they never
  // reach a client, they are not on the slide, and the rows view has no business offering one
  // for typing next to a headline. Keeping them out of Card.fields is what keeps that true, so
  // the price is a second comparison here, over the same paths the story view writes to.
  const jobPaths = useMemo(() => {
    const p = ["job"];
    original.sections.forEach((_, n) => p.push(`sections[${n}].job`));
    originalCards.forEach((c) => { if (c.jobPath) p.push(c.jobPath); });
    return p;
  }, [original, originalCards]);

  const jobEdits = useMemo(() => {
    const numberOf = new Map(originalCards.filter((c) => c.jobPath).map((c) => [c.jobPath!, c.origin]));
    return jobPaths
      .map((path) => ({
        path,
        label: String(numberOf.get(path) ?? (path === "job" ? "deck" : "chapter")),
        from: String(getPath(original, path) ?? ""),
        to: String(getPath(deck, path) ?? ""),
      }))
      .filter((e) => e.to !== e.from);
  }, [jobPaths, original, deck, originalCards]);

  // COMMENTS. Persisted, unlike everything above, and outside undo: undo is for structural moves,
  // and a review pass is the one thing on this page too expensive to lose to a reload.
  const print = useMemo(() => fingerprint(boot.deck), [boot.deck]);
  const [comments, setComments] = useState<Comment[]>(() => loadComments(boot.name));
  useEffect(() => saveComments(boot.name, comments), [boot.name, comments]);
  useEffect(() => watchComments(boot.name, setComments), [boot.name]);
  const numbers = useMemo(() => numberComments(comments), [comments]);
  const stale = comments.filter((c) => c.print !== print).length;
  const [commenting, setCommenting] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const saveDraft = useCallback((d: Draft) => {
    const c = { ...d.comment, text: d.comment.text.trim() };
    if (c.text) setComments((cs) => (d.isNew ? [...cs, c] : cs.map((x) => (x.id === c.id ? c : x))));
    setDraft(null);
  }, []);

  // A click anywhere else keeps what was typed rather than throwing it away, so moving on to the
  // next dot is one click and not Save-then-click. Only an empty draft is dropped.
  useEffect(() => {
    if (!draft) return;
    const away = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.("[data-popover]")) return;
      saveDraft(draft);
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [draft, saveDraft]);

  // The story view has no thumbnails, so there is nothing to point a dot at or anchor one to.
  useEffect(() => { if (view === "story") { setCommenting(false); setDraft(null); } }, [view]);

  // `m` for mark. The slideshow already owns c, d and f (Contents, dark, fullscreen) and this page
  // shares a reviewer's fingers with it, so the editor takes a letter the deck does not use.
  // Typing in any field is left alone, and so are modifiers, so Cmd+M still minimises.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey || shown || view === "story") return;
      if (e.key.toLowerCase() === "m") { e.preventDefault(); setCommenting((c) => !c); }
      // `s` for size, rows view only: it is the only view with a size to change, and a key that
      // silently does nothing in the other two is better than one that changes something unseen.
      else if (e.key.toLowerCase() === "s" && view === "rows") {
        e.preventDefault();
        setSize((z) => SIZES[(SIZES.indexOf(z) + 1) % SIZES.length]);
      }
      else if (e.key === "Escape" && commenting && !draft) setCommenting(false);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [shown, view, commenting, draft]);

  const clearComments = () => {
    if (confirm(`Delete all ${comments.length} comment${comments.length === 1 ? "" : "s"} on ${boot.name}? This cannot be undone.`)) {
      setDraft(null);
      setComments([]);
    }
  };

  const edit = useCallback((path: string, value: string) => {
    setDeck((d) => setPath(d, path, value));
  }, []);

  const move = useCallback((from: number, to: number) => {
    setOrder((o) => {
      const next = o.slice();
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
  }, []);

  // PAYLOAD. Only what changed, keyed by the slide's ORIGINAL number, so a reorder and a
  // rewrite in the same session cannot be confused for one another and an untouched order
  // emits nothing at all.
  const payload = useMemo(() => {
    const L: string[] = ["DECK EDIT", `deck: ${boot.name}`, `base: ${boot.sha}`, ""];
    if (moved) {
      L.push("ORDER  (original slide numbers, in the order they should now run)");
      L.push("  " + order.map((o) => o + 1).join(" "), "");
    }
    const cuts = [...cut].sort((a, b) => a - b);
    if (cuts.length) {
      L.push("CUT");
      cuts.forEach((i) => L.push(`  ${i + 1}  [${originalCards[i].kind}] ${originalCards[i].label}`));
      L.push("");
    }
    if (edits.length) {
      L.push("EDIT");
      edits.forEach((e) => {
        L.push(`  ${e.origin}  ${e.path}`);
        L.push(`     - ${JSON.stringify(e.from)}`);
        L.push(`     + ${JSON.stringify(e.to)}`);
      });
      L.push("");
    }
    // Its own block rather than more EDIT lines, because these two land in different places: an
    // EDIT changes what a client reads and a STORY line changes something they will never see.
    // Anyone applying this should be able to tell those apart without reading the paths.
    if (jobEdits.length) {
      L.push("STORY  (internal; jobs are stripped from the client bundle)");
      jobEdits.forEach((e) => {
        L.push(`  ${e.label}  ${e.path}`);
        L.push(`     - ${JSON.stringify(e.from)}`);
        L.push(`     + ${JSON.stringify(e.to)}`);
      });
      L.push("");
    }
    // Last, because the blocks above are exact and this one is not: applying the exact changes
    // first means a comment is read against the deck as it is about to be, not as it was.
    L.push(...commentLines(comments, print));
    L.push(moved || cuts.length || edits.length || jobEdits.length || comments.length
      ? "Apply exactly what is listed above and nothing else. Anything absent is unchanged."
      : "(nothing changed)");
    return L.join("\n");
  }, [boot.name, boot.sha, moved, order, cut, edits, jobEdits, originalCards, comments, print]);

  const drag = useRef<number | null>(null);
  const [dragPos, setDragPos] = useState<number | null>(null);

  if (!consistent) {
    return (
      <div className={s.broken}>
        <h2>This editor is out of step with the engine.</h2>
        <p>
          It mapped {cards.length} cards onto {flat.length} slides. Adding a slide kind means
          teaching <code>walkCards()</code> in <code>src/admin/fields.ts</code> about it too.
          Nothing is shown rather than showing every slide against the wrong number.
        </p>
      </div>
    );
  }

  return (
    <>
      <header className={s.head} ref={head}>
        <h1 className={s.deckName}>{boot.name}</h1>
        <span className={s.meta}>
          {cards.length} slides{DOT}base {boot.sha}{DOT}{cut.size} cut{DOT}{edits.length} edits
          {moved ? `${DOT}reordered` : ""}{jobEdits.length ? `${DOT}${jobEdits.length} story` : ""}
          {comments.length ? `${DOT}${comments.length} ${comments.length === 1 ? "comment" : "comments"}` : ""}
        </span>
        <span className={s.spacer} />
        <button
          className={commenting ? s.on : ""}
          aria-pressed={commenting}
          disabled={view === "story"}
          title="Click a slide to pin a comment to that spot (M)"
          onClick={() => setCommenting((c) => !c)}
        >Comment <span className={s.kbd}>M</span></button>
        <button onClick={undo} disabled={!history.length}>Undo</button>
        <a className={s.back} href="/admin">All decks</a>
        <button className={view === "sheet" ? s.on : ""} onClick={() => setView("sheet")}>Contact sheet</button>
        <button className={view === "rows" ? s.on : ""} onClick={() => setView("rows")}>Rows</button>
        <button className={view === "story" ? s.on : ""} onClick={() => setView("story")}>Story</button>
        <button className={s.go} onClick={() => setShown(true)}>Copy for Claude</button>
        {commenting && (
          <div className={s.hint}>
            Comment mode. Click anywhere on a slide to pin a numbered comment there; click a dot to
            edit it. Dragging is off until you leave with M or Esc.
          </div>
        )}
      </header>

      {stale > 0 && (
        <div className={s.stale}>
          <span>
            <b>{stale} {stale === 1 ? "comment was" : "comments were"} placed on an earlier build of this deck.</b>{" "}
            A slide may have moved under its dot. Each one still quotes what it pointed at, and the
            paste marks it, so check it or clear them once they are applied.
          </span>
          <button onClick={clearComments}>Clear comments</button>
        </div>
      )}

      {view === "story" ? <Story deck={deck} cards={cards} edit={edit} /> : (
      <div className={s.wrap}>
        {/* Here rather than in the header, which is already one button from wrapping at 1440px,
            and because it only means anything in this view. */}
        {view === "rows" && (
          <div className={s.sizeBar}>
            <span>Slide size</span>
            <div className={s.seg} role="group" aria-label="Slide size">
              {SIZES.map((z) => (
                <button
                  key={z}
                  className={size === z ? s.on : ""}
                  aria-pressed={size === z}
                  title={`${{ s: "Small", m: "Medium", l: "Large" }[z]} slides (S cycles)`}
                  onClick={() => setSize(z)}
                >{z.toUpperCase()}</button>
              ))}
            </div>
          </div>
        )}
        <div className={view === "sheet" ? s.sheet : s.rows} data-size={size}>
          {order.map((o, pos) => {
            const card = cards[o];
            const isCut = cut.has(o);
            return (
              <div
                key={o}
                className={`${s.card}${isCut ? ` ${s.isCut}` : ""}${card.fixed ? ` ${s.fixed}` : ""}${view === "rows" ? ` ${s.row}` : ""}${pos === dragPos ? ` ${s.dragging}` : ""}`}
                draggable={!card.fixed && !commenting}
                onDragStart={() => { snapshot(); drag.current = pos; setDragPos(pos); }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (drag.current !== null && drag.current !== pos) {
                    move(drag.current, pos);
                    drag.current = pos;
                    setDragPos(pos);
                  }
                }}
                onDragEnd={() => { drag.current = null; setDragPos(null); }}
                onDrop={(e) => { e.preventDefault(); drag.current = null; setDragPos(null); }}
              >
                {/* One box for the thumbnail and its footer, so the rows view can pin them as a
                    unit; as two grid items they would stick separately and the footer would
                    scroll away from its slide. */}
                <div className={s.side}>
                <Lazy className={s.thumbHost}>
                  <Thumb layer={
                    <DotLayer
                      comments={comments.filter((c) => c.origin === o + 1)}
                      numbers={numbers}
                      draft={draft?.comment.origin === o + 1 ? draft : null}
                      placing={commenting}
                      stalePrint={print}
                      onOpen={(c) => setDraft({ comment: { ...c }, isNew: false })}
                      onPlace={(e, stage) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        const pct = (v: number) => Math.round(Math.min(100, Math.max(0, v * 100)) * 10) / 10;
                        setDraft({
                          isNew: true,
                          comment: {
                            id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                            at: Date.now(),
                            origin: o + 1,
                            slide: card.path,
                            says: clip(card.says),
                            x: pct((e.clientX - r.left) / r.width),
                            y: pct((e.clientY - r.top) / r.height),
                            ...describePoint(stage, e.clientX, e.clientY, card, deck, base),
                            text: "",
                            base: boot.sha,
                            print,
                          },
                        });
                      }}
                    />
                  }><SlideBody slide={flat[o]} deck={deck} toc={toc} /></Thumb>
                </Lazy>
                <div className={s.bar}>
                  <span className={s.grip} aria-hidden="true">&#x283f;</span>
                  <span className={s.num}>
                    {o === pos ? pos + 1 : <><b>{pos + 1}</b>&#x2190;{o + 1}</>}
                  </span>
                  <span className={s.kind}>{card.kind}</span>
                  <span className={s.name}>{card.label}</span>
                  {!card.fixed && (
                    <button onClick={() => {
                      snapshot();
                      setCut((c) => {
                        const n = new Set(c);
                        n.has(o) ? n.delete(o) : n.add(o);
                        return n;
                      });
                    }}>{isCut ? "Restore" : "Cut"}</button>
                  )}
                </div>
                </div>
                {view === "rows" && (
                  card.fields.length ? (
                    <div className={s.fields}>
                      {card.fields.map((f) => {
                        const value = String(getPath(deck, f.path) ?? "");
                        const changed = value !== (originalCards[o].fields.find((g) => g.path === f.path)?.value ?? "");
                        return (
                          <div key={f.path} className={`${s.f}${changed ? ` ${s.changed}` : ""}`}>
                            <label htmlFor={f.path}>{f.label}</label>
                            {f.multiline
                              ? <textarea id={f.path} rows={Math.min(6, Math.max(2, Math.ceil(value.length / 60)))}
                                          value={value} onChange={(e) => edit(f.path, e.target.value)} />
                              : <input id={f.path} value={value} onChange={(e) => edit(f.path, e.target.value)} />}
                          </div>
                        );
                      })}
                    </div>
                  ) : <div className={s.empty}>No editable copy on this slide.</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      )}

      {draft && (
        <Popover
          draft={draft}
          number={numbers.get(draft.comment.id)
            ?? comments.filter((c) => c.origin === draft.comment.origin).length + 1}
          stale={draft.comment.print !== print}
          onText={(text) => setDraft((d) => (d ? { ...d, comment: { ...d.comment, text } } : d))}
          onSave={() => saveDraft(draft)}
          onCancel={() => setDraft(null)}
          onDelete={() => {
            setComments((cs) => cs.filter((c) => c.id !== draft.comment.id));
            setDraft(null);
          }}
        />
      )}

      {shown && (
        <div className={s.scrim} onClick={() => setShown(false)}>
          <div className={s.dialog} onClick={(e) => e.stopPropagation()}>
            <div className={s.dialogHead}>
              <b>Paste this into Claude Code</b>
              <span className={s.spacer} />
              {/* Here rather than in the header: the moment after copying is when comments become
                  done, and the header was already one button from wrapping. */}
              {comments.length > 0 && <button onClick={clearComments}>Clear comments</button>}
              <button className={s.go} onClick={() => navigator.clipboard.writeText(payload)}>Copy</button>
              <button onClick={() => setShown(false)}>Close</button>
            </div>
            <pre>{payload}</pre>
          </div>
        </div>
      )}
    </>
  );
}
