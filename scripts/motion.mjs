// Walks every transition in a deck and measures whether the motion is smooth.
//
// WHY THIS EXISTS. Motion bugs in this deck have all been found the same way: somebody watches a
// screen recording, says "it jumps", and then a lot of work goes into finding out where. That
// does not scale past one slide, and it cannot tell you whether a fix worked anywhere except the
// slide you were staring at. Every one of those bugs was also a number: a thing that should have
// moved one way and moved back. So measure it.
//
// WHAT IT IS NOT. It does not decide whether the deck looks good, and it never fails a build. A
// deliberate overshoot is non-monotonic on purpose (the chips in `three-walls` are supposed to
// land hard), and no measurement can tell that apart from a bug. It hands you a list; you read
// it. Same reasoning as the body-copy report in build.mjs.
//
// THE THREE THINGS IT LOOKS FOR
//
//   LATE      An element-level animation that STARTS part-way through a view transition. Note
//             "starts", not "runs": the deck's whole entrance is meant to run inside the change,
//             the copy rising while the slide underneath dissolves, so a check for animations
//             merely running during a transition flags every slide and is worth nothing. The
//             first version of this did exactly that, and reported 13 of 17 transitions.
//
//             An entrance begins at t=0 with the change. A beat that begins at 280ms began
//             inside one, which is not a curve problem, it is a thing scheduled at the wrong
//             moment, and it reads as the deck stuttering. That is the bug `three-walls` had.
//
//   BACK      The largest step a tracked element takes against its own direction of travel. A
//             smooth move is monotonic; "it jumped up, then down, then up" is this number.
//
//   SNAP      How far something moves at the instant the browser hands the drawing back from the
//             view-transition pseudo-elements to the real DOM. Sub-pixel is rounding. Anything
//             above a couple of pixels is a visible pop.
//
//   DROPS     Frames the browser missed while the transition was running. The three above all
//             measure whether the motion goes to the wrong PLACE. This measures whether it got
//             there on time, which is the other half of "not smooth" and the half a position
//             trace cannot see: a perfectly monotonic move that stutters reads as bad as a jump.
//             Counted as rAF gaps over 20ms, which at 60fps means at least one frame missed.
//
// MEASURING THE DRAWN THING, NOT THE DOM. During a transition what is on screen is the
// pseudo-element, so `getBoundingClientRect()` on the real node reports where the node will end
// up, not where the picture is. The travelling label has to be read as the computed transform of
// `::view-transition-group(bm-label)`. Getting that wrong is why measuring this by hand keeps
// being fiddly, and encapsulating it once is most of the value here.
//
// Run:  make motion example        (builds first, then walks it)
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const deckName = process.argv[2];
if (!deckName) {
  console.error("usage: node scripts/motion.mjs <deck>   (or: make motion <deck>)");
  process.exit(1);
}

// Thresholds. Deliberately loose: this is a list to read, not a gate, so it should surface the
// handful of things worth looking at rather than every sub-pixel wobble.
const BACK_PX = 2;
const SNAP_PX = 2;
// A couple of missed frames is normal on a loaded machine and invisible. A run of them is what
// "it feels rough" actually is.
const DROP_MAX = 3;

const libDir = join(root, "netlify", "edge-functions", "lib");
if (!existsSync(join(libDir, "editor.js"))) {
  console.error("\n  dist/ and the edge functions are missing. Run `make build` first.\n");
  process.exit(1);
}
const { editorHtml } = await import(pathToFileURL(join(libDir, "editor.js")).href);
const boot = JSON.parse(readFileSync(join(libDir, "editor.js"), "utf8")
  .match(/^const DECKS = (.*);$/m)[1])[deckName];
if (!boot) {
  console.error(`\n  no deck called "${deckName}".\n`);
  process.exit(1);
}
void editorHtml;

// The flat slide count, by the same rule buildSlides follows: title, overview when there is more
// than one section, then per section a divider unless it declines one, its slides, and the outro.
const d = boot.deck;
let total = 1 + (d.sections.length > 1 ? 1 : 0) + 1;
for (const sec of d.sections) total += (sec.divider !== false ? 1 : 0) + sec.slides.length;

const port = Number(process.env.PORT) || 8912;
const srv = spawn(process.execPath, [join(root, "scripts", "serve.mjs")],
  { cwd: root, env: { ...process.env, PORT: String(port) } });
const up = await new Promise((res) => {
  const t = setInterval(async () => {
    try { await fetch(`http://localhost:${port}/admin`); clearInterval(t); res(true); } catch {}
  }, 120);
  setTimeout(() => { clearInterval(t); res(false); }, 15000);
});
if (!up) { console.error("the local server did not start"); srv.kill(); process.exit(1); }

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
await page.goto(`http://localhost:${port}/${boot.slug}/`);
await page.waitForTimeout(800);
const gate = await page.$("input");
if (gate) { await gate.fill(d.passcodes[0]); await gate.press("Enter"); await page.waitForTimeout(1000); }

// Everything below runs in the page, once per transition.
const SAMPLER = `(ms) => new Promise((done) => {
  const NAMES = ["bm-label", "bm-segnav", "bm-contents"];
  const yOf = (name) => {
    const t = getComputedStyle(document.documentElement,
      "::view-transition-group(" + name + ")").transform;
    if (!t || t === "none") return null;
    const m = t.match(/matrix\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(",").map(Number);
    return p.length >= 6 ? p[5] : null;          // translateY of a 2d matrix
  };
  const rectTop = (sel) => {
    const el = document.querySelector(sel);
    return el ? el.getBoundingClientRect().top : null;
  };
  const t0 = performance.now();
  const rows = [];
  let prev = t0;
  const tick = () => {
    const now = performance.now();
    const gap = now - prev;
    prev = now;
    const anims = document.getAnimations();
    const vt = anims.filter((a) => (a.effect && a.effect.pseudoElement || "").startsWith("::view-transition"));
    // Element-level animations, excluding the ambient infinite ones (the scene card washes run
    // forever by design and are not part of any transition).
    const el = anims.filter((a) => {
      if (!a.effect || a.effect.pseudoElement) return false;
      if (a.playState !== "running") return false;
      const it = a.effect.getTiming().iterations;
      return it !== Infinity;
    }).map((a) => a.animationName || ((a.effect.target && a.effect.target.tagName) || "?") + " (transition)");
    rows.push({
      t: Math.round(now - t0),
      gap: Math.round(gap * 10) / 10,
      vt: vt.length,
      el: [...new Set(el)],
      g: NAMES.map(yOf),
      label: rectTop('[data-vt="label"]'),
      h2: rectTop("h2"),
    });
    if (now - t0 < ms) requestAnimationFrame(tick); else done(rows);
  };
  requestAnimationFrame(tick);
})`;

/** Largest step against the series' own net direction. A smooth move returns ~0. */
function back(series) {
  const ys = series.filter((v) => v !== null && Number.isFinite(v));
  if (ys.length < 3) return 0;
  const net = ys[ys.length - 1] - ys[0];
  const dir = Math.abs(net) < 0.5 ? 0 : Math.sign(net);
  let worst = 0;
  for (let i = 1; i < ys.length; i++) {
    const step = ys[i] - ys[i - 1];
    // With no net travel, any movement at all is a wobble in something that should be still.
    const against = dir === 0 ? Math.abs(step) : -step * dir;
    if (against > worst) worst = against;
  }
  return Math.round(worst * 10) / 10;
}

const findings = [];
console.log(`\n— motion: ${deckName}, ${total} slides, ${total - 1} transitions\n`);

for (let i = 1; i < total; i++) {
  const rows = await page.evaluate(
    async ([sampler, ms]) => {
      const run = eval(sampler);
      const p = run(ms);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      return p;
    },
    [SAMPLER, 1300],
  );

  const vtFrames = rows.filter((r) => r.vt > 0);

  // Anything already running in the first frames is the slide's entrance, which belongs inside
  // the change. What we are looking for is a name that was NOT there at the start and appears
  // while the transition is still live.
  const EARLY_MS = 80;
  const atStart = new Set(rows.filter((r) => r.t <= EARLY_MS).flatMap((r) => r.el));
  const late = rows.filter((r) => r.vt > 0 && r.t > EARLY_MS)
    .flatMap((r) => r.el.filter((n) => !atStart.has(n)).map((n) => ({ n, t: r.t })));
  const overlapNames = [...new Set(late.map((x) => x.n))];
  const overlapFrames = late;

  const lastVt = vtFrames.length ? rows.indexOf(vtFrames[vtFrames.length - 1]) : -1;
  const drawn = rows.map((r) => r.g[0]);                     // bm-label, the one that travels
  const snap = lastVt > 0 && lastVt + 1 < rows.length && rows[lastVt].label !== null
    ? Math.round(Math.abs(rows[lastVt + 1].label - rows[lastVt].label) * 10) / 10
    : 0;

  // Frames missed while the change was on screen. The first tick's gap is the time from the
  // sampler starting to the first frame, which is not a drop, so it is skipped.
  const during = rows.filter((r, k) => k > 0 && (r.vt > 0 || r.t < 500));
  const drops = during.filter((r) => r.gap > 20).length;
  const worstGap = during.reduce((w, r) => Math.max(w, r.gap), 0);

  const m = {
    to: i + 1,
    drops,
    worstGap: Math.round(worstGap),
    vtMs: vtFrames.length ? vtFrames[vtFrames.length - 1].t : 0,
    backDrawn: back(drawn),
    backLabel: back(rows.filter((r) => r.vt === 0).map((r) => r.label)),
    backH2: back(rows.filter((r) => r.vt === 0).map((r) => r.h2)),
    snap,
    overlapMs: late.length ? late[0].t : 0,
    overlapNames,
  };
  const bad = m.overlapNames.length || m.backDrawn > BACK_PX || m.backLabel > BACK_PX
    || m.backH2 > BACK_PX || m.snap > SNAP_PX || m.drops > DROP_MAX;
  if (bad) findings.push(m);

  const flag = bad ? "!" : " ";
  console.log(`${flag} -> ${String(m.to).padStart(2)}  vt ${String(m.vtMs).padStart(4)}ms  `
    + `back drawn ${String(m.backDrawn).padStart(5)}  label ${String(m.backLabel).padStart(5)}  `
    + `h2 ${String(m.backH2).padStart(5)}  snap ${String(m.snap).padStart(4)}  `
    + `drops ${String(m.drops).padStart(2)}${m.drops ? ` (worst ${m.worstGap}ms)` : ""}`
    + (m.overlapNames.length ? `  LATE at ${m.overlapMs}ms: ${m.overlapNames.join(", ")}` : ""));
  await page.waitForTimeout(250);
}

console.log("");
if (!findings.length) {
  console.log(`— nothing over the thresholds (back > ${BACK_PX}px, snap > ${SNAP_PX}px, `
    + `> ${DROP_MAX} dropped frames, any animation starting mid-transition)\n`);
} else {
  console.log(`— ${findings.length} transition(s) worth looking at:\n`);
  for (const f of findings) {
    const why = [];
    if (f.overlapNames.length) {
      why.push(`${f.overlapNames.join(", ")} started at ${f.overlapMs}ms, part-way through the `
        + `transition, which ran to ${f.vtMs}ms`);
    }
    if (f.backDrawn > BACK_PX) why.push(`the drawn label went back ${f.backDrawn}px against its own travel`);
    if (f.backLabel > BACK_PX) why.push(`the label went back ${f.backLabel}px after the transition`);
    if (f.backH2 > BACK_PX) why.push(`the heading went back ${f.backH2}px`);
    if (f.snap > SNAP_PX) why.push(`it snapped ${f.snap}px when the drawing handed back to the DOM`);
    if (f.drops > DROP_MAX) why.push(`${f.drops} frames missed while it was on screen, worst gap ${f.worstGap}ms`);
    console.log(`  slide ${f.to}`);
    why.forEach((w) => console.log(`     ${w}`));
  }
  console.log("\n  A deliberate overshoot looks the same as a bug from here. Read the list.\n");
}

await browser.close();
srv.kill();
