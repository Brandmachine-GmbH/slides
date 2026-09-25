import { useLayoutEffect, useRef } from "react";
import type { Deck } from "@engine/types";
import type { Card } from "./fields";
import { getPath } from "./fields";
import s from "./edit.module.css";

// Story mode: the deck as an argument rather than as slides.
//
// The contact sheet and the rows view answer "what is on it". This one answers "what is it
// trying to do", which is the question that goes stale silently: copy gets rewritten a dozen
// times over a deck's life and the reason each slide exists is never written down anywhere, so
// the fifth revision of a headline can be perfectly good and no longer do the job it was there
// for. Every slide's job sits here with its current headline underneath, which is the only
// place those two are ever next to each other.
//
// It shows NO imagery on purpose. A thumbnail is the most interesting thing on any screen it is
// on, and this view is for hearing whether the jobs read as an argument top to bottom.
//
// It also does not reorder. That gesture belongs to the contact sheet, which already drags, and
// having two places to do it means two mental models of the same list.

interface Group {
  /** Index into deck.sections, or null for the title, the overview and the outro. */
  sec: number | null;
  /** The card that is this chapter's divider, if it has one. Its number is the chapter's. */
  divider?: Card;
  rows: Card[];
}

/** Cards in deck order, cut wherever the section changes. The title and the overview fall out as
 *  a leading group with no chapter, and the outro as a trailing one, which is what they are. */
function group(cards: Card[]): Group[] {
  const out: Group[] = [];
  for (const c of cards) {
    const sec = c.sec ?? null;
    let g = out[out.length - 1];
    if (!g || g.sec !== sec) { g = { sec, rows: [] }; out.push(g); }
    if (c.isDivider) g.divider = c;
    else g.rows.push(c);
  }
  return out;
}

/** A job, typed straight into the page at the size it is read at.
 *
 *  It is a controlled textarea rather than a contenteditable, so state moves through this editor
 *  one way like every other field, and it grows to its content instead of scrolling inside a
 *  fixed box: a job is two lines or five depending on the slide, and a box that guesses is
 *  either clipping the end of a sentence or leaving a blank line under every short one.
 *
 *  Height comes from scrollHeight rather than from counting characters, because characters per
 *  line depend on the width, the size and the face, and the first version of this divided by a
 *  constant and left a blank line under most rows. */
function AutoText({
  value, onChange, className, placeholder,
}: { value: string; onChange: (v: string) => void; className: string; placeholder: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";                       // shrink first, or it only ever grows
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(fit);                            // every render, so typing resizes as you type
  useLayoutEffect(() => {
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <textarea
      ref={ref}
      rows={1}
      className={`${s.jobField} ${className}`}
      placeholder={placeholder}
      spellCheck={false}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Story({
  deck, cards, edit,
}: { deck: Deck; cards: Card[]; edit: (path: string, value: string) => void }) {
  const groups = group(cards);
  const val = (path: string) => String(getPath(deck, path) ?? "");

  const jobless = cards.filter((c) => c.jobPath && !val(c.jobPath).trim()).length;

  return (
    <div className={s.story}>
      <span className={s.storyLbl}>What the meeting has to do</span>
      <AutoText
        className={s.storyDeckJob}
        placeholder="One sentence. What has to be true when everyone stands up."
        value={val("job")}
        onChange={(v) => edit("job", v)}
      />

      {/* The page cannot afford a paragraph explaining itself, so it shows the shape of a row
          once, at the indent every row below uses, and lets them inherit the meaning. */}
      <div className={s.storyKey}>
        <div>The job</div>
        <div>What the slide says now</div>
      </div>

      {groups.map((g, gi) => {
        const sec = g.sec === null ? null : deck.sections[g.sec];
        return (
          <div key={gi} className={s.chapter}>
            {sec && (
              <>
                <div className={s.chName}>
                  <span>{sec.short ?? sec.title}</span>
                  {g.divider && <span className={s.chN}>slide {g.divider.origin}</span>}
                  <span className={s.chN}>
                    {g.rows.length} {g.rows.length === 1 ? "slide" : "slides"}
                  </span>
                </div>
                <AutoText
                  className={s.chJob}
                  placeholder="What this chapter has to do."
                  value={val(`sections[${g.sec}].job`)}
                  onChange={(v) => edit(`sections[${g.sec}].job`, v)}
                />
              </>
            )}

            {g.rows.map((c) => (
              <div key={c.origin} className={s.storyRow}>
                <div className={s.storyNum}>{c.origin}</div>
                {c.jobPath ? (
                  <AutoText
                    className={s.storyJob}
                    placeholder="nothing said here"
                    value={val(c.jobPath)}
                    onChange={(v) => edit(c.jobPath!, v)}
                  />
                ) : (
                  // The outro only. Nothing in deck.ts describes that slide, so there is nowhere
                  // to hang a job, the same reason it can only be unnumbered deck-wide.
                  <div className={s.storyNone}>
                    The engine makes this slide, so there is nowhere to write its job.
                  </div>
                )}
                <div className={s.storySays}>
                  {c.says ? `“${c.says}”` : <i>no type on this slide</i>}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      <p className={s.storyFoot}>
        {jobless > 0 && (
          <b>{jobless} {jobless === 1 ? "slide has" : "slides have"} no job. </b>
        )}
        None of this is compiled into the deck. It never reaches the client.
      </p>
    </div>
  );
}
