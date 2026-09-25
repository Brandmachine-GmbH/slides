// The data shape every deck conforms to. A deck is data; the engine renders it.

/** Carried by every slide a deck can author, and by the two the engine generates from deck-level
 *  copy (the title and the overview). Both fields are about the slide rather than on it. */
export interface SlideMeta {
  /** false hides the number on this slide. Default true.
   *
   *  The number itself is never authored, only whether it shows. It is always the slide's
   *  position in the finished deck, which is also its page in the PDF, so "page 9" in the
   *  leave-behind and "9" in the corner of the screen are the same slide. That is the reason
   *  hiding one number does NOT renumber the slides after it: the count is of slides, not of
   *  numbers printed. */
  number?: boolean;

  /** The fuller version, for whoever reads this deck without you in the room.
   *
   *  It NEVER appears on screen. It prints under the slide in the PDF, and that split is the
   *  point: a slide should carry one idea in as few words as it takes, because the argument is
   *  the presenter, out loud. Without somewhere for the rest to go, the only way to keep a sent
   *  deck comprehensible is to write the paragraph onto the slide, and then it is on the wall in
   *  a meeting where nobody reads it and it competes with the person talking.
   *
   *  So: strip the slide, put the sentence you would have said here, and the sent deck loses
   *  nothing. Two or three sentences. `make build` fails past 320 characters, because the band
   *  it prints into is a fixed height and silently clipping a client's copy is worse than
   *  refusing to build. */
  handout?: string;

  /** What this slide has to DO to the room. Internal, and it never leaves this repo.
   *
   *  A slide's copy says what is on it; the job says why it is there, and the two drift apart
   *  because only one of them gets rewritten. Story mode at /admin/edit/<deck> shows every job
   *  in order with the current headline underneath, which is where that drift becomes visible.
   *
   *  It is a TEST, not a source: nothing is ever generated from it. Read the jobs top to bottom
   *  and you should hear the argument; where you cannot, the deck has a hole.
   *
   *  PRIVACY. This is the one field on a slide that is written in the register of the notes at
   *  the top of a deck.ts ("concede the first two points, they already pay someone for that"), so
   *  unlike `handout` it must
   *  not ship. A Vite plugin blanks every `job` out of the client bundle (stripJobs in
   *  vite.config.ts) and check-leaks.mjs fails the build if one ever survives. Nothing else in
   *  deck.ts is treated this way, so a value here is as safe as one in internal.json. */
  job?: string;
}

export interface ContentItem extends SlideMeta {
  /** The small uppercase label above the headline.
   *
   *  A SIGNPOST, not a second headline: it says where you are, and the headline says the
   *  takeaway. See VOICE.md section 2, including the note on the rule that used to say the
   *  opposite. Plain nouns are correct here and usually best ("Product overview", "The terms").
   *
   *  This was called `group` on content and plan slides and `eyebrow` on every other kind, for
   *  the same element in the same place with the same styling. Two names for one thing meant
   *  two different ideas of what belonged in it, and the name `group` in particular suggested a
   *  category rather than a role. One name now. */
  eyebrow: string;
  /** video path relative to the deck base URL, e.g. "videos/before-after/01.mp4" */
  video?: string;
  /** one or more image paths (a studio gallery), e.g. "images/product-studio/01.jpg" */
  images?: string[];
  headline: string;
  /** Body copy as a single paragraph. Provide this OR `bullets`.
   *
   *  USUALLY WRONG, and the most common way a slide in this deck goes bad. On a slide that
   *  already carries a video, a photograph, a drawing or a scene, the picture IS the body copy.
   *  Write the sentence, then delete it and check whether anything was actually lost; most of
   *  the time the same sentence belongs in `handout`, which prints in the PDF and never appears
   *  on screen. `make build` reports anything over 240 characters. VOICE.md section 4. */
  paragraph?: string;
  /** body copy as a bullet list; rendered instead of `paragraph` when present. */
  bullets?: string[];
}

/** An in-section divider slide, e.g. to split a section into "Before" and "After" parts. */
export interface SlideDivider extends SlideMeta {
  divider: true;
  /** small uppercase kicker above the title */
  eyebrow?: string;
  title: string;
  tagline?: string;
}

/** One card in a plan slide: a labelled step or outcome. */
export interface PlanStep {
  /** small uppercase label, e.g. "Step 1 · One day" or "Step 2 · A week" */
  tag: string;
  /** the card's headline, e.g. "Setup & test" or "First results" */
  title: string;
  /** One supporting paragraph under the title, above the blocks.
   *
   *  Rarely earns its place. A stack slide exists because it is carrying evidence, and the
   *  evidence is the body copy. See `paragraph` above. */
  note?: string;
}

/** The highlighted figure on a plan slide, e.g. the pilot price. */
export interface PlanCost {
  /** the big figure, e.g. "€9,900" */
  figure: string;
  /** small caption beside it, e.g. "fixed price, everything included" */
  caption?: string;
}

/** A costed-proposal slide: a row of step/outcome cards plus an optional headline figure. */
export interface SlidePlan extends SlideMeta {
  plan: true;
  /** The small uppercase label above the headline.
   *
   *  A SIGNPOST, not a second headline: it says where you are, and the headline says the
   *  takeaway. See VOICE.md section 2, including the note on the rule that used to say the
   *  opposite. Plain nouns are correct here and usually best ("Product overview", "The terms").
   *
   *  This was called `group` on content and plan slides and `eyebrow` on every other kind, for
   *  the same element in the same place with the same styling. Two names for one thing meant
   *  two different ideas of what belonged in it, and the name `group` in particular suggested a
   *  category rather than a role. One name now. */
  eyebrow: string;
  headline: string;
  steps: PlanStep[];
  cost?: PlanCost;
  /** small print under the figure, e.g. a rate disclaimer */
  footnote?: string;
}

/** A showcase slide: the imagery itself, big, with minimal type. For proving quality.
 *  Source assets are usually square, so "split" keeps a whole square and "duo" trims the sides. */
export interface SlideShowcase extends SlideMeta {
  showcase: true;
  /** "split": one or two full-height images bleeding off an edge, copy beside them (default).
   *  "full": images fill the slide edge to edge, caption on a glass card bottom-left. Best for
   *  dark or wide imagery; on light, airy shots the card lands on top of the subject. */
  layout?: "split" | "full";
  /** image paths relative to the deck (one or two), e.g. "images/looks/01.jpg" */
  images: string[];
  /** small uppercase label above the title */
  eyebrow?: string;
  title: string;
  /** One supporting paragraph under the title, above the drawing.
   *
   *  Rarely earns its place, for the reason `paragraph` gives: the drawing is the body copy. */
  note?: string;
  /** "split" only: which side the image sits on (default "right") */
  imageSide?: "left" | "right";
  /** object-position for the crop, e.g. "50% 30%" (default centred) */
  focus?: string;
}

/** One tile in a stack slide's `tiles` block: a measured figure and what it means. */
export interface StackTile {
  /** the figure, e.g. "94%" or "Whole" */
  value: string;
  /** what the figure is, e.g. "Of frames used unedited" */
  label: string;
  /** optional supporting line under the label */
  note?: string;
}

/** One card in a stack slide's `cards` block: something on offer, and what it costs.
 *
 *  Deliberately NOT `tiles`, which sits beside it in the union and looks similar enough to be
 *  worth saying why. A tile is one measured figure and what it means ("94%", "of frames used
 *  unedited"): evidence, drawn as a plain number over a rule. A card is an option, and an
 *  option carries a price, the band it applies to and what is included, which is four lines
 *  rather than two and wants an edge around it, so that four of them read as four things to
 *  choose between rather than as one row of statistics.
 *
 *  Restyling `tiles` to cover both was the first plan and is why this exists instead: other decks
 *  already use `tiles` for its actual purpose, and the engine is shared, so making one deck's
 *  boxes prettier would have redrawn three client decks nobody was looking at. */
export interface RateCard {
  /** the tier, e.g. "Team" */
  label: string;
  /** the price, set as a numeral, e.g. "€490" */
  value: string;
  /** the unit, set inline after the price, e.g. "/ image" or "+ / mo" */
  unit?: string;
  /** who the tier is for, e.g. "Up to 500 products a year" */
  range?: string;
  /** the small print, e.g. "Billed annually." */
  note?: string;
}

/** One block in a stack slide. Blocks run full width, in the order given.
 *  - `band`   a wide image, fitted rather than cropped, with an optional caption row.
 *  - `tiles`  a row of measured figures (two to four).
 *  - `cards`  a row of priced options (two to four). See RateCard for tiles vs cards.
 *  - `legend` colour swatches, for annotations drawn onto a band.
 *  - `figure` a drawn diagram: the path to an .svg under the deck's images/, inlined.
 *
 *  `figure` and `band` both point at a file, and the difference matters. A band is a picture,
 *  drawn through <img>, which makes it an isolated document: it cannot reach the deck's fonts
 *  or colour tokens, and its text falls back to whatever the file itself names, which in
 *  practice means Arial. A figure is fetched and injected into the page instead, so it is part of this
 *  document: Inter and Playfair apply, var(--orange) resolves, and it prints as vector.
 *
 *  Author figure SVGs with fill="currentColor" or style="fill:var(--ink)". A bare presentation
 *  attribute like fill="var(--ink)" is not valid SVG and silently will not resolve.
 *
 *  Figure files are copied byte for byte like any other image, so unlike deck.ts (whose
 *  comments minification strips) an XML comment inside one reaches the client. check-leaks.mjs
 *  fails the build on those rather than trusting anyone to remember. */
export type StackBlock =
  | { band: string; capLeft?: string; capRight?: string }
  | { tiles: StackTile[] }
  | { cards: RateCard[] }
  | { legend: { swatch: string; label: string }[] }
  | { figure: string }
  | QuoteBlock;

/** One priced line in a quote block. */
export interface QuoteLine {
  /** what is being charged for, e.g. "Setup" */
  item: string;
  /** one line spelling out what that covers */
  note?: string;
  /** the figure exactly as it should read, e.g. "€3,000", "€800 each", "quoted separately" */
  amount: string;
  /** true: a price we are quoting but the client has not taken, so it draws quieter and sits
   *  outside the total. For the rate-card half of an offer: "each further item, €800". */
  rate?: boolean;
}

/** A quote: priced lines with an optional total under them.
 *
 *  THE ENGINE NEVER ADDS THE MONEY UP. `total.figure` is written out in the deck, and that is
 *  deliberate rather than lazy. `amount` is free text because a real offer contains "€800
 *  each", "around €200" and "quoted separately" alongside plain figures, so any sum here would
 *  have to parse prices out of prose and would be confidently wrong on exactly the lines that
 *  are not plain. A total that disagrees with its own lines in front of a client is worse than
 *  one somebody has to keep in step by hand, because the hand-written one is visible in the
 *  diff and reviewable. If this ever does sum, `amount` has to become a number first. */
export interface QuoteBlock {
  quote: QuoteLine[];
  /** a small uppercase label above the lines, e.g. "If you need more" */
  head?: string;
  total?: {
    /** what the figure is the total OF, e.g. "As scoped" */
    label: string;
    figure: string;
    /** small print under the figure, e.g. a validity or VAT note */
    note?: string;
  };
}

/** A stacked slide: a heading, then full-width blocks down the slide.
 *
 *  This is for evidence that is wider than it is tall, where the showcase layouts would crop
 *  the information away: showcase images are `object-fit: cover`, right for photography and
 *  wrong for a strip of frames with lines drawn across it.
 *
 *  The band takes whatever height the other blocks leave and fits inside it, so a slide can
 *  never overflow, but a tall heading buys itself a smaller picture. At 1280x720 a 3:1 band
 *  wants about 380 of the 630 usable pixels, so keep the title to one line where you can.
 *  The tell that you have overspent is the caption row: it always spans the full width, so
 *  once the band is squeezed narrower than that, the caption visibly overhangs the picture. */
export interface SlideStack extends SlideMeta {
  stack: true;
  eyebrow?: string;
  title?: string;
  /** one supporting paragraph under the title, above the blocks */
  note?: string;
  blocks: StackBlock[];
}

/** One box in a scene's left-to-right run.
 *
 *  The field names match PlanStep deliberately. The admin editor finds a slide's copy by walking
 *  `steps[].tag / .title / .note` (src/admin/fields.ts), so naming them the same way means a
 *  scene's words are editable the day the scene is added, rather than after someone remembers
 *  there was a fourth file to teach. */
export interface SceneStep {
  /** the band under the box, naming who does it, e.g. "Product Studio" */
  tag: string;
  /** the box heading, e.g. "Photograph it" */
  title: string;
  /** one supporting line under the heading */
  note?: string;
  /** false: this part of the chain is not one we run, and its band draws dashed and grey
   *  rather than filled. Default true. */
  ours?: boolean;
  /** 0-100: where this step sits along a scene's own axis, as a percentage of it.
   *
   *  Only scenes that plot their steps against something read it. `shoot-when` is a time axis,
   *  so the position IS the argument and the deck has to own it; a scene that simply lays its
   *  steps out in a row (the value chain) ignores this entirely. */
  at?: number;
  /** an icon name, for a scene that draws one. Lucide, kebab-case, e.g. "factory". */
  icon?: string;
  /** a picture of this step, relative to the deck, e.g. "images/steps/01.jpg", for a scene
   *  that shows what each step produces rather than only naming it. Prefixed with the deck's base
   *  in buildSlides like every other asset path; scenes that draw no pictures ignore it. */
  image?: string;
}

/** A closing line a scene builds to. `from` and `to` are step indexes, inclusive, for a scene
 *  that draws the line under a SPAN of its steps (the value chain does); a scene that simply
 *  ends on a sentence leaves them out. */
export interface SceneClaim { text: string; from?: number; to?: number }

/** A hand-built slide: a drawing the ENGINE renders, rather than one the deck supplies as a file.
 *
 *  A `figure` block is the deck's picture, inlined. A scene is the reverse, the engine's
 *  component filled with the deck's copy, and the trade is real in both directions. A figure can
 *  be drawn by whoever writes the deck and needs no engine change; a scene cannot, and in
 *  exchange it can hover, build, lay its own type out live and hold something that moves.
 *
 *  Reach for a scene when a drawing carries an argument the deck leans on, and for a figure
 *  when it explains something once. There should be very few scenes.
 *
 *  Named the way a mockup is (`mockup: "shot-planner"`) rather than pointing at a component, so
 *  deck.ts stays data: the editor, the PDF and the contact sheet all keep working, and no deck
 *  can import code. */
/** What every scene component is handed. A new scene implements this and nothing else. */
export interface SceneProps {
  steps: SceneStep[];
  claim?: SceneClaim;
  answer?: SceneStep;
  months?: number;
  /** Present only while the deck is being presented. Absent for the PDF and the editor's
   *  contact sheet, which is how a scene knows to render its finished, un-driven state. */
  controllerRef?: { current: StoryController | null };
}

export interface SlideScene extends SlideMeta {
  /** The file in src/engine/scenes/, kebab-cased: ValueChain.tsx is "value-chain".
   *
   *  A plain string rather than a union of the ones that exist today, so adding a drawing is
   *  dropping in one file rather than editing three. A typo is caught by the build instead
   *  (checkScenes in build.mjs), which is strictly better than the union was: it also catches a
   *  deck still naming a scene that has since been deleted, which a union never did. */
  scene: string;
  eyebrow?: string;
  title?: string;
  /** one supporting paragraph under the title, above the drawing */
  note?: string;
  /** The cards, boxes or factors the scene draws, in order.
   *
   *  Optional, because a scene can be a single played act with its point in the headline
   *  ("noise", "tooling") and inventing an empty array in every such deck would be ceremony.
   *  SceneProps.steps stays required: buildSlides substitutes [], so no scene has to check. */
  steps?: SceneStep[];
  claim?: SceneClaim;

  /* Below here is read by SOME scenes and ignored by the rest, the same way `assets` belongs to
     the mockup. A scene that needs a shape nobody else does says so here rather than inventing a
     parallel way in, and the name says which scene it serves. */

  /** "season-math": the figure the arithmetic comes to, revealed on the last beat. Its `title`
   *  is the answer ("400 hours") and its `tag` the unit under it. */
  answer?: SceneStep;
  /** "season-math": how many months of one person that is, which is how far the calendar burns.
   *  Authored rather than derived, because the assumption behind it (what a working month is)
   *  belongs in the deck's argument and not in the engine. */
  months?: number;
}

/** A film, edge to edge, with nothing on it.
 *
 *  Not a `content` slide with a video: that one puts a 600x600 rounded card beside a column of
 *  copy, which is right for a short loop illustrating a point and wrong for something you sit
 *  back and watch. This fills the whole 1280x720 stage and carries no type at all, because a
 *  film that needs a caption over it is a film that has not finished being edited.
 *
 *  It plays once and holds its last frame. Nothing loops: the end of the film is a composed
 *  frame, and it is also what the PDF prints, since the export pins every video to its last
 *  frame. So the still in the leave-behind is the one the edit was built to land on. */
export interface SlideFilm extends SlideMeta {
  film: true;
  /** video path relative to the deck, e.g. "videos/film/no-limits.mp4" */
  video: string;
}

/** A live product mockup, driven by the presenter.
 *
 *  Not a screenshot and not a video: the real interface, hand-built, running in the slide. It
 *  mounts static and plays one chapter per mouse click, so a demo happens on the presenter's
 *  beat instead of on a timer while they are still talking. Once the chapters run out a click
 *  moves on like anywhere else. The arrow keys are never captured: they move the deck on every
 *  slide including this one, so a presenter can always leave. See SlideShow's key handler.
 *
 *  The code is a vendored snapshot of the marketing site's `src/interactive-mockups/`, so it
 *  will drift from the site over time. Refresh it deliberately rather than expecting parity.
 *  Its assets live in the deck's own images/, so nothing is fetched in the room.
 *
 *  The stage is natively 1280x816 against a 1280x720 slide, so it fits to about 1129 wide and
 *  wants a slide with almost no type on it. Show it, do not annotate it. */
export interface SlideMockup extends SlideMeta {
  /** A key in the site's mockups/index.ts, e.g. "shot-planner" or "designer".
   *
   *  A plain string rather than a union of the two that exist today, for the reason SlideScene
   *  gives: adding one should be dropping in a file, not editing three. `make build` checks the
   *  name against the folder and prints the ones that exist, which also catches a deck still
   *  naming a mockup somebody has since deleted. */
  mockup: string;
  /** where the mockup's images live, relative to the deck, e.g. "images/shot-planner" */
  assets: string;
  eyebrow?: string;
  /** a short line above the frame. Keep it to one line; the frame wants the room. */
  title?: string;
}

/** One image in a viewer slide. Natural size is read from the file on load, so only the
 *  path and the labels are authored here. */
export interface ViewerImage {
  /** image path relative to the deck, e.g. "images/results/01.jpg" */
  src: string;
  /** tab label */
  label: string;
  /** optional second line in the tab, e.g. "front · take 1" */
  sub?: string;
}

/** A zoomable image inspector. The slide itself shows a normal preview; opening it hands
 *  over to a full-viewport viewer with tabs, pan and zoom, so someone can look at the
 *  actual pixels. Every image shares one scale, so switching tabs compares like for like.
 *
 *  The viewer deliberately renders OUTSIDE the 1280x720 stage: the stage is fitted with
 *  CSS zoom, and scaling an image inside it would both fight that transform and cap the
 *  detail at the stage's resolution. */
export interface SlideViewer extends SlideMeta {
  viewer: true;
  eyebrow?: string;
  title: string;
  note?: string;
  images: ViewerImage[];
  /** how many previews to show on the slide itself, 1 or 2 (default 2) */
  previews?: number;
  /** false keeps this slide's images out of the download offer on a deck that makes one.
   *
   *  For a viewer slide whose images are evidence rather than deliverables. The case it was
   *  written for is a deck that offers the sets it produced for the client and withholds a
   *  validation run, which is on a viewer slide so that a claim made on that slide can be
   *  checked, and is nobody's to keep.
   *
   *  Ignored entirely unless the deck sets `downloads: true`; see Deck.downloads. */
  download?: boolean;
}

export type SectionSlide = ContentItem | SlideDivider | SlidePlan | SlideShowcase | SlideViewer | SlideStack | SlideScene | SlideFilm | SlideMockup;

export interface Section {
  /** false hides the number on this section's DIVIDER slide, and nothing else. The section's
   *  own slides each carry their own `number`. Declared here rather than inherited from
   *  SlideMeta because "the number on this section" would otherwise read as all of them. */
  number?: boolean;
  /** handout text for this section's DIVIDER slide, on the same reading. See SlideMeta. */
  handout?: string;
  id: string;
  title: string;
  /** Set false and this section does not announce itself: its slides simply follow whatever
   *  came before, with no divider.
   *
   *  For a section that is really an opening beat rather than a chapter. It still appears in
   *  the overview and the bottom nav, which jump to its first slide instead of to a divider. */
  divider?: boolean;
  /** A two- or three-word name for this section, for the places a full title will not fit.
   *
   *  The bottom nav prints every section title on one line and sizes itself to fit them, so a
   *  title written as a whole sentence ("Every chapter title written out as a full sentence.")
   *  stretches the bar across the entire screen for the whole meeting. Set `short` and the bar
   *  gets that instead, while the overview, the divider and the Contents panel keep the title.
   *
   *  It also replaces "Section 1" above the divider headline, so a deck whose sections are
   *  arguments rather than topics can label them as such. */
  short?: string;
  tagline: string;

  /** A picture for this section's row on the overview slide, relative to the deck.
   *
   *  Opt-in per deck: the overview only switches to its picture layout when at least one section
   *  sets this, so every deck written before it existed keeps the plain rows it was designed with.
   *  Pick an image that shows what the chapter is about, not one that merely looks good; a row of
   *  unrelated photographs reads as decoration, which is the failure this was added to avoid. */
  thumb?: string;

  /** What this CHAPTER has to do: the job of its slides taken together. Internal, stripped from
   *  the client bundle exactly like SlideMeta.job.
   *
   *  Note that this reads differently from `handout` and `number` on a section, which apply to
   *  that section's divider slide and nothing else. They are properties of a printed slide, so
   *  on a section they can only mean its one slide. A job is a property of an argument, and a
   *  section IS the argument; the divider is only how it announces itself. So the divider has no
   *  job of its own and story mode shows it as the chapter heading, which also removed a whole
   *  category of duplicates: every divider job anybody writes turns out to be its chapter's. */
  job?: string;

  slides: SectionSlide[];
}

export interface Deck {
  /** accepted passcodes (matched case/space/punctuation-insensitively) */
  passcodes: string[];
  /** Pictures for the title slide, relative to the deck: one, or three (the first runs full
   *  height, the other two stack beside it). Absent keeps the text-only title every older deck
   *  was designed around. */
  title: { eyebrow: string; headingHtml: string; sub: string; images?: string[] } & SlideMeta;
  agenda: { eyebrow: string; heading: string } & SlideMeta;
  sections: Section[];
  /** false turns slide numbers off for the whole deck. Default true.
   *
   *  The per-slide `number: false` is for the one or two a deck wants quiet. This is for a deck
   *  that does not want them at all, which is otherwise an edit to every slide in it, and it is
   *  also the only way to unnumber the outro, since nothing in deck.ts describes that slide. */
  numbers?: boolean;

  /** "editorial" switches this deck onto the second visual register: plain white ground with no
   *  colour wash, labels in grey with a small orange dot instead of orange text, no orange rule
   *  under chapter titles, and a type scale with even steps (headline 48 rather than 40).
   *
   *  A deck setting rather than an engine-wide change because the engine is shared: restyling it
   *  in place would silently redraw every client deck already sent, on the next push of any deck.
   *  Absent means the original look, unchanged. The values live in tokens.css under
   *  :root[data-deck-theme="editorial"], and App sets that attribute from here. */
  theme?: "editorial";

  /** true offers the files themselves: on every viewer slide, the image inspector grows a
   *  download button for the frame on screen and one for that slide's whole set as a zip.
   *  Default false, so a deck offers nothing unless it says so.
   *
   *  IT IS CONVENIENCE, NOT ACCESS CONTROL, and that is the thing to be clear about before
   *  setting it either way. Anyone holding the link can already save any image the deck draws,
   *  the same as on any web page, and turning this off does not change that. What it decides is
   *  whether the deck OFFERS, which is the difference between a partner who is meant to walk
   *  away with the files and a prospect who is being shown them.
   *
   *  Deck-wide because that is the decision somebody actually makes, with `download: false` on
   *  a viewer slide for the exception. See SlideViewer.download. */
  downloads?: boolean;

  /** What the MEETING has to do. One sentence, at the top of story mode, and the thing every
   *  slide's job is ultimately answerable to. Internal, stripped like the others.
   *
   *  The outro is the one slide that cannot have a job, for the same reason it cannot have a
   *  number of its own: there is nothing in deck.ts describing it to hang one on. */
  job?: string;
}

/** A flattened, navigable slide produced from a Deck. */
export type FlatSlide = FlatSlideBody & {
  /** This slide's 1-based position in the deck, which is also its page in the PDF. Absent when
   *  the slide, or the deck, asked for no number. See SlideMeta. */
  number?: number;
  /** Print-only copy, rendered by ExportView and by nothing else. See SlideMeta.handout. */
  handout?: string;
};

type FlatSlideBody =
  | { kind: "title"; images?: string[] }
  | { kind: "agenda" }
  | { kind: "divider"; idx: string; title: string; tagline: string }
  | { kind: "groupdivider"; eyebrow?: string; title: string; tagline?: string }
  | { kind: "content"; eyebrow: string; headline: string; paragraph?: string; bullets?: string[]; src?: string; images?: string[] }
  | { kind: "plan"; eyebrow: string; headline: string; steps: PlanStep[]; cost?: PlanCost; footnote?: string }
  | { kind: "showcase"; layout: "split" | "full"; images: string[]; eyebrow?: string; title: string; note?: string; imageSide: "left" | "right"; focus?: string }
  | { kind: "viewer"; eyebrow?: string; title: string; note?: string; images: ViewerImage[]; previews: number; download: boolean }
  | { kind: "mockup"; mockup: string; assets: string; eyebrow?: string; title?: string }
  | { kind: "stack"; eyebrow?: string; title?: string; note?: string; blocks: StackBlock[] }
  | { kind: "scene"; scene: string; eyebrow?: string; title?: string; note?: string; steps: SceneStep[]; claim?: SceneClaim; answer?: SceneStep; months?: number }
  | { kind: "film"; src: string }
  | { kind: "outro" };

export interface TocSection {
  title: string;
  /** Section.short, carried through for the bottom nav. Absent when the deck did not set one. */
  short?: string;
  tagline: string;
  /** Section.thumb, already prefixed with the deck's base. */
  thumb?: string;
  dividerIndex: number;
  items: { label: string; index: number }[];
}

/* ============================================================================
   The contract between the engine and a driven embed
   ----------------------------------------------------------------------------
   These two live here rather than in the mockups because they are the ENGINE's
   half of the deal: the deck drives an embed through `step()`, and draws the
   chapter bar from the list the embed hands back. The mockups are one
   implementation of that contract, and the vendored snapshot of the marketing
   site is another thing again, so a type the deck depends on must not be
   reachable only through a folder we re-vendor.

   The same handle is claimed by things that are not mockups at all: a staged
   figure publishes a `step` and has no chapters, which is why `goTo` is
   optional. Widening this narrows nothing, so it can be implemented by anything
   the presenter should be able to drive with one key.
   ============================================================================ */

/** One entry in the chapter bar the deck draws along the bottom of a mockup slide. */
export interface Chapter {
  title: string;
  copy?: string;
}

/** What a host gets to drive an embed with. */
export interface StoryController {
  /** Play the next beat. Returns true when the embed consumed the input, false
   *  when it has nothing left and the host should handle the key itself. */
  step: () => boolean;
  /** Jump straight to a chapter, for a host drawing its own clickable controls.
   *
   *  Optional because a staged figure publishes this same handle and has no chapters to
   *  jump between. The handle carries the verbs; the chapter list itself arrives by
   *  callback (`onChapters`), because a ref cannot tell a host it has been filled in. */
  goTo?: (i: number) => void;
}

/** What the deck passes to a mockup embed.
 *
 *  Exported so a site's own embeds can be typed against it without reaching into the
 *  engine's internals. `assetBase` is the deck-local folder its product imagery was copied
 *  into, so a mockup runs with no network in the room. */
export interface EmbedProps {
  assetBase: string;
  controllerRef?: { current: StoryController | null };
  onSectionChange?: (index: number) => void;
  onChapters?: (chapters: Chapter[]) => void;
}

/** Who a deck site belongs to.
 *
 *  Resolved through the `@brand` alias, which points at brand.json at the repo root, or at the
 *  engine's neutral example when a site has not written one. Deliberately small: this is the
 *  set of things that were previously hard-coded literals in the engine, and every addition to
 *  it is another thing the engine knows about one company. Colours, fonts and the type scale
 *  are NOT here; those are tokens.css, which is a stylesheet and belongs to whoever is styling.
 */
export interface Brand {
  /** The wordmark's alt text, the browser tab title, and the name on the neutral root page. */
  name: string;
  /** The live site, used by `npm run verify` and by nothing that ships to a client. */
  siteUrl: string;
  gate: {
    eyebrow: string;
    /** HTML, so the greeting can break where it should rather than wherever it fits. */
    headingHtml: string;
    hint: string;
  };
  /** Our own product names, which appear in decks on purpose and must not be mistaken for a
   *  client's brand by check-leaks.mjs. A deck titled with one of these finds the product in
   *  the admin bundle rather than a leak. Empty is fine; it only ever makes the check stricter. */
  products?: string[];
}
