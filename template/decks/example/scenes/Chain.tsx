/* A worked example of a deck-local scene.
 *
 * It exists to show the contract rather than to be reused: `steps` arrives from deck.ts, one
 * box appears per press, and the box under the cursor lights so a presenter can say "this one"
 * without a laser pointer. Copy stays in deck.ts, which is why the editor can still edit this
 * slide's words while showing a placeholder card where the drawing would be.
 *
 * The claim is a beat of its own, after the last box: the chain first, then the point about it,
 * so the point never arrives by accident alongside a box.
 *
 * Every size here comes from tokens.css. `slides build` fails on a raw px font-size in a scene
 * stylesheet, deliberately: a drawing written for one slide is exactly where a ninth type size
 * gets invented. */
import { useState } from "react";
import { useBuildStages, type SceneProps } from "@brandmachine/slides";
import s from "./chain.module.css";

export default function Chain({ steps, claim, controllerRef }: SceneProps) {
  // No controllerRef means nobody is driving: the PDF and the editor's thumbnails. Both want
  // every box up and nothing lit, because a still has no "the one I am on".
  const stage = useBuildStages(steps.length + (claim ? 1 : 0), controllerRef);
  const driven = !!controllerRef;
  const [hover, setHover] = useState<number | null>(null);
  const lit = hover ?? (driven && stage <= steps.length ? stage - 1 : null);
  const claimShown = !driven || stage > steps.length;

  return (
    <div className={s.scene}>
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
      {claim && <p className={`${s.claim} ${claimShown ? "" : s.hidden}`}>{claim.text}</p>}
    </div>
  );
}
