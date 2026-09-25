import { Suspense, lazy, useEffect, useRef, useState, type ComponentType, type CSSProperties } from "react";
import type {
  Deck, TocSection, PlanStep, PlanCost, ViewerImage, StackBlock, SceneProps,
  EmbedProps, Chapter, StoryController,
} from "./types";
import DECK_SCENES from "@deck-scenes";
import SITE_MOCKUPS from "@site-mockups";
import { useBuildStages } from "./useBuildStages";
import brand from "@brand";
import logo from "@brand-logo";
import s from "./slides.module.css";

/** A stack `figure` block: an SVG fetched from the deck's images/ and injected into the page.
 *
 *  Why inject rather than point an <img> at it, which would need no code at all: an SVG loaded
 *  as an image is an isolated document. It cannot see this page's @font-face rules or its CSS
 *  variables, so its text falls back to a system font and var(--orange) never resolves: a
 *  drawing pointed at this way renders its labels in Arial, whatever the deck is set in.
 *  Injected, the drawing is part of this document and inherits everything.
 *
 *  Both routes print as vector. Only this one matches the deck it sits in.
 *
 *  data-slide-pending is the handle the PDF exporter waits on. page.goto resolves on
 *  networkidle, which in practice covers this fetch, but "in practice" is how viewer slides
 *  came to print blank pages in every client PDF for months, so export-pdf.mjs blocks until
 *  nothing is pending rather than trusting the timing. A scene marks itself the same way while
 *  its chunk is still loading, which is why the attribute is not named after figures. */
function FigureBlock({ src, style, controllerRef }: {
  src: string; style: CSSProperties;
  controllerRef?: { current: StoryController | null };
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  // A figure cannot know how many stages it has until the file has arrived, so this starts at
  // zero and is counted from the markup below. useBuildStages copes with a max that grows.
  const [stages, setStages] = useState(0);

  useEffect(() => {
    let live = true;
    fetch(src)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status} ${src}`))))
      .then((text) => {
        // innerHTML parses as HTML, where an XML prolog or DOCTYPE is not markup and can land
        // as visible text above the drawing. Keep the document element and nothing before it.
        const at = text.indexOf("<svg");
        if (at < 0) throw new Error(`no <svg> in ${src}`);
        if (live) setSvg(text.slice(at));
      })
      .catch((e) => {
        // A missing figure must not take the deck down mid-meeting. Leave the space empty,
        // say so in the console, and let the rest of the slide stand.
        console.error("[deck] figure failed to load:", e);
        if (live) setSvg("");
      });
    return () => { live = false; };
  }, [src]);

  // A figure declares its own build stages by tagging groups data-build="1", "2", ... Nothing
  // to author in deck.ts: a drawing that wants to arrive in pieces says so itself, and one that
  // does not is unaffected. With no controllerRef (the PDF export) every stage is shown, since
  // a still cannot be clicked through.
  const staged = !!controllerRef;
  const stage = useBuildStages(stages, controllerRef);

  // Which stage the pointer is over, or null. Presenting is done with the mouse and the mouse is
  // on the projector, so hovering a stage brings it forward and sits the others back: a way to
  // point at one part of a drawing rather than only describe it.
  const [hover, setHover] = useState<number | null>(null);

  // Count the stages out of the markup once it lands. Highest data-build wins rather than the
  // number of groups, so several groups can share a stage and land together.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || svg === null) return;
    let max = 0;
    host.querySelectorAll<SVGElement>("[data-build]").forEach((g) => {
      max = Math.max(max, Number(g.dataset.build ?? "1"));
    });
    setStages(max);
  }, [svg]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || svg === null) return;
    const groups = host.querySelectorAll<SVGElement>("[data-build]");
    groups.forEach((g) => {
      const at = Number(g.dataset.build ?? "1");
      const shown = at <= stage;
      // Opacity and nothing else, and written inline. An authored figure carries its colours in
      // inline style attributes, which beat any stylesheet rule short of !important, so trying
      // to light a stage by restyling its strokes would silently do nothing. This is the one
      // property the engine already owns on these groups, so it stays the one it uses.
      g.style.opacity = !shown ? "0" : hover === null || hover === at ? "1" : "0.4";
    });
  }, [svg, stage, staged, hover]);

  // Hover is delegated from the host rather than bound per group, because the groups arrive with
  // the fetched markup and are replaced wholesale.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || svg === null || !staged) return;
    const over = (e: Event) => {
      const g = (e.target as Element | null)?.closest?.("[data-build]") as SVGElement | null;
      const at = g ? Number(g.dataset.build ?? "1") : null;
      // Never light a stage that has not been revealed yet: it is invisible, and dimming
      // everything else around nothing would look like a fault.
      setHover(at !== null && at <= stage ? at : null);
    };
    const out = () => setHover(null);
    host.addEventListener("mouseover", over);
    host.addEventListener("mouseleave", out);
    return () => {
      host.removeEventListener("mouseover", over);
      host.removeEventListener("mouseleave", out);
    };
  }, [svg, staged, stage]);

  return (
    <div
      ref={hostRef}
      className={`${s.stackBlock} ${s.stackFigure}`}
      style={style}
      {...(svg === null ? { "data-slide-pending": "" } : {})}
      dangerouslySetInnerHTML={{ __html: svg ?? "" }}
    />
  );
}

export function TitleSlide({ deck, images }: { deck: Deck; images?: string[] }) {
  const copy = (
    <>
      <p className={s.eyebrow} data-vt="label">{deck.title.eyebrow}</p>
      <h1 className={s.titleH1} dangerouslySetInnerHTML={{ __html: deck.title.headingHtml }} />
      <p className={s.sub}>{deck.title.sub}</p>
    </>
  );
  if (!images?.length) {
    return (
      <div className={`${s.slide} ${s.title}`}>
        {copy}
        <img className={s.wordmark} src={logo} alt={brand.name} />
      </div>
    );
  }
  // The title is the slide the room looks at while everyone joins, so when a deck has pictures
  // it shows them here rather than making people wait for slide seventeen. Copy keeps the left,
  // pictures bleed off the right edge; with three, the first runs full height.
  return (
    <div className={`${s.slide} ${s.title} ${s.titleSplit}`}>
      <div className={s.titleCopy}>{copy}</div>
      <div className={`${s.titleMedia}${images.length >= 3 ? ` ${s.titleMediaTrio}` : ""}`}>
        {images.slice(0, 3).map((img) => (
          <div key={img} className={s.titleShot}><img src={img} alt="" /></div>
        ))}
      </div>
      <img className={s.wordmark} src={logo} alt={brand.name} />
    </div>
  );
}

export function AgendaSlide({ deck, toc, onJump }: { deck: Deck; toc: TocSection[]; onJump: (index: number) => void }) {
  // Pictures switch the overview to its second layout, but only when the deck has given them:
  // a deck without thumbs keeps the card rows it was written against.
  const pictures = toc.some((sec) => sec.thumb);
  const head = (
    <>
      <p className={s.eyebrow} data-vt="label">{deck.agenda.eyebrow}</p>
      <h1 className={s.agendaH1}>{deck.agenda.heading}</h1>
    </>
  );
  if (pictures) {
    return (
      <div className={`${s.slide} ${s.agenda} ${s.agendaPictures}`}>
        <div className={s.agendaHead}>{head}</div>
        <div className={s.agendaGrid}>
          {toc.map((sec, k) => (
            <button
              key={sec.dividerIndex}
              className={s.agendaPicRow}
              onClick={(e) => { e.stopPropagation(); onJump(sec.dividerIndex); }}
            >
              <span className={s.agendaPicNum}>0{k + 1}</span>
              <span className={s.agendaPicTitle}>{sec.title}</span>
              <span className={s.agendaThumb}>{sec.thumb && <img src={sec.thumb} alt="" />}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className={`${s.slide} ${s.agenda}`}>
      {head}
      <div className={s.agendaList}>
        {toc.map((sec, k) => (
          <button
            key={sec.dividerIndex}
            className={s.agendaRow}
            onClick={(e) => { e.stopPropagation(); onJump(sec.dividerIndex); }}
          >
            <span className={s.agendaNum}>0{k + 1}</span>
            <span className={s.agendaText}>
              <span className={s.agendaTitle}>{sec.title}</span>
              <span className={s.agendaTag}>{sec.tagline}</span>
            </span>
            <span className={s.agendaArrow}>&rarr;</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function DividerSlide({ idx, title, tagline }: { idx: string; title: string; tagline: string }) {
  return (
    <div className={`${s.slide} ${s.divider}`}>
      <div className={s.idx} data-vt="label">{idx}</div>
      <h1 className={s.dividerH1}>{title}</h1>
      <p className={s.tagline}>{tagline}</p>
      <div className={s.rule} />
    </div>
  );
}

export function GroupDividerSlide({ eyebrow, title, tagline }: { eyebrow?: string; title: string; tagline?: string }) {
  return (
    <div className={`${s.slide} ${s.divider}`}>
      {eyebrow && <p className={s.eyebrow} data-vt="label">{eyebrow}</p>}
      <h1 className={s.dividerH1}>{title}</h1>
      {tagline && <p className={s.tagline}>{tagline}</p>}
      <div className={s.rule} />
    </div>
  );
}

export function ContentSlide({ eyebrow, headline, paragraph, bullets, src, images }: { eyebrow: string; headline: string; paragraph?: string; bullets?: string[]; src?: string; images?: string[] }) {
  const isStudio = !!images?.length;
  const hasMedia = isStudio || !!src;
  return (
    <div className={`${s.slide} ${s.content}${isStudio ? ` ${s.contentStudio}` : ""}${!hasMedia ? ` ${s.contentTextOnly}` : ""}`}>
      {isStudio ? (
        <div className={s.studio}>
          {images!.map((img) => (
            <div key={img} className={s.studioShot}>
              <img className={s.studioImg} src={img} alt="" />
            </div>
          ))}
        </div>
      ) : hasMedia ? (
        <div className={s.vidwrap}>
          <video className={s.video} src={src} autoPlay muted playsInline preload="auto" />
        </div>
      ) : null}
      <div className={s.copy}>
        <p className={s.group} data-vt="label">{eyebrow}</p>
        <h2 className={s.contentH2}>{headline}</h2>
        {bullets?.length ? (
          <ul className={s.bullets}>
            {bullets.map((b, k) => (
              <li key={k}>{b}</li>
            ))}
          </ul>
        ) : paragraph ? (
          <p className={s.copyP}>{paragraph}</p>
        ) : null}
      </div>
    </div>
  );
}

export function PlanSlide({ eyebrow, headline, steps, cost, footnote }: { eyebrow: string; headline: string; steps: PlanStep[]; cost?: PlanCost; footnote?: string }) {
  return (
    <div className={`${s.slide} ${s.plan}`}>
      <p className={s.group} data-vt="label">{eyebrow}</p>
      <h2 className={s.planHeadline}>{headline}</h2>
      <div className={s.planSteps}>
        {steps.map((st, k) => (
          <div key={k} className={s.planCard} style={{ animationDelay: `${0.06 + k * 0.05}s` }}>
            <p className={s.planTag}>{st.tag}</p>
            <p className={s.planCardTitle}>{st.title}</p>
            {st.note && <p className={s.planNote}>{st.note}</p>}
          </div>
        ))}
      </div>
      {cost && (
        <div className={s.planCost}>
          <span className={s.planFigure}>{cost.figure}</span>
          {cost.caption && <span className={s.planCaption}>{cost.caption}</span>}
        </div>
      )}
      {footnote && <p className={s.planFootnote}>{footnote}</p>}
    </div>
  );
}

export function ShowcaseSlide({ layout, images, eyebrow, title, note, imageSide, focus }: {
  layout: "split" | "full"; images: string[]; eyebrow?: string; title: string; note?: string;
  imageSide: "left" | "right"; focus?: string;
}) {
  // "split" runs the images full height against a copy column; "full" bleeds them to the edges
  // and carries the caption on a glass card. Motion lives in slides.module.css: the base styles
  // are the settled state and the keyframes animate in from an offset, so killing animation in
  // the PDF export leaves every slide correct (see export.css).
  const frames = images.map((img, k) => (
    <div key={img} className={s.showFrame} style={{ animationDelay: `${k * 0.08}s` }}>
      <img className={s.showImg} src={img} alt="" style={focus ? { objectPosition: focus } : undefined} />
    </div>
  ));

  if (layout === "split") {
    const cls = [s.slide, s.show, s.showSplit];
    if (images.length > 1) cls.push(s.showSplitPair);
    if (imageSide === "left") cls.push(s.showSplitLeft);
    return (
      <div className={cls.join(" ")}>
        <div className={s.showMedia}>{frames}</div>
        <div className={s.showCopy}>
          {eyebrow && <p className={s.group} data-vt="label">{eyebrow}</p>}
          <h2 className={s.showH2}>{title}</h2>
          {note && <p className={s.copyP}>{note}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className={`${s.slide} ${s.show} ${s.showFull}`}>
      <div className={s.showMedia}>{frames}</div>
      <div className={s.showCaption}>
        {eyebrow && <p className={s.showCaptionEyebrow}>{eyebrow}</p>}
        <h2 className={s.showCaptionH2}>{title}</h2>
        {note && <p className={s.showCaptionNote}>{note}</p>}
      </div>
    </div>
  );
}

/** A stack slide: a heading over full-width blocks. The band block flexes, so it takes the
 *  height the heading and the other blocks leave and fits inside it. Nothing can push off the
 *  slide; a long heading just buys a smaller picture. Motion follows the showcase convention,
 *  base styles are the settled state and the keyframes animate in from an offset. */
export function StackSlide({ eyebrow, title, note, blocks, controllerRef }: {
  eyebrow?: string; title?: string; note?: string; blocks: StackBlock[];
  controllerRef?: { current: StoryController | null };
}) {
  return (
    <div className={`${s.slide} ${s.stack}`}>
      {(eyebrow || title || note) && (
        <div className={s.stackHead}>
          {eyebrow && <p className={s.group} data-vt="label">{eyebrow}</p>}
          {title && <h2 className={s.stackH2}>{title}</h2>}
          {note && <p className={s.stackNote}>{note}</p>}
        </div>
      )}
      {blocks.map((b, k) => {
        const delay = { animationDelay: `${0.06 + k * 0.05}s` };
        if ("band" in b) {
          return (
            <div key={k} className={`${s.stackBlock} ${s.stackBand}`} style={delay}>
              <div className={s.stackBandArea}>
                <img className={s.stackBandImg} src={b.band} alt="" />
              </div>
              {(b.capLeft || b.capRight) && (
                <div className={s.stackCaps}>
                  <span>{b.capLeft}</span>
                  <span>{b.capRight}</span>
                </div>
              )}
            </div>
          );
        }
        if ("figure" in b) {
          return <FigureBlock key={k} src={b.figure} style={delay} controllerRef={controllerRef} />;
        }
        if ("tiles" in b) {
          return (
            <div key={k} className={`${s.stackBlock} ${s.stackTiles}`}
                 style={{ ...delay, gridTemplateColumns: `repeat(${b.tiles.length}, 1fr)` }}>
              {b.tiles.map((t, j) => (
                <div key={j} className={s.stackTile}>
                  <p className={s.stackValue}>{t.value}</p>
                  <p className={s.stackLabel}>{t.label}</p>
                  {t.note && <p className={s.stackTileNote}>{t.note}</p>}
                </div>
              ))}
            </div>
          );
        }
        if ("cards" in b) {
          return (
            <div key={k} className={`${s.stackBlock} ${s.stackCards}`}
                 style={{ ...delay, gridTemplateColumns: `repeat(${b.cards.length}, 1fr)` }}>
              {b.cards.map((c, j) => (
                <div key={j} className={s.stackCard}>
                  <p className={s.cardLabel}>{c.label}</p>
                  <p className={s.cardValue}>
                    {c.value}{c.unit && <span className={s.cardUnit}>{c.unit}</span>}
                  </p>
                  {c.range && <p className={s.cardRange}>{c.range}</p>}
                  {c.note && <p className={s.cardNote}>{c.note}</p>}
                </div>
              ))}
            </div>
          );
        }
        if ("quote" in b) {
          return (
            <div key={k} className={`${s.stackBlock} ${s.stackQuote}`} style={delay}>
              {b.head && <p className={s.quoteHead}>{b.head}</p>}
              {b.quote.map((l, j) => (
                <div key={j} className={`${s.quoteRow} ${l.rate ? s.quoteRate : ""}`}>
                  <div className={s.quoteItem}>
                    <p className={s.quoteName}>{l.item}</p>
                    {l.note && <p className={s.quoteNote}>{l.note}</p>}
                  </div>
                  <p className={s.quoteAmount}>{l.amount}</p>
                </div>
              ))}
              {b.total && (
                <div className={s.quoteTotal}>
                  <div className={s.quoteItem}>
                    <p className={s.quoteTotalLabel}>{b.total.label}</p>
                    {b.total.note && <p className={s.quoteNote}>{b.total.note}</p>}
                  </div>
                  <p className={s.quoteTotalFigure}>{b.total.figure}</p>
                </div>
              )}
            </div>
          );
        }
        return (
          <div key={k} className={`${s.stackBlock} ${s.stackLegend}`} style={delay}>
            {b.legend.map((l, j) => (
              <span key={j}>
                <i style={{ background: l.swatch }} />
                {l.label}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** A viewer slide: reads like a showcase, but the imagery is a door. Clicking it hands
 *  over to the full-viewport inspector (see Viewer.tsx). The slide keeps its own preview
 *  so the deck still reads correctly in the PDF export, where nothing is clickable. */
export function ViewerSlide({ eyebrow, title, note, images, previews, onOpen }: {
  eyebrow?: string; title: string; note?: string;
  images: ViewerImage[]; previews: number; onOpen: (at: number) => void;
}) {
  const shown = images.slice(0, Math.max(1, Math.min(previews, images.length)));
  return (
    <div className={`${s.slide} ${s.show} ${s.showSplit}${shown.length > 1 ? ` ${s.showSplitPair}` : ""}`}>
      <div className={`${s.showMedia} ${s.viewerMedia}`}>
        {shown.map((im, k) => (
          <button key={im.src} className={`${s.showFrame} ${s.viewerFrame}`}
                  style={{ animationDelay: `${k * 0.08}s` }}
                  onClick={(e) => { e.stopPropagation(); onOpen(k); }}
                  aria-label={`Inspect ${im.label}`}>
            <img className={s.showImg} src={im.src} alt="" />
          </button>
        ))}
        <span className={s.viewerBadge} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6M11 8v6M8 11h6" />
          </svg>
          Click to inspect
        </span>
      </div>
      <div className={s.showCopy}>
        {eyebrow && <p className={s.group} data-vt="label">{eyebrow}</p>}
        <h2 className={s.showH2}>{title}</h2>
        {note && <p className={s.copyP}>{note}</p>}
        {images.length > 1 && (
          <p className={s.viewerCount}>{images.length} images · zoom to native resolution</p>
        )}
      </div>
    </div>
  );
}

/* Mockups: a driven embed of some other interface, one lazy chunk each, so a deck that uses
   none carries none. Ours drag in framer-motion and lucide-react, which is most of what the
   engine could ever download.

   THE REGISTRY IS A FILE THE SITE OWNS: mockups/index.ts, resolved through @site-mockups,
   mapping the name a deck writes to an already-lazy component. It used to be a glob over
   src/mockups/, which made the engine's own source tree the registry and so required a
   Brandmachine product UI to live inside the engine. A site with no mockups resolves to the
   empty registry and ships nothing.

   Laziness is the site's to declare, not ours, because only the site knows which of its embeds
   is expensive. A typo in a deck still fails the build (checkMockups in build.mjs), which is
   what the union in types.ts used to buy. */
const MOCKUPS: Record<string, ComponentType<EmbedProps>> = SITE_MOCKUPS;

/* Scenes: the engine's own drawings, one lazy chunk each, so a deck that uses none carries none.
   ---------------------------------------------------------------------------------------------
   THE FOLDER IS THE REGISTRY. Dropping a component into scenes/ is the whole registration, and
   the name a deck writes is the filename in kebab-case: ValueChain.tsx is `scene: "value-chain"`.
   Helpers live in scenes/lib/ and are not scenes, which is why Flow.tsx sits there.

   This used to be a hand-written map plus a union in types.ts, so one new drawing meant editing
   three files, and the point of scenes is that a new drawing should be cheap. The union bought a
   compile error on a typo; checkScenes in build.mjs buys the same error and one more besides,
   because it also catches a deck still naming a scene somebody has since deleted. */
const SCENE_MODULES = import.meta.glob<{ default: ComponentType<SceneProps> }>("./scenes/*.tsx");

const sceneName = (path: string) =>
  path.split("/").pop()!.replace(/\.tsx$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();

const ENGINE_SCENES: Record<string, ComponentType<SceneProps>> = Object.fromEntries(
  Object.entries(SCENE_MODULES).map(([path, load]) => [sceneName(path), lazy(load)]),
);

/* A DECK'S OWN SCENES sit alongside the engine's.
   ---------------------------------------------------------------------------------------------
   `@deck-scenes` resolves to decks/<deck>/scenes/index.ts for a deck build, and to an empty
   registry for the admin editor, which builds with no deck selected. So the editor cannot DRAW a
   deck-local scene and shows a placeholder instead; it can still edit its copy, because copy
   lives in deck.ts. That is the trade for /_admin/ being one public bundle carrying no deck
   content, and it is why scenes used to be forced into the engine.

   Deck-local wins on a name clash at runtime, but `make build` refuses the build first, because
   a scene silently shadowing another is the kind of thing you would only find while presenting.

   WHICH ONE TO WRITE. Deck-local by default: a drawing that carries one client's argument
   belongs to that client, and two decks sharing a file means you cannot tune one without
   touching the other. Promote into the engine only when a drawing is genuinely general. */
const SCENES: Record<string, ComponentType<SceneProps>> = { ...ENGINE_SCENES, ...DECK_SCENES };

/** A scene slide: the engine draws the picture, the deck supplies the words.
 *
 *  It borrows the stack slide's frame on purpose, so the heading over a scene is the same
 *  heading over a drawn `figure` and the two read as one family. Everything below the heading
 *  is the scene's own. */
export function SceneSlide({ scene, eyebrow, title, note, controllerRef, ...rest }: {
  scene: string;
  eyebrow?: string; title?: string; note?: string;
  controllerRef?: { current: StoryController | null };
} & Omit<SceneProps, "controllerRef">) {
  const Scene = SCENES[scene];
  // The build refuses a deck naming a scene that is not there, so this is for the gap between
  // deleting a file and running a build. Loud beats blank: an empty slide in a meeting reads as
  // the deck being broken, a sentence reads as one drawing being missing.
  if (!Scene) {
    // Two causes, and they want different words. In the admin editor every deck-local scene is
    // absent by design, so "missing" would be a lie on a perfectly healthy deck.
    return (
      <div className={`${s.slide} ${s.stack}`}>
        <div className={s.stackHead}>
          <p className={s.group}>{__ADMIN__ ? "Custom slide" : "Missing scene"}</p>
          <h2 className={s.stackH2}>
            {__ADMIN__
              ? "Drawn by this deck, not previewed here."
              : <>No component named &ldquo;{scene}&rdquo;.</>}
          </h2>
          <p className={s.stackNote}>
            {__ADMIN__
              ? "Its copy is editable below like any other slide. The drawing lives in this deck's own scenes/ folder, which the shared editor bundle deliberately does not carry."
              : "Scenes are files in this deck's scenes/ folder or in src/engine/scenes/, kebab-cased: ValueChain.tsx is \u201cvalue-chain\u201d."}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className={`${s.slide} ${s.stack}`}>
      {(eyebrow || title || note) && (
        <div className={s.stackHead}>
          {eyebrow && <p className={s.group} data-vt="label">{eyebrow}</p>}
          {title && <h2 className={s.stackH2}>{title}</h2>}
          {note && <p className={s.stackNote}>{note}</p>}
        </div>
      )}
      {/* The fallback carries the same pending marker a figure uses, so the PDF exporter waits
          for the chunk instead of printing an empty half-slide. */}
      <Suspense fallback={<div className={s.stackBlock} style={{ flex: "1 1 auto" }} data-slide-pending="" />}>
        <Scene {...rest} controllerRef={controllerRef} />
      </Suspense>
    </div>
  );
}

/** A live product mockup on a slide, driven by the presenter's mouse.
 *
 *  The frame is natively 1280x816 on a 1280x720 stage, so it is scaled to fit rather than
 *  cropped: cropping a user interface cuts off the very chrome that makes it read as software.
 *  Any heading is deliberately small, because the frame is the argument.
 *
 *  Nothing plays on arrival. The demo lands on its first frame and waits, so the presenter can
 *  say what is on screen before any of it moves. The chapter nav bottom-left says how many
 *  beats there are and which one is running, and each one can be clicked to go back to it when
 *  somebody asks about a step you have already passed. */
export function MockupSlide({ mockup, eyebrow, title, assets, controllerRef }: {
  /** A key in mockups/index.ts, e.g. "designer". */
  mockup: string;
  eyebrow?: string; title?: string; assets: string;
  /** Absent in the PDF export and the admin editor's contact sheet, where the demo is a still.
   *  Its presence is also what says this is being presented, so the nav is drawn only then. */
  controllerRef?: { current: StoryController | null };
}) {
  // -1 until the presenter starts it. The story mounts idle rather than in chapter one, so on
  // arrival nothing is playing, and the nav marks the first chapter as queued up instead of
  // claiming it is already running.
  const [at, setAt] = useState(-1);
  const [chapters, setChapters] = useState<Chapter[]>([]);

  const Embed = MOCKUPS[mockup];
  // The build refuses a deck naming a mockup that is not there, so this covers only the gap
  // between deleting a file and running a build. Same reasoning as the missing-scene card:
  // an empty slide in a meeting reads as the whole deck being broken.
  if (!Embed) {
    return (
      <div className={`${s.slide} ${s.stack}`}>
        <div className={s.stackHead}>
          <p className={s.group}>Missing mockup</p>
          <h2 className={s.stackH2}>No embed named &ldquo;{mockup}&rdquo;.</h2>
          <p className={s.stackNote}>
            Mockups are registered in mockups/index.ts, which maps this name to the
            component that draws it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${s.slide} ${s.mockup}`}>
      {(eyebrow || title) && (
        <div className={s.mockupHead}>
          {eyebrow && <p className={s.group} data-vt="label">{eyebrow}</p>}
          {title && <h2 className={s.mockupH2}>{title}</h2>}
        </div>
      )}
      {/* The frame is a live application, so it owns its own clicks. The deck advances on a
          click anywhere on the stage, which meant pressing "Generate 22 previews" fired the
          mockup's hotzone AND skipped the slide. The keyboard is not an option by design: it
          always moves the deck.

          Only the interface is shielded, not the box around it. This element is a full-width
          flex box and the frame it centres is about 1050 of 1280, so blanket-stopping here also
          swallowed the letterbox down either side, leaving a 28px strip of slide padding as the
          presenter's entire click-to-advance target. That went unnoticed while the demo started
          itself; the moment it stopped doing that, the first click of the slide had nowhere to
          land. Comparing target with currentTarget draws the line exactly where the picture
          ends: a click that reaches this element never touched the software. */}
      <div
        className={`${s.mockupFrame} bmx-frame`}
        onClick={(e) => { if (e.target !== e.currentTarget) e.stopPropagation(); }}
      >
        <Suspense fallback={null}>
          <Embed
            assetBase={assets}
            controllerRef={controllerRef}
            onSectionChange={setAt}
            onChapters={setChapters}
          />
        </Suspense>
      </div>
      {controllerRef && chapters.length > 1 && (
        // Left, because the deck's own section bar is centred at the bottom of the viewport and
        // the two would otherwise sit on top of each other. Its own click handler for the same
        // reason the frame has one: pressing a chapter must not also skip the slide.
        <div className={s.chapters} onClick={(e) => e.stopPropagation()}>
          {chapters.map((c, k) => {
            const state = k === at ? s.chapterOn
              : k < at ? s.chapterDone
              : at < 0 && k === 0 ? s.chapterNext
              : "";
            return (
              <button
                key={k}
                className={`${s.chapter} ${state}`}
                title={c.copy}
                aria-current={k === at || undefined}
                onClick={() => controllerRef.current?.goTo?.(k)}
              >
                <span className={s.chapterNum}>{k + 1}</span>
                <span className={s.chapterTitle}>{c.title}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The slide number, bottom right.
 *
 *  A sibling of the slide rather than a child of it, so it is positioned against the 1280x720
 *  stage and not against whatever padding that slide kind happens to use. All three renderers
 *  give it a positioned parent: the live stage, the PDF's page wrapper, and the editor's
 *  thumbnail frame. */
export function SlideNumber({ n, onMedia }: { n: number; onMedia: boolean }) {
  return (
    <span className={`${s.slideNum}${onMedia ? ` ${s.slideNumOnMedia}` : ""}`} aria-hidden="true">
      {n}
    </span>
  );
}

/** A film, edge to edge. Plays once on arrival and holds its last frame; the deck moves on when
 *  the presenter says so, not when the video ends. */
export function FilmSlide({ src }: { src: string }) {
  return (
    <div className={`${s.slide} ${s.film}`}>
      <video className={s.filmVideo} src={src} autoPlay muted playsInline preload="auto" />
    </div>
  );
}

export function OutroSlide() {
  return (
    <div className={`${s.slide} ${s.outro}`}>
      <div className={s.mark}>
        <img src={logo} alt={brand.name} />
      </div>
    </div>
  );
}
