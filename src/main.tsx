import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import deck from "@deck";
import { App } from "@engine/App";
import "@engine/tokens.css";
import "@active-fonts"; // variable woff2 for live decks, static TTF for PDF export (see vite.config.ts)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App deck={deck} />
  </StrictMode>,
);
