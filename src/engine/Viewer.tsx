import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ViewerImage } from "./types";
import { saveBlob, saveUrl, uniqueNames, zipStore } from "./download";
import v from "./Viewer.module.css";

/** The file's own name, which is what somebody downloading it should end up with: it is the name
 *  the deck ships, the name any earlier delivery of the same file used, and the only one that
 *  means anything once the file is out of this deck.
 *
 *  Not percent-decoded, and that is deliberate rather than an omission. These paths are the
 *  literal strings out of deck.ts with the deck's base in front, never a URL read back from the
 *  DOM, so there is nothing to decode: decoding could only corrupt a name that genuinely
 *  contains a percent sign, and decodeURIComponent throws outright on one ("100%.jpg") which
 *  would take the button silently dead. */
const baseName = (src: string) =>
  src.split(/[?#]/)[0].split("/").pop() || "image";

/** What a zip of one slide's images should be called: the deck's name and the folder its images
 *  came out of, e.g. <deck>-frames.zip.
 *
 *  Derived rather than authored, and the folder is the half that earns its keep. A deck can have
 *  two downloadable viewer slides; named from the deck alone, both would arrive as
 *  <deck>-images.zip and the browser would silently rename the second. Where the images do
 *  not share one folder there is nothing honest to say about them together, so it falls back. */
function zipName(images: ViewerImage[]): string {
  const dirs = new Set(images.map((im) => im.src.slice(0, im.src.lastIndexOf("/"))));
  const folder = dirs.size === 1 ? [...dirs][0].split("/").filter(Boolean).pop() ?? "" : "";
  const deck = __DECK__ || "deck";
  return `${deck}-${folder && folder !== "images" ? folder : "images"}.zip`;
}

/** Full-viewport image inspector: tabs, pan, zoom.
 *
 *  WHY IT LIVES OUTSIDE THE STAGE
 *  The deck stage is a fixed 1280x720 box fitted to the viewport with CSS zoom. Anything
 *  rendered inside it is capped at that resolution and its pointer coordinates come back
 *  pre-scaled. The viewer is mounted as a sibling of the stage instead, so it owns the real
 *  viewport and inspects at true device pixels.
 *
 *  HOW ZOOMING STAYS FAST AND STILL LOOKS SHARP
 *  Two techniques are usually presented as either/or:
 *    - transform: scale()   compositor-only, 60fps, but the layer is rasterised once and
 *                           stretched, so it goes soft as you zoom in.
 *    - width/height in px   the browser draws straight from the decoded bitmap at the new
 *                           size, so it is always sharp, but every frame costs layout.
 *  This does both. While a gesture is running the canvas carries a single transform (fast,
 *  and cheap because one composited layer moves). ~180ms after the gesture stops, the
 *  current scale is baked into the images' width/height and the transform scale resets to
 *  1. Nothing moves on screen, but the frame after the bake is re-rastered sharp.
 *
 *  will-change is applied only during a gesture. Pinning it permanently keeps the layer
 *  alive at its old raster scale, which is exactly the softness we are avoiding, and costs
 *  memory on large images.
 *
 *  All images share one canvas and therefore one scale and one pan. That is deliberate:
 *  switching tabs then compares like for like instead of resetting the view. */
export function Viewer({ images, startAt, download, onClose }: {
  images: ViewerImage[]; startAt: number; download?: boolean; onClose: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState(startAt);
  const [ready, setReady] = useState(0);
  const [bg, setBg] = useState(0);
  const [hud, setHud] = useState({ z: 1, w: 0, h: 0 });
  // "working" while a zip is being assembled, "failed" after a fetch that did not come back.
  // A button that goes quiet for four seconds and then quiet again on failure is the one thing
  // worse than no button, and this is the only action here that is not instant.
  const [zip, setZip] = useState<"idle" | "working" | "failed">("idle");

  // Natural sizes, filled in as the files decode. Index-aligned with `images`.
  const nat = useRef<{ w: number; h: number }[]>([]);
  // View state is a ref, not state: pointer and wheel handlers write it many times per
  // frame and must not queue a React render each time. The DOM is written directly.
  const view = useRef({ tx: 0, ty: 0, z: 1, base: 1 });
  const prev = useRef(startAt);
  const bakeTimer = useRef<number | undefined>(undefined);

  const BGS = ["#3a3a3a", "#808080", "#ffffff", "#000000", "#f8f3ed"];

  /** The width every image is laid out at when zoom is 1.0. Locking to the first image
   *  means a 6000px master and a 2200px render line up instead of jumping. */
  const refW = () => nat.current[0]?.w || 1000;

  /** Push the view to the DOM. Transform only, so this stays on the compositor. */
  const paint = useCallback(() => {
    const { tx, ty, z, base } = view.current;
    if (canvasRef.current) {
      canvasRef.current.style.transform =
        `translate3d(${tx}px, ${ty}px, 0) scale(${z / base})`;
    }
  }, []);

  /** Bake the live scale into layout so the next raster is sharp. Visually a no-op:
   *  transform-origin is 0 0 and translate is applied before scale, so the canvas
   *  top-left stays at (tx, ty) whichever way the scale is expressed. */
  const bake = useCallback(() => {
    const st = view.current;
    if (st.base === st.z || !canvasRef.current) return;
    st.base = st.z;
    const w = refW() * st.base;
    canvasRef.current.querySelectorAll("img").forEach((im, k) => {
      const n = nat.current[k];
      if (!n) return;
      im.style.width = `${w}px`;
      im.style.height = `${(w * n.h) / n.w}px`;
    });
    paint();
  }, [paint]);

  /** Mark a gesture as finished: drop will-change so the browser is free to re-raster,
   *  then bake. Called on every gesture end and debounced during wheel zooming. */
  const settle = useCallback(() => {
    window.clearTimeout(bakeTimer.current);
    bakeTimer.current = window.setTimeout(() => {
      canvasRef.current?.style.setProperty("will-change", "auto");
      bake();
      setHud((h) => ({ ...h, z: view.current.z }));
    }, 180);
  }, [bake]);

  const gestureStart = () => canvasRef.current?.style.setProperty("will-change", "transform");

  const fit = useCallback(() => {
    const st = stageRef.current, n = nat.current[cur];
    if (!st || !n) return;
    const rw = refW();
    const pad = 48;
    const z = Math.min((st.clientWidth - pad) / rw, (st.clientHeight - pad) / ((rw * n.h) / n.w));
    view.current.z = z;
    view.current.tx = (st.clientWidth - rw * z) / 2;
    view.current.ty = (st.clientHeight - ((rw * z * n.h) / n.w)) / 2;
    paint();
    gestureStart();
    settle();
  }, [cur, paint, settle]);

  /** Zoom to an absolute factor, keeping the stage centre fixed. */
  const setZ = useCallback((nz: number) => {
    const st = stageRef.current;
    if (!st) return;
    const cx = st.clientWidth / 2, cy = st.clientHeight / 2, s = view.current;
    s.tx = cx - (cx - s.tx) * (nz / s.z);
    s.ty = cy - (cy - s.ty) * (nz / s.z);
    s.z = nz;
    paint();
    gestureStart();
    settle();
  }, [paint, settle]);

  // Preload. Every image is mounted at once and toggled with visibility, so switching
  // tabs is instant and never shows a blank frame mid-presentation.
  useEffect(() => {
    let alive = true;
    images.forEach((it, k) => {
      const im = new Image();
      im.onload = () => {
        if (!alive) return;
        nat.current[k] = { w: im.naturalWidth, h: im.naturalHeight };
        setReady((r) => r + 1);
      };
      im.onerror = () => { if (alive) setReady((r) => r + 1); };
      im.src = it.src;
    });
    return () => { alive = false; };
  }, [images]);

  // Fit once every file has reported its size, so the first frame is already framed.
  const allIn = ready >= images.length;
  useLayoutEffect(() => { if (allIn) fit(); }, [allIn]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setHud({ z: view.current.z, w: nat.current[cur]?.w || 0, h: nat.current[cur]?.h || 0 });
  }, [cur, allIn]);

  // Pointer pan and pinch. Pointer events cover mouse, trackpad and touch in one path.
  useEffect(() => {
    const st = stageRef.current;
    if (!st) return;
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0;

    const down = (e: PointerEvent) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      st.setPointerCapture(e.pointerId);
      st.classList.add(v.dragging);
      gestureStart();
      window.clearTimeout(bakeTimer.current);
    };

    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const s = view.current;
      if (pts.size === 1) {
        s.tx += e.clientX - p.x;
        s.ty += e.clientY - p.y;
      }
      p.x = e.clientX; p.y = e.clientY;

      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const r = st.getBoundingClientRect();
        const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
        if (pinch) {
          const nz = Math.max(0.02, Math.min(16, s.z * (d / pinch)));
          s.tx = mx - (mx - s.tx) * (nz / s.z);
          s.ty = my - (my - s.ty) * (nz / s.z);
          s.z = nz;
        }
        pinch = d;
      }
      paint();
    };

    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = 0;
      if (!pts.size) { st.classList.remove(v.dragging); settle(); }
    };

    // Trackpad pinch arrives as ctrlKey+wheel; plain wheel zooms too, which is what people
    // expect in an image viewer and costs nothing since the deck never scrolls.
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = view.current, r = st.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const k = e.ctrlKey ? Math.exp(-e.deltaY / 100) : e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const nz = Math.max(0.02, Math.min(16, s.z * k));
      s.tx = mx - (mx - s.tx) * (nz / s.z);
      s.ty = my - (my - s.ty) * (nz / s.z);
      s.z = nz;
      gestureStart();
      paint();
      settle();
    };

    st.addEventListener("pointerdown", down);
    st.addEventListener("pointermove", move);
    st.addEventListener("pointerup", up);
    st.addEventListener("pointercancel", up);
    st.addEventListener("wheel", wheel, { passive: false });
    return () => {
      st.removeEventListener("pointerdown", down);
      st.removeEventListener("pointermove", move);
      st.removeEventListener("pointerup", up);
      st.removeEventListener("pointercancel", up);
      st.removeEventListener("wheel", wheel);
    };
  }, [paint, settle]);

  /** The frame on screen, straight from the server. No fetch and no Blob: the browser streams it
   *  to disk itself, which also means the file lands byte for byte as delivered, metadata and
   *  colour profile included. */
  const saveOne = useCallback(() => {
    const im = images[cur];
    if (im) saveUrl(im.src, baseName(im.src));
  }, [images, cur]);

  /** Every image on this slide, as one zip. The deck warms all of them into the HTTP cache on
   *  load (see useMediaPrefetch in SlideShow), so in a room this is normally instant. */
  const saveAll = useCallback(async () => {
    setZip("working");
    try {
      const names = uniqueNames(images.map((im) => baseName(im.src)));
      const files = await Promise.all(images.map(async (im, k) => {
        const res = await fetch(im.src);
        if (!res.ok) throw new Error(String(res.status));
        return { name: names[k], data: await res.arrayBuffer() };
      }));
      saveBlob(zipStore(files), zipName(images));
      setZip("idle");
    } catch (err) {
      // The button says "failed" and cannot say why. Somebody standing in front of a client with
      // a laptop can open the console; a swallowed error leaves them nothing to open.
      console.error("[deck] download failed", err);
      setZip("failed");
    }
  }, [images]);

  const go = useCallback((k: number) => {
    setCur((c) => { if (k !== c) prev.current = c; return (k + images.length) % images.length; });
  }, [images.length]);

  // The deck's own key handler is suppressed while this is mounted (see SlideShow), so
  // arrows cycle images here rather than changing slide.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "Escape") { e.preventDefault(); onClose(); return; }
      e.stopPropagation();
      if (k === " ") { e.preventDefault(); go(prev.current); }
      else if (k >= "1" && k <= "9") { const n = +k - 1; if (n < images.length) go(n); }
      else if (k === "0") setZ(1);
      else if (k === "ArrowRight" || k === "ArrowDown") go(cur + 1);
      else if (k === "ArrowLeft" || k === "ArrowUp") go(cur - 1);
      else if (k.toLowerCase() === "f") fit();
      else if (k.toLowerCase() === "b") setBg((b) => (b + 1) % BGS.length);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [cur, go, fit, setZ, onClose, images.length, BGS.length]);

  const it = images[cur];
  const pct = hud.w ? Math.round(((refW() * hud.z) / hud.w) * 100) : 0;

  return (
    <div className={v.root}>
      <div className={v.tabs}>
        {images.map((im, k) => (
          <button key={im.src} className={`${v.tab}${k === cur ? ` ${v.on}` : ""}`}
                  onClick={() => go(k)}>
            <span className={v.k}>{k + 1}</span>
            <span className={v.label}>{im.label}</span>
            {im.sub && <span className={v.sub}>{im.sub}</span>}
          </button>
        ))}
        <button className={v.close} onClick={onClose} aria-label="Close">Close esc</button>
      </div>

      <div className={v.stage} ref={stageRef} style={{ background: BGS[bg] }}>
        <div className={v.canvas} ref={canvasRef}>
          {images.map((im, k) => (
            <img key={im.src} src={im.src} alt={im.label} draggable={false}
                 style={{ visibility: k === cur ? "visible" : "hidden" }} />
          ))}
        </div>
        {!allIn && <div className={v.loading}>loading {images.length} images…</div>}
      </div>

      <div className={v.bar}>
        <b>{it?.label}</b>
        <span>{hud.w ? `${hud.w} × ${hud.h}` : ""}</span>
        <span>{pct ? `${pct}% of native` : ""}</span>
        <button className={v.btn} onClick={fit}>Fit <kbd>F</kbd></button>
        <button className={v.btn} onClick={() => setZ(1)}>1:1 <kbd>0</kbd></button>
        <button className={v.btn} onClick={() => setZ(2)}>2×</button>
        <button className={v.btn} onClick={() => setZ(4)}>4×</button>
        <button className={v.btn} onClick={() => setBg((b) => (b + 1) % BGS.length)}>BG <kbd>B</kbd></button>
        {download && (
          <>
            <i className={v.sep} />
            <button className={`${v.btn} ${v.dl}`} onClick={saveOne}>
              <DownIcon /> Download
            </button>
            {images.length > 1 && (
              <button className={`${v.btn} ${v.dl}`} onClick={saveAll} disabled={zip === "working"}>
                <DownIcon />
                {zip === "working" ? "Preparing…"
                  : zip === "failed" ? "Failed, try again"
                  : `All ${images.length} as .zip`}
              </button>
            )}
          </>
        )}
        <span className={v.hint}>drag to pan · wheel to zoom · <kbd>1</kbd>–<kbd>9</kbd> switch · <kbd>space</kbd> A/B</span>
      </div>
    </div>
  );
}

/** Tray-and-arrow, the icon every browser uses for this, at the size of the type beside it. */
function DownIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v11M7.5 10L12 14.5 16.5 10M4 20h16" />
    </svg>
  );
}
