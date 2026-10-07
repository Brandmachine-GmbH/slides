// The package, used the way a stranger uses it. `npm run check`, and CI on every push.
//
// Everything else in this repo tests the engine from inside the repo, where every path resolves
// the convenient way. The failures that matter for a package only happen once it is installed:
// vite hoisted into somebody else's node_modules, the entry HTML under node_modules where Vite's
// dependency scan does not look, Deno refusing TypeScript from a package. Those were all found by
// a spike that did exactly this by hand, so this does it on every change instead.
//
// Two halves. First the tarball: `files` in package.json is an allowlist, and this fails if
// anything outside it would ship, or anything generated, because a denylist publishes whatever
// nobody thought about. Then a fresh folder: install the tarball, `slides init`, `slides new`,
// build, typecheck, and import the Netlify gate the way Deno will.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();
const step = (msg) => console.log(`— ${msg}`);

// ---- the tarball -------------------------------------------------------------------------------
const packed = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", tmpdir()], root))[0];
const tgz = join(tmpdir(), packed.filename);
const paths = packed.files.map((f) => f.path);

const bad = paths.filter((p) =>
  p.includes("netlify/edge-functions/lib/") ||    // every deck in full
  p.startsWith("template/dist/") ||
  /\.pdf$/.test(p) ||
  (p.startsWith("decks/")) ||                       // a real site's decks, never the package's
  p.endsWith("internal.json") && !p.startsWith("template/decks/example/") ||
  p.endsWith("slug.txt") && !p.startsWith("template/decks/example/"));
if (bad.length) {
  console.error(`\n✗ the tarball would publish ${bad.length} file(s) it must not:\n${bad.map((p) => "  " + p).join("\n")}\n`);
  process.exit(1);
}
if (!paths.includes("netlify/admin.js")) {
  console.error("\n✗ netlify/admin.js is missing from the tarball: the prepack compile did not run\n");
  process.exit(1);
}
step(`tarball: ${paths.length} files, ${(packed.size / 1024).toFixed(0)} KB, nothing outside the allowlist`);

// ---- a stranger's folder -----------------------------------------------------------------------
const site = mkdtempSync(join(tmpdir(), "slides-site-"));
try {
  // The README's own commands, as written. An earlier version of this wrote its own
  // package.json and pinned React by itself, and so missed the two ways the README's instructions
  // actually broke: an unpinned install pulling React 19, and npm 11's `npm init -y` writing
  // "type": "commonjs". If the README's Quick start changes, change this with it.
  run("npm", ["init", "-y"], site);
  run("npm", ["install", "--silent", "--no-audit", "--no-fund", tgz, "react@18", "react-dom@18"], site);
  run("npm", ["ci", "--silent", "--no-audit", "--no-fund"], site);
  step("README install: npm init -y, install with React 18, and npm ci on the lockfile it left");

  const slides = (...a) => run(process.execPath, [join(site, "node_modules", "@brandmachine", "slides", "bin", "slides.mjs"), ...a], site);
  slides("init");
  const slug = readFileSync(join(site, "decks", "example", "slug.txt"), "utf8").trim();
  const published = readFileSync(join(root, "template", "decks", "example", "slug.txt"), "utf8").trim();
  if (slug === published) throw new Error("slides init kept the published example slug");
  step("slides init: template written, example given its own slug");

  slides("new", "acme");
  if (!existsSync(join(site, "decks", "acme", "slug.txt"))) throw new Error("slides new wrote no slug");
  step("slides new acme");

  const out = slides("build");
  if (!/Built 2 deck/.test(out)) throw new Error(`build did not build both decks:\n${out}`);
  step("slides build: 2 decks, every check");

  run(process.execPath, [join(site, "node_modules", "typescript", "bin", "tsc"), "--noEmit", "-p", "."], site);
  step("tsc over the site's decks");

  // serve imports the generated modules from the site, so it is where the site's package.json
  // "type" decides whether they load at all.
  const port = 8800 + Math.floor(Math.random() * 90);
  const srv = spawn(process.execPath, [join(site, "node_modules", "@brandmachine", "slides", "bin", "slides.mjs"), "serve"],
    { cwd: site, env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
  try {
    let status = 0;
    for (let i = 0; i < 40 && status !== 200; i++) {
      await new Promise((r) => setTimeout(r, 250));
      status = await fetch(`http://localhost:${port}/admin`).then((r) => r.status, () => 0);
    }
    if (status !== 200) throw new Error(`slides serve did not answer /admin (last status ${status})`);
  } finally {
    srv.kill();
  }
  step("slides serve answers /admin");

  // Deno is what runs this in production and it will not strip types from node_modules, which is
  // why the gate ships compiled. Importing it through the package's own export map from the site
  // proves the name resolves and the file is plain JavaScript.
  const probe = join(site, "probe.mjs");
  writeFileSync(probe, 'import { adminHandler } from "@brandmachine/slides/netlify";\nif (typeof adminHandler !== "function") process.exit(1);\n');
  run(process.execPath, [probe], site);
  step("@brandmachine/slides/netlify resolves to plain JavaScript");
} finally {
  rmSync(site, { recursive: true, force: true });
  rmSync(tgz, { force: true });
}
console.log("\npackage check passed\n");
