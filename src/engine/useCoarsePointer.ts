import { useEffect, useState } from "react";

/**
 * True when the primary pointing device is touch (phones, tablets), false for a mouse or
 * trackpad (desktop). This is the modern, user-agent-free way to tell "touch" from "desktop":
 * it asks the browser about the actual input device via the `(pointer: coarse)` media query,
 * and stays correct across devices that UA sniffing gets wrong (touch laptops, iPads, etc.).
 *
 * Reactive: re-renders if the primary input changes (e.g. a mouse is attached to a tablet).
 * For layout differences prefer plain CSS `@media (pointer: coarse)`; reach for this hook only
 * when behaviour has to branch in JS.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const onChange = () => setCoarse(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return coarse;
}
