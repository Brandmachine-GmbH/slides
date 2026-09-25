import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { flushSync } from "react-dom";
import type { Deck } from "./types";
import { buildSlides } from "./buildSlides";
import { Toc } from "./Toc";
import { SegNav } from "./SegNav";
import { useCoarsePointer } from "./useCoarsePointer";
import { SlideBody } from "./SlideBody";
import type { StoryController } from "./types";
import { Viewer } from "./Viewer";
import { applyColorScheme, readStoredScheme, storeScheme, type ColorScheme } from "./colorScheme";
import s from "./SlideShow.module.css";
import "./transitions.css";

// WebKit and Blink have carried `zoom` for years; Firefox picked up the standardised property in
// 126. Anywhere it is missing we fall back to the transform fit rather than break the layout.
const SUPPORTS_ZOOM = typeof document !== "undefined" && "zoom" in document.documentElement.style;

/** Under this the stage is fitted with `transform` rather than `zoom`, whatever the browser
 *  supports. See the note in SlideShow.module.css for which mechanism is right when and why.
 *
 *  It is 1, which is to say `zoom` is used only ever to ENLARGE. WebKit will not draw text
 *  smaller than 9px and enforces that by rewriting the COMPUTED font size, and `zoom` is a
 *  rewrite of computed font sizes, so any reduction at all can push some piece of type under the
 *  floor and get it inflated back. On an iPhone the fit is 0.30 and a 12px label came back at
 *  29.5px, which put the eyebrow, the body copy, the captions and the slide number all on one
 *  size with the eyebrow clipped, while the 68px headline stayed correct because it was still
 *  over the floor. That is what made it read as a font-size bug in the deck.
 *
 *  Do NOT try to derive this from the type scale. The first version of it was 9 / 12, on the
 *  reasoning that --type-label at 12px is the smallest type on a slide and 0.75 is therefore
 *  where the floor starts. Both halves were wrong: --type-ui at 11px is inside the stage too, on
 *  the mockup slide's chapter bar, and the vendored mockups in mockups/ carry type of their
 *  own down to 9px, which has no headroom at any reduction whatsoever. A 13 inch laptop sits at
 *  about 0.97 and would have been on the wrong side of 0.75 with a live product demo on screen.
 *  There is no safe reduction, so the rule is simply that there are no reductions. */
const TRANSFORM_BELOW = 1;

interface ViewTransition {
  finished?: Promise<void>;
  ready?: Promise<void>;
  updateCallbackDone?: Promise<void>;
}
type ViewTransitionDoc = Document & { startViewTransition?: (cb: () => void) => ViewTransition };

/** Held rather than read once, because `matches` has to be checked at navigation time: a viewer
 *  who turns the setting on mid-deck should get the rest of it without motion. */
const REDUCED_MOTION =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

/** The slide a URL is asking for, as an index into `flat`, or null when it asks for nothing.
 *
 *  The number in the hash is the one printed in the slide's corner, which is also its page in the
 *  PDF. That is deliberate and worth keeping: "12" then means the same slide said down the phone,
 *  read off a printout and typed into an address bar. It counts from 1, hence the -1.
 *
 *  Out of range is clamped rather than refused, so a link to a slide that has since been cut lands
 *  on the nearest real one instead of a blank screen. Anything that is not a plain number is
 *  ignored outright, so a stray fragment cannot quietly move the deck. */
function slideFromHash(count: number): number | null {
  const raw = window.location.hash.replace(/^#/, "");
  if (!/^\d+$/.test(raw)) return null;
  return Math.max(0, Math.min(count - 1, Number(raw) - 1));
}

/** Every write to the address bar goes through here, and it is deliberately unable to fail.
 *
 *  Safari THROWS on the 101st history write in ten seconds ("SecurityError: Attempt to use
 *  history.replaceState() more than 100 times per 10 seconds") where Chrome silently drops it, and
 *  these calls sit in an effect with no error boundary above them, so one uncaught throw unmounts
 *  the React root and the deck goes white mid-meeting. Measured in WebKit against the real bundle:
 *  holding an arrow key down to scrub, at a fast key-repeat setting, killed the deck in under eight
 *  seconds. The debounce at the call site is what keeps us under the limit; this is the promise
 *  that a URL update can never be the thing that ends a presentation.
 *
 *  `n` is the index; the URL carries `n + 1`, the slide's printed number. */
function writeHash(n: number) {
  try { history.replaceState(null, "", `#${n + 1}`); } catch { /* the deck matters, the URL does not */ }
}

// Warm the deck's media in the background so navigation feels instant: fetch everything (a few
// lanes at a time) into the HTTP cache after first paint, and each slide then draws from cache.
//
// This used to warm videos ONLY, on the reasoning that a deck is a few MB. That is true of the
// clips and not of the photography: a showcase image here is 2 to 3MB, and there are eighteen of
// them in one deck. On a client-office network the effect was ugly and completely invisible in
// development. The slide would arrive, its entrance animation would run to completion against an
// empty <img>, the slide would sit blank for a couple of seconds, and then the photograph would
// appear in one hard step with no fade at all, because the fade had already finished.
//
// `priority: "low"` matters. Without it this competes with the images the slide you are actually
// looking at is still loading, and warming slide 12 makes slide 3 slower. Browsers that do not
// know the option ignore it.
function useMediaPrefetch(srcs: string[]) {
  useEffect(() => {
    if (typeof fetch !== "function" || srcs.length === 0) return;
    let cancelled = false;
    const controllers = new Set<AbortController>();
    const queue = [...srcs];
    async function pump() {
      while (!cancelled) {
        const src = queue.shift();
        if (!src) return;
        const ctrl = new AbortController();
        controllers.add(ctrl);
        try {
          const res = await fetch(src, { signal: ctrl.signal, priority: "low" } as RequestInit);
          await res.blob(); // read to completion so the whole file lands in cache
        } catch {
          // best-effort: ignore aborts and network errors
        } finally {
          controllers.delete(ctrl);
        }
      }
    }
    for (let i = 0; i < Math.min(3, srcs.length); i++) pump();
    return () => {
      cancelled = true;
      controllers.forEach((c) => c.abort());
    };
  }, [srcs]);
}

export function SlideShow({ deck }: { deck: Deck }) {
  const { flat, toc } = useMemo(() => buildSlides(deck), [deck]);
  // The slide this session opens on: 0 for a plain link, 11 for one ending in #12. Read once at
  // mount, because it seeds two things that must agree, the first slide shown and where the media
  // prefetch starts.
  const [start] = useState(() => slideFromHash(flat.length) ?? 0);
  // Every file the deck will draw, deduped, in the order this session will reach them, so the ones
  // met first are warmed first. A mockup's assets are absent on purpose: it is a directory of tiles rather than a path,
  // and ShotPlannerEmbed already warms its own on mount.
  const mediaSrcs = useMemo(() => {
    const out: string[] = [];
    // Walked from the slide this session opened on and wrapped around, rather than always from the
    // first. A link to #40 warms 40 onwards first and the slides behind it last, so paging forward
    // out of a deep link draws from cache. Warming in fixed slide order would spend most of a
    // deck's 20 to 30MB on slides the viewer was sent straight past.
    for (let k = 0; k < flat.length; k++) {
      const f = flat[(start + k) % flat.length];
      if (f.kind === "content") {
        if (f.src) out.push(f.src);
        out.push(...(f.images ?? []));
      } else if (f.kind === "showcase") {
        out.push(...f.images);
      } else if (f.kind === "viewer") {
        out.push(...f.images.map((im) => im.src));
      } else if (f.kind === "stack") {
        for (const b of f.blocks) {
          if ("band" in b) out.push(b.band);
          else if ("figure" in b) out.push(b.figure);
        }
      }
    }
    return [...new Set(out)];
  }, [flat, start]);
  useMediaPrefetch(mediaSrcs);
  const [i, setI] = useState(start);
  const [tocOpen, setTocOpen] = useState(false);
  // null = closed; otherwise the image index the inspector opened on.
  const [viewerAt, setViewerAt] = useState<number | null>(null);
  // Claimed by whichever slide has something to reveal before the deck should move on: a
  // mockup with chapters left, a figure with build stages left. Null on every other slide, so
  // the forward key and the forward click behave normally without either handler needing to
  // know the slide kind. One mechanism rather than one per kind.
  const stepRef = useRef<StoryController | null>(null);
  const touch = useCoarsePointer();
  const stageRef = useRef<HTMLDivElement>(null);
  // Light or dark, chosen by whoever is presenting and remembered per deck (see colorScheme.ts).
  const [scheme, setScheme] = useState<ColorScheme>(readStoredScheme);
  // Before paint, so a presenter who left a deck dark does not get one white frame on reopening.
  // The cleanup takes it off again, which matters only for a host that unmounts the slideshow and
  // keeps the page, but costs nothing and means the attribute never outlives the thing that set it.
  useLayoutEffect(() => {
    applyColorScheme(scheme);
    return () => applyColorScheme("light");
  }, [scheme]);
  const toggleScheme = useCallback(() => {
    setScheme((cur) => {
      const next = cur === "dark" ? "light" : "dark";
      storeScheme(next);
      return next;
    });
  }, []);

  // Read inside `show` without making it a dependency, so its identity stays stable across
  // slides and the nav components below do not re-render for a reason that is not theirs.
  const iRef = useRef(0);
  iRef.current = i;
  // Same treatment, and for the same reason: `show` needs to know what KIND of slide it is
  // leaving and arriving at (see the film note in `show`) without taking the slide list as a
  // dependency and re-creating itself on every render.
  const flatRef = useRef(flat);
  flatRef.current = flat;

  /** Move to slide `n`, as one animated beat.
   *
   *  `also` runs in the same beat as the slide change rather than after it. The Contents panel
   *  is the case that needs it: jumping from the panel both moves the deck and closes the panel,
   *  and left as two separate state updates the browser has already taken its "before" snapshot
   *  by the time the second one lands, so the panel vanishes instead of leaving.
   *
   *  The DOM has to be updated SYNCHRONOUSLY inside the callback, hence flushSync: React would
   *  otherwise batch the update until after the browser had captured the "after" state, and the
   *  deck would animate from a state to itself.
   *
   *  Where there is no API (Firefox has not shipped it) this falls through to a plain setState,
   *  and the deck still animates: the copy's own entrance lives in slides.module.css and runs
   *  everywhere. What is lost there is the dissolve between slides, not the motion. */
  const show = useCallback(
    (n: number, also?: () => void) => {
      const next = Math.max(0, Math.min(flat.length - 1, n));
      // Already there, e.g. clicking forward on the last slide. Animating a state to itself
      // costs a third of a second and shows a flash for it.
      if (next === iRef.current) { also?.(); return; }
      const apply = () => { setI(next); also?.(); };
      const doc = document as ViewTransitionDoc;
      if (typeof doc.startViewTransition !== "function" || REDUCED_MOTION?.matches) { apply(); return; }
      // A film gets no dissolve, and this is not a taste call.
      //
      // A <video> is composited on its own layer, and the View Transitions snapshot does not
      // reliably include it. Measured directly: leaving the film slide, the outgoing snapshot
      // came back as flat white (mean luminance 255, standard deviation 0) while the film's own
      // frame at that timestamp is a photograph (mean 84, sd 52). So the picture vanishes for
      // the length of the dissolve and the next slide fades up out of white, which is the
      // "blinking" a full-bleed clip shows on the way in and on the way out.
      //
      // It is a RACE, not a constant: roughly one navigation in ten in a harness, and it lands
      // on the first one after a cold load, when the clip is still being decoded. That is both
      // why it reads as "sometimes" and why a viewer is unusually likely to meet it, since the
      // first time anyone sees the film is by definition a cold load.
      //
      // Skipping the transition removes the snapshot, and with it the thing that can come back
      // blank. A cut is also the right grammar for a full-bleed film, and the copy entrance
      // still runs, so this is exactly what the slide already does in Firefox.
      const from = flatRef.current[iRef.current]?.kind;
      const to = flatRef.current[next]?.kind;
      if (from === "film" || to === "film") { apply(); return; }

      // And no dissolve between two slides that are both led by a photograph.
      //
      // A cross-dissolve shows BOTH states at once for part of its run. That is not a defect,
      // it is the definition of a dissolve, and on type it reads as a soft hand-off. Between two
      // unrelated full-bleed photographs it reads as a double exposure: measured across two
      // consecutive image slides, both pictures and both headings are legible together through
      // the middle of the change. That is the flicker reported on the right-hand image slides.
      //
      // It cannot be tuned out. Shortening the dissolve shortens the overlap without removing
      // it, and the dissolve is already at 260ms against Material's 500ms guidance for a
      // full-screen change, so there is no room left to take. Cutting removes it outright.
      //
      // Only when BOTH sides are media-led: going from a text slide to a photograph has nothing
      // to double-expose against, so that keeps its dissolve.
      const MEDIA_LED = new Set(["showcase", "viewer", "content"]);
      if (MEDIA_LED.has(from as string) && MEDIA_LED.has(to as string)) { apply(); return; }
      const t = doc.startViewTransition(() => flushSync(apply));
      // A presenter clicking quickly starts the next transition before this one has finished,
      // and the browser deals with that by SKIPPING the old one, which means rejecting its
      // promises. Nothing here awaits them, so unhandled that is an "AbortError: Transition was
      // skipped" in the console for every fast keypress. Being skipped is the correct and
      // expected outcome, so acknowledge all three and drop them.
      const hush = () => {};
      t?.finished?.catch(hush);
      t?.ready?.catch(hush);
      t?.updateCallbackDone?.catch(hush);
    },
    [flat.length],
  );

  // Fit the fixed 1280x720 stage to the viewport, and publish the browser-chrome gaps
  // (the parts of the layout viewport hidden behind mobile toolbars) as CSS vars so the
  // overlay controls can stay clear of them. visualViewport is more reliable than
  // window.innerHeight on mobile (dynamic toolbars); we also re-sync on orientation change.
  //
  // Before paint rather than after it, because on a phone the gap between the two is a whole
  // frame of a 1280px stage in a 390px window.
  useLayoutEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    // The fit currently written to the element. Panning a pinched page fires this handler on
    // every frame, and vv.width * vv.scale does not come back bit-identical each time, so
    // without this the stage would be handed a hair-different zoom 60 times a second and
    // relayout the whole slide for a change nobody can see.
    let applied = -1;
    function sync() {
      // Measure the screen as if it were NOT pinched.
      //
      // visualViewport shrinks as the viewer pinches in, so fitting to it directly scaled the
      // stage down by exactly what the browser was scaling it up by, and the two cancelled: the
      // slide sat there refusing to zoom while the nav and the Contents button grew, since those
      // are siblings of the stage and nothing re-fits them. Multiplying by `scale` undoes the
      // pinch, so pinching now magnifies the slide the way it magnifies a photograph.
      //
      // It still tracks a collapsing mobile toolbar, which is what visualViewport is here for:
      // that changes the height and leaves the scale at 1.
      const scale = vv?.scale ?? 1;
      const w = (vv?.width ?? window.innerWidth) * scale;
      const h = (vv?.height ?? window.innerHeight) * scale;
      const k = Math.min(w / 1280, h / 720);
      const el = stageRef.current;
      // WHICH mechanism fits the stage is a property of k, not of the browser: see
      // TRANSFORM_BELOW above and the note in SlideShow.module.css. The class is set here rather
      // than named in JSX so that one function owns the whole fit.
      const byTransform = !SUPPORTS_ZOOM || k < TRANSFORM_BELOW;
      // Re-asserted on every event, outside the guard below, deliberately. React does not touch
      // className while the prop is the constant it is today, but that is a property of the JSX
      // and not a promise, and a transform left on an element that has lost this class is placed
      // by the parent's flex centring instead: half its own size up and to the left. Setting a
      // class it already has costs nothing and does not touch the DOM, whereas the guard below
      // would leave the damage until the next real resize.
      if (el) el.classList.toggle(s.stageScaled, byTransform);
      if (el && Math.abs(k - applied) > 0.0005) {
        applied = k;
        if (byTransform) {
          el.style.zoom = "";
          el.style.transform = `translate(-50%, -50%) scale(${k})`;
        } else {
          el.style.transform = "";
          el.style.zoom = String(k);
        }
      }
      // The toolbar gaps are only meaningful unzoomed. While the page is pinched, vv.offsetTop is
      // where the viewer has panned to rather than the height of a browser toolbar, and feeding
      // that in walks the nav bar up the screen as they pan. Leave the last honest values.
      if (scale > 1.01) return;
      // root.clientHeight is the layout-viewport height; on iOS window.innerHeight returns the
      // *visual* height (already minus the toolbar), which would make these gaps collapse to 0.
      const layoutH = root.clientHeight;
      const top = vv ? Math.max(0, vv.offsetTop) : 0;
      const bottom = vv ? Math.max(0, layoutH - vv.offsetTop - vv.height) : 0;
      root.style.setProperty("--chrome-top", `${top}px`);
      root.style.setProperty("--chrome-bottom", `${bottom}px`);
    }
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
    };
  }, []);

  // Changing slide always closes the inspector, so it can never linger over the wrong slide.
  useEffect(() => { setViewerAt(null); }, [i]);

  // Keep the address bar on the slide being looked at, so copying the URL mid-deck IS the way to
  // link to a slide: nothing to count and nothing to type.
  //
  // replaceState rather than pushState. A sixty-slide deck would otherwise leave sixty entries in
  // the back button, and Back is how somebody LEAVES a deck. It fires no hashchange either, so
  // this cannot feed the listener below, and it touches neither style nor layout, so a slide
  // transition still in flight is unaffected by it.
  //
  // On a timer rather than at once, and the timer is load-bearing: holding an arrow key down to
  // scrub through a deck fires one navigation per slide at the key-repeat rate, up to 33 a second,
  // and Safari throws on the 101st history write in ten seconds (see writeHash). A trailing
  // debounce collapses a whole scrub into a single write, which caps the worst case at 5 writes a
  // second against a limit of 10. Do not remove it, and do not shorten it far.
  useEffect(() => {
    // A deck opened at its plain link and not yet moved keeps that link plain, so what a client is
    // sent stays what they see in the bar until they move. A fragment that names no slide is left
    // alone for the same reason, it is somebody else's and not ours to overwrite. From the first
    // navigation onward the hash tracks every slide, slide 1 included.
    if (i === 0 && slideFromHash(flat.length) === null) return;
    const t = setTimeout(() => writeHash(i), 200);
    return () => clearTimeout(t);
  }, [i, flat.length]);

  // Typing a different number into the address bar moves the deck. The effect above never fires
  // this event, so this only ever runs for something the viewer did to the URL themselves, which
  // includes a Back onto a history entry the deck has not stamped.
  useEffect(() => {
    function onHash() {
      const n = slideFromHash(flat.length);
      // Names no slide, so the deck stays put: a stray fragment must never move what is on screen.
      // The URL is corrected instead, because the one thing that has to stay true is that the bar
      // names the slide being looked at. Back onto the original hash-less entry is exactly this
      // case, and without this the bar would read as the front of the deck with slide 13 on the
      // wall, so the next person sent that URL would land in the wrong place.
      if (n === null) { writeHash(iRef.current); return; }
      // #999 and #0 clamp onto a slide that can be the one already showing, and `show` returns
      // early when it is, so the effect above would never run to tidy the URL. Do it here.
      if (n === iRef.current) { writeHash(n); return; }
      show(n);
    }
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [flat.length, show]);

  // Keyboard navigation.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName || "";
      if (/^(input|textarea)$/i.test(tag)) return;
      if (viewerAt !== null) return;   // the inspector owns the keyboard while it is open
      if (e.key === "Escape") { if (tocOpen) { e.preventDefault(); setTocOpen(false); } return; }
      if (e.key.toLowerCase() === "c") { e.preventDefault(); setTocOpen((o) => !o); return; }
      // `d` for dark, beside `c` and `f` in being a letter: a presenter remote cannot send it, so
      // it can never fire by accident mid-performance, and it is live with Contents open for the
      // same reason `c` is. Modifiers are left alone so Cmd+D still bookmarks.
      if (e.key.toLowerCase() === "d" && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); toggleScheme(); return; }
      if (tocOpen) return;
      // Two verbs, on two sets of keys, split by what is in your hand rather than by symbol.
      //
      //   Space, PageDown   PLAY. Run the next beat of whatever is on this slide (a staged
      //                     figure, a scene, the mockup demo) and move on only once there is
      //                     nothing left to play.
      //   the arrows        NAVIGATE. Always a whole slide, on every slide, no exceptions.
      //
      // A presenter remote sends PageDown and PageUp, so the remote performs; the laptop
      // keyboard is what navigates. That split is the point. The rule before this one was
      // "the keyboard moves slides and only slides", which kept the arrows honest (the key you
      // reach for to leave can never go quiet) at the price of making every reveal mouse-only,
      // and a mouse is the one thing you do not have when you are standing up with a clicker.
      // So the mockup, the value chain and the season maths were unreachable in exactly the
      // room they were built for.
      //
      // Back is deliberately NOT the mirror of forward: PageUp moves a slide like the arrows
      // rather than un-playing a beat. Going forward is the performance and going back is a
      // repair, so back should be big. It is also the only honest option, because a stage is
      // defined going forward only: the acts that run on a timer would restart mid-flight.
      if ([" ", "PageDown"].includes(e.key)) {
        e.preventDefault();
        if (!stepRef.current?.step()) show(i + 1);
      }
      else if (["ArrowRight", "ArrowDown"].includes(e.key)) { e.preventDefault(); show(i + 1); }
      else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); show(i - 1); }
      else if (e.key === "Home") show(0);
      else if (e.key === "End") show(flat.length - 1);
      else if (e.key.toLowerCase() === "f") document.documentElement.requestFullscreen?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, tocOpen, viewerAt, flat.length, show, toggleScheme]);

  const slide = flat[i];

  // Tap to navigate. On touch devices the left third goes back and the rest goes forward;
  // with a mouse, a click always advances.
  function onStageClick(e: ReactMouseEvent) {
    if (tocOpen || viewerAt !== null) return;
    if (touch && e.clientX < window.innerWidth * 0.33) show(i - 1);
    // A click plays a beat and falls through to the next slide once there is nothing left,
    // which is exactly what Space and PageDown do (see the keyboard handler). One line, on
    // purpose: the mouse and the remote are the two ways to perform a slide, and they must not
    // drift apart. The arrows are the third input and the only one that always moves the deck.
    else if (!stepRef.current?.step()) show(i + 1);
  }

  return (
    <>
      {/* data-vt="stage" is what takes the slide dissolve OFF the root capture. See the note
          in transitions.css: WebKit force-clips the root's new-state capture, which puts it on a
          per-frame software snapshot, and this element escapes that. */}
      <div className={s.viewport} data-vt="stage" onClick={onStageClick}>
        {/* No fit in the className: the effect above owns both the class and the inline
            style, so the two can never disagree about which mechanism is in use. */}
        <div className={s.stage} ref={stageRef}>
          {/* `key={i}` remounts on every slide change, which is what makes the entrance
              animations replay and what stops a mockup or a staged figure carrying its
              revealed state over to the next slide. */}
          <SlideBody
            key={i}
            slide={slide}
            deck={deck}
            toc={toc}
            onJump={show}
            onOpenViewer={setViewerAt}
            controllerRef={stepRef}
          />
        </div>
      </div>

      {/* Mounted as a sibling of the stage on purpose: the stage is fitted (zoom or transform,
          see the fit effect above), so anything inside it inspects at the stage's resolution
          rather than the screen's,
          and its pointer coordinates arrive pre-scaled. Out here the viewer owns the real
          viewport. It also sits outside the viewport's click-to-advance handler. */}
      {slide.kind === "viewer" && viewerAt !== null && (
        <Viewer images={slide.images} startAt={viewerAt} download={slide.download}
                onClose={() => setViewerAt(null)} />
      )}

      <SegNav toc={toc} flatLength={flat.length} current={i} onJump={show} />

      <Toc
        toc={toc}
        current={i}
        open={tocOpen}
        onToggle={() => setTocOpen((o) => !o)}
        onClose={() => setTocOpen(false)}
        onJump={(idx) => show(idx, () => setTocOpen(false))}
        scheme={scheme}
        onToggleScheme={toggleScheme}
      />
    </>
  );
}
