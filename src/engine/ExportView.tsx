import type { Deck } from "./types";
import { buildSlides } from "./buildSlides";
import { SlideBody } from "./SlideBody";
import "@export-css"; // export.css in export builds, an empty stub in live builds (vite.config.ts)

// Export/PDF mode: render every slide the deck would show, stacked as one print page each, with
// no gate and no nav overlays. A headless browser prints this to a vector PDF (see
// scripts/export-pdf.mjs). It reuses the exact slide components the live deck uses, so the PDF
// matches what the client sees on screen.
//
// No onJump, no onOpenViewer and no controllerRef: nothing on a printed page can be clicked.
// A mockup therefore prints as a still, and export-pdf.mjs runs the page with reduced motion so
// the story engine lands each section in its settled state rather than mid-animation. A staged
// figure prints every stage, for the same reason.
//
// This is also the ONLY renderer that draws handout text. That is the whole point of the field:
// the screen carries one idea and the presenter says the rest, while the person who reads the
// deck a week later, alone, gets the rest in writing. Putting it in SlideBody would have put it
// on the wall in the meeting, which is exactly what it exists to avoid.
export function ExportView({ deck }: { deck: Deck }) {
  const { flat, toc } = buildSlides(deck);
  // The handout band can be left out of a whole export (NOTES=off, see export-pdf.mjs): the file
  // is then a plain deck at the slide's own page size, with nothing of the presenter's in it.
  const notes = !import.meta.env.VITE_EXPORT_NO_NOTES;
  const hasHandout = notes && flat.some((f) => f.handout);
  return (
    <>
      {/* The page grows to make room for the band, and the two numbers below have to agree:
          630pt is 840px at 96dpi, which is the 720px slide plus a 120px band. They live in one
          rule so that changing one without the other is hard to do by accident. A deck with no
          handout text anywhere never sees this and prints at exactly the size it always did. */}
      {hasHandout && (
        <style>{"@page { size: 960pt 630pt; } .bmx-page { height: 840px; }"}</style>
      )}
      {flat.map((slide, i) => (
        <div className="bmx-page" key={i}>
          <div className="bmx-slide">
            <SlideBody slide={slide} deck={deck} toc={toc} />
            {/* A printed page cannot play anything, and a still of a film or a demo reads as the
                whole of it unless the page says otherwise. So those two kinds say where the
                moving version is. No URL: the link to a deck is its only lock, and a PDF gets
                forwarded further than the link was meant to go. */}
            {(slide.kind === "film" || slide.kind === "mockup") && (
              <div className="bmx-moving">
                {slide.kind === "film" ? "Film" : "Live demo"} · plays in the online version of this deck
              </div>
            )}
          </div>
          {/* Rendered only where there is something to say. An empty band would draw its rule
              across the bottom of every unwritten slide and read as a mistake. */}
          {notes && slide.handout && (
            <div className="bmx-handout">
              <p>{slide.handout}</p>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
