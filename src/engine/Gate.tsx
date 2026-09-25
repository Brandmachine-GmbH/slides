import { useRef, useState, type FormEvent } from "react";
import brand from "@brand";
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
    <div className={`${s.gate} ${shake ? s.shake : ""}`}>
      <div className={s.box}>
        <p className={s.eyebrow}>{brand.gate.eyebrow}</p>
        <h1 className={s.h1} dangerouslySetInnerHTML={{ __html: brand.gate.headingHtml }} />
        <p className={s.hint}>{brand.gate.hint}</p>
        <form onSubmit={submit} autoComplete="off" className={s.form}>
          <input
            ref={inputRef}
            type="password"
            placeholder="Password"
            autoFocus
            aria-label="Passcode"
            className={s.input}
          />
          <button type="submit" className={s.btn}>
            Enter
          </button>
        </form>
        <div className={s.err} style={{ opacity: err ? 1 : 0 }}>
          Hmm, not quite.
        </div>
      </div>
    </div>
  );
}
