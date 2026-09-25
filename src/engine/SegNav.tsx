import { useEffect, useMemo, useRef, useState } from "react";
import { useCoarsePointer } from "./useCoarsePointer";
import type { TocSection } from "./types";
import s from "./SegNav.module.css";

interface Tick { index: number; label: string; }
interface Segment { label: string; firstIndex: number; ticks: Tick[]; }

function buildSegments(toc: TocSection[], flatLength: number): Segment[] {
  const segs: Segment[] = [
    // One tick per slide that exists. buildSlides only emits an overview when a deck has more
    // than one section, so on a single-section deck slide 1 is that section's first slide and
    // a fixed "Overview" tick here would point at it under the wrong name.
    { label: "Intro", firstIndex: 0, ticks:
      toc.length > 1
        ? [{ index: 0, label: "Title" }, { index: 1, label: "Overview" }]
        : [{ index: 0, label: "Title" }] },
  ];
  toc.forEach((sec) => {
    // A section with `divider: false` has no divider slide of its own, so buildSlides points
    // its dividerIndex at its FIRST SLIDE instead. Without this, that slide gets two ticks: one
    // standing for the section and one for itself. React saw two children keyed `2` and the bar
    // drew two dots for one slide.
    const seen = new Set<number>();
    const ticks = [
      { index: sec.dividerIndex, label: sec.title },
      ...sec.items.map((it) => ({ index: it.index, label: it.label })),
    ].filter((t) => {
      if (seen.has(t.index)) return false;
      seen.add(t.index);
      return true;
    });
    segs.push({
      // The bar is a single line that sizes itself to fit every section title, so a title
      // written as a whole sentence stretches it across the screen for the whole meeting.
      // `short` is the deck's answer. The hover tooltip and the Contents panel keep the title.
      label: sec.short ?? sec.title,
      firstIndex: sec.dividerIndex,
      ticks,
    });
  });
  segs.push({ label: "Outro", firstIndex: flatLength - 1, ticks: [
    { index: flatLength - 1, label: "Thank you" },
  ] });
  return segs;
}

interface Props {
  toc: TocSection[];
  flatLength: number;
  current: number;
  onJump: (index: number) => void;
}

/** How close to the bottom edge the pointer has to come before the bar appears. */
const REVEAL_ZONE = 150;

export function SegNav({ toc, flatLength, current, onJump }: Props) {
  // The bar is a presenter's control, not part of the slide, so on a desktop it stays out of
  // the way until the pointer goes looking for it. Touch devices have no hover and no pointer
  // to track, so there it is simply always there.
  const coarse = useCoarsePointer();
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (coarse) return;
    const onMove = (e: PointerEvent) => setNear(e.clientY > window.innerHeight - REVEAL_ZONE);
    // Leaving the window entirely should hide it too, or it sticks open after the pointer has
    // gone somewhere else on the desktop.
    const onLeave = () => setNear(false);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [coarse]);
  const shown = coarse || near;
  const segs = useMemo(() => buildSegments(toc, flatLength), [toc, flatLength]);
  const barRef = useRef<HTMLElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  // The bar sizes to its section titles and scrolls sideways once that exceeds the viewport
  // (SegNav.module.css). Keep the current section visible so it never scrolls out of sight.
  useEffect(() => {
    const bar = barRef.current;
    const seg = activeRef.current;
    if (!bar || !seg || bar.scrollWidth <= bar.clientWidth) return;
    const target = seg.offsetLeft + seg.offsetWidth / 2 - bar.clientWidth / 2;
    bar.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [current, segs]);

  return (
    // Named for the slide transition ONLY while the bar is actually on screen. A named element is
    // painted separately from the page snapshot, which means its rectangle is cut out of that
    // snapshot; for a bar sitting at opacity 0 that left a bright hole across the bottom of the
    // deck for the length of every transition. Unnamed it is simply part of the page, and an
    // invisible thing being pushed sideways with everything else costs nothing.
    <nav
      className={`${s.bar} ${shown ? s.barShown : s.barHidden}`}
      ref={barRef}
      data-vt={shown ? "segnav" : undefined}
      aria-label="Slide navigation"
    >
      {segs.map((seg, n) => {
        const last = seg.ticks[seg.ticks.length - 1].index;
        const active = current >= seg.firstIndex && current <= last;
        return (
          <div key={n} ref={active ? activeRef : undefined} className={`${s.seg}${active ? ` ${s.segActive}` : ""}`}>
            <button className={s.segLabel} title={seg.label} onClick={() => onJump(seg.firstIndex)}>
              {seg.label}
            </button>
            <div className={s.ticks}>
              {active && seg.ticks.map((t) => {
                const cls = t.index === current ? s.tickCur : t.index < current ? s.tickPast : "";
                return (
                  <button
                    key={t.index}
                    className={`${s.tick} ${cls}`}
                    title={t.label}
                    aria-label={t.label}
                    aria-current={t.index === current || undefined}
                    onClick={() => onJump(t.index)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
