# Changelog

Until 1.0, a minor version (0.2.0) may change something a site relies on, and says what here. A
patch version (0.1.1) never does.

## 0.1.1

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
