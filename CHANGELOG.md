# Changelog

Until 1.0, a minor version (0.2.0) may change something a site relies on, and says what here. A
patch version (0.1.1) never does.

## 0.3.2

- **The skill grows three references** beside `SKILL.md`: `writing.md` (jobs, the deck's header
  note, headlines, budgets, numbers), `design.md` (the accent, the type scale, pictures, motion,
  themes including dark-first and stage-sized ones) and `scenes.md` (staged figures, writing a
  scene component with the patterns that worked, and driven mockups). `SKILL.md` adds the
  `/admin` review loop, presenting keys, deep links, media sizes, placeholders, recipes for
  common slides, what the checks do not catch, and a first-publish walkthrough.
- The example scene now plays its `claim` as a last beat and draws text on its lit box with
  `--on-ink`, so it reads on the dark ground.
- Documentation only: stale references in `types.ts` and the README (private file names, scene
  names, a `divider: true` field that no longer exists) are gone. Nothing a deck relies on
  changes.

## 0.3.1

- **An agent skill.** `plugin/skills/slides/SKILL.md` is the manual for an agent making decks:
  setting up a site, writing `deck.ts`, checking, exporting and publishing, and the rules that
  keep a deck private. It installs as a Claude Code plugin from this repository and as a Codex
  skill, and it ships in the package.
- `slides init` also writes `AGENTS.md` and a `CLAUDE.md` that loads it, pointing an agent at
  the skill inside `node_modules`. Like every file `init` writes, neither replaces one that
  already exists.

## 0.3.0

- **The presenter's switch means "the other ground".** A theme whose base rule declares
  `color-scheme: dark` is dark-first: `d` turns its slides to its light variant, written as
  `[data-deck-theme="<name>"][data-color-scheme="light"]`, and back. Light slides turn dark exactly
  as before. On a deck mixing both, each slide turns to its own other ground, and the switch's
  icon offers whatever the slide on screen would become. A dark-first theme with no light variant
  still ignores the switch.
- Every slide's ground element (the stage, each PDF page, each editor thumbnail, the passcode
  screen) now carries `data-color-scheme` beside `data-deck-theme`, and the engine's dark tokens
  apply there through `:where()`, so any theme rule on that element outranks them. A theme's
  variant rules should be joined to the theme (`[data-deck-theme="x"][data-color-scheme="dark"]`)
  rather than written under an ancestor; the ancestor form still works in the slideshow only.
- The root's `data-color-scheme` follows the slide on screen, so the nav and the Contents panel
  are dark on a dark-first deck by default.
- **`slides pdf <deck> --scheme light|dark`** prints every slide on one ground, into
  `decks/<deck>/<deck>-<scheme>.pdf` unless `--out` is given. Without it, nothing changes.
- The passcode screen of a dark-first deck shows the theme's light variant to a viewer who has
  flipped the deck; a light deck's screen stays light as before.
- The switch now stores `"flip"`. A `"dark"` stored by 0.2 and earlier still darkens a light deck
  and is ignored on a dark-first deck, so a deck that opened black keeps opening black.
- A dark-first theme now draws on the engine's dark tokens by default, where it used to inherit
  the light ones from `:root`. A theme that sets every token it uses (as it should) sees no
  change; one that left some unset may see those parts render in their dark values.
- Known limit: in a PDF without `--scheme`, a canvas scene on a dark-first page reads the light
  scheme, while the slideshow reads dark. CSS-drawn slides are unaffected.

## 0.2.0

**Breaking: every slide has a `type`, and the deck is one ordered `slides` list.** The engine no
longer adds a title, an overview or an end slide; a deck places each of them, wherever it wants
them or not at all. `npx slides migrate <deck>` rewrites a 0.1 deck.ts in place, keeping every
comment, so that it renders the same slides in the same order with the same numbers:

| 0.1 | 0.2 |
| --- | --- |
| `const deck: Deck = { ... }` | `const deck = { ... } satisfies Deck` |
| `title: { eyebrow, headingHtml, sub, images? }` on the deck | `{ type: "title", eyebrow, headingHtml, sub, images? }` as a slide |
| `agenda: { eyebrow, heading }` on the deck | `{ type: "toc", eyebrow, heading }` as a slide (it was only shown when a deck had two or more sections) |
| `sections: [ { id, title, ... } ]` | `slides: [ { type: "section", id, title, ... } ]`, beside any slide that belongs to no section |
| `agenda: false` on a section | `toc: false` |
| the automatic outro | `{ type: "end" }`, placed (it was already placeable as `{ end: true }`) |
| `{ eyebrow, headline, ... }` (no flag) | `{ type: "content", eyebrow, headline, ... }` |
| `{ divider: true, ... }` | `{ type: "divider", ... }` |
| `{ plan: true, ... }`, `showcase`, `stack`, `viewer`, `film` | `{ type: "plan", ... }` and so on |
| `{ scene: "value-chain", ... }` | `{ type: "scene", name: "value-chain", ... }` |
| `{ mockup: "designer", ... }` | `{ type: "mockup", name: "designer", ... }` |
| `{ end: true }` | `{ type: "end" }` |

- **Slides are a discriminated union** on `type`: each kind accepts and requires exactly its own
  fields, and an editor lists the kinds after `type: "`. Theme, scene and mockup names are typed
  from the site through `.slides/names.d.ts`, which every command regenerates (add `.slides/` to
  `.gitignore` and `.slides/names.d.ts` to the tsconfig `include`; `slides init` does both).
- **Decks are typechecked.** `slides build` typechecks every deck before building and stops on an
  error; `slides pdf <deck>` checks that deck first and stops too, since a PDF is a deliverable;
  `slides dev <deck>` prints the deck's errors as warnings and starts the preview anyway. `slides check [deck]`
  runs the checks alone: types, then at most one `title` and one `end` per deck, every `type`
  known, and every theme, scene and mockup name registered.
- **`slides pdf <deck> --out <file>`** writes the PDF anywhere. Exports can run in parallel in one
  checkout: each takes a free port and its own Vite dependency cache. Vite's cache is now per deck
  (`node_modules/.vite/slides-<deck>`), so two dev servers no longer reload each other either.
- The Contents panel and the bottom nav list slides that belong to no section in deck order around
  the sections: before the first section they are "Intro", after the last "Outro". A loose end
  slide gets no Contents row, as the outro never had one.
- In `/admin`, the title and toc are ordinary cards (draggable, cuttable), and edit paths read
  `slides[3].slides[0].title` where they read `sections[2].slides[0].title`.
- The engine's own package check (`make check`) no longer leaves a `serve` process running.

**Breaking:** the engine no longer ships the `editorial` theme. A site that uses
`theme: "editorial"` must add it as `themes/editorial.css` before upgrading, or the build fails
naming the decks that use it. The rules are the ones that were in `tokens.css`, rescoped from
`:root[data-deck-theme="editorial"]` to `[data-deck-theme="editorial"]`; its three greys
(`--stone`, `--mist`, `--graphite`) also need their dark values in a
`[data-color-scheme="dark"] [data-deck-theme="editorial"]` rule, since the engine's dark scheme
no longer carries `--stone` and `--graphite`.

- **Themes belong to the site.** `themes/<name>.css`, scoped under `[data-deck-theme="<name>"]`,
  selected with `theme: "<name>"`, which is now any string. `slides build` fails on a name with
  no file, on a theme file with any rule not scoped to its own name, and on a raw `font-size` in a theme.
  `slides init` writes an example, `themes/night.css`, used on one slide of the example deck.
- **A slide can have its own theme.** `theme` on any slide, on the title and the overview, and
  on a section for its divider. It replaces the deck's theme for that slide. The slideshow
  dissolves from one theme's ground to the next, the PDF prints each page in its own theme, and
  the editor draws each thumbnail in its own.
- The theme attribute moved off `<html>` onto each slide's ground (the stage, `.bmx-slide` in the
  PDF, the editor's thumbnail) and the passcode screen. A site stylesheet that selected
  `:root[data-deck-theme=...]` must drop the `:root`.
- `--label-color`, `--type-stack-head`, `--solid`, `--gate-ground` and `--gate-wash` are no
  longer declared on `:root`; they are read with their old defaults as fallbacks, so a theme
  that changes `--orange`, `--type-title`, `--ink`, `--stage-ground` or `--slide-wash` carries
  them along. Setting any of them in `theme.css` or a theme works as before. Reading one in a
  site's own CSS now needs the same fallback, e.g. `var(--label-color, var(--orange))`, since
  without a declaration on `:root` a bare `var(--label-color)` resolves to nothing.
- The PDF's slide box paints `--stage-ground` instead of relying on the white page, so a site
  whose `theme.css` changes the ground now gets it in the PDF too.
- **Theme hooks for layout:** `--caption-*` and `--type-show-caption` for a full-bleed
  showcase's caption (card, scrim, position, title size), `--divider-align` and
  `--divider-kicker` for section and statement dividers. Every one defaults to what was drawn
  before. See the README's Themes section.
- **A dark theme can say so.** The logo's dark-ground inversion is now `--mark-filter`, set by
  the dark scheme and by any theme that needs it, instead of a rule only the presenter's switch
  could trigger. Inline SVG figures swap their palette on `color-scheme: dark` (through
  `light-dark()`), which a theme can set, instead of only under the switch. Both look exactly as
  before without a theme. `light-dark()` needs Safari 17.5, Chrome 123 or Firefox 120; an older
  browser keeps a figure's drawn colours in the dark.
- The passcode screen's logo also takes `--mark-filter`, so a dark deck theme does not put a black
  logo on its black ground.

## 0.1.3

- A presenter's **steps** switch, `s` or the list icon beside the light/dark toggle. Off, a
  staged figure or scene arrives with every beat already shown, and Space, PageDown and a click
  move a whole slide. For browsing a deck you are not rehearsing, where the beats interrupt every
  jump. A slide's entrance animation and a mockup's demo chapters are unchanged. Remembered in
  the browser for every deck on the site, unlike light/dark, which is per deck. On by default.
- The passcode screen is the site's own. It shows `brand/logo.svg` (the neutral mark when a site
  has none), its colours are `--gate-*` tokens a `theme.css` can override, its ground and wash
  follow the slides' by default, and every part carries a `data-gate` attribute for styling the
  tokens do not reach. `brand.json` can also set `gate.placeholder`, `gate.button` and
  `gate.error`. A site that sets none of this looks as before, plus its logo.

## 0.1.2

The same change as 0.1.1, which was tagged but never published: its release run failed on a
change in npm 12's output, before anything was uploaded. The release workflow now pins npm 11
and the package check reads either output.

## 0.1.1 (not published)

- The `/admin` index names the editor **Review & edit** and draws it as the card's second
  action. It was a faint grey "Edit copy" pill, which undersold an editor that reorders, cuts,
  retypes and comments, and was not found. The editor's page title follows.

## 0.1.0

The engine as an npm package. Before this it was a repository you copied.

- `slides` command: `init`, `new`, `dev`, `build`, `serve`, `pdf`, `motion`, `verify`.
- A site's own look goes in `theme.css`, loaded after the engine's tokens.
- The Netlify `/admin` gate ships in the package as `@brandmachine/slides/netlify`; a site's
  `netlify/edge-functions/admin.ts` is three lines that call it.
- Decks import from `@brandmachine/slides`. `@engine/types`, `@engine/useBuildStages` and
  `@engine/colorScheme` keep working through 0.x.
