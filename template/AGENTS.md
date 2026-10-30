# A deck site

This folder is a deck site built on `@brandmachine/slides`: each deck is
`decks/<name>/deck.ts` plus its media, served at the secret URL in `decks/<name>/slug.txt`.

**Before making or changing a deck, read
`node_modules/@brandmachine/slides/plugin/skills/slides/SKILL.md`.** It is the full manual, and
it ships inside the engine so it always matches the version this site has installed. If
`node_modules/` is missing, run `npm install` first.

The rules that matter most, in case you read nothing else:

- Create every deck with `npx slides new <name>`, never by copying a deck folder, so each one
  gets its own fresh slug. A slug that was ever sent to someone is never reused.
- This repository must stay private: the slugs are committed, and a slug in a public repository
  makes its deck public.
- Publishing puts a deck in front of a client, so deploy or push only when the person asks.
- Never edit the engine in `node_modules/`. The site's look lives in `theme.css` and `themes/`.
- Run `npx slides check <deck>` after every edit, and `npx slides pdf <deck>` to look at the result.
