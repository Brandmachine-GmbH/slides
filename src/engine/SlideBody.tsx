import type { Deck, FlatSlide, TocSection } from "./types";
import type { StoryController } from "./types";
import { TitleSlide, AgendaSlide, DividerSlide, GroupDividerSlide, ContentSlide, PlanSlide, ShowcaseSlide, ViewerSlide, StackSlide, SceneSlide, MockupSlide, FilmSlide, OutroSlide, SlideNumber } from "./slides";
import { BuildTrack } from "./BuildTrack";

// One flat slide -> the component that draws it. The only place in the codebase that maps a
// slide kind to a renderer.
//
// It used to be two places, and the comments this file inherited are the record of what that
// cost: `bullets` was added to the live renderer only, so every PDF of a bullets deck printed
// a headline with an empty column under it (caught on one deck, and a second had the same hole), and
// viewer slides were missing from the export entirely, so those decks printed blank pages for
// months. Adding the admin editor would have made it three. Hence one.
//
// The differences between the three callers are all props, not markup: the live deck wants a
// viewer that opens and a mockup that can be driven, the PDF and the editor want neither.
export function SlideBody({ slide, deck, toc, onJump, onOpenViewer, controllerRef }: {
  slide: FlatSlide;
  deck: Deck;
  toc: TocSection[];
  /** the overview's row links. Omitted where there is nowhere to jump to. */
  onJump?: (i: number) => void;
  /** opens the zoomable inspector. Omitted in the PDF and the editor, where it cannot open. */
  onOpenViewer?: (i: number) => void;
  /** claimed by a mockup or a staged figure that has something left to reveal. Omit and both
   *  render, but nothing drives them, which is what a still and a thumbnail want. Its absence
   *  is also how a slide knows it is not being presented: the mockup draws no chapter nav on a
   *  printed page, and a figure shows every build stage at once rather than only the first. */
  controllerRef?: { current: StoryController | null };
}) {
  return (
    // BuildTrack draws the beats-remaining dots bottom left, for the same reason the number is
    // drawn here rather than per slide kind: one place, and every kind gets it, including the
    // next scene somebody writes. It shows nothing unless something inside reports stages, so
    // the eight kinds that never reveal anything are untouched, and so is every still.
    <BuildTrack>
      {slideBody({ slide, deck, toc, onJump, onOpenViewer, controllerRef })}
      {/* Here rather than inside each slide component, which would be eleven places to forget
          it, and here rather than in SlideShow, which would be the live deck only. The number
          belongs to the slide: it prints, and its value IS the PDF page. */}
      {slide.number != null && <SlideNumber n={slide.number} onMedia={cornerIsMedia(slide)} />}
    </BuildTrack>
  );
}

/** True when this slide's bottom-right corner is photography rather than the slide's own ground.
 *
 *  Worth computing rather than guessing per kind: a content slide puts its media on the LEFT, so
 *  its corner is clear, and a showcase with `imageSide: "left"` has its copy column on the right,
 *  so that one is clear too. Only these three actually put an unknown photograph under the
 *  number, and only they need the glass behind it. */
function cornerIsMedia(slide: FlatSlide): boolean {
  if (slide.kind === "viewer" || slide.kind === "film") return true;                    // previews always run down the right
  if (slide.kind === "showcase") return slide.layout === "full" || slide.imageSide === "right";
  return false;
}

function slideBody({ slide, deck, toc, onJump, onOpenViewer, controllerRef }: {
  slide: FlatSlide;
  deck: Deck;
  toc: TocSection[];
  onJump?: (i: number) => void;
  onOpenViewer?: (i: number) => void;
  controllerRef?: { current: StoryController | null };
}) {
  const noop = () => {};
  switch (slide.kind) {
    case "title":        return <TitleSlide deck={deck} images={slide.images} />;
    case "agenda":       return <AgendaSlide deck={deck} toc={toc} onJump={onJump ?? noop} />;
    case "divider":      return <DividerSlide idx={slide.idx} title={slide.title} tagline={slide.tagline} />;
    case "groupdivider": return <GroupDividerSlide eyebrow={slide.eyebrow} title={slide.title} tagline={slide.tagline} />;
    case "content":      return <ContentSlide eyebrow={slide.eyebrow} headline={slide.headline} paragraph={slide.paragraph} bullets={slide.bullets} src={slide.src} images={slide.images} />;
    case "plan":         return <PlanSlide eyebrow={slide.eyebrow} headline={slide.headline} steps={slide.steps} cost={slide.cost} footnote={slide.footnote} />;
    case "showcase":     return <ShowcaseSlide layout={slide.layout} images={slide.images} eyebrow={slide.eyebrow} title={slide.title} note={slide.note} imageSide={slide.imageSide} focus={slide.focus} />;
    case "viewer":       return <ViewerSlide eyebrow={slide.eyebrow} title={slide.title} note={slide.note} images={slide.images} previews={slide.previews} onOpen={onOpenViewer ?? noop} />;
    case "stack":        return <StackSlide eyebrow={slide.eyebrow} title={slide.title} note={slide.note} blocks={slide.blocks} controllerRef={controllerRef} />;
    case "scene":        return <SceneSlide scene={slide.scene} eyebrow={slide.eyebrow} title={slide.title} note={slide.note} steps={slide.steps} claim={slide.claim} answer={slide.answer} months={slide.months} controllerRef={controllerRef} />;
    case "mockup":       return <MockupSlide mockup={slide.mockup} eyebrow={slide.eyebrow} title={slide.title} assets={slide.assets} controllerRef={controllerRef} />;
    case "film":         return <FilmSlide src={slide.src} />;
    case "outro":        return <OutroSlide />;
  }
}
