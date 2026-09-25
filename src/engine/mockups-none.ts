// The empty mockup registry.
//
// `@site-mockups` resolves here for a site with no mockups/index.ts of its own, and for the
// admin editor. Having a real module to point at is what lets slides.tsx import the registry
// unconditionally instead of guarding every use of it, the same reason scenes/none.ts exists.
import type { ComponentType } from "react";
import type { EmbedProps } from "./types";

const none: Record<string, ComponentType<EmbedProps>> = {};
export default none;
