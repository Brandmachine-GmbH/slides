/// <reference types="vite/client" />

declare module "@deck" {
  import type { Deck } from "@engine/types";
  const deck: Deck;
  export default deck;
}

// CSS side-effect imports resolved by aliases in vite.config.ts.
declare module "@active-fonts";
declare module "@export-css";

// Build-time flag injected via vite.config.ts `define`. true only in PDF-export builds.
declare const __EXPORT__: boolean;

// A deck's own scenes, resolved per build by the "@deck-scenes" alias: to
// decks/<deck>/scenes/index.ts for a deck build, and to an empty registry for the admin editor,
// which builds with no deck selected. See the note in vite.config.ts.
declare module "@deck-scenes" {
  import type { ComponentType } from "react";
  import type { SceneProps } from "@engine/types";
  const scenes: Record<string, ComponentType<SceneProps>>;
  export default scenes;
}

// The site's mockup registry, resolved by "@site-mockups" to mockups/index.ts, or to an empty
// registry for a site that has none. Unlike @deck-scenes this does NOT vary per deck: a mockup
// is site-level, which is why the editor can draw one and cannot draw a deck-local scene.
declare module "@site-mockups" {
  import type { ComponentType } from "react";
  import type { EmbedProps } from "@engine/types";
  const mockups: Record<string, ComponentType<EmbedProps>>;
  export default mockups;
}

// Who this deck site belongs to, resolved by "@brand" to brand.json, or to the engine's neutral
// example for a site that has not written one. See the note in vite.config.ts.
declare module "@brand" {
  import type { Brand } from "@engine/types";
  const brand: Brand;
  export default brand;
}

// The wordmark, resolved by "@brand-logo" to brand/logo.svg, or to the engine's neutral mark.
declare module "@brand-logo" {
  const src: string;
  export default src;
}

// true only in the /_admin/ editor build, which cannot draw deck-local scenes and says so.
declare const __ADMIN__: boolean;

// The deck folder this bundle was built for, e.g. "example". Names a downloaded zip; see
// Deck.downloads. Empty string in the admin build.
declare const __DECK__: string;
