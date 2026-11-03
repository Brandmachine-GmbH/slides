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

## The rest of this skill

This file is the workflow. Three references beside it carry the craft; read each one at the
moment it applies, not all up front:

- **`writing.md`**, before writing or editing any copy: the order to write a slide in, jobs,
  the deck's header note, headlines that read cold, budgets, sober rather than sold, numbers.
- **`design.md`**, before choosing pictures, writing a theme or drawing a figure: the accent
  rule, the type scale, pictures, motion, themes and their dark and light variants.
- **`scenes.md`**, when a slide has to build, react to the cursor, play something or run real
  software: staged figures, writing your own scene component, and driven product mockups.

## Which version this describes

This file is published twice: in the GitHub repository (the newest engine) and inside the npm
package. If the folder you are in already has `node_modules/@brandmachine/slides/`, compare the
`version` in `node_modules/@brandmachine/slides/package.json` with the newest release; when the
site runs an older engine, follow the copy of this skill inside that package, because it
matches what the site actually runs. Before 1.0 a minor version may
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

Needs Node 20 or newer, and Google Chrome for `slides pdf` and `slides motion`. React must be
18: an unpinned install pulls 19, which leaves a lockfile that `npm ci` and Netlify both refuse.
`--save-exact` pins the engine, so an engine release never changes a deck until someone upgrades
on purpose. The `"type"` that `npm init` writes does not matter.

`slides init` never overwrites a file. It writes:

- `decks/example/`: a worked deck (with a scene in `scenes/` and a figure in
  `images/figures/`), given its own fresh slug.
- `brand.json`, `theme.css`, `themes/night.css`, `tsconfig.json`.
- `netlify.toml` and `netlify/edge-functions/admin.ts`, the password gate for `/admin`.
- `.gitignore`, which keeps build output out of git. Never commit `dist/` or
  `netlify/edge-functions/lib/`: between them they hold every deck, slug and passcode.
- `AGENTS.md` and `CLAUDE.md`, pointing agents at this skill.

Read `decks/example/deck.ts` once (it is the quickest way to see a finished deck), then **delete
`decks/example/`** unless the person wants to keep it: on a published site it is a live deck with
the passcode `example`. Delete it before removing `themes/night.css`, which it uses, or the build
fails on a deck naming a theme that no longer exists.

Then make the site the person's own:

- `brand.json`: `name` (the browser tab and the wordmark's alt text), `siteUrl` (the live
  address, used by `slides verify`), and `gate`, the words on the passcode screen.
- `brand/logo.svg`: their wordmark, shown on the title slide, the end slide and the passcode
  screen. **Without one, the engine shows its own placeholder mark there**, which is not
  something to put in front of an audience. Supply the logo, or hide the mark everywhere with
  `--mark-filter: opacity(0)` in `theme.css`.
- `theme.css`: their colours and fonts, as overrides of the engine's tokens. Optional.
- `git init`, and a private remote when they want one (rule 2).

## Before writing

Look at the material the person has first (open the images and documents yourself), then ask
what it does not answer in one short message, and do the whole job. What you need to know:

- Who the deck is for, who will be in the room, and the one thing they should leave believing
  or agree to.
- What material exists: photographs, screenshots, videos, numbers, quotes, an earlier deck or
  document to start from. For prices: the exact figures, currency, VAT, term, and what each
  covers.
- Whether it will be presented live, sent as a link, or sent as a PDF (this decides how much
  goes in `handout`). For a narrated talk with few words on screen, the whole talk goes in
  `handout` (`writing.md`, "Where the rest goes"), and a keynote-style theme (`design.md`).
- Whether a price belongs in this deck or in a second deck with its own link (`writing.md`).
- The passcode, which is usually the client's brand name.
- The language of the deck.
- For a new site: the person's logo (SVG if they have one) and brand colour.
- Whether any named customer, quote or screenshot is cleared to be shown.

Then, before any slide copy: write the deck's header note and the `job` of the deck, of each
section and of each slide (`writing.md` says how). Reading the jobs in order is the cheapest
moment to find that the argument has a hole.

## Making a deck

```
npx slides new acme      # lowercase letters, digits and dashes
```

That writes `decks/acme/deck.ts`, `slug.txt`, and empty `images/` and `videos/` folders. To base
a deck on an existing one, create it with `slides new` and then copy over `deck.ts` and the
media you need. Never copy `slug.txt`, `internal.json` (the other client's private note) or the
other deck's PDF.

Media goes in the deck's own `images/` and `videos/` and is referenced by a path relative to
the deck: `images/looks/01.jpg`, `videos/intro.mp4`. A deck with its own scenes also needs a
`scenes/` folder, which you create by hand (`scenes.md`).

### Media

| Where | How it is drawn | Supply |
| --- | --- | --- |
| `content` image or video | a 600x600 rounded card, **cropped to fill** | square, at least 1200x1200 |
| `showcase` `"split"` | one or two images full height, cropped to fill | square or portrait, at least 1440 tall |
| `showcase` `"full"`, `film` | the whole 1280x720 stage, cropped to fill | 16:9, at least 2560x1440 |
| `stack` `band` | the full width, **fitted, never cropped** | anything wide: screenshots, strips of frames |
| `viewer` | a preview, and full resolution in the inspector | the real file, as large as it is |
| `title` `images` | beside the title: one, or three (the first full height) | portrait or square |

- **Screenshots** are wide, so they belong in a `band` on a `stack` slide or in a `viewer`, not
  in a `content` card, which would crop them. Before using one, look for real names, emails or
  other customers on it; blur them, or add the strings to `leaks.json`.
- JPEG or WebP for photographs, PNG for screenshots with fine text. Keep files small: every
  file goes into git and into every deploy.
- **Placeholders**, while the real pictures do not exist yet: write a small SVG per picture at
  the final aspect ratio, under the name the real file will have, and list every placeholder in
  the deck's header note under THE PICTURES so none is sent by accident. An SVG needs no tool and
  no font on the machine:

  ```svg
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200">
    <rect width="1200" height="1200" fill="#d6d7d9"/>
    <text x="600" y="610" text-anchor="middle" font-family="sans-serif" font-size="48" fill="#6d675f">Placeholder: hero shot</text>
  </svg>
  ```

  Image fields take any image path, so `images/hero.svg` works and later becomes
  `images/hero.jpg` with a one-word edit. The sizes in the table above are guidance; nothing
  enforces them.
- **Metadata**: the build fails on personal metadata (photographer, GPS, camera serial) in a
  shipped image. Strip it with `exiftool -all= -overwrite_original <file>`, or by re-exporting.
- **Video** is MP4 (H.264), plays muted and once, and holds its last frame, which is also what
  the PDF prints. Trim a screen recording so it ends on a frame worth printing, and use `film`
  only for an edited piece that ends on a composed frame; a raw recording works better in a
  `content` card beside a headline. A `content` slide takes a `video` or `images`, not both.

### Common jobs, and which slide does them

- **A customer quote.** There is no testimonial kind, and the `quote` block is for priced lines,
  not customer quotes. Use a `content` slide: eyebrow = name, role and company; headline = the
  sentence in curly quotes, cut to the part that carries the point; the full quote and its
  context in `handout`. For two short quotes side by side, a `plan` slide with one card each
  (`tag` the attribution, `title` the quote).
- **A price.** A `stack` slide with a `quote` block (priced lines, a hand-written `total`), or a
  `plan` slide with `cost`. A per-unit price whose total depends on the client's count is the
  case for an arithmetic scene (`scenes.md`).
- **Several options with prices.** A `stack` slide with a `cards` block.
- **A few measured figures.** `tiles` on a `stack` slide, two to four.
- **Steps, a plan, what happens next.** A `plan` slide.
- **An appendix** shown only when someone asks: a section with `toc: false`, placed after the
  `end` slide, so walking forward ends the meeting on the mark and the backup slides are still
  in the Contents panel.
- **A short deck** may not need sections at all: every section adds a divider slide unless it
  sets `divider: false`.

## The deck.ts shape

```ts
import type { Deck } from "@brandmachine/slides";

const deck = {
  passcodes: ["Acme"],
  // theme: "stage",    // optional: a file in themes/, for every slide of this deck
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
| `divider` | Big words on their own, at display size: a divider inside a section ("Before", "After"), or a **statement slide** anywhere in the deck. `--divider-align: center` in a theme centres it. |
| `plan` | A row of labelled cards (`steps: [{ tag, title, note? }]`), with an optional `cost` figure. Steps, options, a proposal. |
| `showcase` | The imagery big with little type, to prove quality. `layout: "full"` fills the slide. |
| `viewer` | A preview that opens a full-screen inspector with tabs, pan and zoom, for looking at actual pixels. |
| `stack` | A heading over full-width blocks, for evidence wider than it is tall: `band` (a wide image, fitted, not cropped), `tiles` (two to four figures), `cards` (priced options), `quote` (priced lines and a total), `legend`, `figure` (an SVG diagram). |
| `scene` | A drawing the site renders as a React component in `decks/<name>/scenes/`, filled with the deck's copy. Few decks need one; a `figure` is the default. |
| `film` | A video edge to edge with nothing on it. Plays once and holds its last frame. |
| `mockup` | A live, driven embed of real software from the site's `mockups/index.ts`. Rare. |
| `end` | The brand mark on its own. |

Any slide also takes `number: false`, `theme: "<name>"`, `handout` and `job` (below).

**The heading field is not named the same on every kind**, and a wrong name is a type error:

| Kind | Heading field | Eyebrow |
| --- | --- | --- |
| `title` | `headingHtml` (HTML), plus `sub` | required |
| `toc` | `heading` | required |
| `content`, `plan` | `headline` | required |
| `stack`, `scene`, `mockup` | `title` (optional) | optional |
| `showcase`, `viewer` | `title` | optional |
| `divider` | `title`, plus `tagline` | optional |
| `section` | `title`, plus `tagline` (required) | none: `short` replaces "Section 1" |

Where `writing.md` says "headline", it means whichever of these the kind uses. Every slide is
numbered unless it says `number: false`, the title and end slides included.

### Fields worth knowing

| Field | Where | What it does |
| --- | --- | --- |
| `handout` | any slide; a section (its divider) | Prints in a band under the slide in the PDF and never on screen, so the sent deck is complete while the wall stays sparse. Max 320 characters (the build fails). |
| `job` | deck, section, slide | What it has to do to the room. Internal: stripped before bundling, and the build fails if one survives. |
| `paragraph`, `note`, `bullets` | most slides | Usually wrong: on a slide with a picture, the picture is the body copy. Over 240 characters is reported. |
| `number: false` | any slide; a section (its divider) | Hides that slide's number. Never renumbers anything, so the number on screen always equals the PDF page. |
| `numbers: false` | the deck | No slide numbers at all. |
| `divider: false` | a section | No divider slide: for an opening beat that is not really a chapter. |
| `short` | a section | Two or three words for the bottom bar when the title is a whole sentence. |
| `toc: false` | a section | An appendix: off the table of contents, still in the nav. |
| `thumb` | a section | A picture on its table-of-contents row; the toc switches to its picture layout once any section has one. |
| `layout: "full"` | `showcase` | Images edge to edge, caption on a glass card. `focus` sets the crop (`"50% 30%"`). |
| `previews` | `viewer` | 1 or 2 previews on the slide itself. |
| `downloads: true` | the deck | Viewer slides offer a download of the frame on screen and the slide's whole set as a zip, byte for byte as delivered. Off by default. Convenience, not access control: anyone with the link can already save an image. |
| `download: false` | `viewer` | Keeps one slide's images out of that offer (evidence rather than deliverables). |
| `cost`, `footnote` | `plan` | A headline figure beside the cards, and small print under it. |

Copy rules (the eyebrow is a signpost, the headline is the takeaway and reads cold, budgets,
sober rather than sold) are in **`writing.md`**. Read it before writing any copy.

### Diagrams

Draw a diagram as an `.svg` under the deck's `images/` and use it as a `figure` block on a
`stack` slide. The engine puts the drawing into the page, so it uses the deck's fonts and colours.

- Colour it with `fill="currentColor"` or `style="fill:var(--ink)"`. A plain
  `fill="var(--ink)"` attribute is not valid SVG and silently draws black.
- **No comments inside the SVG.** It ships to the client byte for byte, so a comment in it is
  published, and the build fails on one.
- Groups tagged `data-build="1"`, `"2"`, and so on appear one key press at a time (see
  `scenes.md`).
- Do not use `band` for a diagram: a band is drawn as a picture, which cannot reach the deck's
  fonts, so every label falls back to Arial.

When a drawing has to build, react to the cursor or move, it becomes a `scene` you write
yourself: `scenes.md` has the contract and the patterns that worked.

## How it should look

The short version, with the reasons and the rest in **`design.md`**:

- **One type scale, eight steps** (enforced: the build fails on a raw `font-size`).
- **One accent colour, used once per slide**, on the single thing the room should look at.
- **A picture only when it shows what the slide is talking about**, and the same product
  followed through every step of a process.
- The stage is a fixed 1280x720, scaled to whatever screen it lands on, phones included (pinch
  zooms the slide). Keep titles on stack and mockup slides to one line.
- **`theme.css`** is every deck's look; **a theme** in `themes/` is one deck's or one slide's.
  Never change the look of a deck that has already been sent.

## Check, preview, export

- `npx slides check <deck>` typechecks and shape-checks one deck. Run it after every edit and fix
  what it reports before going on. **It does not check that media files exist**, and neither
  does the build: a wrong path in `images` or `video` passes both and shows up only as an empty
  frame in the PDF or the deck. Check the paths yourself after adding media:

  ```sh
  d=decks/<deck>; grep -oE '"(images|videos)/[^"]+"' $d/deck.ts | tr -d '"' | sort -u | while read p; do [ -e "$d/$p" ] || echo "missing: $p"; done
  ```

  What the checks do catch: type errors, a second title or end slide, an unknown theme, scene or
  mockup name, a raw `font-size`, body copy over 240 characters (reported) and handouts over 320
  (fails), comments inside an SVG, personal metadata in images, and any private text reaching
  the bundle.
- `npx slides pdf <deck>` checks the deck and writes `decks/<deck>/<deck>.pdf`, one vector page per
  slide (needs Google Chrome). **This is how you look at your own work**: read the PDF page by
  page as images (most agents can read PDF pages directly), and fix what reads badly before
  showing the person: a headline on three lines, type over a subject, a crop that cuts the
  product, a video's last frame. Videos print their last frame, driven slides print their
  finished state, and handouts print under their slides. `--scheme light` or `--scheme dark`
  prints every slide on one ground. PDFs are gitignored: hand the file to the person to send.
- **The handout band.** Once any slide in a deck has a `handout`, every PDF page becomes 960x630pt
  (the slide at the top, a white band of handout text under it) instead of 960x540, and slides
  without a handout get an empty band. The band is always white, so on a dark deck every page
  is a black slide over a white strip. That is intended for a leave-behind; for a clean 16:9 PDF
  of a dark or narrated deck, send the `NOTES=off` version below.
- `npx slides dev <deck>` serves the deck at http://localhost:5173 and reloads on every edit.
  `slides dev` and `slides serve` are long-running servers. A person comfortable with a terminal
  usually prefers to run them in their own; for someone who is not, offer to start it in the
  background and tell them the address. Ask which, once. The passcode is any entry in the
  deck's `passcodes`.
- `npx slides serve --build` serves the whole built site at http://localhost:8888, with the
  `/admin` index and the copy editor, and no password.

- `NOTES=off npx slides pdf <deck>` writes `<deck>-no-notes.pdf` beside the normal one, without
  the handout band, for people who do not need the fuller sentences.

## Reviewing with the person: the editor at /admin

The fastest review loop is the built-in editor, not a description in chat. Run
`npx slides serve --build` (or use the live `/admin`, behind `ADMIN_PASSWORD`), open the deck's
**Review & edit**, and the person can drag slides to reorder, cut them, retype any copy on the
real rendered slides, pin comments on a slide, and edit each slide's `job` in the **Story** view.
**Copy for Claude** produces a text block they paste back to you:

```
DECK EDIT
deck: acme
base: <commit the page was built from>

ORDER  (original slide numbers, in the order they should now run)
  1 2 3 5 4 6
CUT
  7  [stack] Headline of the cut slide.
EDIT
  3  slides[2].slides[0].headline
     - "Old headline."
     + "New headline."
COMMENTS  (requests, not edits ...)
  4  slides[2].slides[1]  "Its headline"
     1  (31%, 45%) on image images/x.jpg [slides[2].slides[1].images]: use the wider crop
STORY  (internal ...)
  ...
```

Applying it:

- Slide numbers are the **original** numbers, as the page showed them. Apply `ORDER`, `CUT` and
  `EDIT` first, then work through the comments.
- If `base` is not the commit `deck.ts` is at now, the deck has changed since the page was built.
  Say so and check each change still applies, rather than overwriting newer work.
- **A comment is a request, not a diff.** The bracketed path is where to start, the quoted text
  is how to confirm it is still the right place, and `(x%, y%)` is where the dot sits on the
  slide. Turn each into a change in `deck.ts`, or say why not, and ask when one is unclear.
  Comments marked `[earlier build]` may name a slide by an old number: find them by their quoted
  text.
- `STORY` lines change `job` fields, which no client ever sees; `EDIT` lines change what the
  client reads.

The editor edits text only. Images, videos, figures and slide kinds are shown so the person can
see what they are moving. It never writes to the repository: you apply the paste.

`base` is a commit, so the loop works best when each round is committed locally. A local commit
is not publishing (rule 3 is about pushing and deploying), but ask the person once whether they
want you to commit as you go.

## Presenting

| Key | Does |
| --- | --- |
| Space, PageDown, click | play the next beat on this slide (a staged figure, a scene, a mockup chapter); when there is none, next slide |
| Right, Down | next slide, always |
| Left, Up, PageUp | previous slide, always |
| `c` | the Contents panel |
| `f` | fullscreen |
| `d` | the other ground (light or dark), remembered per deck in this browser |
| `s` | steps on or off: off, every staged slide arrives complete and Space moves whole slides, for jumping around a deck you are not rehearsing |
| Home, End | first, last slide |

On a `viewer` slide, clicking the preview opens the full-screen inspector: the arrow keys switch
between its images, Escape closes it.

A presenter remote sends PageDown and PageUp, so the remote performs and the keyboard
navigates. A slide with beats left shows small dots bottom left. On a touch screen, tapping the
left third goes back. The cursor is a pointer on the projector: hovering a staged figure's group
or a scene's box lights it.

**Linking to one slide**: add `#<number>` to the deck's URL (`<siteUrl>/<slug>/#12`). The number
is the one in the slide's corner and its page in the PDF, so "look at 12" means the same thing on
screen, on paper and in a link. The address bar follows the deck, so standing on a slide and
copying the URL gives the link. A deep link survives the passcode screen.

## Privacy, in full

- The slug is the only real protection. The passcode screen is a courtesy: the content is
  already in the page.
- `decks/<name>/internal.json` is a private note about the deck, shown on `/admin` and never
  shipped: `{ "company": "...", "note": "...", "date": "YYYY-MM-DD" }`, all optional. `company`
  is the line on the admin card, `note` the internal box, `date` sorts the index. The build fails
  if a phrase of 25 or more characters from a note, or a name (two or more capitalised words),
  reaches any deck, except where that text is already part of the deck's own copy. So the
  client's company name on their own slides is fine, and a contact's name in another client's
  deck is caught.
- `leaks.json` at the site root, `{ "forbidden": ["..."] }`, lists extra strings that must never
  ship, such as a supplier named in a draft and then cut.
- `products` in `brand.json` lists your own product names, so the check never mistakes them for
  a client's name in somebody else's deck.
- The build also fails on sourcemaps, personal metadata in a shipped image, and a `job` that
  survived stripping. Do not work around these checks; fix what they found.

## Publishing

The reference host is Netlify, and `slides init` already wrote `netlify.toml` and the edge
function that puts `/admin` behind a password.

The first time, once the person has said to publish:

1. **A private repository.** With the GitHub CLI: `gh repo create <name> --private --source . --push`.
   Confirm with `gh repo view --json visibility` (rule 2).
2. **A Netlify site.** The person does this in Netlify's dashboard (you cannot log in for them):
   Add new site, Import an existing project, choose the repository, branch `main`. The build
   settings come from `netlify.toml`, so nothing needs typing.
3. **Two secrets**, in the site's Environment variables: `ADMIN_PASSWORD` (the password for
   `/admin`) and `AUTH_SECRET` (a long random string; they can make one with
   `openssl rand -hex 32` in their own terminal). Never ask for either value in the chat.
4. **The address.** Netlify assigns one (`<name>.netlify.app`) or the person connects their own
   domain. Put it in `brand.json` as `siteUrl`; it only feeds `slides verify` and reaches no
   client, so it can ride along with the next publish.

Every publish after that:

1. When the person says to publish, commit and push to `main`. Netlify runs `npx slides build`,
   which checks every deck and fails on any leak. A failed build publishes nothing; read its log.
2. After the deploy, run `npx slides verify <siteUrl>` to confirm the gate and headers attached.
3. Hand back `<siteUrl>/<slug>/` (the UUID in `decks/<name>/slug.txt`) and the passcode, plus
   `#<n>` links to any slide worth pointing at, and the PDF.

The built `dist/` is plain static folders, so another host works too; `slides serve` shows what
the edge function does.

## Upgrading the engine

Read `CHANGELOG.md` in the new version first. Set the exact version in `package.json`,
`npm install`, then `npx slides build`. For a deck written for 0.1, `npx slides migrate <deck>`
rewrites it into the current shape in place.
