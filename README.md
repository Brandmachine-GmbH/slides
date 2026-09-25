# Slides

A slideshow engine for decks you send to one client. Each deck is a folder of data, builds to
its own bundle, and is served at an unguessable URL that nobody has unless you send it to them.

It is opinionated on purpose. A fixed 1280x720 stage scaled to whatever screen it lands on, one
type scale of eight steps that the build enforces, one accent colour, a PDF leave-behind with
real selectable text, and a copy editor that emits a diff rather than writing to the repo. If
you want a general presentation framework, this is not it. If you present to clients and you
already work in a repo, it will feel like the right shape.

## Quick start

```
npm install
make dev example        # one deck at localhost:5173, hot reload. Passcode: example
make serve              # the whole site at localhost:8888, /admin included
make pdf example        # a vector PDF at decks/example/example.pdf
make build              # every deck into dist/, with the checks
```

`make` on its own lists every task.

`decks/example/` is a real deck about the engine, and it is also the build's fixture: it uses most
of the slide kinds that need no photography, so a change that breaks one fails there first.

## Making it yours

| What | Where |
| --- | --- |
| Your name, live URL, passcode-screen copy | `brand.json` at the root (falls back to `src/engine/brand.example.json`) |
| Your wordmark | `brand/logo.svg` (falls back to a neutral mark) |
| Colours, the type scale, card material | `src/engine/tokens.css` |
| Fonts | `src/engine/assets/fonts/` and the two `fonts-*.css` files |
| Your decks | `decks/<name>/`: `deck.ts`, `slug.txt`, optional `internal.json`, `images/`, `videos/` |
| Drawings one deck owns | `decks/<name>/scenes/`, registered in that folder's `index.ts` |
| Driven embeds of other software | `mockups/index.ts` at the root |

Neither `brand.json` nor `brand/` nor `mockups/` exists in this repo. The engine falls back to
neutral defaults so it runs out of the box, and adding yours is how you make it a real site.

## A new deck

```
cp -r decks/example decks/acme
uuidgen | tr A-Z a-z > decks/acme/slug.txt
rm decks/acme/internal.json
```

The second line is the one that matters. A copied folder keeps the example's slug, which is
published in this repo, so without a fresh one your deck would live at a URL anyone can read on
GitHub. `make build` refuses a slug shared by two decks or one that is not a UUID, but it cannot
know a slug was never sent to anyone, so never reuse one.

`internal.json` is your note to yourself about the deck (who it is for, when you sent it). It
shows on `/admin` and never reaches the client; write a new one or leave it out.

Then edit `decks/acme/deck.ts` and run `make dev acme`.

**Keep your decks in a private repository, and do not use GitHub's Fork button for it.** A fork
of a public repository is always public, so client decks committed to one publish their secret
URLs. Clone this repo, create a new private repository, and push to that instead:

```
git clone https://github.com/Brandmachine-GmbH/slides.git my-decks
cd my-decks
git remote set-url origin git@github.com:<you>/my-decks.git   # a PRIVATE repo you created
```

Then delete the `check-public` step from `.github/workflows/check.yml` in your copy. It fails on
any slug other than the example's, on purpose, because its job is to keep this public repo empty
of real decks; yours is meant to hold them.

## A deck

```ts
import type { Deck } from "@engine/types";

const deck: Deck = {
  passcodes: ["Client Brand"],
  title:  { eyebrow: "You", headingHtml: "One idea,<br/>two lines.", sub: "A subtitle." },
  agenda: { eyebrow: "Overview", heading: "What we'll cover." },
  sections: [{
    id: "one",
    title: "First section",
    tagline: "A short line under the chapter heading.",
    slides: [
      { eyebrow: "Label", headline: "A claim, not a topic." },
      { stack: true, title: "Evidence wider than it is tall.",
        blocks: [{ figure: "images/figures/how.svg" }] },
    ],
  }],
};

export default deck;
```

Slide kinds: video, images, showcase, viewer, plan, stack, scene, mockup, divider. Every field
is documented in `src/engine/types.ts`, which is written as prose rather than as a list of types.
`decks/example/deck.ts` is the worked example.

## Privacy

A deck's privacy is one thing: the UUID in its `slug.txt`. The passcode screen is a courtesy and
a facade, since the content is already in the page. Two checks enforce the rest.

`check-leaks.mjs` runs inside every build and fails it if anything private reached `dist/`: a
sourcemap, a deck's `internal.json`, a phrase from one, a contact's name, personal metadata in a
shipped image, or a `job` field that survived being stripped.

`check-public.mjs` asserts nothing private is in this repo at all, and runs in CI. Its rules are
shape-based rather than name-based, so they keep working in a fork that has never heard of
whoever wrote them.

## Deploying

The reference deployment is Netlify, with `/admin` and the copy editor behind an edge-function
password (`netlify/edge-functions/admin.ts`, plus `ADMIN_PASSWORD` and `AUTH_SECRET`). The deck
bundles themselves are plain static folders and will serve from anywhere. `scripts/serve.mjs` is
the host-agnostic version of what the edge function does, and `npm run verify <url>` checks after
a deploy that the gate actually attached.

## Licence

MIT, see `LICENSE`. The fonts (OFL 1.1) and two Lucide icons (ISC) are under their own
licences, see `THIRD-PARTY.md`.
