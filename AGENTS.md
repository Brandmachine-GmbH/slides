# Agents in this repository

This is the source of `@brandmachine/slides`, a slideshow engine for client decks.

## If you are here to make a deck

Read `plugin/skills/slides/SKILL.md` and follow it. Decks are not made in this repository: they
live in a site of their own, a separate private folder that installs the package from npm.
The skill starts from an empty folder.

The same skill installs as a Claude Code plugin (`/plugin marketplace add Brandmachine-GmbH/slides`,
then `/plugin install slides@brandmachine`) and is found by Codex in `.agents/skills/`.

## If you are working on the engine

- **This repository is public.** Everything in it is published the moment it is pushed,
  comments and examples included: no client names, prices, contacts, deck copy or slugs. CI runs
  `scripts/check-public.mjs`, which catches stray UUIDs and private files but cannot recognise a
  price or a person, so check every line you write for them.
- `template/` is the site the engine develops against, and the same files `slides init` writes
  into a new site. `template/AGENTS.md` is therefore instructions for a deck site, not for this
  repository.
- `make` lists the tasks. `make check` packs the package and uses it from an empty folder, the
  way a stranger would; run it before calling a change done.
- The skill describes the engine, so a change to what a deck can say or how a command behaves
  updates `plugin/skills/slides/SKILL.md` in the same change.
- Releasing is a person's decision: bump `version`, add a `CHANGELOG.md` entry, then tag
  `v<version>` and push the tag, which publishes through GitHub Actions. Never tag or push a tag
  on your own.
