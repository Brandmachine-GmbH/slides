import type { TocSection } from "./types";
import type { ColorScheme } from "./colorScheme";
import s from "./Toc.module.css";

// Drawn inline rather than taken from lucide-react, which the mockups already use: the engine
// keeps lucide out of the deck's main chunk on purpose (see the note on mockups in slides.tsx),
// and two icons are not worth pulling it into every deck.
const MOON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>;
const SUN = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>;

interface Props {
  toc: TocSection[];
  current: number;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onJump: (index: number) => void;
  scheme: ColorScheme;
  onToggleScheme: () => void;
}

export function Toc({ toc, current, open, onToggle, onClose, onJump, scheme, onToggleScheme }: Props) {
  const cls = (base: string, active: boolean) => `${base}${active ? ` ${s.current}` : ""}`;
  return (
    <>
      <div
        className={`${s.scrim} ${open ? s.scrimOpen : ""}`}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      />
      <aside className={`${s.panel} ${open ? s.panelOpen : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className={s.head}>Contents</div>
        <nav className={s.nav}>
          <button className={cls(`${s.item} ${s.lvl0}`, current === 0)} onClick={() => onJump(0)}>Title</button>
          {toc.length > 1 && (
            <button className={cls(`${s.item} ${s.lvl0}`, current === 1)} onClick={() => onJump(1)}>Overview</button>
          )}
          {toc.map((sec) => (
            <div className={s.group} key={sec.dividerIndex}>
              <button className={cls(`${s.item} ${s.section}`, current === sec.dividerIndex)} onClick={() => onJump(sec.dividerIndex)}>
                {sec.title}
              </button>
              {sec.items.map((it) => (
                <button key={it.index} className={cls(`${s.item} ${s.slide}`, current === it.index)} onClick={() => onJump(it.index)}>
                  {it.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      {/* data-vt is on the group, not the button, so both buttons hold still together through a
          slide change (transitions.css). */}
      <div className={s.dock} data-vt="contents">
        {/* The icon names where the button takes you, the usual convention for a scheme switch,
            and the title says it in words for anyone who hovers. */}
        <button
          className={`${s.btn} ${s.scheme}`}
          aria-label={scheme === "dark" ? "Switch to light (d)" : "Switch to dark (d)"}
          title={scheme === "dark" ? "Light (d)" : "Dark (d)"}
          onClick={(e) => { e.stopPropagation(); onToggleScheme(); }}
        >
          {scheme === "dark" ? SUN : MOON}
        </button>
        <button className={s.btn} onClick={(e) => { e.stopPropagation(); onToggle(); }}>Contents</button>
      </div>
    </>
  );
}
