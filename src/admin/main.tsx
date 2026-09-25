import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EditApp } from "./EditApp";
import "@engine/tokens.css";       // the deck's own tokens: the thumbnails are real slides
import "@active-fonts";
import "./edit-chrome.css";

// The deck being edited is injected by the /admin edge function, never fetched. That is the
// same rule the deck index follows: this bundle is public code on the CDN, and every word of
// deck copy arrives inside the password-gated HTML. Nothing about any deck sits on the CDN
// for someone to find by guessing a URL.
const boot = (window as unknown as { __EDIT__: Parameters<typeof EditApp>[0]["boot"] }).__EDIT__;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EditApp boot={boot} />
  </StrictMode>,
);
