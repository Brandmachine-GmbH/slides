# How a deck should look

Read this before choosing pictures, writing a theme, or drawing anything. Three rules are held by
the build (marked **enforced**); the rest is judgement, with the reasoning written down so that
breaking one is a decision.

## One accent colour, once per slide

The engine's accent token is `--orange`; a site sets its own brand colour there in `theme.css`.
A colour that fills a box is not an accent any more, whatever you call it.

- **On any one slide, the accent marks the single thing you want the room to look at**: one
  figure that is the answer, one line that is the argument, the marker for "you are here". If
  you can point at two accent areas, one is wrong.
- **Small uppercase labels are the exception.** The engine draws the eyebrow in the accent, and
  a figure's labels can be too: at label size they read as signposts, not as emphasis, and they
  are not what the rule counts. The rule is about areas and about large type: a filled shape, a
  headline, a big figure. In a lighter register the labels go grey and the accent becomes a dot
  beside them, which leaves it free for the one mark that matters.
- **Not for**: filling a card, a band, a chart series, a progress bar, the active box of a
  diagram, or any area you could measure in inches.
- **Dark against pale is the other emphasis, and it costs nothing.** Reach for ink before colour.
  Handing the accent back to one element makes that element louder than a whole slide of it was.

## One type scale, eight steps · enforced

| Token | Default | What it is |
| --- | --- | --- |
| `--type-display` | 68 | a slide that is only a statement: the title, a section divider |
| `--type-headline` | 40 | the heading of a working slide |
| `--type-title` | 30 | a heading in a tighter frame, and big numerals |
| `--type-subhead` | 24 | a card or box heading inside a slide |
| `--type-body` | 18 | paragraphs, bullets, taglines |
| `--type-note` | 14 | a secondary line under a card, a caption beside a figure |
| `--type-label` | 12 | uppercase labels, footnotes, captions, the slide number |
| `--type-ui` | 11 | the presenter's own controls, which sit over a slide |

The build fails on a raw `font-size` in `theme.css`, a theme, or a scene stylesheet. A theme may
give a step a new value; it may not add a step. **A role names what the type is, not how big it
is here**: a tighter frame steps down the scale and never invents a size between two steps. If a
drawing seems to need a ninth size, the type is usually doing a job that belongs to the slide's
own headline.

Two typefaces at most (the engine's are a serif for headings and figures, a sans for the rest).
No italics for emphasis: use the scale or the colour.

**Colour inside an SVG figure.** Any token works, for fills and strokes alike, written as a
style: `style="fill:var(--ink)"`, `style="stroke:var(--hairline)"`,
`style="fill:var(--muted);fill-opacity:0.5"`, or `fill="currentColor"`. A `var()` in a plain
attribute (`fill="var(--ink)"`, `stroke="var(--ink)"`) is not valid SVG and silently draws
black. Literal hex colours do not follow the dark switch, except a short fixed list of the
engine's own greys that it remaps (the example's `pipeline.svg` uses those); use tokens and the
question never comes up.

**Type inside an SVG figure**: use four sizes and keep them identical across every drawing on the
site, so all figures match: a label (sans, about 11px, semibold, uppercase, letter-spaced, the
accent), a heading (serif, about 26px), body (sans, about 13px) and a caption (sans, about 12px,
lighter grey). A muted label instead of the accent is allowed for one purpose: marking which of
several states is *not* the current one.

## Material

The engine's card tokens (`--card-face`, `--card-edge`, `--card-lift`) are shared by every raised
surface so two cannot drift apart. If a theme restyles them, keep the reasons they look the way
they do: a card face warms very slightly downward (flat white on near-white reads as an
outline), a lift is three shadows (tight contact, short mid, wide ambient; one blurred shadow is
the tell of a box sitting on nothing), and hairlines are warm rather than neutral grey. The PDF
drops shadows on purpose and keeps face and edge; do not compensate by darkening borders.

A lighter register is also legitimate: no raised cards at all, hairlines doing the structure, and
a surface being only a photograph or a flat fill. If the content is dated facts in order, draw a
timeline rather than a row of cards.

## Pictures

- **A picture goes on a slide only when it shows what the slide is talking about.** Ask what it
  is doing there; if the answer is "it looks good", take it off. A full-bleed photograph behind a
  chapter title and a wall of unrelated product shots behind "Product overview" are the two
  classic failures. Chapter slides can be type on white.
- **Follow one product.** Where a slide (or a run of slides) walks through steps, show the same
  item at every step. Four good pictures of four different things read as a mood board, which is
  the opposite of the argument that one thing moves through the whole process.
- **Ideas get drawings, not photographs.** A chapter title is an idea, and a photograph is one
  particular shoot. For a picture table of contents (`thumb` on each section), simple drawings in
  one consistent hand (same medium, same palette, one small accent touch, lots of empty space)
  read as a set. Keep any replacement in the same hand.
- **Type over a picture keeps off the subject**: on the wall, the floor, the sky, never across a
  face or the product.
- **Pictures are not themed.** Photographs and their captions do not change with the light and
  dark switch. Media made on black (a product UI composed on `#000`, a film with a black ground)
  shows as a black rectangle on a light slide, so give it a transparent or light ground if the
  deck may be shown light.
- **Illustrations of your product are labelled as such in the deck's notes.** If a slide draws
  overlays to explain what a product does, keep them looking like drawings, not screenshots,
  unless they are real output.
- Every image that ships is checked for personal metadata (photographer, GPS, serial numbers).
  Strip it rather than work around the check.

## Motion

- **Slides do not cut.** The copy lifts a little and fades in, heading first and body just
  behind; the slide underneath dissolves. No sideways travel: it reads as a slideshow control
  rather than one thought giving way to the next. The dissolve needs the View Transitions API, so
  present from Chrome or Safari 18+; in Firefox the frame cuts and the copy still rises.
- **The base state is the settled state.** In any scene or theme CSS, write every rule as the
  finished position and let keyframes come in *from* an offset. That is what lets the PDF switch
  animation off wholesale and still draw every slide correctly.
- **Entrances on images and videos are opacity only.** Moving or scaling a photograph mid-animation
  makes it soft for the duration; opacity never resamples.
- **Interactivity is rare and earned.** A live demo earns it; an argument the presenter works in
  the room earns it. A slide with three numbers does not. What every slide gets is motion on
  arrival and one thing the cursor can point at, which is not the same as something you operate.
- **Everything respects `prefers-reduced-motion`**, including anything a scene draws on a canvas.
- `npx slides motion <deck>` measures every slide change in a real browser and reports four
  numbers per transition: **late** (an animation that *starts* part-way through a change, the
  usual cause of a stutter), **back** (an element stepping against its own direction), **snap**
  (a jump when the transition hands back to the page) and **drops** (missed frames). It reports
  and never fails. It does not measure what a scene does after it has arrived.

## Density

One idea per slide, in as few words as it takes. Three tiles each carrying a figure, a label and
a paragraph is a wall. The sentence the slide was going to carry goes in `handout`.

## Themes

- **`theme.css`** is the look of every deck on the site. Changing it redraws every deck already
  sent, so a look for one client or one talk is a theme instead.
- **A theme** is `themes/<name>.css`, every rule under `[data-deck-theme="<name>"]` (the build
  fails on any selector not scoped to its own name), chosen with `theme: "<name>"` on the deck,
  on one slide (it *replaces* the deck's theme for that slide, so a slide looks the same in any
  deck), or on a section (its divider only).
- **Do not change the theme of a deck that has been sent.** It redraws what the client already
  has. Start new decks on the new look and leave old ones alone.
- **Light-first or dark-first.** A theme is light-first unless its base rule sets
  `color-scheme: dark`. The presenter's `d` switch means "the other ground": a light slide goes
  dark, a dark-first slide goes to the theme's light variant. A token the theme sets wins on both
  grounds; one it leaves alone follows the ground, so a variant states only what differs:

```css
[data-deck-theme="paper"][data-color-scheme="dark"] { --hairline: #2f3232; }
[data-deck-theme="night"][data-color-scheme="light"] { color-scheme: light; --ink: #1d1d1f; }
```

- **A dark-first theme must set three things** that cannot follow `--ink`: its card colours (or
  light cards sit under light type), `color-scheme: dark` (or inline SVG figures keep black lines
  on black), and `--mark-filter: invert(1)` (or the logo is black on black). Its light variant
  sets them back.
- **On a dark theme, show pictures with `showcase`, not `content`.** The `content` slide's
  600x600 picture card has a fixed light ground and frame that no token reaches, so on black it
  is a bright box. `showcase` (`"split"` or `"full"`) puts the picture straight on the ground.
- **Big type for a stage.** A theme may give the eight steps new values, and a keynote for a hall
  should: for example display 96 to 120, headline 52 to 88, title 48 to 56, leaving body, note and
  label alone because a narrated deck barely uses them. Scale the figure sizes with it (a stage
  deck's figures might use labels around 18 to 20, headings around 36), and keep them identical
  across every figure *of that theme*, which is the rule that matters.
- **Layout hooks.** The engine's class names are hashed, so a theme cannot restyle a slide part
  directly. It can set the tokens the engine reads for that: `--caption-*` (the glass card under
  a full-bleed showcase caption: ground, blur, edge, lift, inset, width, padding, and a
  `--caption-scrim` gradient for type straight on the picture), `--type-show-caption`,
  `--divider-align: center` (centred dividers and statements) and `--divider-kicker: none` (no
  "Section 2" above a divider). The README's Themes section lists them with defaults. Anything
  they do not reach is an engine change.
- **Two registers that work**, as starting points:
  - *Editorial*: white ground, grey labels with a small accent dot, no raised cards, the accent as
    a mark and never as text colour, even type steps.
  - *Keynote*: black ground, few words set very large, the presenter carries the rest; full-bleed
    photos carry their title on the picture over a soft scrim, dividers centred with no kicker,
    the logo inverted, plus a light variant for bright rooms. A scrim faint enough for a dark
    photo vanishes on a near-white one, so a theme that drops the glass card needs a scrim strong
    enough for its lightest picture.
- `npx slides pdf <deck> --scheme light` prints a dark deck's light leave-behind as a separate
  file (`<deck>-light.pdf`).
