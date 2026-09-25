import { createContext, useCallback, useState, type ReactNode } from "react";
import c from "./BuildTrack.module.css";

/** How many beats a slide has, and how many you have played. Bottom left, opposite the number.
 *
 *  Why it exists. Space and PageDown play the next beat of a staged slide; the arrows always move
 *  a whole slide (see the keyboard handler in SlideShow). That split keeps the arrows honest, and
 *  it buys a quiet failure in exchange for the loud one it removes: present with the arrows out of
 *  habit and you sail past a scene without ever playing it, and nothing tells you. Four dots on
 *  arrival, none of them filled, is what tells you.
 *
 *  Not orange, and not clickable. Not orange because a slide spends its one accent on the thing
 *  the room should look at, and that is never the chrome (see STYLE.md). Not clickable because
 *  a stage is only defined going forward: the acts that run themselves on a timer would restart
 *  mid-flight, which reads as a fault rather than as going back. The mockup's chapter bar CAN be
 *  clicked, because a chapter is a real place in a story and knows how to be re-entered.
 *
 *  It reports through a context rather than props because the thing that counts stages is
 *  useBuildStages, which is called by the scene or the figure, several layers under the slide
 *  that has the corner to draw in. Nothing in a deck or a scene has to know about any of this.
 */

/** Set by BuildTrack; called by useBuildStages whenever its count changes. */
export const BuildProgressCtx =
  createContext<((shown: number, total: number) => void) | null>(null);

export function BuildTrack({ children }: { children: ReactNode }) {
  // Null until something below reports, which is also the answer for a still: the PDF export and
  // the editor's contact sheet pass no controllerRef, useBuildStages does not report, and no
  // track is drawn. A printed page cannot be played through, so a count of presses is noise.
  const [p, setP] = useState<{ shown: number; total: number } | null>(null);

  const report = useCallback((shown: number, total: number) => {
    // Same numbers, same object: a figure re-reports on every reveal and an unguarded setState
    // here would re-render the whole slide for no change.
    setP((prev) => (prev && prev.shown === shown && prev.total === total ? prev : { shown, total }));
  }, []);

  return (
    <BuildProgressCtx.Provider value={report}>
      {children}
      {p && p.total > 1 && (
        // aria-hidden: it is a presenter's cue about the remote in their hand, not content.
        <div className={c.track} aria-hidden="true">
          {Array.from({ length: p.total }, (_, k) => (
            <span key={k} className={`${c.dot}${k < p.shown ? ` ${c.dotOn}` : ""}`} />
          ))}
        </div>
      )}
    </BuildProgressCtx.Provider>
  );
}
