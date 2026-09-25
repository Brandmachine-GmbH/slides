// Fails the build if anything private reached dist/.
//
// WHY THIS EXISTS. A deck is protected by an unguessable URL and a facade passcode, so
// everything in dist/<slug>/ should be assumed readable by the client who holds the link, and
// by anyone they forward it to. Several things keep private material out of there, and every
// one of them was a convention rather than a check:
//
//   - Vite minifies, which strips the comments in deck.ts. Those comments hold the internal
//     reasoning: who the deck is for, what we deliberately leave off a slide, what we noticed
//     about the client. Sourcemaps would ship the file verbatim.
//   - build.mjs copies only videos/ and images/, so decks/<name>/internal.json has no route
//     to the CDN. That is one line away from not being true.
//   - Images are copied byte for byte, so whatever metadata a file arrives with is published.
//     A phone photo carries GPS. A retouched file carries the retoucher's name.
//
// Run from build.mjs after every deck is built. Exits non-zero on a hit, which fails the
// deploy rather than shipping it.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import exifr from "exifr";
import ts from "typescript";

// Metadata fields that identify a person, a place or a device. Anything here in a shipped
// image is a leak. Deliberate tags are NOT listed: DigitalSourceType is the provenance
// declaration a deck can invite the client to go and find.
const PRIVATE_TAGS = [
  "Artist", "Creator", "By-line", "Copyright", "Rights", "OwnerName", "SerialNumber",
  "CameraSerialNumber", "GPSLatitude", "GPSLongitude", "GPSPosition", "LensSerialNumber",
  "AuthorsPosition", "CreatorContactInfo", "CreatorWorkEmail", "CreatorWorkTelephone",
];

// For images exifr cannot parse. XMP is XML and IPTC is readable ASCII, so the field NAMES are
// present as plain text in the file whenever the field is. These are the names, not the values.
const RAW_METADATA_MARKERS = [
  "dc:creator", "dc:rights", "photoshop:Credit", "photoshop:AuthorsPosition",
  "Iptc4xmpCore:CreatorContactInfo", "exif:GPSLatitude", "exif:GPSLongitude",
  "xmpRights:Owner", "aux:SerialNumber", "By-line", "CameraSerialNumber",
];

// Strings that must never appear in dist/, on top of everything the sidecars contain.
//
// The list lives in leaks.json rather than here because every entry is itself the kind of thing
// it exists to catch: a supplier's name, an internal filename. A denylist written into a script
// is a denylist that gets read by anyone the script is shown to. Missing file means no extra
// terms, which is the right default for a checkout that has none.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// The site's own name and product names. Both are exemptions this check needs and neither is a
// property of the engine, so they come from brand.json rather than from literals in here. A fork
// with different products gets its own exemptions by editing one file.
const BRAND = JSON.parse(readFileSync(
  existsSync(join(ROOT, "brand.json"))
    ? join(ROOT, "brand.json")
    : join(ROOT, "src", "engine", "brand.example.json"), "utf8"));
const OUR_NAME = (BRAND.name ?? "").toLowerCase().replace(/[^a-z]/g, "");
const OUR_PRODUCTS = (BRAND.products ?? []).map((p) => p.toLowerCase());

const FORBIDDEN = (() => {
  const f = join(ROOT, "leaks.json");
  if (!existsSync(f)) return [];
  return JSON.parse(readFileSync(f, "utf8")).forbidden ?? [];
})();

/** Everything already public by design: every deck's authored copy and the engine's own source.
 *  A proper noun found in here is a product, a brand or our own history, not a leak, and the
 *  client whose deck it is already reads it on a slide. Built from the repo rather than kept as
 *  a list, so it cannot go stale: naming something new in a deck excludes it automatically. */
let srcCache = null;
function engineSource(decksDir) {
  if (srcCache !== null) return srcCache;
  const parts = [];
  const root = join(decksDir, "..");
  const walkSrc = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walkSrc(full);
      else if (/\.(ts|tsx|css|html)$/.test(e.name)) parts.push(readFileSync(full, "utf8"));
    }
  };
  // mockups/ is listed separately because it is NOT under src/. It has to be here: it names
  // "Shot Planner", "Designer" and every product string the mockups draw, and those appear in
  // internal.json notes about decks that demo them. Leaving it out turns a product name into a
  // two-capitalised-word "contact name" and fails the build on the deck it belongs to. It is a
  // list rather than a path so that moving a source tree again cannot silently narrow it.
  for (const dir of ["src", "mockups"]) {
    const full = join(root, dir);
    if (existsSync(full)) walkSrc(full);
  }
  srcCache = parts.join("\n");
  return srcCache;
}

function publicCorpus(decksDir, deckName) {
  const parts = [];
  // This deck's OWN authored copy. A note about a deck naturally repeats what is on its slides
  // ("their platform vendor goes in the handshake"), and a phrase the client already reads is not a
  // leak to that client. Other decks' copy is deliberately NOT included: the same name turning
  // up in someone else's bundle is exactly the cross-client mistake worth failing on.
  const own = join(decksDir, deckName, "deck.ts");
  if (existsSync(own)) parts.push(readFileSync(own, "utf8"));
  parts.push(engineSource(decksDir));
  return parts.join("\n");
}

/** Every string a deck's internal.json holds, split into words worth searching for.
 *  This is what makes the sidecars safe by construction: write a contact name in one and
 *  the build refuses to ship any file containing it. */
function sidecarStrings(decksDir) {
  const out = [];
  for (const name of readdirSync(decksDir)) {
    const f = join(decksDir, name, "internal.json");
    if (!existsSync(f)) continue;
    let data;
    try {
      data = JSON.parse(readFileSync(f, "utf8"));
    } catch (err) {
      throw new Error(`${name}/internal.json is not valid JSON: ${err.message}`);
    }
    const publik = publicCorpus(decksDir, name);

    // Two passes, because the threshold alone was not enough.
    //
    // Long phrases: the note is prose about the deck and legitimately shares words with the
    // slides ("garments", "content guide"), so only phrases distinctive enough to be worth
    // checking are, which in practice means multi-word specifics.
    //
    // Proper nouns, at any length: the 25-character rule alone had a hole exactly where it
    // matters most. A note reading "For " and a person's first and last name is usually well
    // under 25 characters, so a contact's name in a short note was never checked at all, which
    // is the single worst thing a sidecar can leak. Two or
    // more capitalised words in a row are checked whatever their length, minus anything already
    // public (see publicCorpus). A single capitalised word is never checked: that is usually the
    // client's own brand, which appears legitimately all over their own deck.
    for (const value of Object.values(data)) {
      if (typeof value !== "string") continue;
      for (const phrase of value.split(/[.;:]\s+/)) {
        const t = phrase.trim();
        if (t.length >= 25) out.push({ from: `${name}/internal.json`, text: t });
      }
      for (const m of value.matchAll(/\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+)+/gu)) {
        // A product name, a brand written in full, a partner's company: all two capitalised
        // words, and all appear in decks on purpose. Checking those failed every build, on
        // every deck, which is how this exclusion was found. What is left after
        // removing this deck's own copy and the engine's is, in practice, people's names.
        //
        // THE LIMIT, stated because the old version of this file overclaimed and the docs
        // repeated the overclaim: writing a contact's name into the very deck they are about
        // will NOT be caught, since the name is then part of that deck's own public copy. What
        // is caught is that name reaching any OTHER deck, and any name that was never authored
        // onto a slide at all.
        if (publik.includes(m[0])) continue;
        out.push({ from: `${name}/internal.json (name)`, text: m[0] });
      }
    }
  }
  return out;
}

/** Every `job` written in any deck.ts, as the literal strings it is made of.
 *
 *  A job is the one field on a slide that is internal, so stripJobs in vite.config.ts empties
 *  every one of them before a deck is bundled. This is the check on that: the strip is AST-exact
 *  and this greps for the result, because a transform nobody verifies is a convention with extra
 *  steps, and the failure mode is a client reading why we think they will buy.
 *
 *  Parsed rather than pattern-matched so a job built by concatenating lines yields each of its
 *  pieces. Fragments under 20 characters are skipped: a job split into "Get them to feel " +
 *  "the weeks" gives a first half that is distinctive and a tail that might not be.
 *
 *  THE LIMIT, and it is a real one. A fragment that also exists as authored slide copy in ANY
 *  deck is dropped, because its presence in a bundle is then explained by that copy and the two
 *  are indistinguishable once compiled. This is not hypothetical: one deck's job for a slide
 *  ended with a phrase that another deck's authored slide copy also used word for word, so the
 *  first version of this check failed the build on a phrase that had not leaked. What the
 *  exclusion costs is a job written entirely in words already on a slide, which
 *  would not be caught. What it keeps is every job written the way jobs actually are, in the
 *  register of the notes at the top of a deck.ts, which no client-facing copy shares. */
function deckJobStrings(decksDir) {
  const found = [];
  const publicParts = [engineSource(decksDir)];

  for (const name of readdirSync(decksDir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const file = join(decksDir, name.name, "deck.ts");
    if (!existsSync(file)) continue;
    const code = readFileSync(file, "utf8");
    const src = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);

    const cuts = [];
    const visit = (n) => {
      if (ts.isPropertyAssignment(n) && n.name.text === "job") {
        cuts.push([n.initializer.getStart(src), n.initializer.getEnd()]);
        const grab = (m) => {
          if (ts.isStringLiteral(m) || ts.isNoSubstitutionTemplateLiteral(m)) {
            const t = m.text.trim();
            if (t.length >= 20) found.push({ from: `${name.name}/deck.ts job`, text: t });
          }
          ts.forEachChild(m, grab);
        };
        grab(n.initializer);
        return;                                     // a job cannot contain another job
      }
      ts.forEachChild(n, visit);
    };
    ts.forEachChild(src, visit);

    // The deck's public half: the same file with every job value removed. Taking the file whole
    // would make each job "already public" against itself and the check would never fire.
    let pub = code;
    for (const [a, b] of cuts.reverse()) pub = pub.slice(0, a) + pub.slice(b);
    publicParts.push(pub);
  }

  const publik = publicParts.join("\n");
  return found.filter((f) => !publik.includes(f.text));
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

export async function checkLeaks({ dist, decksDir }) {
  const problems = [];
  const files = existsSync(dist) ? walk(dist) : [];

  // 1. Sourcemaps, and the sidecars themselves. Either means a build rule changed.
  for (const f of files) {
    const rel = relative(dist, f);
    if (f.endsWith(".map")) problems.push(`sourcemap shipped: ${rel}`);
    if (f.endsWith("internal.json")) problems.push(`internal sidecar shipped: ${rel}`);
  }

  // 2. Forbidden strings in anything text-shaped. Images are skipped here; they get the
  //    metadata pass below.
  const needles = [
    ...FORBIDDEN.map((text) => ({ from: "check-leaks.mjs", text })),
    ...sidecarStrings(decksDir),
    ...deckJobStrings(decksDir),
  ];
  const TEXTY = new Set([".js", ".css", ".html", ".json", ".txt", ".svg", ".map"]);
  for (const f of files) {
    if (!TEXTY.has(extname(f))) continue;
    if (statSync(f).size > 20e6) continue;
    const body = readFileSync(f, "utf8");
    for (const n of needles) {
      if (body.includes(n.text)) {
        problems.push(`"${n.text.slice(0, 60)}" (${n.from}) found in ${relative(dist, f)}`);
      }
    }
  }

  // 2b. XML comments in shipped SVGs. deck.ts can hold internal reasoning safely because Vite
  //     minifies it away, and that is where the convention says to put it. An SVG is copied
  //     byte for byte, so the same habit applied to a `figure` file publishes the note. Rather
  //     than asking anyone to remember which file type forgives comments, fail on all of them.
  //     The engine's own assets are exempt: they are ours, not deck content.
  for (const f of files) {
    if (extname(f) !== ".svg") continue;
    if (/[\\/]assets[\\/]/.test(f)) continue;
    const body = readFileSync(f, "utf8");
    const hit = body.match(/<!--([\s\S]*?)-->/);
    if (hit) {
      const text = hit[1].trim().replace(/\s+/g, " ").slice(0, 60);
      problems.push(`XML comment "${text}" shipped in ${relative(dist, f)} (strip it: SVG comments reach the client)`);
    }
  }

  // 2c. The admin editor's bundle must contain no deck content.
  //
  //     /_admin/ is the one thing in dist/ that can render ANY deck, and the only reason that
  //     is safe is that it ships the renderer and nothing else: every word of copy is injected
  //     into the page by the password-gated edge function at request time. If a deck ever got
  //     bundled in instead, guessing one URL would hand over all of them, with no passcode and
  //     no secret slug. Check rather than trust: every deck's title and passcodes are looked
  //     for in everything under dist/_admin/.
  const adminFiles = files.filter((f) => relative(dist, f).split(/[\\/]/)[0] === "_admin");
  if (adminFiles.length) {
    const deckStrings = [];
    for (const name of readdirSync(decksDir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
      const src = join(decksDir, name.name, "deck.ts");
      if (!existsSync(src)) continue;
      const body = readFileSync(src, "utf8");
      // The authored headline and every passcode: short, distinctive, and present in any
      // plausible way a deck could end up bundled.
      const head = /headingHtml:\s*"([^"]{8,})"/.exec(body)?.[1]?.replace(/<[^>]+>/g, " ").trim();
      // Same exemption as the site's own name below, for the same reason. A deck whose headline
      // is one of our own product names finds that product in the admin bundle, not a leak: a
      // deck can be titled "Designer" while /_admin/ ships a DesignerEmbed component and a
      // sidebar naming every product. A client's brand as a headline is still worth failing on,
      // which is why this is a list of ours (brand.json) rather than a length floor.
      if (head && !OUR_PRODUCTS.includes(head.toLowerCase().trim())) {
        deckStrings.push({ from: `${name.name}/deck.ts`, text: head.split(/\s+/).slice(0, 4).join(" ") });
      }
      for (const m of body.matchAll(/passcodes:\s*\[([^\]]*)\]/g)) {
        for (const q of m[1].matchAll(/"([^"]{4,})"/g)) {
          // The site's own name is on every deck as a universal passcode, and a mockup prints
          // it in its own chrome. Checking for it finds our branding, not a leak. Every other
          // passcode is a client's brand and is worth failing on.
          if (OUR_NAME && q[1].toLowerCase().replace(/[^a-z]/g, "") === OUR_NAME) continue;
          deckStrings.push({ from: `${name.name} passcode`, text: q[1] });
        }
      }
    }
    for (const f of adminFiles) {
      if (!TEXTY.has(extname(f))) continue;
      const body = readFileSync(f, "utf8");
      for (const n of deckStrings) {
        if (body.includes(n.text)) {
          problems.push(`deck content in the admin bundle: "${n.text}" (${n.from}) found in ${relative(dist, f)}`);
        }
      }
    }
  }

  // 3. Personal metadata on shipped images.
  //
  //    This used to shell out to exiftool and, when the binary was missing, print a warning and
  //    carry on. So "clean" meant two different things depending on where the build ran: a Mac
  //    with Homebrew scanned, and the Netlify deploy almost certainly never did, since exiftool
  //    was declared in no package.json and no build command. Meanwhile CLAUDE.md promised this
  //    was "enforced rather than remembered". Now it is an ordinary dependency and always runs.
  //
  //    exifr reads jpeg, png, tiff, heic and avif but not webp, and this repo ships 32 webp
  //    files. Anything it cannot parse gets a raw text scan instead, which is format-agnostic
  //    and catches XMP and IPTC because both store readable strings. That does miss binary EXIF
  //    in a webp, which is the one hole left, and it is named in the tally below rather than
  //    quietly averaged into a clean result.
  const images = files.filter((f) => /\.(jpe?g|png|webp|avif|tiff?)$/i.test(f));
  let parsed = 0;
  let textScanned = 0;
  for (const f of images) {
    let tags = null;
    let readable = false;
    try {
      tags = await exifr.parse(f, { tiff: true, exif: true, gps: true, iptc: true, xmp: true, mergeOutput: true });
      readable = true;              // exifr understood the format. `tags` is null if it simply
    } catch {                       // found no metadata, which is the answer we want, not a miss.
      readable = false;             // Not a format exifr reads. Fall through to the text scan.
    }
    if (readable) {
      parsed++;
      if (!tags) continue;
      for (const tag of PRIVATE_TAGS) {
        const v = tags[tag];
        if (v === undefined || v === null || v === "") continue;
        problems.push(`image metadata ${tag}="${String(v).slice(0, 80)}" on ${relative(dist, f)}`);
      }
      continue;
    }

    textScanned++;
    const raw = readFileSync(f).toString("latin1");
    for (const marker of RAW_METADATA_MARKERS) {
      if (raw.includes(marker)) {
        problems.push(`image metadata "${marker}" found in ${relative(dist, f)} (text scan)`);
      }
    }
  }

  if (problems.length) {
    console.error(`\n✗ leak check failed, ${problems.length} problem(s):`);
    problems.forEach((p) => console.error(`    ${p}`));
    console.error("\nNothing was deployed. Fix the above, or adjust scripts/check-leaks.mjs");
    console.error("if the material is genuinely safe for a client to read.\n");
    process.exit(1);
  }
  console.log(`— leak check: ${files.length} files, ${images.length} images `
    + `(${parsed} metadata-parsed, ${textScanned} text-scanned), clean`);
}
