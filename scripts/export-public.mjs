// Copy the engine, and only the engine, into the public repo.
//
// The two repos are not wired together with git. Engine work keeps happening here, where the
// decks are, because that is where it has always happened and a change to a slide kind is
// usually made in the same sitting as the deck that wanted it. Publishing is a separate,
// deliberate act: this script.
//
// It stages into a temp directory and runs scripts/check-public.mjs over THAT, before anything
// is written into the public checkout. So a failing check cannot leave a client's name sitting
// in a public working tree waiting to be committed by accident. Nothing is ever committed or
// pushed from here: it writes files and leaves you a diff to read.
//
// Usage:  make export-public              (target defaults to ../slides-engine)
//         make export-public DEST=<dir>
import { readdirSync, readFileSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { cpSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dest = process.argv[2] || join(root, "..", "slides-engine");

/* WHAT THE PUBLIC REPO GETS.
 *
 * An allowlist, never a denylist, and never "the tree minus some things". A denylist is wrong
 * by default: anything added to this repo that nobody thought about is published. This way
 * anything new is private until a person puts it on this list.
 *
 * `dir` entries are MIRRORED, so a file deleted here is deleted there. `file` entries are just
 * copied. Everything else in the public repo (its README, its LICENSE, decks/example, its CI)
 * is authored there and is never touched by this. */
const DIRS = [
  "src/engine",
  "src/admin",
  "scripts",
  "hub",
  "netlify/edge-functions",   // mirrored, which is how lib/ stays out
];
const FILES = [
  "src/main.tsx",
  "src/vite-env.d.ts",
  "build.mjs",
  "vite.config.ts",
  "Makefile",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "index.html",
  "netlify.toml",
  ".gitignore",
];

/* Deck folder names that are ordinary English words and appear legitimately in engine source
 * ("a pricing page" is a comment in slides.module.css). Everything else under decks/ becomes a
 * forbidden term, so a new client is covered the day the folder is created and nobody has to
 * remember to add them. "brandmachine" is here because the public repo is ours: the LICENSE and
 * the repo owner say so on purpose. */
const NOT_A_CLIENT = new Set(["example", "pricing", "brandmachine"]);

/** Every name this repo must not publish, derived from the repo rather than kept as a list, so
 *  that it cannot go stale the way a hand-maintained one does. */
function denyTerms() {
  const terms = new Set();

  const decksDir = join(root, "decks");
  if (existsSync(decksDir)) {
    for (const name of readdirSync(decksDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      if (!NOT_A_CLIENT.has(name.name)) terms.add(name.name);

      // The sidecar holds the things worth catching most: a company written out in full, and
      // the contact names in its note. Two or more capitalised words, the same shape
      // check-leaks.mjs looks for, because that is what a person's name looks like.
      const f = join(decksDir, name.name, "internal.json");
      if (!existsSync(f)) continue;
      const data = JSON.parse(readFileSync(f, "utf8"));
      for (const value of Object.values(data)) {
        if (typeof value !== "string") continue;
        for (const m of value.matchAll(/\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+)+/gu)) terms.add(m[0]);
      }
      if (typeof data.company === "string" && data.company.trim()) terms.add(data.company.trim());
    }
  }

  const leaks = join(root, "leaks.json");
  if (existsSync(leaks)) for (const t of JSON.parse(readFileSync(leaks, "utf8")).forbidden ?? []) terms.add(t);

  // Our own name and our own product names are public by design: we own the public repo, its
  // LICENSE says so, and the engine's docs name the products a mockup can draw. They reach this
  // list because they turn up in internal.json notes like any other proper noun, so they are
  // subtracted here rather than never collected, which keeps the collection rule simple.
  const brandFile = existsSync(join(root, "brand.json"))
    ? join(root, "brand.json")
    : join(root, "src", "engine", "brand.example.json");
  const brand = JSON.parse(readFileSync(brandFile, "utf8"));
  const ours = new Set([brand.name, ...(brand.products ?? [])].filter(Boolean).map((s) => s.toLowerCase()));

  return [...terms].filter((t) => t.length >= 4 && !ours.has(t.toLowerCase()));
}

/** Mirror `src` onto `dst`: copy everything, then delete whatever is there and should not be. */
function mirror(src, dst) {
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
}

const stage = join(tmpdir(), `slides-export-${process.pid}`);
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

let copied = 0;
const count = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) count(join(d, e.name)); else copied++;
  }
};

for (const d of DIRS) {
  const from = join(root, d);
  if (!existsSync(from)) continue;
  mirror(from, join(stage, d));
}
for (const f of FILES) {
  const from = join(root, f);
  if (!existsSync(from)) { console.warn(`  (skipped, not here: ${f})`); continue; }
  mkdirSync(dirname(join(stage, f)), { recursive: true });
  cpSync(from, join(stage, f));
}

// The generated edge-function modules are the single most sensitive pair of files in this repo:
// one holds every deck in full, the other every slug and passcode. Mirroring the folder already
// leaves them behind, and this makes that a rule rather than a side effect.
rmSync(join(stage, "netlify/edge-functions/lib"), { recursive: true, force: true });

count(stage);

const terms = denyTerms();
const denyFile = join(tmpdir(), `slides-deny-${process.pid}.json`);
writeFileSync(denyFile, JSON.stringify({ terms }, null, 2));

// Check the STAGE, not the destination. If this exits non-zero nothing has been written into
// the public checkout at all, which is the whole reason for staging.
try {
  execFileSync(process.execPath, [join(root, "scripts", "check-public.mjs"), stage, "--deny", denyFile],
    { stdio: "inherit" });
} catch {
  rmSync(stage, { recursive: true, force: true });
  rmSync(denyFile, { force: true });
  console.error("\n  Nothing was written to the public repo.\n");
  process.exit(1);
}
rmSync(denyFile, { force: true });

if (!existsSync(dest)) {
  console.error(`\n  No public checkout at ${dest}`);
  console.error("  Create it first, or pass one:  make export-public DEST=<dir>\n");
  rmSync(stage, { recursive: true, force: true });
  process.exit(1);
}

for (const d of DIRS) {
  const from = join(stage, d);
  if (!existsSync(from)) continue;
  rmSync(join(dest, d), { recursive: true, force: true });
  mirror(from, join(dest, d));
}
for (const f of FILES) {
  const from = join(stage, f);
  if (!existsSync(from)) continue;
  mkdirSync(dirname(join(dest, f)), { recursive: true });
  cpSync(from, join(dest, f));
}
rmSync(stage, { recursive: true, force: true });

console.log(`\n— exported ${copied} files to ${relative(process.cwd(), dest) || dest}`);
console.log(`— ${terms.length} private terms checked, none present`);
console.log("\n  Nothing was committed. Read the diff there before you do:");
console.log(`    cd ${dest} && git status && git diff\n`);
