// The gate on what may sit in the PUBLIC engine repo.
//
// It runs twice, and both runs matter. `make export-public` runs it here, over the copy it has
// just written, with a denylist of every client and contact name this repo knows. The public
// repo runs it in CI over itself, with no denylist at all, because the names cannot live there:
// a list of the things you must not publish is itself a thing you must not publish.
//
// So the checks below are deliberately shape-based rather than name-based. A rule that asks
// "does this look like a secret slug" keeps working in a repo that has never heard of our
// clients, and keeps working when a client we have never had is added. The denylist is the
// extra pass, not the main one.
//
// Usage:  node scripts/check-public.mjs <dir> [--deny <file.json>]
//
// Exits non-zero on the first category that fails, with every offending path listed, so it can
// gate an export or a CI run.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, basename } from "node:path";

const args = process.argv.slice(2);
const dir = args[0];
const denyFile = args.includes("--deny") ? args[args.indexOf("--deny") + 1] : null;

if (!dir || !existsSync(dir)) {
  console.error("usage: node scripts/check-public.mjs <dir> [--deny <file.json>]");
  process.exit(2);
}

// The one deck that is allowed to exist, and therefore the one place a slug may appear.
const EXAMPLE = "decks/example";

// 5 MB. Not a privacy rule but a clone-size one: the public repo is something people clone to
// try, and a repo that starts with a hundred megabytes of media is one they do not.
const MAX_BYTES = 5 * 1024 * 1024;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Anything here is private by construction, whatever it contains. Listed as shapes rather than
// as a copy of the export allowlist, so that a file someone adds to the public repo by hand is
// checked too, not just the ones the export wrote.
const NEVER = [
  { test: (p) => basename(p) === "internal.json" && !p.startsWith(EXAMPLE),
    why: "a deck's private note" },
  { test: (p) => basename(p) === "slug.txt" && !p.startsWith(EXAMPLE),
    why: "a deck's secret URL" },
  { test: (p) => p.startsWith("netlify/edge-functions/lib/"),
    why: "generated, and holds every deck in full" },
  { test: (p) => p === "brand.json" || p.startsWith("brand/"),
    why: "one company's identity; the public repo ships the neutral example instead" },
  { test: (p) => p === "leaks.json", why: "the private denylist" },
  { test: (p) => p.startsWith("mockups/"), why: "a company's own product UI" },
  { test: (p) => p.startsWith("notes/"), why: "internal notes" },
  { test: (p) => p === ".env" || basename(p) === ".env", why: "secrets" },
];

const TEXT = /\.(ts|tsx|js|mjs|jsx|json|css|html|svg|md|txt|yml|yaml|toml|py)$/;

const files = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.name === ".git" || e.name === "node_modules" || e.name === "dist") continue;
    const full = join(d, e.name);
    if (e.isDirectory()) walk(full);
    else files.push(full);
  }
};
walk(dir);

const fail = [];
const rel = (f) => relative(dir, f).split("\\").join("/");

for (const f of files) {
  const p = rel(f);

  for (const rule of NEVER) {
    if (rule.test(p)) fail.push(`${p}  (${rule.why})`);
  }

  const size = statSync(f).size;
  if (size > MAX_BYTES) {
    fail.push(`${p}  (${(size / 1024 / 1024).toFixed(1)} MB, over the ${MAX_BYTES / 1024 / 1024} MB limit)`);
  }
}

if (fail.length) {
  console.error(`\ncheck-public: ${fail.length} file(s) that must not be here\n`);
  for (const f of fail) console.error("  " + f);
  console.error("");
  process.exit(1);
}

// A slug is the whole privacy model for a deck, so one in a public commit is permanent: GitHub
// keeps forks and caches, and so does everything that mirrors it. The only remedy would be
// re-slugging the deck and re-sending the link to a client who already has the old one. Hence a
// shape check over every text file rather than a check on slug.txt alone: a UUID pasted into a
// comment, a doc or a test fixture is the same leak.
const slugs = [];
for (const f of files) {
  const p = rel(f);
  if (!TEXT.test(p)) continue;
  if (p === `${EXAMPLE}/slug.txt`) continue;
  const text = readFileSync(f, "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(UUID);
    if (m) slugs.push(`${p}: ${m[0]}`);
  }
}
if (slugs.length) {
  console.error(`\ncheck-public: ${slugs.length} UUID(s) outside ${EXAMPLE}/slug.txt\n`);
  for (const s of slugs) console.error("  " + s);
  console.error("\n  A UUID here is a deck's secret URL. Published once is published forever.\n");
  process.exit(1);
}

// The name pass. Only ever runs on the private side, and the terms arrive by path so they never
// have to be written down in anything the public repo can see.
let terms = [];
if (denyFile) {
  if (!existsSync(denyFile)) {
    console.error(`check-public: --deny file not found: ${denyFile}`);
    process.exit(2);
  }
  terms = JSON.parse(readFileSync(denyFile, "utf8")).terms ?? [];
}

const hits = [];
for (const f of files) {
  const p = rel(f);
  if (!TEXT.test(p)) continue;
  const text = readFileSync(f, "utf8").toLowerCase();
  for (const term of terms) {
    const t = String(term).toLowerCase();
    if (t && text.includes(t)) hits.push(`${p}: "${term}"`);
  }
}
if (hits.length) {
  console.error(`\ncheck-public: ${hits.length} private term(s) found\n`);
  for (const h of hits) console.error("  " + h);
  console.error("");
  process.exit(1);
}

const kb = (files.reduce((n, f) => n + statSync(f).size, 0) / 1024).toFixed(0);
console.log(`check-public: ${files.length} files, ${kb} KB, clean` +
  (terms.length ? ` (${terms.length} private terms checked)` : " (no denylist given)"));
