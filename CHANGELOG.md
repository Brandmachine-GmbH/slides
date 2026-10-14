# Changelog

Until 1.0, a minor version (0.2.0) may change something a site relies on, and says what here. A
patch version (0.1.1) never does.

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
