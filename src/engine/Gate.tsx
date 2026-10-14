import { useRef, useState, type FormEvent } from "react";
import brand from "@brand";
import logo from "@brand-logo";
import s from "./Gate.module.css";

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");

export function Gate({
  passcodes,
  onUnlock,
}: {
  passcodes: string[];
  onUnlock: () => void;
}) {
  // A passcode with no Latin letters or digits normalises to "", which an empty submit would
  // match, so a deck passcoded in another script would open on Enter. Dropped instead.
  const ok = passcodes.map(norm).filter(Boolean);
  const [err, setErr] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (ok.includes(norm(inputRef.current?.value || ""))) {
      onUnlock();
      return;
    }
    setErr(true);
    setShake(false);
    requestAnimationFrame(() => setShake(true));
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.focus();
    }
  }

  return (
    // data-gate names each part for a site's theme.css. The class names are CSS Modules hashes
    // that change between builds, so without these a site could only reach what the tokens
    // reach. Renaming one breaks every site that styles it: treat them as public API.
    <div className={`${s.gate} ${shake ? s.shake : ""}`} data-gate="screen">
      <div className={s.box} data-gate="box">
        {/* The site's brand/logo.svg, or the engine's neutral mark when it has none (the
            @brand-logo alias in vite.config.ts), the same file the slides' wordmark uses. A
            site that wants no logo here hides [data-gate="logo"] in its theme.css. */}
        <img className={s.logo} src={logo} alt={brand.name} data-gate="logo" />
        <p className={s.eyebrow} data-gate="eyebrow">{brand.gate.eyebrow}</p>
        <h1 className={s.h1} data-gate="heading" dangerouslySetInnerHTML={{ __html: brand.gate.headingHtml }} />
        <p className={s.hint} data-gate="hint">{brand.gate.hint}</p>
        <form onSubmit={submit} autoComplete="off" className={s.form} data-gate="form">
          <input
            ref={inputRef}
            type="password"
            placeholder={brand.gate.placeholder ?? "Password"}
            autoFocus
            aria-label="Passcode"
            className={s.input}
            data-gate="input"
          />
          <button type="submit" className={s.btn} data-gate="button">
            {brand.gate.button ?? "Enter"}
          </button>
        </form>
        <div className={s.err} style={{ opacity: err ? 1 : 0 }} data-gate="error">
          {brand.gate.error ?? "Hmm, not quite."}
        </div>
      </div>
    </div>
  );
}
