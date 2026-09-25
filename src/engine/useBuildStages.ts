import { useContext, useEffect, useRef, useState } from "react";
import type { StoryController } from "./types";
import { BuildProgressCtx } from "./BuildTrack";

/** Reveal in pieces, one presenter click at a time.
 *
 *  Two things in the deck arrive this way and they used to say so separately: a `figure`, whose
 *  .svg tags its own groups `data-build="1"`, `"2"`, and a `scene`, a component that knows how
 *  many stages it has. Both need the same three behaviours, and the third is the one that is
 *  easy to get wrong on the second attempt: claim the deck's stepper while stages remain, hand
 *  it back on the last one (so the click that finishes a drawing does not also skip the slide),
 *  and keep the handle pointing at THIS render's closure rather than the one from mount.
 *
 *  With no controllerRef nothing is being presented: the PDF export and the editor's contact
 *  sheet both render stills, and a still cannot be clicked through, so it gets every stage at
 *  once. That is also why this returns a number rather than a pair. Callers only ever ask "how
 *  much is showing", and answering `max` when there is nobody to click is the whole rule.
 *
 *  `max` may start at 0 and grow: a figure cannot count its stages until the file has arrived.
 */
export function useBuildStages(
  max: number,
  controllerRef?: { current: StoryController | null },
): number {
  const [stage, setStage] = useState(1);

  const step = useRef<() => boolean>(() => false);
  step.current = () => {
    if (stage >= max) return false;
    setStage((n) => n + 1);
    return true;
  };

  useEffect(() => {
    if (!controllerRef) return;
    controllerRef.current = { step: () => step.current() };
    return () => { controllerRef.current = null; };
  }, [controllerRef]);

  // Tell the slide how far through it is, so it can show the presenter how many presses are
  // left (see BuildTrack). Only while presenting: a still has nobody to press anything.
  const report = useContext(BuildProgressCtx);
  useEffect(() => {
    if (controllerRef) report?.(stage, max);
  }, [report, stage, max, controllerRef]);

  return controllerRef ? stage : max;
}
