// Builds every deck under decks/<name>/ into dist/<slug>/ (one Vite build per deck),
// copies that deck's static media (videos/ and images/) in, and writes a neutral root page.
// Each deck is served at <the site's domain>/<slug>/; see brand.json.
// Run:  node build.mjs   (or: npm run build)
import { execSync, execFile } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { cp } from "node:fs/promises";
import { cpus } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build as esbuild } from "esbuild";
import { checkLeaks } from "./scripts/check-leaks.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const decksDir = join(root, "decks");
const dist = join(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

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
// JOBS=1 restores the old one-at-a-time behaviour, which is what you want when a build fails and
// you would rather read the output in order than find it.
const JOBS = Math.max(1, Number(process.env.JOBS) || Math.min(4, cpus().length - 1));
const VITE = join(root, "node_modules", "vite", "bin", "vite.js");

function viteBuild(env) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath, [VITE, "build"],
      { cwd: root, env: { ...process.env, ...env }, maxBuffer: 64e6 },
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

console.log(`— building ${deckJobs.length} decks + the editor, ${JOBS} at a time\n`);
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

console.log(`\n— ${built.length} decks + editor built in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

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
    return {
      title: (d.title?.headingHtml || name).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      eyebrow: d.title?.eyebrow || "",
      sub: d.title?.sub || "",
      passcodes: Array.isArray(d.passcodes) ? d.passcodes : [],
      sections: Array.isArray(d.sections) ? d.sections.length : 0,
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
  existsSync(join(root, "brand.json"))
    ? join(root, "brand.json")
    : join(root, "src", "engine", "brand.example.json"), "utf8"));

// lib/ holds three generated modules and is created here rather than assumed. A checkout that
// has never built has no reason to contain it: the files in it are output, and a fresh clone of
// a repo that gitignores them starts without the folder at all.
const edgeLib = join(root, "netlify", "edge-functions", "lib");
mkdirSync(edgeLib, { recursive: true });

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
  console.log(`\n— hub -> /admin  (${entries.length} decks, compiled into the edge function)`);
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
      return execSync("git rev-parse --short HEAD", { cwd: root, stdio: ["ignore", "pipe", "ignore"] })
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
  const boot = DECKS[name];
  if (!boot) return null;
  return \`<!doctype html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>\${boot.name} \u00b7 edit</title>
\${CSS.map((h) => \`<link rel="stylesheet" href="\${h}">\`).join("")}
</head><body><div id="root"></div>
<script>window.__EDIT__=\${JSON.stringify(boot).replace(/</g, "\\\\u003c")}</script>
<script type="module" src="\${JS}"></script>
</body></html>\`;
}\n`);
  console.log(`— editor -> /admin/edit/<deck>  (${Object.keys(decks).length} decks, compiled into the edge function)`);
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
  // Deck-local scenes moved OUT of src/engine, and their stylesheets are exactly the ones most
  // likely to invent a size, because they are written for one slide. Scoping this check to the
  // engine would have quietly exempted them the day they moved.
  for (const d of readdirSync(decksDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const sc = join(decksDir, d.name, "scenes");
    if (existsSync(sc)) dirs.push(sc);
  }
  const files = dirs.flatMap((dir) => readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((f) => f.isFile() && f.name.endsWith(".css"))
    .map((f) => join(f.parentPath ?? f.path, f.name)));
  const bad = [];
  for (const f of files) {
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      // Capture the value and test it, rather than trying to exclude the good case in the
      // pattern: `font-size:\s*(?!var\(--type-)` looks right and is not, because \s* happily
      // backtracks to zero characters and then the lookahead is satisfied by the space.
      const m = line.match(/font-size:\s*([^;}]+)/);
      const value = m?.[1].trim();
      if (value && !value.startsWith("var(--type-") && value !== "inherit") {
        bad.push(`${f.slice(root.length + 1)}:${i + 1}  font-size: ${value}`);
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
  console.log(`— type scale: ${files.length} stylesheets, every font-size on the scale`);
}
checkTypeScale();

// Handout text prints into a fixed 120px band (export.css), so there is a length past which a
// client silently gets a clipped sentence in the PDF they were sent. Refusing to build is the
// less bad outcome, and the limit is roughly three lines at the width the band gives.
const HANDOUT_MAX = 320;
{
  // Scenes are registered by being a file in src/engine/scenes/ (see SCENES in slides.tsx), so
  // this is what replaces the union that used to sit in types.ts. It buys the same error on a
  // typo, and one the union never gave: a deck still naming a scene somebody has since deleted.
  const sceneDir = join(root, "src", "engine", "scenes");
  const kebab = (n) => n.replace(/\.tsx$/, "").replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  const known = readdirSync(sceneDir, { withFileTypes: true })
    .filter((f) => f.isFile() && f.name.endsWith(".tsx"))   // scenes/lib/ holds helpers, not scenes
    .map((f) => kebab(f.name));

  // A deck's own scenes, read from the registry it publishes rather than from its filenames,
  // because that registry is what the engine actually merges.
  const deckScenes = (name) => {
    const f = join(decksDir, name, "scenes", "index.ts");
    if (!existsSync(f)) return [];
    return [...readFileSync(f, "utf8").matchAll(/^\s*"([a-z0-9-]+)"\s*:/gm)].map((m) => m[1]);
  };
  const clashes = [];

  // Mockups follow the same rule as deck scenes and for the same reason: the registry the
  // engine actually merges is the list of valid names, so read that rather than a directory.
  // `mockup` in types.ts is a plain string so that adding one is dropping in a file and adding
  // a line, and this check is what the union it replaced used to buy.
  const knownMockups = (() => {
    const f = join(root, "mockups", "index.ts");
    if (!existsSync(f)) return [];
    return [...readFileSync(f, "utf8").matchAll(/^\s*"([a-z0-9-]+)"\s*:/gm)].map((m) => m[1]);
  })();

  const over = [];
  const missing = [];
  const missingMockups = [];
  const walk = (deck, name) => {
    const check = (text, where) => {
      if (typeof text === "string" && text.length > HANDOUT_MAX) {
        over.push(`${name} ${where}: ${text.length} chars (max ${HANDOUT_MAX})`);
      }
    };
    check(deck?.title?.handout, "title");
    check(deck?.agenda?.handout, "agenda");
    (deck?.sections ?? []).forEach((sec, i) => {
      check(sec.handout, `sections[${i}] divider`);
      (sec.slides ?? []).forEach((sl, j) => {
        check(sl.handout, `sections[${i}].slides[${j}]`);
        if (typeof sl.scene === "string"
            && !known.includes(sl.scene) && !deckScenes(name).includes(sl.scene)) {
          missing.push(`${name} sections[${i}].slides[${j}]: scene "${sl.scene}"`);
        }
        if (typeof sl.mockup === "string" && !knownMockups.includes(sl.mockup)) {
          missingMockups.push(`${name} sections[${i}].slides[${j}]: mockup "${sl.mockup}"`);
        }
      });
    });
  };
  for (const b of built) walk(await deckFull(b.name), b.name);

  if (missing.length) {
    console.error(`\n✗ scene not found. Known scenes: ${known.join(", ") || "(none)"}\n`);
    missing.forEach((m) => console.error(`   ${m}`));
    console.error("\n  A scene is a component in src/engine/scenes/, named in kebab-case:");
    console.error("  ValueChain.tsx is scene: \"value-chain\". Helpers belong in scenes/lib/.\n");
    process.exit(1);
  }
  if (missingMockups.length) {
    console.error(`\n✗ mockup not found. Known mockups: ${knownMockups.join(", ") || "(none)"}\n`);
    missingMockups.forEach((m) => console.error(`   ${m}`));
    console.error("\n  A mockup is a name registered in mockups/index.ts:");
    console.error("  DesignerEmbed.tsx is mockup: \"designer\".\n");
    process.exit(1);
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
    const deck = await deckFull(b.name);
    (deck?.sections ?? []).forEach((sec) => (sec.slides ?? []).forEach((sl) => {
      if (typeof sl.scene === "string") usedAnywhere.add(sl.scene);
    }));
  }
  const orphans = known.filter((n) => !usedAnywhere.has(n));
  const deckCounts = built.map((b) => [b.name, deckScenes(b.name).length]).filter(([, n]) => n);
  console.log(`— registries: ${known.length} engine scene(s), ${knownMockups.length} mockups `
    + `(${knownMockups.join(", ")})`
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
    const deck = await deckFull(b.name);
    (deck?.sections ?? []).forEach((sec, i) => {
      (sec.slides ?? []).forEach((sl, j) => {
        const body = sl.note ?? sl.paragraph;
        if (typeof body === "string" && body.length > BODY_MAX) {
          fat.push(`${b.name} sections[${i}].slides[${j}]: ${body.length} chars — ${body.slice(0, 52)}...`);
        }
      });
    });
  }
  if (fat.length) {
    console.log(`\n— body copy: ${fat.length} slide(s) over ${BODY_MAX} chars on screen (VOICE.md §4)`);
    fat.forEach((f) => console.log(`    ${f}`));
    console.log("    Aim under 120. The sentence usually belongs in `handout`, which prints.");
  } else {
    console.log(`— body copy: every slide under ${BODY_MAX} chars on screen`);
  }
}

// Last, so it sees everything that is about to be deployed. Exits non-zero on a hit.
await checkLeaks({ dist, decksDir });

console.log(`\nBuilt ${built.length} deck(s):`);
built.forEach((b) => console.log(`  ${b.name}  ->  /${b.slug}/`));
