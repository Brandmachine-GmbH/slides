#!/usr/bin/env node
// The `slides` command. It runs the package's own build and scripts against the site in the
// current directory, which is the whole difference from before the package existed: a site
// holds decks and nothing else, and every tool here finds it through SLIDES_ROOT.
//
// Deliberately thin. Each command is one of the scripts beside it, so the scripts stay runnable
// on their own and this file never grows logic of its own that could drift from them.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const pkg = join(dirname(fileURLToPath(import.meta.url)), "..");
const site = process.cwd();
const [cmd, ...args] = process.argv.slice(2);

const HELP = `slides <command>

  init                 set this folder up as a deck site (never overwrites a file)
  new <deck>           a new deck under decks/<deck>/, with its own fresh secret slug
  dev <deck>           one deck at localhost:5173, reloading as you edit
  build                every deck into dist/, the /admin index and editor, and every check
  serve [--build]      the built site at localhost:8888, /admin included, no password
  pdf <deck>           a vector PDF leave-behind at decks/<deck>/<deck>.pdf
  motion <deck>        build, then measure every transition in a deck for jumps
  verify [url]         check a deployed site: the gate, the headers, the neutral root
`;

function run(script, extra = [], env = {}) {
  const r = spawnSync(process.execPath, [join(pkg, script), ...extra], {
    stdio: "inherit",
    cwd: pkg,
    env: { ...process.env, SLIDES_ROOT: site, ...env },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function decks() {
  const d = join(site, "decks");
  return existsSync(d) ? readdirSync(d).filter((n) => existsSync(join(d, n, "deck.ts"))) : [];
}

// A deck name is optional when there is exactly one, which is every site on its first day.
function deckArg() {
  // A known deck name wins wherever it sits, so `--port 3000 example` works; failing that, the
  // first word that is neither a flag nor a flag's value is taken to be a mistyped deck.
  const positional = args.filter((a, i) => !a.startsWith("-") && !(i > 0 && /^--[^=]+$/.test(args[i - 1])));
  const name = args.find((a) => decks().includes(a)) ?? positional[0];
  if (name) {
    if (!decks().includes(name)) fail(`no deck called "${name}". Decks here: ${decks().join(", ") || "none"}`);
    return name;
  }
  const all = decks();
  if (all.length === 1) return all[0];
  fail(`name a deck: slides ${cmd} <deck>. Decks here: ${all.join(", ") || "none, try slides new <deck>"}`);
}

function fail(msg) {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

/** Copy the package's template into the site, file by file, skipping anything already there. */
function copyTree(from, to, rename = {}) {
  const written = [];
  const walk = (src) => {
    for (const e of readdirSync(src)) {
      const s = join(src, e);
      const rel = relative(from, s);
      const d = join(to, rename[rel] ?? rel);
      if (statSync(s).isDirectory()) walk(s);
      else if (!existsSync(d)) {
        mkdirSync(dirname(d), { recursive: true });
        copyFileSync(s, d);
        written.push(relative(to, d));
      }
    }
  };
  walk(from);
  return written;
}

switch (cmd) {
  case "init": {
    // npm drops any file called .gitignore from a published package, so the template carries it
    // as `gitignore` and it is renamed on the way out.
    const written = copyTree(join(pkg, "template"), site, { gitignore: ".gitignore" });
    // The example's slug is published in the package, so a site's copy gets its own. It is only
    // the example, but a slug that is in a public tarball is not a secret.
    const slugFile = join(site, "decks", "example", "slug.txt");
    if (written.includes(join("decks", "example", "slug.txt"))) writeFileSync(slugFile, randomUUID() + "\n");
    console.log(written.length ? `\n  wrote:\n${written.map((w) => `    ${w}`).join("\n")}` : "\n  nothing to write, every file is already here");
    console.log(`\n  next:  npx slides dev example     (passcode: example)\n`);
    break;
  }

  case "new": {
    const name = args[0];
    if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) fail("usage: slides new <deck>   (lowercase letters, digits and dashes)");
    const dir = join(site, "decks", name);
    if (existsSync(dir)) fail(`decks/${name} already exists`);
    mkdirSync(join(dir, "images"), { recursive: true });
    mkdirSync(join(dir, "videos"), { recursive: true });
    // The one rule that keeps a deck private is a fresh UUID nobody has seen. Doing it here
    // makes it the tool's job rather than something the author has to remember.
    writeFileSync(join(dir, "slug.txt"), randomUUID() + "\n");
    writeFileSync(join(dir, "deck.ts"), readFileSync(join(pkg, "bin", "new-deck.ts"), "utf8").replaceAll("__NAME__", name));
    console.log(`\n  decks/${name}/ created with a fresh slug.\n  next:  npx slides dev ${name}\n`);
    break;
  }

  case "dev": {
    const deck = deckArg();
    const vite = join(dirname(createRequire(import.meta.url).resolve("vite/package.json")), "bin", "vite.js");
    const extra = args.filter((a) => a !== deck);
    const r = spawnSync(process.execPath, [vite, "--config", join(pkg, "vite.config.ts"), ...extra], {
      stdio: "inherit", cwd: pkg, env: { ...process.env, SLIDES_ROOT: site, VITE_DECK: deck },
    });
    process.exit(r.status ?? 0);
  }

  case "build":
    run("build.mjs");
    break;

  case "serve":
    if (args.includes("--build")) run("build.mjs");
    run("scripts/serve.mjs");
    break;

  case "pdf":
    run("scripts/export-pdf.mjs", [deckArg()]);
    break;

  case "motion": {
    const deck = deckArg();
    run("build.mjs");
    run("scripts/motion.mjs", [deck]);
    break;
  }

  case "verify":
    run("scripts/verify-deploy.mjs", args);
    break;

  case undefined:
  case "help":
  case "--help":
  case "-h":
    console.log(HELP);
    break;

  default:
    console.error(`unknown command: ${cmd}\n\n${HELP}`);
    process.exit(1);
}
