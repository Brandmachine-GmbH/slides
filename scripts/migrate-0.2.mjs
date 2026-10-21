// Rewrite a 0.1 deck.ts into the 0.2 shape, in place.
//
//   node scripts/migrate-0.2.mjs <path/to/deck.ts> [...]      or: npx slides migrate <deck>
//
// What changes, and nothing else:
//   - every slide's flag becomes `type`: `film: true` is `type: "film"`, a slide with no flag is
//     `type: "content"`, and `scene: "x"` / `mockup: "x"` become `type: "scene", name: "x"`.
//   - every section gets `type: "section"`, and its `agenda: false` becomes `toc: false`.
//   - `sections: [...]` becomes `slides: [...]`, with the deck-level `title` moved in as the first
//     slide, `agenda` as the second (as a `toc`, only when the deck has more than one section,
//     which is the only time it was ever shown), and `{ type: "end" }` last unless a section
//     already places one. That is exactly the order the 0.1 engine rendered, so a migrated deck
//     renders the same slides in the same order with the same numbers.
//   - `const deck: Deck = {...}` becomes `const deck = {...} satisfies Deck`, so literal types are
//     kept and a type error points at the slide that has it.
//
// WHY POSITIONAL EDITS AND NOT A PRINTER. The comments in a deck.ts are the point of the file:
// they hold who it is for and why each slide is the way it is. Re-printing the file from a syntax
// tree loses or moves them. So this parses with TypeScript's own parser to find exact positions
// and splices text at those positions, the same way stripJobs in vite.config.ts does; every byte
// it does not deliberately rewrite stays where it was. The moved title and agenda carry their own
// leading and trailing comments with them.
//
// It refuses rather than guesses: a spread, a computed key, a field it does not know, a flag
// that is not `true`, or a slide it cannot classify stops it with the reason and the position,
// and the file is left untouched. Running it twice is safe; a migrated file is reported and left
// as it is.
import { readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import ts from "typescript";

// Paths are printed relative to the site when run through `slides migrate`, whose cwd is the package.
const base = process.env.SLIDES_ROOT || process.cwd();

const FLAGS = ["film", "divider", "showcase", "plan", "stack", "viewer", "end"];
const NAMED = ["scene", "mockup"];
const DECK_KEYS = new Set(["passcodes", "title", "agenda", "sections", "numbers", "theme", "downloads", "job"]);
const SECTION_KEYS = new Set(["id", "title", "tagline", "short", "divider", "agenda", "thumb", "number", "handout", "theme", "job", "slides"]);

class Refuse extends Error {}

function migrate(file) {
  const before = readFileSync(file, "utf8");
  const where = (src, node) => {
    const { line, character } = src.getLineAndCharacterOfPosition(node.getStart(src));
    return `${relative(base, file)}:${line + 1}:${character + 1}`;
  };
  const refuse = (src, node, why) => { throw new Refuse(`${where(src, node)}  ${why}`); };
  const notes = [];

  // ---- phase 1: the slides and sections, inside the sections array --------------------------
  let src = parse(file, before);
  let deckObj = findDeck(src, refuse);
  if (!deckObj) refuse(src, src, "no `const deck = { ... }` in this file");

  const prop = (obj, key) => obj.properties.find((p) => keyOf(src, p, refuse) === key);
  const hasSlides = prop(deckObj.obj, "slides");
  const hasSections = prop(deckObj.obj, "sections");
  if (hasSlides && !hasSections && !prop(deckObj.obj, "title") && !prop(deckObj.obj, "agenda")) {
    if (deckObj.satisfies) return { file, changed: false, notes: ["already in the 0.2 shape"] };
    // Migrated by hand but still annotated `const deck: Deck`: only the satisfies step is left.
    const out = applyEdits(before, satisfiesEdits(src, deckObj, refuse));
    writeFileSync(file, out);
    return { file, changed: true, notes: ["already in the 0.2 shape; switched to `satisfies Deck`"] };
  }
  if (hasSlides) refuse(src, hasSlides, "has both `slides` and the 0.1 fields; finish or undo the migration by hand");

  for (const p of deckObj.obj.properties) {
    const k = keyOf(src, p, refuse);
    if (!DECK_KEYS.has(k)) refuse(src, p, `unknown deck field \`${k}\``);
  }
  const sectionsProp = hasSections ?? refuse(src, deckObj.obj, "no `sections`");
  const sectionsArr = arrayOf(src, sectionsProp, refuse);
  const edits = [];
  let placedEnd = false;

  for (const secEl of sectionsArr.elements) {
    const sec = objectOf(src, secEl, refuse, "a section");
    if (prop(sec, "type")) refuse(src, sec, "a section that already has `type`; this file is half migrated");
    for (const p of sec.properties) {
      const k = keyOf(src, p, refuse);
      if (!SECTION_KEYS.has(k)) refuse(src, p, `unknown section field \`${k}\``);
      if (k === "agenda") edits.push({ start: p.name.getStart(src), end: p.name.getEnd(), text: "toc" });
    }
    edits.push(insertFirst(src, sec, 'type: "section"'));
    const slidesProp = prop(sec, "slides") ?? refuse(src, sec, "a section with no `slides`");
    for (const slEl of arrayOf(src, slidesProp, refuse).elements) {
      const sl = objectOf(src, slEl, refuse, "a slide");
      if (prop(sl, "type")) refuse(src, sl, "a slide that already has `type`; this file is half migrated");
      const flags = sl.properties.filter((p) => [...FLAGS, ...NAMED].includes(keyOf(src, p, refuse)));
      if (flags.length > 1) refuse(src, sl, `a slide with two kinds (${flags.map((f) => keyOf(src, f, refuse)).join(", ")})`);
      const f = flags[0];
      if (!f) {
        // The 0.1 content slide had no flag and was recognised by its headline.
        if (!prop(sl, "headline")) refuse(src, sl, "a slide with no kind flag and no headline; cannot tell what it is");
        edits.push(insertFirst(src, sl, 'type: "content"'));
        continue;
      }
      const k = keyOf(src, f, refuse);
      if (!ts.isPropertyAssignment(f)) refuse(src, f, `\`${k}\` must be written out as \`${k}: ...\``);
      if (FLAGS.includes(k)) {
        if (f.initializer.kind !== ts.SyntaxKind.TrueKeyword) refuse(src, f, `\`${k}\` is not \`true\`; cannot tell what this slide is`);
        if (k === "end") placedEnd = true;
        edits.push({ start: f.getStart(src), end: f.getEnd(), text: `type: "${k}"` });
      } else {
        if (!ts.isStringLiteral(f.initializer)) refuse(src, f, `\`${k}\` must be a string literal`);
        edits.push({ start: f.getStart(src), end: f.getEnd(), text: `type: "${k}", name: ${f.initializer.getText(src)}` });
      }
    }
  }
  let text = applyEdits(before, edits);

  // ---- phase 2: the deck object itself, on the re-parsed text --------------------------------
  src = parse(file, text);
  deckObj = findDeck(src, refuse);
  const obj = deckObj.obj;
  const titleProp = prop(obj, "title");
  const agendaProp = prop(obj, "agenda");
  const secProp = prop(obj, "sections");
  const arr = arrayOf(src, secProp, refuse);
  const elemIndent = arr.elements.length ? indentOf(text, arr.elements[0].getStart(src)) : indentOf(text, secProp.getStart(src)) + "  ";
  const moved = [];
  const e2 = [];

  const lift = (p, type) => {
    const o = objectOf(src, p.initializer, refuse, `\`${keyOf(src, p, refuse)}\``);
    // The object's own text with `type` added, plus the comments written above the property and
    // after its comma, all moved to the element's indent.
    const ins = insertFirst(src, o, `type: "${type}"`);
    const objText = applyEdits(text, [ins]).slice(o.getStart(src), o.getEnd() + ins.text.length);
    const lead = ownComments(text, p).map((c) => text.slice(c.pos, c.end));
    const { end, trailing } = afterComma(text, p);
    const shift = elemIndent.length - indentOf(text, p.getStart(src)).length;
    const reindent = (t) => t.split("\n").map((l, i) => (i === 0 ? l : shift >= 0 ? " ".repeat(shift) + l : l.slice(Math.min(-shift, l.length - l.trimStart().length)))).join("\n");
    const chunk = [...lead.map(reindent), reindent(objText) + "," + (trailing ? " " + trailing : "")]
      .map((l) => elemIndent + l).join("\n");
    e2.push({ start: removalStart(text, p), end, text: "" });
    return chunk;
  };

  if (titleProp) moved.push(lift(titleProp, "title"));
  else notes.push("this deck had no title; none added");
  if (agendaProp) {
    if (arr.elements.length > 1) moved.push(lift(agendaProp, "toc"));
    else {
      // A one-section deck never showed its overview (0.1 skipped it), so carrying it over would
      // add a slide. Printed rather than silently lost, in case its words were wanted somewhere.
      const { end } = afterComma(text, agendaProp);
      notes.push(`dropped the overview, which a one-section deck never showed. It was:\n${text.slice(removalStart(text, agendaProp), end).trim()}`);
      e2.push({ start: removalStart(text, agendaProp), end, text: "" });
    }
  }
  // Sections keep their text exactly; the moved slides go in front and the end slide behind.
  const open = arr.getStart(src) + 1;
  e2.push({ start: secProp.name.getStart(src), end: secProp.name.getEnd(), text: "slides" });
  if (moved.length) e2.push({ start: open, end: open, text: "\n" + moved.join("\n") });
  if (!placedEnd) {
    const last = arr.elements[arr.elements.length - 1];
    const at = last ? (arr.elements.hasTrailingComma ? text.indexOf(",", last.getEnd()) + 1 : last.getEnd()) : open;
    e2.push({ start: at, end: at, text: `${last && !arr.elements.hasTrailingComma ? "," : ""}\n${elemIndent}{ type: "end" },` });
  } else notes.push("kept the end slide this deck already places");
  e2.push(...satisfiesEdits(src, deckObj, refuse));
  text = applyEdits(text, e2);

  // The result has to parse; anything else would be a bug here, and a broken deck.ts is worse
  // than an unmigrated one.
  const check = parse(file, text);
  if (check.parseDiagnostics?.length) throw new Error(`migration produced invalid TypeScript in ${file}; nothing written`);
  writeFileSync(file, text);
  return { file, changed: true, notes };
}

function parse(file, text) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

/** `const deck = {...}` with or without `: Deck`, or `const deck = {...} satisfies Deck`. */
function findDeck(src, refuse) {
  for (const st of src.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || d.name.text !== "deck" || !d.initializer) continue;
      let init = d.initializer;
      let satisfies = false;
      if (ts.isSatisfiesExpression(init)) { satisfies = true; init = init.expression; }
      if (!ts.isObjectLiteralExpression(init)) refuse(src, init, "`deck` is not an object literal");
      return { decl: d, obj: init, satisfies };
    }
  }
  return null;
}

function satisfiesEdits(src, deckObj, refuse) {
  if (deckObj.satisfies) return [];
  const d = deckObj.decl;
  if (d.type && d.type.getText(src) !== "Deck") refuse(src, d.type, `\`deck\` is typed \`${d.type.getText(src)}\`, not \`Deck\``);
  return [
    ...(d.type ? [{ start: d.name.getEnd(), end: d.type.getEnd(), text: "" }] : []),
    { start: deckObj.obj.getEnd(), end: deckObj.obj.getEnd(), text: " satisfies Deck" },
  ];
}

function keyOf(src, p, refuse) {
  if (ts.isSpreadAssignment(p)) refuse(src, p, "a spread (`...`); move the values in by hand first");
  if (ts.isShorthandPropertyAssignment(p)) return p.name.text;
  if (!p.name || ts.isComputedPropertyName(p.name)) refuse(src, p, "a computed key");
  return ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : p.name.getText(src);
}

function arrayOf(src, p, refuse) {
  if (!ts.isPropertyAssignment(p) || !ts.isArrayLiteralExpression(p.initializer)) refuse(src, p, "expected an array literal");
  for (const el of p.initializer.elements) if (ts.isSpreadElement(el)) refuse(src, el, "a spread (`...`); move the values in by hand first");
  return p.initializer;
}

function objectOf(src, node, refuse, what) {
  if (!ts.isObjectLiteralExpression(node)) refuse(src, node, `${what} that is not an object literal`);
  return node;
}

function indentOf(text, pos) {
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  return text.slice(lineStart, pos).match(/^[ \t]*/)[0];
}

/** `type: "x"` as the object's first field, in the object's own layout: on its own line when
 *  the fields are one per line, inline after `{` when the object is written on one line. */
function insertFirst(src, obj, field) {
  const text = src.text;
  const open = obj.getStart(src) + 1;
  const first = obj.properties[0];
  if (!first) return { start: open, end: open, text: ` ${field} ` };
  const firstAt = first.getStart(src);
  if (text.slice(open, firstAt).includes("\n")) return { start: open, end: open, text: `\n${indentOf(text, firstAt)}${field},` };
  return { start: open, end: open, text: ` ${field},` };
}

/** The comments written above a property, on their own lines. A comment on the same line as the
 *  previous field's comma belongs to that field, though the parser hands it to this one. */
function ownComments(text, p) {
  const full = p.getFullStart();
  return (ts.getLeadingCommentRanges(text, full) ?? []).filter((c) => text.slice(full, c.pos).includes("\n"));
}

/** Where a property's removal starts: straight after the last thing before its own comments, so
 *  the blank lines and comments above it go with it and no gap of empty lines is left behind. */
function removalStart(text, p) {
  const comments = ownComments(text, p);
  let i = comments.length ? comments[0].pos : p.getStart();
  while (i > 0 && /\s/.test(text[i - 1])) i--;
  return i;
}

/** The end of a property including its comma and any comment after it on the same line. */
function afterComma(text, p) {
  let i = p.getEnd();
  while (/[ \t]/.test(text[i])) i++;
  if (text[i] === ",") i++;
  const trailing = (ts.getTrailingCommentRanges(text, i) ?? [])[0];
  if (trailing && !text.slice(i, trailing.pos).includes("\n")) {
    return { end: trailing.end, trailing: text.slice(trailing.pos, trailing.end) };
  }
  return { end: i, trailing: "" };
}

function applyEdits(text, edits) {
  // Back to front, so an earlier edit cannot move a later one's offsets. Two inserts at the same
  // offset keep the order they were added in.
  const sorted = edits.map((e, k) => ({ ...e, k })).sort((a, b) => b.start - a.start || b.k - a.k);
  let out = text;
  for (const e of sorted) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error("usage: node scripts/migrate-0.2.mjs <path/to/deck.ts> [...]");
  process.exit(1);
}
let failed = 0;
for (const f of files) {
  try {
    const r = migrate(f);
    console.log(`${r.changed ? "migrated" : "unchanged"}  ${relative(base, f)}`);
    r.notes.forEach((n) => console.log(`  note: ${n.replace(/\n/g, "\n        ")}`));
  } catch (e) {
    failed++;
    console.error(`refused   ${relative(base, f)}\n  ${e instanceof Refuse ? e.message : e.stack}\n  The file was not changed.`);
  }
}
process.exit(failed ? 1 : 0);
