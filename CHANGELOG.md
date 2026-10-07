# Changelog

Until 1.0, a minor version (0.2.0) may change something a site relies on, and says what here. A
patch version (0.1.1) never does.

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
