# Building your own slide pieces: staged figures, scenes, mockups

Read this when a slide needs to do more than show a picture: build in steps, light what the
cursor points at, play something, or run real software. There are three ways, from cheapest to
most work. Pick the cheapest one that carries the argument; "there should be very few scenes"
is a rule, not modesty.

| | What it is | Who can make it | Can do |
| --- | --- | --- | --- |
| **Staged figure** | an `.svg` in the deck's `images/`, on a `stack` slide | anyone who can draw an SVG | appear one press at a time, hover a stage |
| **Scene** | a React component in `decks/<deck>/scenes/`, filled with copy from `deck.ts` | someone who writes React | anything: build, hover, lay out live, animate, canvas |
| **Mockup** | a React embed of real software in the site's `mockups/` | someone porting a real UI | run a product demo chapter by chapter |

## Staged figures

Tag groups inside the SVG with `data-build="1"`, `"2"`, and so on. Stage 1 is on screen on
arrival; each press of Space shows the next; once all are shown the next press moves on. Groups
that should land together share a number. Staged groups are also hoverable: the one under the
cursor comes to full strength and the rest sit back, so the presenter can say "this one". The PDF
prints every stage. A figure without `data-build` groups is one still object.

Figure rules (repeated because they fail silently): colour with `fill="currentColor"` or
`style="fill:var(--ink)"`, never a bare `fill="var(--ink)"`; no XML comments (the file ships byte
for byte); keep to the four figure type sizes in design.md.

**Canvas.** A figure is fitted to the width of the slide's content area, 1136px (1280 minus the
slide's 72px side margins), and to whatever height the heading leaves, about 560px under a
one-line title. Draw on a `viewBox` about 1000 to 1136 wide, as tall as the drawing needs; a
wide, shallow drawing (the example's is 1000x200) sits comfortably under a heading. Because the
figure scales, the type sizes are in viewBox units: draw at roughly 1:1 so they come out at the
sizes in design.md.

## Scenes

### The contract

A scene is a component that receives `SceneProps` and nothing else:

```ts
interface SceneProps {
  steps: SceneStep[];      // { tag, title, note?, ours?, at?, icon?, image? }, from deck.ts
  claim?: SceneClaim;      // { text, from?, to? }: a closing line, optionally under a span of steps
  answer?: SceneStep;      // a payoff figure, for scenes that reveal one
  months?: number;         // one scene's own field; ignored by the rest
  controllerRef?: { current: StoryController | null };
}
```

Register it in the deck's own `scenes/index.ts`, lazily, so a deck that does not use it never
downloads it:

```ts
import { lazy } from "react";
import type { ComponentType } from "react";
import type { SceneProps } from "@brandmachine/slides";

const scenes: Record<string, ComponentType<SceneProps>> = {
  "timeline": lazy(() => import("./Timeline")),
};
export default scenes;
```

Then use it from `deck.ts`:

```ts
{ type: "scene", name: "timeline", eyebrow: "History", title: "Three years, one direction.",
  steps: [
    { tag: "2019", note: "Founded", title: "Two people and a prototype" },
    { tag: "2022", note: "First customer", title: "In production every week" },
    { tag: "2025", note: "Today", title: "Forty brands" },
  ] }
```

`decks/example/scenes/Chain.tsx` in a fresh site is the minimal worked example: one box per
press, hover lighting, and the claim as its own last beat. The build checks every scene name a
deck uses and fails on one that does not exist.

The engine ships **no built-in scenes**: every scene is the site's own. `answer` and `months` on
`SceneProps` are fields some scenes read and others ignore, not a sign that a scene already
exists. Two decks may each register the same name for their own component; only a deck name
that collides with an engine scene fails the build.

### The box a scene gets

The engine draws the slide's eyebrow, `title` and `note` itself, at the top, and renders the
scene below them inside a **flex column**: the slide is 1280x720 with 42px top and bottom and
72px side padding, so the scene is **1136px wide**, and about **560px tall under a one-line
title** (less under two lines or a note). The scene's root is a flex child, so give it
`flex: 1 1 auto; min-height: 0;` to fill the height, or it is only as tall as its content and
sits centred. The engine wraps the lazy import in a `Suspense` fallback and the PDF waits for
it, so you do not handle loading.

### Tokens a scene uses

Colours, all flipped by the dark switch:

| Token | For |
| --- | --- |
| `--ink` | type and the strongest mark; also the fill of a "lit" box |
| `--on-ink` | type on an `--ink` fill. Defined only for the dark ground, so always read it with a fallback: `color: var(--on-ink, #fff)` |
| `--copy-ink` | body copy |
| `--muted`, `--note-ink` | labels, secondary lines |
| `--orange` | the accent (whatever the site set it to) |
| `--card-face`, `--card-edge`, `--card-edge-low`, `--card-lift` | a raised card |
| `--hairline` | a rule or axis |
| `--stage-ground` | the slide's ground colour |

Sizes are the eight `--type-*` steps in design.md: `--type-title` for a figure that is a big
numeral inside a drawing, `--type-display` only for the single answer a scene builds to.
Typefaces: `h2` and `h3` elements already get the heading serif and the body gets the sans, so
use an `h3` for a box heading rather than setting `font-family` yourself. The build's type check
reads `font-size:` declarations; do not use the `font:` shorthand or `em` sizes to get round it.
The full list of tokens is `node_modules/@brandmachine/slides/src/engine/tokens.css`.

### The three rules every scene follows

1. **Copy lives in `deck.ts`, never in the component.** Read words from `steps[].tag / title /
   note`, `claim.text` and `answer`. The admin editor edits a slide's copy by walking exactly
   those fields, so a scene that keeps its words there is editable the day it is written. The
   editor cannot draw a deck-local scene (it shows a placeholder card), but the copy stays
   editable.
   - **Need a field the type does not have?** Give an existing field a local reading first and
     document it at the top of the component: `tag` routing each step to a part of the drawing
     ("count", "loop", "pass"), a step *with* an `image` being a pillar and one *without* being a
     chip, `answer.title` holding a comma-separated list. A new engine field for one drawing is
     what deck-local scenes exist to avoid.
   - **Words are copy, marks are drawing.** Anything someone might want to reword goes in
     `deck.ts`. The drawing's own punctuation (the `×` and `=` of a sum, an arrow, a "?") can
     live in the component.
2. **No `controllerRef` means a still.** The PDF and the editor's thumbnails render a scene with
   no `controllerRef`. Show the finished state and light nothing, because a still has no "the one
   I am on".
3. **Every colour comes from a token, every size from the type scale** (tables above). The dark
   switch flips tokens and nothing else, so a literal hex, white included, stays light-mode
   forever. The one exception is a
   colour *of a photograph* (a measured backdrop swatch), which must not follow the switch; write
   a comment saying so. Scene CSS modules may not set a raw `font-size` (the build fails).

### Stepping: useBuildStages

```tsx
import { useState } from "react";
import { useBuildStages, type SceneProps } from "@brandmachine/slides";
import s from "./Timeline.module.css";

export default function Timeline({ steps, controllerRef }: SceneProps) {
  const live = !!controllerRef;
  const stage = useBuildStages(steps.length, controllerRef); // 1..max while presenting, max in a still
  const [hover, setHover] = useState<number | null>(null);
  const lit = hover ?? (live ? stage - 1 : null);

  return (
    <div className={s.row}>
      {steps.map((st, i) => (
        <div key={i}
          className={`${s.item} ${live && i >= stage ? s.pending : ""} ${lit === i ? s.lit : ""}`}
          onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          <p className={s.tag}>{st.tag}</p>
          <p className={s.title}>{st.title}</p>
        </div>
      ))}
    </div>
  );
}
```

`useBuildStages(max, controllerRef)` returns **how many stages are showing**, counting from 1:
stage 1 is on screen when the slide arrives, each press adds one, and `max` is everything. So
"item `i` is shown" is `i < stage`, and "the extra beat after `n` items is shown" is
`stage > n`. It claims Space while stages remain and hands it back on the last one, so the press
that finishes a drawing does not also skip the slide. It draws the "presses left" dots for the
presenter, and it returns `max` in a still and when the presenter has turned steps off (`s`), so
no scene needs to know that switch exists. `max` may start at 0 and grow.

If the first thing should arrive on a press rather than with the slide, add an empty stage 1 (a
`max` one higher, and show item `i` when `i < stage - 1`).

### Patterns that worked

- **One item per press, cursor lights the item.** The basic shape above. The lit item fills
  dark with white type; hover overrides the current stage, so the presenter can go back to any
  item by pointing.
- **Held back, or hidden.** A pending item at low opacity (about 0.15) keeps the shape of the
  whole drawing on screen from the first press, so nothing jumps as it fills in. Fully hidden
  (opacity 0, with the space still reserved) is right when the reveal itself is the point.
- **The claim is its own beat.** Stages = `steps.length + 1`, with the last press bringing in
  `claim` (and whatever marks which parts are yours, `ours: false` drawing dashed and grey).
  The chain first, then the argument about it, so the argument never arrives by accident.
- **Hold on a question.** For arithmetic: one factor per press, the "= ?" arriving with the last
  factor, then nothing until the presenter is ready, so they can ask the room and let someone
  guess. The answer comes on the final press, ideally in a unit people feel (months of a person
  drawn as a calendar filling, rather than a count of hours). Make the data honest: if the sum is
  4.8 months, draw 4.8, not 5.
  The skeleton, with the factors in `steps` (`title` the number, `tag` its label) and the answer
  in `answer`:
  ```tsx
  export default function Sum({ steps, answer, controllerRef }: SceneProps) {
    const live = !!controllerRef;
    const stage = useBuildStages(steps.length + 1, controllerRef); // a factor per press, then the answer
    const solved = !live || stage > steps.length;
    const asking = live && stage === steps.length;                 // "= ?" rides in with the last factor
    return (
      <div className={s.scene}>
        <div className={s.sum}>                                   {/* align-items: baseline */}
          {steps.map((st, i) => (
            <Fragment key={i}>
              {i > 0 && <span className={`${s.op} ${!live || i < stage ? "" : s.hidden}`}>×</span>}
              <div className={!live || i < stage ? "" : s.hidden}>
                <p className={s.value}>{st.title}</p><p className={s.label}>{st.tag}</p>
              </div>
            </Fragment>
          ))}
          <span className={`${s.op} ${asking || solved ? "" : s.hidden}`}>=</span>
          <p className={s.value}>{solved ? answer?.title : asking ? "?" : ""}</p>
        </div>
      </div>
    );
  }
  ```
  Lay the row out on a shared baseline (`display: flex; align-items: baseline`), with each
  number and its label stacked in their own column, so numbers, operators and the answer sit on
  one line. Fill a calendar or bar with `--muted` or graphite rather than full `--ink`, so it does
  not outshout the answer.
- **Positions the deck owns.** On a time axis a position is a claim, so the deck sets `at` (0 to
  100, a percentage of the axis) and the scene places steps there. Building right to left (today
  first, then each earlier stop arriving with the time it saves measured underneath) makes "this
  happens weeks earlier" the thing the room watches.
- **A timeline of dated facts** instead of a row of cards: `tag` the year above an axis, a dot
  per moment, the newest dot in the accent.
- **An act that plays itself.** For a beat that should be felt rather than read (a flood of
  names arriving faster than anyone can follow, a text being rewritten until it is unreadable):
  the act starts on arrival, takes no presses, and settles into a still the presenter can talk
  over. Spell out the timing curve in a comment rather than tuning by feel. Start the first beat
  **at least 500ms after mount**: mount happens inside the slide transition, so an earlier beat
  lands while the dissolve is still running and reads as the deck stuttering. In a still, land on
  the finished state at once. Respect `prefers-reduced-motion`. Mechanics:
  - Do **not** call `useBuildStages`. A scene that never claims the presenter's key leaves Space
    to the deck (the next press moves on) and draws no "presses left" dots.
  - Read `controllerRef` only as "am I being presented": `const live = !!controllerRef`. Live,
    run the act; not live (PDF, editor), render the settled end state.
  - Design the settled state as its own composition, because it is what the PDF prints and what
    the room looks at while the presenter talks. A pile that arrived chaotically can still settle
    into something that reads as a pile, not a tidy grid.
  - Every `SceneStep` needs a `tag`. When a step has nothing to show there (a bare name in a
    flood), use `tag` as an undrawn grouping label or an empty string, and say so in the
    component's header comment.
  ```tsx
  export default function Flood({ steps, controllerRef }: SceneProps) {
    const live = !!controllerRef;
    const [shown, setShown] = useState(live ? 0 : steps.length);
    useEffect(() => {
      if (!live || matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(steps.length); return; }
      let n = 0, t: number;
      const tick = () => { setShown(++n); if (n < steps.length) t = window.setTimeout(tick, Math.max(40, 400 * 0.85 ** n)); };
      t = window.setTimeout(tick, 500); // after the slide transition, never inside it
      return () => clearTimeout(t);
    }, [live, steps.length]);
    // ...draw steps.slice(0, shown) at seeded positions
  }
  ```
- **Deterministic, never random.** Scatter positions seeded from the index (for example
  `fract(sin((i + 1) * n) * 43758.5453)`), so the slide looks the same every time it is presented
  and one bad roll cannot stack three labels on top of each other in front of a client.
- **Lay out from the data.** Compute geometry from `steps.length` so adding or cutting a step in
  `deck.ts` is a copy edit, not a geometry edit.
- **One act, several frames.** When two slides show the same animation in different frames
  (three ideas on one slide, or one per slide), put the act itself in `scenes/lib/` and have
  both scenes import it, so the two cannot drift apart. Files in `scenes/lib/` are not
  registered as scenes.
- **SVG drawn in the component.** Measure the box the slide gives a scene under its heading and
  set the `viewBox` to exactly that, so nothing letterboxes; keep `preserveAspectRatio` at its
  default (`meet`) so a title that wraps to two lines scales the drawing down instead of cropping
  it.
- **Canvas.** Read colours at draw time with `cssToken("--ink")`, and add `useColorScheme()` to
  the draw's dependencies, because a canvas does not repaint when the presenter flips the ground.
  Both are exported from `@brandmachine/slides`.
- **Real pictures in steps.** `image` on a step (a path relative to the deck) lets a scene show
  what each step produces instead of naming it. Follow one product through every step.
- **Write the reasoning at the top of the component**: what the slide used to be and why it was
  replaced, why it builds in this order, which fields it reads and how, and what it must not be
  restyled into. The next person to touch it will otherwise rebuild the version that already
  failed.

### Testing a scene

`slides check`, `slides build` and `slides pdf` only ever see the still (no `controllerRef`),
so they prove the finished state and nothing about the build-up or the timing. To see it run,
the deck has to be presented: `npx slides dev <deck>` (or `slides serve --build`), then click
through the slide with Space, and check three things: every press does one visible thing, the
last press moves on to the next slide, and nothing starts while the slide is still dissolving
in. Who starts the server is the person's call (SKILL.md, "Check, preview, export"); if you
cannot run it, say plainly that the live behaviour is untested and ask them to click through.
`npx slides motion <deck>` measures the transition into the slide but not what a scene does
after it has arrived.

### Deck-local or engine

A scene belongs to a deck. Two decks that want the same drawing each keep a copy, free to
diverge: coupling them means you cannot retune one meeting without touching the other, and it
would put one client's component in every other client's bundle. Only a drawing that is
genuinely general belongs in the engine (`src/engine/scenes/`, a pull request on the engine
repo), and the gain is that the editor can draw it live. A name claimed by both fails the build.

## Mockups: real software, driven by the presenter

A mockup slide runs an actual product interface inside the deck: it lands static, and each press
of Space plays one chapter (upload, plan, results), so the demo happens on the presenter's beat.
Once the chapters run out, the next press moves on. The arrow keys always leave, so a demo never
traps the presenter.

**Registry.** `mockups/index.ts` at the site root maps a name to a lazy component:

```ts
import { lazy, type ComponentType } from "react";
import type { EmbedProps } from "@brandmachine/slides";

const MOCKUPS: Record<string, ComponentType<EmbedProps>> = {
  "my-app": lazy(() => import("./MyAppEmbed")),
};
export default MOCKUPS;
```

Lazy matters most here: a product UI usually pulls in animation and icon libraries, and a deck
without a mockup slide must not download them.

**The contract.** The embed receives `EmbedProps`:

- `assetBase`: the deck-local folder its images were copied into (`assets: "images/my-app"` on
  the slide). Copy every picture the demo needs into the deck, so it runs with no network in
  the room. If the UI resolves image paths on its first render, set the base before first paint
  (not in an effect), or every tile points at the wrong path until something re-renders.
- `controllerRef`: publish `{ step, goTo }`. `step()` plays the next chapter and returns `true`,
  or returns `false` when there is nothing left, which hands the press back to the deck. **While
  a chapter is still playing, swallow the press (return `true` and do nothing)**, so a fast
  presenter cannot skip a chapter's timeline and land on the next having shown nothing.
  `goTo(i)` jumps to a chapter.
- `onChapters(chapters)`: call it once on mount with `[{ title, copy? }]`. The deck draws its own
  numbered chapter bar bottom left from it: the running chapter lit, played ones filled, each
  clickable to jump back.
- `onSectionChange(i)`: call it when a chapter starts, so the bar lights the right one.

**Mount static.** Arrive on the first chapter's starting screen and stay there until the first
press, so the presenter can say what the room is looking at before anything moves.

**In the PDF** (no `controllerRef`), render the finished board.

**Size.** The mockup frame is 1280x816 on a 1280x720 slide, so keep the slide's title to one line:
every line of type is taken off the software.

**Vendoring from a website.** When the UI comes from another codebase (a marketing site's
interactive demo), keep the original view file unchanged beside your slide version
(`MyApp.tsx` and `MyAppEmbed.tsx`), so refreshing the snapshot later is a diff, and write at the
top of the embed exactly what differs (no page navigation, a `controllerRef`, the asset base).
Expect it to drift from the source, and refresh it on purpose.
