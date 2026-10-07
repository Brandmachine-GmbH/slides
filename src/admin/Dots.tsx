import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Comment } from "./comments";
import s from "./edit.module.css";

// The comment dots over a thumbnail, and the one popover that edits them.
//
// The layer sits over the stage rather than inside it. The stage is the slide at 1280x720,
// scaled; a dot drawn in there would scale with it and be a third of its size in the rows view.
// Over it, a dot is the same size at every thumbnail width and only its position is relative.

/** The comment being written or edited. A new one is NOT in the list until it is saved, so
 *  cancelling it is just dropping the draft, and an abandoned click leaves nothing behind. */
export interface Draft { comment: Comment; isNew: boolean }

export function DotLayer({
  comments, numbers, draft, placing, stalePrint, onPlace, onOpen,
}: {
  comments: Comment[];
  numbers: Map<string, number>;
  draft: Draft | null;
  placing: boolean;
  stalePrint: string;
  onPlace: (e: React.MouseEvent<HTMLDivElement>, stage: HTMLElement) => void;
  onOpen: (c: Comment) => void;
}) {
  const shown = draft?.isNew ? [...comments, draft.comment] : comments;
  return (
    <div
      className={`${s.dots}${placing ? ` ${s.placing}` : ""}`}
      onClick={placing ? (e) => {
        const stage = e.currentTarget.parentElement?.querySelector<HTMLElement>("[data-stage]");
        if (stage) onPlace(e, stage);
      } : undefined}
    >
      {shown.map((c) => {
        const isDraft = draft?.comment.id === c.id;
        const n = numbers.get(c.id) ?? comments.length + 1;
        const old = c.print !== stalePrint;
        return (
          <button
            key={c.id}
            type="button"
            data-dot={c.id}
            className={`${s.dot}${isDraft ? ` ${s.dotOn}` : ""}${old ? ` ${s.dotOld}` : ""}`}
            style={{ left: `${c.x}%`, top: `${c.y}%` }}
            title={c.text || undefined}
            aria-label={`Comment ${n}${c.text ? `: ${c.text}` : ""}`}
            // A dot sits inside a draggable card, and the browser starts that drag from the card,
            // so draggable={false} or onDragStart on the button never sees it. Cancelling the
            // mousedown is what stops a slightly moved click from reordering the deck.
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => { e.stopPropagation(); onOpen(c); }}
          >{n}</button>
        );
      })}
    </div>
  );
}

const W = 288;
const GAP = 10;

/** Fixed to the viewport and positioned from the dot, rather than rendered beside it: every card
 *  clips its thumbnail (overflow: hidden is what makes it a frame), so anything drawn inside the
 *  card would be cut off at the edge of a 268px slide. */
export function Popover({
  draft, number, stale, onText, onSave, onCancel, onDelete,
}: {
  draft: Draft;
  number: number;
  stale: boolean;
  onText: (t: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const c = draft.comment;

  useLayoutEffect(() => {
    const place = () => {
      const dot = document.querySelector(`[data-dot="${c.id}"]`);
      const el = box.current;
      if (!dot || !el) return;
      const r = dot.getBoundingClientRect();
      const h = el.offsetHeight;
      let left = r.right + GAP;
      if (left + W > innerWidth - 8) left = Math.max(8, r.left - GAP - W);
      const top = Math.min(Math.max(8, r.top - 12), innerHeight - h - 8);
      setPos({ left, top });
    };
    place();
    // Capture, so a scroll inside any container moves it too, not only the window's.
    addEventListener("scroll", place, true);
    addEventListener("resize", place);
    // The thumbnail can change size with the window unchanged (the rows view's S/M/L), which
    // moves the dot without firing either event above.
    const layer = document.querySelector(`[data-dot="${c.id}"]`)?.parentElement;
    const ro = new ResizeObserver(place);
    if (layer) ro.observe(layer);
    return () => {
      removeEventListener("scroll", place, true);
      removeEventListener("resize", place);
      ro.disconnect();
    };
  }, [c.id]);

  // Caret at the end on an existing comment: reopening one is almost always to add to it.
  // Keyed on `placed` because the box is visibility: hidden until it has been measured, and a
  // hidden textarea refuses focus, so the first keystroke went to the page instead, where an
  // `m` in the comment toggled comment mode.
  const area = useRef<HTMLTextAreaElement>(null);
  const placed = pos !== null;
  useEffect(() => {
    const t = area.current;
    if (t && placed) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
  }, [c.id, placed]);

  return (
    <div
      ref={box}
      className={s.pop}
      data-popover
      role="dialog"
      aria-label={`Comment ${number} on slide ${c.origin}`}
      style={pos ? { left: pos.left, top: pos.top, width: W } : { visibility: "hidden", width: W }}
    >
      <div className={s.popHead}>
        <span className={s.popNum}>{number}</span>
        <b>Slide {c.origin}</b>
        {stale && <span className={s.popOld}>earlier build</span>}
      </div>
      <div className={s.popOn}>
        {c.target ? <>on {c.target}</> : "on empty space"}
        {c.field && <code>{c.field}</code>}
      </div>
      <textarea
        ref={area}
        rows={3}
        value={c.text}
        placeholder="What should change here?"
        onChange={(e) => onText(e.target.value)}
        onKeyDown={(e) => {
          // Enter saves because a comment is a sentence, not a document; Shift+Enter still
          // breaks a line for the rare one that needs two.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (c.text.trim()) onSave();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
        }}
      />
      <div className={s.popBar}>
        {!draft.isNew && <button type="button" onClick={onDelete}>Delete</button>}
        <span className={s.spacer} />
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="button" className={s.on} disabled={!c.text.trim()} onClick={onSave}>Save</button>
      </div>
    </div>
  );
}
