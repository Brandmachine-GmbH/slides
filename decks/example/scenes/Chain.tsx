/* A worked example of a deck-local scene.
 *
 * It exists to show the contract rather than to be reused: `steps` arrives from deck.ts, one
 * box appears per press, and the box under the cursor lights so a presenter can say "this one"
 * without a laser pointer. Copy stays in deck.ts, which is why the editor can still edit this
 * slide's words while showing a placeholder card where the drawing would be.
 *
 * Every size here comes from tokens.css. `make build` fails on a raw px font-size in a scene
 * stylesheet, deliberately: a drawing written for one slide is exactly where a ninth type size
 * gets invented. */
import { useState } from "react";
import type { SceneProps } from "@engine/types";
import { useBuildStages } from "@engine/useBuildStages";
import s from "./chain.module.css";

export default function Chain({ steps, controllerRef }: SceneProps) {
  // No controllerRef means nobody is driving: the PDF and the editor's thumbnails. Both want
  // every box up and nothing lit, because a still has no "the one I am on".
  const stage = useBuildStages(steps.length, controllerRef);
  const driven = !!controllerRef;
  const [hover, setHover] = useState<number | null>(null);
  const lit = hover ?? (driven ? stage - 1 : null);

  return (
    <div className={s.row}>
      {steps.map((step, i) => (
        <div
          key={step.title}
          className={`${s.box} ${driven && i >= stage ? s.pending : ""} ${lit === i ? s.lit : ""}`}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
        >
          <p className={s.tag}>{step.tag}</p>
          <h3 className={s.title}>{step.title}</h3>
          {step.note && <p className={s.note}>{step.note}</p>}
        </div>
      ))}
    </div>
  );
}
