import { useContext, useEffect, useRef, useState } from "react";
import type { StoryController } from "./types";
import { BuildProgressCtx } from "./BuildTrack";
import { StepsCtx } from "./buildSteps";

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
 *  The presenter's steps switch (see buildSteps.ts) gives the same answer for the same reason:
 *  with steps off there is still a presenter, but they have said they will not be clicking
 *  through beats. Handled here so that no scene or figure has to know the switch exists.
 *
 *  `max` may start at 0 and grow: a figure cannot count its stages until the file has arrived.
 */
export function useBuildStages(
  max: number,
  controllerRef?: { current: StoryController | null },
): number {
  const [stage, setStage] = useState(1);
  const steps = useContext(StepsCtx);

  const step = useRef<() => boolean>(() => false);
  step.current = () => {
    // Returning false hands the press back to the deck, which moves to the next slide.
    if (!steps || stage >= max) return false;
    setStage((n) => n + 1);
    return true;
  };

  // Steps switched off halfway through a slide: hold everything as shown, so switching them
  // back on does not take beats away again in front of the room. Re-runs as `max` grows.
  useEffect(() => {
    if (!steps) setStage((n) => Math.max(n, max));
  }, [steps, max]);

  useEffect(() => {
    if (!controllerRef) return;
    controllerRef.current = { step: () => step.current() };
    return () => { controllerRef.current = null; };
  }, [controllerRef]);

  // Tell the slide how far through it is, so it can show the presenter how many presses are
  // left (see BuildTrack). Only while presenting: a still has nobody to press anything. With
  // steps off there are no presses left to count, and 0 of 0 is what hides the dots.
  const report = useContext(BuildProgressCtx);
  useEffect(() => {
    if (controllerRef) report?.(steps ? stage : 0, steps ? max : 0);
  }, [report, stage, max, controllerRef, steps]);

  return controllerRef && steps ? stage : max;
}
