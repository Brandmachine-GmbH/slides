// The password-gated /admin index and copy editor. The logic is in the package, so a fix to it
// arrives with `npm update`; this file only hands it what `slides build` generated into lib/.
// Set ADMIN_PASSWORD and AUTH_SECRET in Netlify's environment variables.
import { adminHandler } from "@brandmachine/slides/netlify";
import { BRAND } from "./lib/brand.js";
import { HUB_HTML } from "./lib/hub.js";
import { editorHtml } from "./lib/editor.js";

export default adminHandler({ BRAND, HUB_HTML, editorHtml });

// Stays here as a literal: Netlify reads it from this file. One shared password, and the code
// saying so is public, so the rate limit is what makes guessing it impractical.
export const config = {
  path: ["/admin", "/admin/*"],
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
