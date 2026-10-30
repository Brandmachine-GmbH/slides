# Slides

A slideshow engine for decks you send to one client. Each deck is a folder of data, builds to
its own bundle, and is served at an unguessable URL that nobody has unless you send it to them.

It is opinionated on purpose. A fixed 1280x720 stage scaled to whatever screen it lands on, one
type scale of eight steps that the build enforces, one accent colour, a PDF leave-behind with
real selectable text, and a copy editor that emits a diff rather than writing to the repo. If
you want a general presentation framework, this is not it. If you present to clients and you
already work in a repo, it will feel like the right shape.

## With an agent

Point Claude Code or Codex at this repository and say what deck you want. The manual it needs is
`plugin/skills/slides/SKILL.md`, and both agents can install it as a skill:

- **Claude Code:** `/plugin marketplace add Brandmachine-GmbH/slides`, then
  `/plugin install slides@brandmachine`.
- **Codex:** `$skill-installer install https://github.com/Brandmachine-GmbH/slides/tree/main/plugin/skills/slides`.

The skill starts from an empty folder and does the Quick start below for you. Every site that
`slides init` sets up also gets an `AGENTS.md` (and a `CLAUDE.md` that loads it), pointing at the
copy of the skill inside `node_modules`, which always matches the engine version the site runs.

## Quick start

In an empty folder:

```
npm init -y
npm install @brandmachine/slides react@18 react-dom@18
npx slides init          # an example deck, a theme, the Netlify files. Never overwrites a file.
npx slides dev example   # localhost:5173, reloads as you edit. Passcode: example
```

Pin React to 18: the engine is built on it, and an unpinned install pulls 19, which leaves a
lockfile that `npm ci` and Netlify's deploy both refuse. `npx slides` on its own lists every command:

| Command | Does |
| --- | --- |
| `slides new <deck>` | a new deck under `decks/<deck>/`, with its own fresh secret slug |
| `slides check [deck]` | typecheck and shape-check one deck, or all of them |
| `slides dev <deck>` | serve one deck, reloading as you edit; prints the deck's type errors as warnings |
| `slides build` | check every deck, then build all of them into `dist/` with the `/admin` index and editor |
| `slides serve [--build]` | the built site at localhost:8888, `/admin` included, no password |
| `slides pdf <deck> [--out f] [--scheme light\|dark]` | check the deck, then a vector PDF leave-behind (needs Google Chrome); `--scheme` prints every slide on one ground; exports can run in parallel |
| `slides motion <deck>` | measures every transition in a deck for jumps (needs Google Chrome) |
| `slides migrate <deck>` | rewrites a 0.1 deck.ts into the 0.2 shape in place, comments kept |
| `slides verify [url]` | checks a deployed site: the gate, the headers, the neutral root |

## Your site

A site holds only its own material. The engine lives in `node_modules`, and everything here is
optional except `decks/`:

| What | Where |
| --- | --- |
| Your decks | `decks/<name>/`: `deck.ts`, `slug.txt`, optional `internal.json`, `images/`, `videos/` |
| Your name, live URL, passcode-screen copy | `brand.json` |
| Your wordmark, on the slides and the passcode screen | `brand/logo.svg` |
| Your colours and fonts | `theme.css`, loaded after the engine's tokens, so a rule there overrides them |
| Named looks a deck or a single slide can choose | `themes/<name>.css`, one file per theme (see Themes below) |
| Your passcode screen's look | `theme.css`: the `--gate-*` tokens, and `[data-gate="…"]` for anything else |
| Drawings one deck owns | `decks/<name>/scenes/`, registered in that folder's `index.ts` |
| Driven embeds of other software | `mockups/index.ts` |

`internal.json` is your note to yourself about a deck (who it is for, when you sent it). It
shows on `/admin` and never reaches the client.

**Keep your site in a private repository.** A deck is private because nobody knows its URL, and
the URL is in `decks/<name>/slug.txt`. Commit that to a public repository and the deck is public.

## A new deck

```
npx slides new acme
```

That writes `decks/acme/deck.ts` and a fresh random slug. Use it rather than copying a deck
folder: a copy keeps the other deck's slug, and `slides build` will refuse two decks that share
one, but it cannot know whether a slug was ever sent to anyone, so never reuse one.

## A deck

```ts
import type { Deck } from "@brandmachine/slides";

const deck = {
  passcodes: ["Client Brand"],
  slides: [
    { type: "title", eyebrow: "You", headingHtml: "One idea,<br/>two lines.", sub: "A subtitle." },
    { type: "toc", eyebrow: "Overview", heading: "What we'll cover." },
    {
      type: "section",
      id: "one",
      title: "First section",
      tagline: "A short line under the chapter heading.",
      slides: [
        { type: "content", eyebrow: "Label", headline: "A claim, not a topic." },
        { type: "stack", title: "Evidence wider than it is tall.",
          blocks: [{ figure: "images/figures/how.svg" }] },
      ],
    },
    { type: "end" },
  ],
} satisfies Deck;

export default deck;
```

**The deck is `slides`, in order, and nothing else.** Every slide says what it is with `type`:
`title`, `toc`, `content`, `divider`, `plan`, `showcase`, `viewer`, `stack`, `scene`, `mockup`,
`film`, `end`, and `section` for a chapter. The title, the table of contents and the end slide are
placed like any other slide, anywhere or not at all; the engine adds nothing except a divider at
the head of each section (`divider: false` declines it). A deck has at most one `title` and one
`end`; a `toc` may appear more than once.

**Typed per kind.** `Slide` is a union on `type`, so in an editor `type: "` lists every kind and
each kind then offers and requires exactly its own fields: `steps` on a `film` or a `showcase`
without `images` is an error on that line. Write `satisfies Deck` rather than `const deck: Deck`,
which keeps the literal types and points errors at the slide. Theme, scene and mockup names are
typed from the site itself: every `slides` command writes `.slides/names.d.ts` (gitignored) from
`themes/`, each deck's `scenes/index.ts` and `mockups/index.ts`, so `theme: "keynot"` is an error
in the editor. Include `.slides/names.d.ts` in the site's tsconfig (`slides init` does).

**Checked before anything is built.** Vite strips types without checking them, so `slides build`
typechecks every deck first and `slides pdf` the deck it is given, and both stop on an error;
`slides dev` prints the same errors as warnings and starts anyway. Each also refuses a second
title or end slide and a name the site does not register. `slides check [deck]` runs only the
checks. Every field is documented in `node_modules/@brandmachine/slides/src/engine/types.ts`,
which is written as prose rather than as a list of types. `decks/example/deck.ts` from
`slides init` is the worked example.

**From 0.1:** `npx slides migrate <deck>` rewrites a deck.ts in place, comments and formatting
kept; see CHANGELOG.md for what changes.

## Themes

`theme.css` changes the look of the whole site. A theme is a look a deck chooses, or one slide
within a deck: `theme: "night"` on the deck, on a slide, or on a section (where it applies to
that section's divider only). A slide's theme replaces the deck's for that slide; it is not
layered on top. The engine ships no themes of its own; `slides init` writes one example,
`themes/night.css`.

A theme is a stylesheet in `themes/`, its filename is its name, and every rule in it is scoped
to that name:

```css
[data-deck-theme="night"] {
  --stage-ground: #0b0b0c;
  --ink: #f4f4f2;
  --slide-wash: none;
}
```

The engine sets `data-deck-theme` on the element that paints each slide's ground: the stage in
the slideshow, each page of the PDF, each thumbnail in the editor, and the passcode screen. It
never sets it on the page as a whole, which is why every page of a PDF can have its own theme
and why a slide looks the same in any deck. A change of theme between two slides is part of the
ordinary dissolve.

Any token in `node_modules/@brandmachine/slides/src/engine/tokens.css` can be set. A theme may
give a step of the type scale a new value; it may not add a step, and `slides build` fails on a
raw `font-size` in a theme, on a slide naming a theme with no file, and on a theme file with no
rule for its own name.

**Grounds and the presenter's switch.** Every slide is drawn on a ground, light or dark, and the
engine puts it beside the theme as `data-color-scheme`. A theme is light-first unless its base
rule declares `color-scheme: dark`. The presenter's switch (`d`, the moon or sun beside Contents)
means **the other ground**: a light slide turns dark, a slide in a dark-first theme turns to that
theme's light variant, and the icon offers whichever the slide on screen would become. A token a
theme sets wins on both grounds and a token it leaves alone follows the ground, so a variant
only says what differs. Write it joined to the theme, because both attributes are on the same
element:

```css
/* a light-first theme's dark values */
[data-deck-theme="paper"][data-color-scheme="dark"] { --hairline: #2f3232; }
/* a dark-first theme's light variant */
[data-deck-theme="night"][data-color-scheme="light"] { color-scheme: light; --ink: #1d1d1f; }
```

**A dark-first theme** sets three things that cannot follow `--ink` on their own, and its light
variant sets them back:

- its card material (`--card-face`, `--card-edge`, `--surface`, `--solid` and friends), or light
  cards sit under its light type;
- `color-scheme: dark`, which also marks the theme as dark-first and is what inline SVG figures
  read to swap their drawn palette for the tokens;
- `--mark-filter: invert(1)`, because the logo is an `<img>` of a black mark.

A dark-first theme with no light variant stays dark when the switch is pressed.

**The PDF** prints every slide on its own theme's ground, as written. `slides pdf <deck> --scheme
light` (or `dark`) prints every slide on that ground instead, into `decks/<deck>/<deck>-light.pdf`
unless `--out` says otherwise: the light leave-behind of a black deck.

**Layout hooks.** A few things a theme may want to change are not colours or sizes, and the
slide components' class names are hashed, so they are tokens too. Each is read with today's
value as its fallback, so a theme that does not set it changes nothing:

| Token | What it changes | Default |
| --- | --- | --- |
| `--caption-ground`, `--caption-blur`, `--caption-edge`, `--caption-lift` | the glass card under a full-bleed showcase's caption: background, backdrop blur, border, shadow | the card |
| `--caption-inset`, `--caption-width`, `--caption-padding` | where the caption sits and how wide | `48px`, `452px`, the card's padding |
| `--caption-scrim` | a background drawn over the pictures and under the caption, e.g. a bottom gradient | `none` |
| `--type-show-caption` | the caption title's size, as a step of the scale (`var(--type-title)`) | `var(--type-subhead)` |
| `--divider-align` | `center` centres section dividers and `divider: true` statement slides | left |
| `--divider-kicker` | `none` hides the "Section 2" (or `short`) kicker above a section divider | shown |

The glass card is the default for a reason: a scrim faint enough for a dark photograph vanishes
on a near-white one, and a card keeps the type off the seam between two pictures. A theme that
trades it for type on the picture needs a scrim strong enough for its lightest image.

## Privacy

A deck's privacy is one thing: the UUID in its `slug.txt`. The passcode screen is a courtesy and
a facade, since the content is already in the page.

The build enforces the rest. It fails if anything private reached `dist/`: a sourcemap, a deck's
`internal.json`, a phrase from one, a contact's name, personal metadata in a shipped image, or a
`job` field that survived being stripped. Add a `leaks.json` of extra strings that must never
ship, `{ "forbidden": ["..."] }`, and it checks those too.

## Deploying

The reference deployment is Netlify. `slides init` writes `netlify.toml` and a three-line
`netlify/edge-functions/admin.ts`, which puts `/admin` and the copy editor behind a password. Set
`ADMIN_PASSWORD` and `AUTH_SECRET` in the site's environment variables. The gate itself lives in
the package, so a fix to it arrives with `npm update`.

The deck bundles are plain static folders and serve from anywhere. `slides serve` is the
host-agnostic version of what the edge function does, and `slides verify <url>` checks after a
deploy that the gate actually attached.

## Versions

0.x: a minor version (0.2.0) may change something a site relies on, and `CHANGELOG.md` says
what; a patch (0.1.1) never does. Pin an exact version and upgrade on purpose.

## Working on the engine

This repo is the package. `template/` is the site it develops against, the same files
`slides init` writes, so the example that ships is the example that is tested. `make` lists the
tasks; `make check` packs the package and uses it from an empty folder, the way a stranger would.

## Licence

MIT, see `LICENSE`. The fonts (OFL 1.1) and two Lucide icons (ISC) are under their own
licences, see `THIRD-PARTY.md`.
