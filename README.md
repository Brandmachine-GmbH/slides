# Slides

A slideshow engine for decks you send to one client. Each deck is a folder of data, builds to
its own bundle, and is served at an unguessable URL that nobody has unless you send it to them.

It is opinionated on purpose. A fixed 1280x720 stage scaled to whatever screen it lands on, one
type scale of eight steps that the build enforces, one accent colour, a PDF leave-behind with
real selectable text, and a copy editor that emits a diff rather than writing to the repo. If
you want a general presentation framework, this is not it. If you present to clients and you
already work in a repo, it will feel like the right shape.

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
| `slides dev <deck>` | one deck, reloading as you edit |
| `slides build` | every deck into `dist/`, the `/admin` index and editor, and every check |
| `slides serve [--build]` | the built site at localhost:8888, `/admin` included, no password |
| `slides pdf <deck>` | a vector PDF leave-behind (needs Google Chrome installed) |
| `slides motion <deck>` | measures every transition in a deck for jumps (needs Google Chrome) |
| `slides verify [url]` | checks a deployed site: the gate, the headers, the neutral root |

## Your site

A site holds only its own material. The engine lives in `node_modules`, and everything here is
optional except `decks/`:

| What | Where |
| --- | --- |
| Your decks | `decks/<name>/`: `deck.ts`, `slug.txt`, optional `internal.json`, `images/`, `videos/` |
| Your name, live URL, passcode-screen copy | `brand.json` |
| Your wordmark | `brand/logo.svg` |
| Your colours and fonts | `theme.css`, loaded after the engine's tokens, so a rule there overrides them |
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
is documented in `node_modules/@brandmachine/slides/src/engine/types.ts`, which is written as
prose rather than as a list of types. `decks/example/deck.ts` from `slides init` is the worked
example.

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
