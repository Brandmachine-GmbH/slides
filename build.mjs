// Builds every deck under decks/<name>/ into dist/<slug>/ (one Vite build per deck),
// copies that deck's static media (videos/ and images/) in, and writes a neutral root page.
// Each deck is served at <the site's domain>/<slug>/; see brand.json.
// Run:  node build.mjs   (or: npm run build)
import { execSync, execFile } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, rmSync, mkdirSync, existsSync, realpathSync } from "node:fs";
import { cp } from "node:fs/promises";
import { cpus } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { build as esbuild } from "esbuild";
import { checkLeaks } from "./scripts/check-leaks.mjs";
import { eachSlide, loadDeck, shapeProblems, siteNames, typecheck, writeSiteNames } from "./scripts/check.mjs";

const root = dirname(fileURLToPath(import.meta.url));
// Two roots: `root` is this package, `userRoot` the site being built (decks/, brand.json, the
// output). See the same note in vite.config.ts.
// Real path, because Vite reports module ids by their real path: through a symlink, stripJobs'
// prefix test against decks/ missed every deck and only check-leaks stopped the jobs shipping.
const userRoot = realpathSync(process.env.SLIDES_ROOT || process.cwd());
const decksDir = join(userRoot, "decks");
const dist = join(userRoot, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

if (!existsSync(decksDir)) {
  console.error(`✗ No decks/ folder in ${userRoot}. Run \`npx slides init\` here, or cd into the site.`);
  process.exit(1);
}

const names = readdirSync(decksDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

// Every Vite build is its own process, run several at a time.
//
// WHY PROCESSES AND NOT VITE'S API. The deck is chosen by VITE_DECK, which vite.config.ts reads
// once at module load. One process cannot hold twelve values of that, so the isolation is doing
// real work rather than being ceremony.
//
// WHY NOT npx. `npx vite build` spends 0.22s resolving the binary before it does anything, which
// across twelve builds was 2.6s of a 15.7s build. Calling the entry directly with this Node skips
// all of it and removes a dependency on how PATH happens to be set.
//
// Eight at most: measured on a 10-performance-core Mac (7 Oct 2026), more than eight builds at
// once compete for the machine and the whole build gets slower again, not faster.
//
// JOBS=1 restores the old one-at-a-time behaviour, which is what you want when a build fails and
// you would rather read the output in order than find it.
const JOBS = Math.max(1, Number(process.env.JOBS) || Math.min(8, cpus().length - 1));
// Resolved rather than joined onto node_modules/: installed as a dependency, vite is usually
// hoisted into the SITE's node_modules, not this package's.
const VITE = join(dirname(createRequire(import.meta.url).resolve("vite/package.json")), "bin", "vite.js");

function viteBuild(env) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath, [VITE, "build"],
      { cwd: root, env: { ...process.env, SLIDES_ROOT: userRoot, ...env }, maxBuffer: 64e6 },
      (err, stdout, stderr) => {
        const out = `${stdout}${stderr}`;
        err ? reject(Object.assign(err, { out })) : resolve(out);
      },
    );
  });
}

/** Run `worker` over `items`, `limit` at a time, and return the results IN INPUT ORDER.
 *
 *  The ordering is not cosmetic. `built` decides the order of the _headers rules, of the keys in
 *  the generated editor.js, and of the hub index, so collecting results as each finishes would
 *  produce a deploy that works perfectly and differs on every build. Writing to out[i] keeps the
 *  output byte-identical to the serial build, which is exactly what makes it checkable: build
 *  both ways and `diff -r` the two dist/ trees. */
async function pool(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await worker(items[i], i);
  }));
  return out;
}

// Vite prints twenty lines of asset table per build, which serially was a readable log and in
// parallel is 240 interleaved lines. One line each on success; the whole thing on failure, which
// is the only time anyone reads it.
function summarise(name, slug, out, ms) {
  const warn = out.split("\n").filter((l) => /warn/i.test(l) && !/^\s*$/.test(l));
  console.log(`  ${name.padEnd(18)} -> /${slug}/  ${(ms / 1000).toFixed(1)}s`);
  warn.forEach((w) => console.warn(`      ${w.trim()}`));
}

const deckJobs = names
  .filter((name) => {
    if (existsSync(join(decksDir, name, "slug.txt"))) return true;
    console.warn(`skip ${name}: no slug.txt`);
    return false;
  })
  .map((name) => ({ name, slug: readFileSync(join(decksDir, name, "slug.txt"), "utf8").trim() }));

// The slug is the only thing keeping a deck private, and both ways of losing that are silent:
// `cp -r` of another deck keeps its slug, so two decks build into one folder and the later one
// wins, and a hand-typed slug like "acme" is a URL anyone can guess.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const slugOwner = new Map();
for (const { name, slug } of deckJobs) {
  const fix = `uuidgen | tr A-Z a-z > decks/${name}/slug.txt`;
  if (!UUID.test(slug)) {
    console.error(`✗ ${name}: slug.txt must be a lowercase UUID. Run: ${fix}`);
    process.exit(1);
  }
  if (slugOwner.has(slug)) {
    // Sort order cannot tell the copy from the original, and re-slugging the original breaks
    // a link somebody already has, so name both and let the person say which is new.
    console.error(
      `✗ ${slugOwner.get(slug)} and ${name} share a slug. Give whichever is the copy a fresh one: ` +
        `uuidgen | tr A-Z a-z > decks/<the copy>/slug.txt`,
    );
    process.exit(1);
  }
  slugOwner.set(slug, name);
}

if (deckJobs.length === 0) {
  console.error("✗ No decks to build: add a folder under decks/ with a deck.ts and a slug.txt.");
  process.exit(1);
}

// Before any Vite build, because Vite strips types without checking them and renders whatever
// shape it is handed: a deck with a misspelt field, a `steps` on a film or two title slides
// would otherwise build cleanly and look wrong. The same checks `slides check` runs (see
// scripts/check.mjs), over every deck.
writeSiteNames(userRoot);
const registered = siteNames(userRoot);
{
  const tc = typecheck(userRoot);
  if (tc.skipped) console.log(`· types: ${tc.skipped}`);
  else if (tc.errors) {
    console.error(`\n✗ ${tc.count} type error(s); nothing was built\n`);
    console.error(tc.errors);
    process.exit(1);
  } else console.log("· types: every deck typechecks");
  const problems = [];
  for (const { name } of deckJobs) {
    // Same as check.mjs: a deck.ts that throws at load is reported as a problem rather than
    // ending the build in an unhandled rejection.
    try {
      problems.push(...shapeProblems(await loadDeck(userRoot, name), name, registered));
    } catch (err) {
      problems.push(`decks/${name}/deck.ts does not load: ${String(err?.message ?? err).split("\n")[0]}`);
    }
  }
  if (problems.length) {
    console.error(`\n✗ ${problems.length} problem(s) in the decks; nothing was built\n`);
    problems.forEach((p) => console.error(`   ${p}`));
    console.error("");
    process.exit(1);
  }
  console.log(`· shape: ${deckJobs.length} decks, every slide typed, at most one title and one end each\n`);
}

console.log(`· building ${deckJobs.length} decks + the editor, ${JOBS} at a time\n`);
const t0 = Date.now();

// The admin bundle goes through the same pool: it shares nothing with the decks and writes only
// dist/_admin, so there is no reason for it to wait for eleven deck builds first.
const ADMIN = { name: "(the editor)", slug: "_admin/", env: { VITE_ADMIN: "1" } };
const built = (await pool([...deckJobs, ADMIN], JOBS, async (job) => {
  const t = Date.now();
  let out;
  try {
    out = await viteBuild(job.env ?? { VITE_DECK: job.name });
  } catch (err) {
    console.error(`\n✗ ${job.name} failed to build\n`);
    console.error(err.out ?? err.message);
    process.exit(1);
  }
  // Static media is not bundled by Vite; copy each deck's videos/ and images/ into its output.
  // Async, so 145MB of mp4 copies while other decks are still compiling.
  if (!job.env) {
    for (const dir of ["videos", "images"]) {
      const src = join(decksDir, job.name, dir);
      if (existsSync(src)) await cp(src, join(dist, job.slug, dir), { recursive: true });
    }
  }
  summarise(job.name, job.slug, out, Date.now() - t);
  return job.env ? null : { name: job.name, slug: job.slug };
})).filter(Boolean);

console.log(`\n· ${built.length} decks + editor built in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// A deck's private notes, for the hub only: decks/<name>/internal.json.
//
// It is a SIDECAR rather than a field on deck.ts, and that is the whole design. deck.ts is
// compiled into the deck's own client bundle, so anything written there is readable by whoever
// holds the secret link. This file is never imported by a deck and never copied into dist/
// (only videos/ and images/ are), so it can hold contact names and candid notes. Both halves
// of that are enforced by scripts/check-leaks.mjs rather than trusted.
//
// Every field is optional and a missing file is normal: the card just falls back to what
// deck.ts already gives it.
function deckInternal(name) {
  const f = join(decksDir, name, "internal.json");
  if (!existsSync(f)) return { company: "", note: "", date: "" };
  try {
    const d = JSON.parse(readFileSync(f, "utf8"));
    return { company: d.company || "", note: d.note || "", date: d.date || "" };
  } catch (err) {
    console.warn(`  hub: could not read ${name}/internal.json (${err.message.split("\n")[0]})`);
    return { company: "", note: "", date: "" };
  }
}

// Read a deck's authored metadata for the hub index. deck.ts is TypeScript with a
// type-only import, so it is transpiled to a temp module and imported rather than
// pattern-matched: a regex over authored copy breaks the first time someone writes an
// apostrophe or reorders a field.
async function deckMeta(name) {
  const tmp = join(dist, `.meta-${name}.mjs`);
  try {
    await esbuild({
      entryPoints: [join(decksDir, name, "deck.ts")],
      outfile: tmp, bundle: true, format: "esm", platform: "node",
      logLevel: "silent",
      // The engine types are erased at compile time; nothing else is imported.
      external: ["@engine/*"],
    });
    const mod = await import(pathToFileURL(tmp).href);
    const d = mod.default || {};
    // The card is named from the deck's title slide wherever it is placed, and from the folder
    // when the deck has none, which is now a deck's own choice.
    const items = Array.isArray(d.slides) ? d.slides : [];
    const title = items.find((it) => it?.type === "title")
      ?? items.flatMap((it) => (it?.type === "section" ? it.slides ?? [] : [])).find((sl) => sl?.type === "title");
    return {
      title: (title?.headingHtml || name).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      eyebrow: title?.eyebrow || "",
      sub: title?.sub || "",
      passcodes: Array.isArray(d.passcodes) ? d.passcodes : [],
      sections: items.filter((it) => it?.type === "section").length,
    };
  } catch (err) {
    console.warn(`  hub: could not read ${name}/deck.ts (${err.message.split("\n")[0]})`);
    return { title: name, eyebrow: "", sub: "", passcodes: [], sections: 0 };
  } finally {
    rmSync(tmp, { force: true });
  }
}

// The whole deck object, for the editor at /admin/edit/<name>. deckMeta above pulls out the
// handful of fields the index card shows; this returns everything, because the editor renders
// the real slides. Same transpile-and-import trick, same reason.
async function deckFull(name) {
  const tmp = join(dist, `.full-${name}.mjs`);
  try {
    await esbuild({
      entryPoints: [join(decksDir, name, "deck.ts")],
      outfile: tmp, bundle: true, format: "esm", platform: "node",
      logLevel: "silent", external: ["@engine/*"],
    });
    const mod = await import(pathToFileURL(tmp).href);
    return mod.default || null;
  } catch (err) {
    console.warn(`  editor: could not read ${name}/deck.ts (${err.message.split("\n")[0]})`);
    return null;
  } finally {
    rmSync(tmp, { force: true });
  }
}

// Who this site belongs to. The same file the engine reads through @brand; read here too so
// the three pages the BUILD writes (the neutral root page, the hub, the edge function's login
// screen) carry the same name as the pages Vite writes.
const brand = JSON.parse(readFileSync(
  existsSync(join(userRoot, "brand.json"))
    ? join(userRoot, "brand.json")
    : join(root, "src", "engine", "brand.example.json"), "utf8"));

// lib/ holds three generated modules and is created here rather than assumed. A checkout that
// has never built has no reason to contain it: the files in it are output, and a fresh clone of
// a repo that gitignores them starts without the folder at all.
const edgeLib = join(userRoot, "netlify", "edge-functions", "lib");
mkdirSync(edgeLib, { recursive: true });
// The modules below are ES modules, and Node decides how to load a .js file from the nearest
// package.json. npm 11's `npm init -y` writes "type": "commonjs" into a site's, which made
// `slides serve` (it imports these) die on the first `export`. This pins the folder to ESM.
writeFileSync(join(edgeLib, "package.json"), '{ "type": "module" }\n');

// The edge function runs on Deno at request time and cannot read brand.json, so the build hands
// it the same values as a module, next to the hub and editor modules it already imports.
writeFileSync(join(edgeLib, "brand.js"),
  "// GENERATED by build.mjs from brand.json. Do not edit.\n" +
  `export const BRAND = ${JSON.stringify({ name: brand.name })};\n`);

// The hub: a private index of every deck, served at /admin.
//
// It is compiled INTO the edge function rather than written to dist/. That is the point:
// nothing about it reaches the CDN, so without the password there is no page to fetch,
// view-source or scrape. See netlify/edge-functions/admin.ts.
//
// The generated file is committed so the deploy never depends on build order, and it is
// server-side only. It does contain deck passcodes in the clear, which is no worse than
// deck.ts already being in this private repo, but it must never be copied into dist/.
//
// It lives in lib/ because Netlify turns every TOP-LEVEL file in netlify/edge-functions/
// into an edge function; a data module up there fails the bundle with "default export
// must be a function". Subdirectories are for shared code.
const hubDir = join(root, "hub");
{
  const entries = [];
  for (const b of built) entries.push({ ...b, ...(await deckMeta(b.name)), ...deckInternal(b.name) });
  // Newest first, which is what makes the index scannable. Decks with no date sort to the
  // bottom rather than to 1970, then alphabetically so the order is stable.
  entries.sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.name.localeCompare(b.name));

  const page = readFileSync(join(hubDir, "template.html"), "utf8")
    .replace("__DECKS__", JSON.stringify(entries))
    .replaceAll("__BRAND_NAME__", brand.name);

  writeFileSync(join(edgeLib, "hub.js"),
    "// GENERATED by build.mjs. Do not edit. Server-side only, never served as a file.\n" +
    `export const HUB_HTML = ${JSON.stringify(page)};\n`);
  console.log(`\n· hub -> /admin  (${entries.length} decks, compiled into the edge function)`);
}

// The editor at /admin/edit/<name>.
//
// ONE bundle for every deck, at /_admin/, built once. It contains the engine and no deck
// content whatsoever; the deck being edited is injected into the gated HTML by the edge
// function. So the split is: renderer on the CDN, copy behind the password. A stranger who
// guesses /_admin/assets/index-*.js gets a slideshow engine with nothing to show.
//
// The generated module holds every deck in full, which is more than hub.js holds, and is the
// reason it lives in lib/ and is served only from inside the edge function. It must never be
// copied into dist/.
{
  // The bundle itself was built above, in the same pool as the decks. This is the part that
  // cannot be: it reads the manifest that build wrote, to learn the hashed filenames.
  const manifest = JSON.parse(readFileSync(join(dist, "_admin", ".vite", "manifest.json"), "utf8"));
  const entry = Object.values(manifest).find((e) => e.isEntry);
  if (!entry) throw new Error("no entry in the admin manifest; the editor cannot be served");
  const js = "/_admin/" + entry.file;
  const css = (entry.css ?? []).map((f) => "/_admin/" + f);

  // Netlify sets COMMIT_REF on a deploy; git is there locally. Either way the editor stamps
  // the commit it was built from, so an edit made against a stale page can be spotted.
  // stderr is discarded on purpose: a repo with no commits yet (a fresh clone of the engine,
  // before anything is committed) makes git print "fatal: Needed a single revision" into an
  // otherwise clean build log, for a value we already have a fallback for.
  const sha = (process.env.COMMIT_REF || (() => {
    try {
      return execSync("git rev-parse --short HEAD", { cwd: userRoot, stdio: ["ignore", "pipe", "ignore"] })
        .toString().trim();
    } catch { return "unknown"; }
  })()).slice(0, 7);

  const decks = {};
  for (const b of built) {
    const deck = await deckFull(b.name);
    if (deck) decks[b.name] = { name: b.name, slug: b.slug, sha, deck };
  }

  writeFileSync(join(edgeLib, "editor.js"),
    "// GENERATED by build.mjs. Do not edit. Server-side only, never served as a file.\n" +
    "// Holds every deck IN FULL. Serving this from the CDN would publish every deck at once.\n" +
    `const DECKS = ${JSON.stringify(decks)};\n` +
    `const JS = ${JSON.stringify(js)};\n` +
    `const CSS = ${JSON.stringify(css)};\n` +
    `export const EDITOR_DECKS = Object.keys(DECKS);\n` +
    `export function editorHtml(name) {
  // hasOwn, not DECKS[name]: "constructor" would otherwise find Object and render it.
  const boot = Object.hasOwn(DECKS, name) ? DECKS[name] : null;
  if (!boot) return null;
  return \`<!doctype html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>\${boot.name} \u00b7 review & edit</title>
\${CSS.map((h) => \`<link rel="stylesheet" href="\${h}">\`).join("")}
</head><body><div id="root"></div>
<script>window.__EDIT__=\${JSON.stringify(boot).replace(/</g, "\\\\u003c")}</script>
<script type="module" src="\${JS}"></script>
</body></html>\`;
}\n`);
  console.log(`· editor -> /admin/edit/<deck>  (${Object.keys(decks).length} decks, compiled into the edge function)`);
}

// Cache-Control for deck media so the in-app prefetch (see useVideoPrefetch) is reused and repeat
// opens are instant. Concrete per-slug paths, which Netlify's _headers matches reliably (a ":slug"
// placeholder in netlify.toml did not). 1h, not "immutable": media is sometimes swapped at the same
// path, and Netlify's ETag revalidates cheaply (304) after the hour, picking up replacements.
const headerRules = built
  .flatMap(({ slug }) => [
    `/${slug}/videos/*`,
    "  Cache-Control: public, max-age=3600",
    `/${slug}/images/*`,
    "  Cache-Control: public, max-age=3600",
  ])
  .join("\n");
writeFileSync(join(dist, "_headers"), headerRules + "\n");

// Neutral root page. Decks live only at /<slug>/, so the root reveals nothing; this
// also gives the deploy a second top-level entry (Netlify won't unwrap a single folder).
writeFileSync(join(dist, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="robots" content="noindex" />
<title>${brand.name}</title>
<style>html,body{height:100%;margin:0;display:grid;place-items:center;background:#fff;font-family:"Inter",system-ui,sans-serif}
p{font-weight:700;font-size:20px;letter-spacing:-0.6px;color:#181b1b;font-feature-settings:"salt";text-transform:lowercase}</style>
</head><body><p>${brand.name}</p></body></html>
`);

// The type scale is a rule, so the build holds it rather than a person remembering to.
//
// Every font-size in the engine has to name a step from tokens.css. This is here rather than in
// a script of its own because it is three lines of work and one more file to find; it runs on
// every build for the same reason the leak check does.
//
// Scoped to src/engine deliberately. mockups/ is a vendored snapshot of the marketing site and
// is kept diffable against it, so its sizes are the site's business, not this repo's. The admin
// editor has its own chrome tokens and is not a slide.
function checkTypeScale() {
  const dirs = [join(root, "src", "engine")];
  // A site's theme overrides tokens, so it is exactly where a raw size would sneak in, and its
  // named themes (themes/) doubly so: a register that wants bigger type is the obvious place to
  // write a size straight in. A theme may re-value a step, as it may any token; it may not add one.
  const theme = join(userRoot, "theme.css");
  const themes = join(userRoot, "themes");
  if (existsSync(themes)) dirs.push(themes);
  // Deck-local scenes moved OUT of src/engine, and their stylesheets are exactly the ones most
  // likely to invent a size, because they are written for one slide. Scoping this check to the
  // engine would have quietly exempted them the day they moved.
  for (const d of readdirSync(decksDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const sc = join(decksDir, d.name, "scenes");
    if (existsSync(sc)) dirs.push(sc);
  }
  const files = [...(existsSync(theme) ? [theme] : []), ...dirs.flatMap((dir) => readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((f) => f.isFile() && f.name.endsWith(".css"))
    .map((f) => join(f.parentPath ?? f.path, f.name)))];
  const bad = [];
  for (const f of files) {
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      // Capture the value and test it, rather than trying to exclude the good case in the
      // pattern: `font-size:\s*(?!var\(--type-)` looks right and is not, because \s* happily
      // backtracks to zero characters and then the lookahead is satisfied by the space.
      const m = line.match(/font-size:\s*([^;}]+)/);
      const value = m?.[1].trim();
      if (value && !value.startsWith("var(--type-") && value !== "inherit") {
        bad.push(`${relative(userRoot, f)}:${i + 1}  font-size: ${value}`);
      }
    });
  }
  if (bad.length) {
    console.error(`\n✗ type scale: ${bad.length} font-size(s) not on the scale in tokens.css\n`);
    bad.forEach((b) => console.error(`   ${b}`));
    console.error("\n  Use a step: --type-display/headline/title/subhead/body/note/label/ui.");
    console.error("  A size that fits none of them is a sign the type is doing a new job;");
    console.error("  pick the nearest step rather than adding a ninth.\n");
    process.exit(1);
  }
  console.log(`· type scale: ${files.length} stylesheets, every font-size on the scale`);
}
checkTypeScale();

// Handout text prints into a fixed 120px band (export.css), so there is a length past which a
// client silently gets a clipped sentence in the PDF they were sent. Refusing to build is the
// less bad outcome, and the limit is roughly three lines at the width the band gives.
const HANDOUT_MAX = 320;
{
  // The registries, read once before the build by siteNames (scripts/check.mjs): engine scenes
  // are files in src/engine/scenes/, a deck's own are the keys of its scenes/index.ts, because
  // that registry is what the engine actually merges.
  const known = registered.engineScenes;
  const deckScenes = (name) => registered.deckScenes[name] ?? [];
  const clashes = [];

  // Themes are the site's stylesheets in themes/, one per name, and the filename IS the name
  // (vite.config.ts imports exactly the files this pattern accepts). So the folder is the
  // registry, and this is the check `theme?: "editorial"` used to get from a union in types.ts.
  const themesDir = join(userRoot, "themes");
  const themeFiles = existsSync(themesDir)
    ? readdirSync(themesDir, { withFileTypes: true }).filter((f) => f.isFile()).map((f) => f.name)
    : [];
  const knownThemes = themeFiles.filter((f) => /^[a-z0-9-]+\.css$/.test(f)).map((f) => f.slice(0, -4));
  const badThemes = [];
  // A file the pattern refuses would not be loaded at all, and a slide naming it would then pass
  // this check against the wrong spelling and render in no theme. Refuse it here instead.
  for (const f of themeFiles) {
    if (f.endsWith(".css") && !knownThemes.includes(f.slice(0, -4))) {
      badThemes.push(`themes/${f}: a theme's filename is its name, in lowercase kebab-case`);
    }
  }
  // Every theme is in every bundle (see siteThemes in vite.config.ts), so a rule that is not
  // scoped to its own name restyles every deck on the site. A copied file whose selector still
  // names the theme it was copied from is the likely way to get there, and it would quietly
  // give that other theme a second definition.
  //
  // So every selector is checked, not just one: a copy that fixes its first rule but keeps the
  // source's dark rule, or a stray bare `:root`, would otherwise pass. At-rule preludes (@media,
  // @font-face, @keyframes) are skipped as wrappers, and keyframe stops are not selectors.
  const ownScope = (t) => new RegExp(`\\[data-deck-theme=(?:"${t}"|'${t}'|${t})\\]`);
  for (const t of knownThemes) {
    const css = readFileSync(join(themesDir, `${t}.css`), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const preludes = [...css.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim());
    const selectors = preludes.filter((p) => !p.startsWith("@")).flatMap((p) => p.split(",").map((s) => s.trim()))
      .filter((s) => s && !/^(from|to|\d+(\.\d+)?%)$/.test(s));
    if (!selectors.length) badThemes.push(`themes/${t}.css: no rule for [data-deck-theme="${t}"]`);
    for (const s of selectors.filter((s) => !ownScope(t).test(s))) {
      badThemes.push(`themes/${t}.css: "${s}" is not scoped under [data-deck-theme="${t}"]`);
    }
  }
  if (badThemes.length) {
    console.error(`\n✗ themes/ has a file the engine cannot use:\n`);
    badThemes.forEach((b) => console.error(`   ${b}`));
    console.error("\n  themes/<name>.css is the theme `theme: \"<name>\"` selects, and every rule in it");
    console.error("  is scoped under [data-deck-theme=\"<name>\"]. See THEMES in the engine's tokens.css.\n");
    process.exit(1);
  }

  // Unknown scene, mockup and theme names are refused before the build, in shapeProblems
  // (scripts/check.mjs). What is left here is what needs every deck at once.
  const over = [];
  for (const b of built) {
    eachSlide(await deckFull(b.name), (sl, where, _sec, isSection) => {
      if (typeof sl?.handout === "string" && sl.handout.length > HANDOUT_MAX) {
        over.push(`${b.name} ${where}${isSection ? " (divider)" : ""}: ${sl.handout.length} chars (max ${HANDOUT_MAX})`);
      }
    });
  }
  if (over.length) {
    console.error(`\n✗ handout text too long to print without clipping:\n`);
    over.forEach((o) => console.error(`   ${o}`));
    console.error("\n  Handout copy is two or three sentences, not a page. Cut it, or move the");
    console.error("  rest onto the slide where it can breathe.\n");
    process.exit(1);
  }
  for (const b of built) {
    for (const n of deckScenes(b.name)) {
      if (known.includes(n)) clashes.push(`${b.name}/scenes claims "${n}", which the engine also has`);
    }
  }
  if (clashes.length) {
    console.error(`\n✗ a scene name resolves in two places:\n`);
    clashes.forEach((c) => console.error(`   ${c}`));
    console.error("\n  Deck-local would win at runtime, which is a shadow you would find while");
    console.error("  presenting. Rename one, or delete the engine copy if the deck's has diverged.\n");
    process.exit(1);
  }
  // Nothing else notices an engine scene going out of use; `three-walls` sat orphaned for a
  // while before anyone looked. This is a report, not a failure: an unused scene is untidy,
  // not broken.
  const usedAnywhere = new Set(built.flatMap((b) => deckScenes(b.name)));
  for (const b of built) {
    eachSlide(await deckFull(b.name), (sl) => { if (sl?.type === "scene") usedAnywhere.add(sl.name); });
  }
  const orphans = known.filter((n) => !usedAnywhere.has(n));
  const deckCounts = built.map((b) => [b.name, deckScenes(b.name).length]).filter(([, n]) => n);
  console.log(`· registries: ${known.length} engine scene(s), ${registered.mockup.length} mockups `
    + `(${registered.mockup.join(", ")}), ${knownThemes.length} theme(s) (${knownThemes.join(", ")})`
    + (deckCounts.length ? `, deck scenes: ${deckCounts.map(([n, c]) => `${n} ${c}`).join(", ")}` : ""));
  if (orphans.length) console.log(`    engine scenes no deck uses: ${orphans.join(", ")}`);
}

// On-screen body copy that has grown into a wall. See VOICE.md section 3.
//
// REPORTED, NOT ENFORCED, and the difference is deliberate. `handout` fails the build at 320
// because it is print copy in a fixed-height band, so over-long silently clips and the fix is
// always safe. This is the opposite case: several decks here were sent to clients months ago
// and still live at their URLs, so failing would either rewrite what somebody already read or
// need an exemption list. A line in the build output every time is the honest instrument.
//
// Note the inversion this exists to catch: before it, the copy that gets READ (the handout, in
// a PDF, alone, at leisure) was capped at 320 and the copy nobody reads (a paragraph on a wall,
// for three seconds) had no limit at all, and had reached 400.
const BODY_MAX = 240;
{
  const fat = [];
  for (const b of built) {
    eachSlide(await deckFull(b.name), (sl, where, _sec, isSection) => {
      const body = isSection ? undefined : sl?.note ?? sl?.paragraph;
      if (typeof body === "string" && body.length > BODY_MAX) {
        fat.push(`${b.name} ${where}: ${body.length} chars: ${body.slice(0, 52)}...`);
      }
    });
  }
  if (fat.length) {
    console.log(`\n· body copy: ${fat.length} slide(s) over ${BODY_MAX} chars on screen (VOICE.md §4)`);
    fat.forEach((f) => console.log(`    ${f}`));
    console.log("    Aim under 120. The sentence usually belongs in `handout`, which prints.");
  } else {
    console.log(`· body copy: every slide under ${BODY_MAX} chars on screen`);
  }
}

// Last, so it sees everything that is about to be deployed. Exits non-zero on a hit.
await checkLeaks({ dist, decksDir });

console.log(`\nBuilt ${built.length} deck(s):`);
built.forEach((b) => console.log(`  ${b.name}  ->  /${b.slug}/`));
