// Export a deck to a vector PDF (one slide per page) using headless Chrome.
//
//   node scripts/export-pdf.mjs <deck>        e.g. node scripts/export-pdf.mjs example
//
// It spins up an ephemeral Vite dev server in export mode (VITE_EXPORT=1 -> stacked print pages,
// static TTF fonts, no passcode gate), prints the page to PDF with system Chrome, then shuts the
// server down. Output: decks/<deck>/<deck>.pdf. Nothing is left running.
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const deckName = process.argv[2];

if (!deckName) {
  console.error("usage: node scripts/export-pdf.mjs <deck>");
  process.exit(1);
}
if (!existsSync(join(root, "decks", deckName, "deck.ts"))) {
  console.error(`no such deck: decks/${deckName}/deck.ts`);
  process.exit(1);
}

process.env.VITE_DECK = deckName;
process.env.VITE_EXPORT = "1";

// NOTES=off prints the deck without its handout band, for sending to people who were not in the
// room and do not need the presenter's fuller sentences (founders' CVs, the arithmetic spelled
// out). A second file rather than a replacement, so the version with notes is never overwritten
// by the one without: `make pdf <deck>` and `NOTES=off make pdf <deck>` give you both.
const noNotes = process.env.NOTES === "off";
process.env.VITE_EXPORT_NO_NOTES = noNotes ? "1" : "";

const server = await createServer({ root, server: { port: 0 } });
await server.listen();
const url = server.resolvedUrls.local[0];

const browser = await chromium.launch({ channel: "chrome" }); // headless system Chrome
try {
  // Mockup slides run an animated story. Reduced motion makes their engine skip every autoplay
  // and land each section in its settled state, which is the only frame worth printing. Nothing
  // else in the deck relies on motion: slide entrances are authored so the base state IS the
  // settled state (see export.css), so this is free everywhere else.
  const page = await browser.newPage({ reducedMotion: "reduce" });
  await page.goto(url, { waitUntil: "networkidle" });
  // Two things on a slide draw themselves after mount and mark themselves data-slide-pending
  // until they have: a `figure` block, which fetches and injects its SVG, and a `scene`, which
  // is a lazily-imported chunk. networkidle normally covers both, but either resolving a moment
  // late would print as an empty box, which is the same silent failure that made viewer slides
  // print blank pages for months. Wait for the elements themselves, not for a timer.
  await page.waitForFunction(() => !document.querySelector("[data-slide-pending]"), null,
                             { timeout: 15000 });
  // Pin every video to its LAST frame. They are `autoPlay`, which is right for the live deck, and
  // reduced motion does not stop video playback, so without this the printer caught whichever
  // frame each clip happened to be on and every export of the same deck came out different.
  //
  // The last frame rather than the first, and this is not a detail: these clips are build-up
  // animations that draw themselves in, so frame zero is an empty canvas. Pinning to the start
  // printed pages of blank dotted panels, which is worse than the non-determinism it fixed. The
  // end is also the convention the whole export already follows, that a still shows the settled
  // state: slide entrances are authored so the base state is the finished one, a mockup prints
  // the completed board, and a staged figure prints every stage.
  const pinned = await page.evaluate(async () => {
    const vids = [...document.querySelectorAll("video")];
    await Promise.all(vids.map((v) => new Promise((done) => {
      const seek = () => {
        // A hair inside the end: seeking to exactly `duration` is not required to render a frame.
        const end = Number.isFinite(v.duration) ? Math.max(0, v.duration - 0.05) : 0;
        if (Math.abs(v.currentTime - end) < 0.02 && v.readyState >= 2) return done();
        const settle = () => { v.removeEventListener("seeked", settle); done(); };
        v.addEventListener("seeked", settle);
        v.currentTime = end;
      };
      v.pause();
      // `duration` is not known until metadata lands, and is NaN before that.
      if (v.readyState >= 1) seek();
      else v.addEventListener("loadedmetadata", seek, { once: true });
      // A clip that will not seek must not hang the export; a wrong frame beats no PDF.
      setTimeout(done, 2500);
    })));
    // Reported rather than assumed: this is the whole point of the step, and a clip that refused
    // to seek is exactly the case that would otherwise quietly print a different frame each time.
    const settled = vids.filter((v) => v.paused && Number.isFinite(v.duration) &&
                                       v.currentTime >= v.duration - 0.1).length;
    return { total: vids.length, settled };
  });
  if (pinned.total) console.log(`videos: ${pinned.settled}/${pinned.total} pinned to the last frame`);

  // Make sure every font and image has actually rendered before we snapshot to PDF.
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((img) => (img.complete ? null : img.decode().catch(() => {}))),
    );
  });

  // Deck photos are stored at full resolution (2000-3000px) but display in a ~600px box.
  // Chromium would embed them at source resolution, bloating the PDF. Downscale each image to
  // ~2x its rendered size (retina-crisp) and re-encode as JPEG, in-page, before printing. This
  // only touches raster images; the gradient washes and text stay native vector.
  const RETINA = 2;
  const JPEG_QUALITY = 0.85;
  const MAX_PX = 1600; // absolute ceiling on the longest side, safety net for odd layouts
  const stats = await page.evaluate(async ({ retina, quality, maxPx }) => {
    const out = { total: 0, downscaled: 0, skipped: [] };
    for (const img of [...document.querySelectorAll("img")]) {
      out.total++;
      const src = img.currentSrc || img.src;
      if (src.startsWith("data:") || /\.svg(\?|$)/i.test(src)) { out.skipped.push("svg/data"); continue; }
      try { if (!img.complete) await img.decode(); } catch { out.skipped.push("decode-fail"); continue; }
      const nat = Math.max(img.naturalWidth, img.naturalHeight);
      if (!nat) { out.skipped.push("no-natural"); continue; }
      const rect = img.getBoundingClientRect();
      const byDisplay = rect.width ? Math.ceil(rect.width * retina) : maxPx;
      const targetLong = Math.min(nat, byDisplay, maxPx);
      if (targetLong >= nat) { out.skipped.push(`already-small ${img.naturalWidth}x${img.naturalHeight} @${Math.round(rect.width)}`); continue; }
      const scale = targetLong / nat;
      try {
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.naturalWidth * scale));
        c.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, c.width, c.height);
        // JPEG has no alpha, and an untouched canvas is transparent BLACK, so re-encoding a
        // transparent image as JPEG paints every see-through pixel black. A UI mockup with
        // rounded corners came out of the exporter wearing a black frame. Sample the four
        // corners, which is exactly where a rounded panel's transparency sits, and keep PNG
        // when any of them is not opaque. Photographs are unaffected and stay JPEG.
        let hasAlpha = false;
        try {
          for (const [x, y] of [[0, 0], [c.width - 1, 0], [0, c.height - 1], [c.width - 1, c.height - 1]]) {
            if (ctx.getImageData(x, y, 1, 1).data[3] < 255) { hasAlpha = true; break; }
          }
        } catch { /* reading pixels can fail; falling through to JPEG matches the old behaviour */ }
        img.src = hasAlpha ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", quality); // same-origin -> canvas not tainted
        out.downscaled++;
      } catch (e) {
        out.skipped.push("draw-fail: " + (e && e.message));
      }
    }
    await Promise.all([...document.images].map((img) => (img.complete ? null : img.decode().catch(() => {}))));
    return out;
  }, { retina: RETINA, quality: JPEG_QUALITY, maxPx: MAX_PX });
  console.log(`images: ${stats.downscaled}/${stats.total} downscaled`, stats.skipped.length ? "| skipped: " + JSON.stringify(stats.skipped) : "");

  const out = join(root, "decks", deckName, `${deckName}${noNotes ? "-no-notes" : ""}.pdf`);
  await page.pdf({
    path: out,
    preferCSSPageSize: true, // take the 960pt x 540pt page box from the @page rule
    printBackground: true, // keep the gradient washes / dot grid
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
  });
  console.log(`wrote ${out}`);
} finally {
  await browser.close();
  await server.close();
}
