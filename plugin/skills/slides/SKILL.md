---
name: slides
description: Make, edit, preview, export and publish client slide decks with the @brandmachine/slides engine, where each deck is a deck.ts file served at its own secret URL behind a passcode. Use when someone wants a deck, a pitch, a proposal or a presentation for one client, wants to set up a deck site from an empty folder, works in a folder that has decks/<name>/deck.ts, or points you at github.com/Brandmachine-GmbH/slides and says to get started.
---

# Making decks with @brandmachine/slides

A deck is data: `decks/<name>/deck.ts` holds every word, `images/` and `videos/` beside it hold
the media, and `slug.txt` holds a UUID that becomes the deck's address. The engine builds each
deck into its own bundle at `<site>/<uuid>/`, behind a passcode screen. Nobody can find a deck
without the link, and that is the whole privacy model.

The person you are helping may not be technical. Do the technical steps yourself, explain in
plain words, and when a deck is done hand back the two things they need: **the link and the
passcode**.

## Which version this describes

This file is published twice: in the GitHub repository (the newest engine) and inside the npm
package. If the folder you are in already has `node_modules/@brandmachine/slides/`, read
`node_modules/@brandmachine/slides/plugin/skills/slides/SKILL.md` instead of this copy, because
that one matches the engine version the site actually runs. Before 1.0 a minor version may
change the deck shape (`CHANGELOG.md` in the package says what).

## The rules that keep a deck private

1. **A fresh slug for every deck, never a reused one.** Create decks with `npx slides new <name>`,
   which writes a new UUID. Never copy a deck folder: the copy keeps the other deck's slug, and
   a slug that was ever sent to someone must never point at a different client's deck.
2. **The site repository must be private.** `slug.txt` is committed, so a deck in a public
   repository is a public deck. Check before the first push (`gh repo view --json visibility`
   on GitHub). If the person wants it public, stop and explain this first.
3. **Publishing is client-facing.** Deploy, push to the deploy branch, or run anything that puts
   a deck online only when the person clearly asks for it. Until then, preview locally.
4. **Never edit the engine in `node_modules/`.** A change there is lost on the next install. A
   deck's look belongs in the site's `theme.css` or `themes/`; anything else the engine cannot
   do is an issue or a pull request on github.com/Brandmachine-GmbH/slides.

## Starting

**Already a site?** If `package.json` lists `@brandmachine/slides` and `decks/` exists, skip to
"Before writing".

**New site.** Confirm the folder with the person, then:

```
npm init -y
npm install --save-exact @brandmachine/slides react@18 react-dom@18
npx slides init
```

React must be 18: an unpinned install pulls 19, which leaves a lockfile that `npm ci` and
Netlify both refuse. `--save-exact` pins the engine, so an engine release never changes a deck
until someone upgrades on purpose. `slides init` writes an example deck, `brand.json`,
`theme.css`, `themes/night.css`, `netlify.toml`, the Netlify edge function and an `AGENTS.md`.
It never overwrites a file.

Then make the site the person's own:

- `brand.json`: `name` (the browser tab and the wordmark's alt text), `siteUrl` (the live
  address, used by `slides verify`), and `gate`, the words on the passcode screen.
- `brand/logo.svg`: their wordmark, shown on the slides and the passcode screen. Optional.
- `theme.css`: their colours and fonts, as overrides of the engine's tokens. Optional.
- `git init`, and a private remote when they want one (rule 2).

`decks/example/deck.ts` is a worked example of most slide kinds. Read it once; it is the
quickest way to see what a finished deck looks like.

## Before writing

Ask one or two short questions, then do the whole job. What you need to know:

- Who the deck is for, and the one thing the room should leave believing.
- What material exists: photographs, videos, numbers, an earlier deck or document to start from.
- The passcode, which is usually the client's brand name.
- The language of the deck.

## Making a deck

```
npx slides new acme      # lowercase letters, digits and dashes
```

That writes `decks/acme/deck.ts`, `slug.txt`, and empty `images/` and `videos/` folders. To base
a deck on an existing one, create it with `slides new` and then copy over `deck.ts` and the
media you need. Never copy `slug.txt`, `internal.json` (the other client's private note) or the
other deck's PDF.

Media goes in the deck's own `images/` and `videos/` and is referenced by a path relative to
the deck: `images/looks/01.jpg`, `videos/intro.mp4`.

## The deck.ts shape

```ts
import type { Deck } from "@brandmachine/slides";

const deck = {
  passcodes: ["Acme"],
  slides: [
    { type: "title", eyebrow: "Acme", headingHtml: "One idea,<br/>on two lines.", sub: "A subtitle." },
    { type: "toc", eyebrow: "Overview", heading: "What we'll cover." },
    {
      type: "section", id: "why", title: "Why now", tagline: "A short line under the chapter heading.",
      slides: [
        { type: "content", eyebrow: "The problem", headline: "A claim, not a topic.",
          images: ["images/looks/01.jpg"] },
      ],
    },
    { type: "end" },
  ],
} satisfies Deck;

export default deck;
```

- `slides` is the deck, in order. The engine adds nothing except a divider slide at the head of
  each section (`divider: false` on the section turns it off). Title, table of contents and end
  slide go wherever you place them, or nowhere.
- At most one `title` and one `end`. A `toc` may appear more than once. Sections sit beside
  plain slides at the top level and do not nest.
- Write `satisfies Deck`, not `const deck: Deck =`, so each slide keeps its own type and an error
  is reported on the slide that has it.
- `deck.ts` is data only. No imports other than the `Deck` type, no functions.
- Comments in `deck.ts` are safe: the build strips them. They are the right place for the
  reasoning behind a deck.
- Every field is documented in `node_modules/@brandmachine/slides/src/engine/types.ts`, written
  as prose. Read the slide kind you are about to use there before using it for the first time.

### Slide kinds

| `type` | Use it for |
| --- | --- |
| `title` | The opening slide: `eyebrow`, `headingHtml` (HTML, so you choose the line break), `sub`, optional `images` (one or three). |
| `toc` | The table of contents, written by the engine from the sections. |
| `section` | A chapter: `id`, `title`, `tagline`, `slides`. Optional `short` (two or three words for the bottom bar when the title is a sentence), `toc: false` (an appendix), `thumb`. |
| `content` | The working slide: `eyebrow`, `headline`, and a `video` or one or two `images` beside it. |
| `divider` | A divider inside a section, such as "Before" and "After". |
| `plan` | A row of labelled cards (`steps: [{ tag, title, note? }]`), with an optional `cost` figure. Steps, options, a proposal. |
| `showcase` | The imagery big with little type, to prove quality. `layout: "full"` fills the slide. |
| `viewer` | A preview that opens a full-screen inspector with tabs, pan and zoom, for looking at actual pixels. |
| `stack` | A heading over full-width blocks, for evidence wider than it is tall: `band` (a wide image, fitted, not cropped), `tiles` (two to four figures), `cards` (priced options), `quote` (priced lines and a total), `legend`, `figure` (an SVG diagram). |
| `scene` | A drawing the site renders as a React component in `decks/<name>/scenes/`, filled with the deck's copy. Few decks need one; a `figure` is the default. |
| `film` | A video edge to edge with nothing on it. Plays once and holds its last frame. |
| `mockup` | A live, driven embed of real software from the site's `mockups/index.ts`. Rare. |
| `end` | The brand mark on its own. |

Any slide also takes `number: false`, `theme: "<name>"`, `handout` and `job` (below).

### Writing the copy

A slide carries one idea, written for a three-second glance, because the argument is the
presenter, out loud.

- **`eyebrow` is a signpost**, a plain noun or two ("The terms", "Product overview"). The claim
  goes in the headline, not in the eyebrow.
- **The headline is a claim, not a topic.** "Shoots in a day, not a month" rather than "Speed".
- **`paragraph`, `note` and `bullets` are usually wrong.** On a slide with a picture, a drawing or
  figures, the picture is the body copy. Write the sentence, delete it, and check whether
  anything was lost. The build reports body copy over 240 characters.
- **`handout` is where that sentence goes.** It never appears on screen and prints in a band
  under the slide in the PDF, so a deck sent after the meeting is still complete. Two or three
  sentences; the build fails past 320 characters.
- **`job` is internal**: what the slide has to do to the room. It is stripped before bundling and
  never reaches the client. Read the jobs top to bottom and you should hear the argument.
- Write like a person. No dashes as sentence punctuation, no "it's not just X, it's Y", no lists
  of three reached for only for rhythm, no throat-clearing openers.
- **The engine never adds up money.** A `quote` total is written out by hand, so check the sum
  yourself.

### Diagrams

Draw a diagram as an `.svg` under the deck's `images/` and use it as a `figure` block on a
`stack` slide. The engine puts the drawing into the page, so it uses the deck's fonts and colours.

- Colour it with `fill="currentColor"` or `style="fill:var(--ink)"`. A plain
  `fill="var(--ink)"` attribute is not valid SVG and silently draws black.
- **No comments inside the SVG.** It ships to the client byte for byte, so a comment in it is
  published, and the build fails on one.
- Groups tagged `data-build="1"`, `"2"`, and so on appear one key press at a time.
- Do not use `band` for a diagram: a band is drawn as a picture, which cannot reach the deck's
  fonts, so every label falls back to Arial.

## How it should look

- **One type scale, eight steps.** Every size comes from the engine's `tokens.css`, and the build
  fails on a raw `font-size` in `theme.css` or a theme. A tighter frame steps down the scale; it
  never invents a size between two steps.
- **One accent colour, used once per slide**, on the single thing the room should look at.
  Contrast between dark and pale is the other emphasis, and it costs nothing.
- The stage is a fixed 1280x720, scaled to whatever screen it lands on. Keep titles on stack and
  mockup slides to one line, because every line of type is taken off the picture.
- **`theme.css`** changes the look of every deck on the site. **A theme** is a look one deck or
  one slide chooses: `themes/<name>.css`, every rule scoped under
  `[data-deck-theme="<name>"]`, chosen with `theme: "<name>"` on the deck, a slide or a section.
  Changing `theme.css` redraws every deck already sent, so a look for one client belongs in a
  theme. The README's Themes section covers dark-first themes and the presenter's light and dark
  switch.

## Check, preview, export

- `npx slides check <deck>` typechecks and shape-checks one deck. Run it after every edit and fix
  what it reports before going on.
- `npx slides pdf <deck>` checks the deck and writes `decks/<deck>/<deck>.pdf`, one vector page per
  slide (needs Google Chrome). **This is how you look at your own work**: open the PDF, look at
  every page, and fix what reads badly before showing the person. Videos print their last frame,
  driven slides print their finished state, and handouts print under their slides.
  `--scheme light` or `--scheme dark` prints every slide on one ground.
- `npx slides dev <deck>` serves the deck at http://localhost:5173 and reloads on every edit. It
  is a long-running server, so give the person the command to run in their own terminal unless
  they ask you to start it. The passcode is any entry in the deck's `passcodes`.
- `npx slides serve --build` serves the whole built site at http://localhost:8888, with the
  `/admin` index and the copy editor, and no password.

Presenting: Space (or a remote's forward button) plays the next step of a staged figure, scene or
mockup and otherwise moves on; the arrow keys always move a whole slide. `d` switches between the
light and dark ground.

## Privacy, in full

- The slug is the only real protection. The passcode screen is a courtesy: the content is
  already in the page.
- `decks/<name>/internal.json` is a private note about the deck (who it is for, when it was
  sent). It shows on `/admin` and never reaches the client, and the build fails if any phrase from
  one reaches `dist/`.
- `leaks.json` at the site root, `{ "forbidden": ["..."] }`, lists extra strings that must never
  ship, such as a supplier named in a draft and then cut.
- The build also fails on sourcemaps, personal metadata in a shipped image, and a `job` that
  survived stripping. Do not work around these checks; fix what they found.

## Publishing

The reference host is Netlify, and `slides init` already wrote `netlify.toml` and the edge
function that puts `/admin` behind a password.

1. The site is a private repository (rule 2), connected to a Netlify site.
2. In Netlify's environment variables, the person sets `ADMIN_PASSWORD` and `AUTH_SECRET`
   (a long random string). Never ask for either value in the chat; have them enter it there.
3. When the person says to publish, commit and push to the branch Netlify deploys. Netlify runs
   `npx slides build`, which checks every deck and fails on any leak.
4. After the deploy, run `npx slides verify <siteUrl>` to confirm the gate and headers attached.
5. Hand back `<siteUrl>/<slug>/` (the UUID in `decks/<name>/slug.txt`) and the passcode.

The built `dist/` is plain static folders, so another host works too; `slides serve` shows what
the edge function does.

## Upgrading the engine

Read `CHANGELOG.md` in the new version first. Set the exact version in `package.json`,
`npm install`, then `npx slides build`. For a deck written for 0.1, `npx slides migrate <deck>`
rewrites it into the current shape in place.
