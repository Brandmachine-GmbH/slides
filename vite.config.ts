import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import ts from "typescript";
import { createReadStream, existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// One build per deck. build.mjs sets VITE_DECK; each build emits dist/<slug>/ with
// base "/<slug>/". Only the selected deck's data is bundled (via the @deck alias).
const root = dirname(fileURLToPath(import.meta.url));
// Two roots. `root` is this package, wherever it is installed; `userRoot` is the site being
// built, which holds decks/, brand.json and the output. They are the same folder nowhere: in a
// site the package sits under node_modules, and in this repo the site is template/. The `slides`
// command sets SLIDES_ROOT; anything run by hand falls back to the current directory.
// Real path, because Vite reports module ids by their real path: through a symlink, stripJobs'
// prefix test against decks/ missed every deck and only check-leaks stopped the jobs shipping.
const userRoot = realpathSync(process.env.SLIDES_ROOT || process.cwd());
const decksDir = join(userRoot, "decks");

const allDecks = readdirSync(decksDir, { withFileTypes: true })
  // A half-made deck folder with no slug.txt yet is skipped by build.mjs, so it must not be
  // picked here either as the fallback deck the editor build borrows.
  .filter((d) => d.isDirectory() && existsSync(join(decksDir, d.name, "slug.txt")))
  .map((d) => d.name);

const deck = process.env.VITE_DECK || allDecks[0];
const slug = readFileSync(join(decksDir, deck, "slug.txt"), "utf8").trim();

// PDF-export builds (VITE_EXPORT=1, used by scripts/export-pdf.mjs): render the whole deck as
// stacked print pages and use static TTF fonts so Chromium embeds them as small vector fonts.
// Off for every live deck build, so the deployed site is unaffected.
const isExport = !!process.env.VITE_EXPORT;

// The admin editor build (VITE_ADMIN=1, run once by build.mjs): one bundle at /_admin/ that can
// render ANY deck's slides, rather than one bundle per deck. It ships no deck content at all;
// the deck being edited is injected into the page by the gated edge function, which is what
// keeps every word of deck copy off the CDN. See src/admin/EditApp.tsx.
const isAdmin = !!process.env.VITE_ADMIN;

// Who this deck site belongs to. See the @brand alias below for why this is JSON rather than a
// module: build.mjs and the Netlify edge function read the same file with no TypeScript step.
const brandFile = existsSync(join(userRoot, "brand.json"))
  ? join(userRoot, "brand.json")
  : join(root, "src/engine/brand.example.json");
const brand = JSON.parse(readFileSync(brandFile, "utf8")) as { name: string };

/* The browser tab's title, from brand.json like every other name on this site.
 *
 * The HTML carries a placeholder rather than the real name, so a file that somehow misses this
 * transform is visibly wrong instead of quietly showing the wrong company's name on somebody
 * else's deck. Both entry documents (the deck and the editor) go through it. */
function brandHtml(): PluginOption {
  return {
    name: "brand-html",
    transformIndexHtml: (html: string) => html.replaceAll("%BRAND_NAME%", brand.name),
  };
}

// In dev the app requests static media at /videos/* and /images/* (BASE_URL is "/"), but they
// live under decks/<deck>/ and are only copied into dist/<slug>/ at build time. Serve them from
// the selected deck's folder during dev, with HTTP range support (Safari needs it for video).
const MIME: Record<string, string> = {
  ".mp4": "video/mp4", ".webm": "video/webm",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml",
};
function deckMedia(): PluginOption {
  const deckDir = join(decksDir, deck);
  const roots = ["/videos/", "/images/"];
  return {
    name: "serve-deck-media",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!roots.some((r) => url.startsWith(r))) return next();
        let file: string;
        try { file = normalize(join(deckDir, decodeURIComponent(url))); } catch { return next(); }
        // Inside the media folder the URL named, not merely inside the deck: `..%2f` would
        // otherwise reach the deck's own internal.json and slug.txt, and a bare prefix test lets
        // decks/acme reach decks/acme-pricing. This runs before Vite's host check, so a
        // DNS-rebinding page could have read either.
        if (!roots.some((r) => file.startsWith(join(deckDir, r.slice(1, -1)) + sep)) || !existsSync(file)) return next();
        const { size } = statSync(file);
        const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
        res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
        res.setHeader("Accept-Ranges", "bytes");
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
        if (range) {
          const start = range[1] ? parseInt(range[1], 10) : 0;
          const end = range[2] ? parseInt(range[2], 10) : size - 1;
          res.statusCode = 206;
          res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
          res.setHeader("Content-Length", end - start + 1);
          createReadStream(file, { start, end }).pipe(res);
        } else {
          res.setHeader("Content-Length", size);
          createReadStream(file).pipe(res);
        }
      });
    },
  };
}

/* lucide-react imports, rewritten to one file per icon.
 *
 * The package's entry re-exports all ~1500 icons, and Rollup transforms every one of them before
 * tree-shaking throws all but the few dozen we use away. That happened once per deck build, so
 * it was most of the build's time (measured 7 Oct 2026: 2040 modules per deck, ~1500 of them
 * icons). Pointing each named import at its own icon file skips the barrel entirely; the output
 * is byte-for-byte the same icons.
 *
 * The name-to-file map is read from the package's own entry rather than derived from the name,
 * because lucide's aliases (AlarmCheck and AlarmClockCheck are one file) do not follow from
 * kebab-casing. A name the map does not know, or a type-only import, stays on the barrel import,
 * so a lucide upgrade can make the build slower again but never wrong. */
function lucideIcons(): PluginOption {
  const files = new Map<string, string>();
  try {
    // lucide-react is the SITE's dependency (its mockups use it; the engine draws its two icons
    // inline), so it is found from the site's package.json, wherever npm put it.
    const pkgJson = createRequire(join(userRoot, "package.json")).resolve("lucide-react/package.json");
    const esm = join(dirname(pkgJson), "dist", "esm");
    const entry = readFileSync(join(esm, "lucide-react.js"), "utf8");
    for (const m of entry.matchAll(/export \{([^}]*)\} from '\.\/icons\/([^']+)'/g)) {
      for (const n of m[1].matchAll(/default as (\w+)/g)) files.set(n[1], join(esm, "icons", m[2]));
    }
  } catch { /* no map: every import stays on the barrel, as before */ }
  const IMPORT = /import\s*\{([^}]*)\}\s*from\s*["']lucide-react["'];?/g;
  return {
    name: "lucide-per-icon",
    enforce: "pre",
    transform(code, id) {
      if (!files.size || id.includes("node_modules") || !/\.[jt]sx?$/.test(id) || !code.includes("lucide-react")) return;
      const out = code.replace(IMPORT, (_all, list: string) => {
        const direct: string[] = [];
        const rest: string[] = [];
        for (const raw of list.split(",").map((x) => x.trim()).filter(Boolean)) {
          const [name, local] = raw.split(/\s+as\s+/);
          const file = files.get(name);
          if (raw.startsWith("type ") || !file) rest.push(raw);
          else direct.push(`import ${local ?? name} from ${JSON.stringify(file)};`);
        }
        return [...direct, rest.length ? `import { ${rest.join(", ")} } from "lucide-react";` : ""].join("\n");
      });
      return out === code ? undefined : { code: out, map: null };
    },
  };
}

// Every `job` in a deck.ts is emptied before the deck is bundled.
//
// WHY THIS IS NOT A CONVENTION. Comments in deck.ts are safe because minification removes them,
// which is the whole reason internal reasoning is written there. A `job` is DATA, so nothing
// removes it: it would be compiled into dist/<slug>/ and read by whoever holds the link. And a
// job is written in exactly the register of those comments ("concede the first two points, they
// already pay someone for that"), so shipping one is the same class of mistake as shipping
// internal.json.
//
// HOW. The value is replaced, not the property, and the replacement is padded to the original
// length with newlines kept. So every offset in the file is unchanged and every later line still
// starts where it did, which means no printer, no reformat, and sourcemaps that still point at
// the right lines. Deleting the property instead would mean also finding its comma and shifting
// everything after it, and a mistake there is a syntax error in a client's deck at build time.
// What lands in the bundle is `job:""`, eight bytes a slide, containing nothing.
//
// The parse is TypeScript's own, so a job spanning several concatenated lines, holding a brace,
// or quoted any of three ways is found exactly. scripts/check-leaks.mjs then greps dist/ for the
// real strings, because a transform nobody verifies is a convention with extra steps.
function stripJobs(): PluginOption {
  return {
    name: "strip-deck-jobs",
    enforce: "pre",
    transform(code, id) {
      const file = normalize(id.split("?")[0]);
      if (!file.startsWith(normalize(decksDir)) || !file.endsWith("deck.ts")) return null;

      const src = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
      const cuts: { start: number; end: number }[] = [];
      const visit = (n: ts.Node) => {
        if (
          ts.isPropertyAssignment(n) &&
          (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name)) &&
          n.name.text === "job"
        ) {
          cuts.push({ start: n.initializer.getStart(src), end: n.initializer.getEnd() });
          return;                                   // a job cannot contain another job
        }
        ts.forEachChild(n, visit);
      };
      ts.forEachChild(src, visit);
      if (!cuts.length) return null;

      let out = code;
      // Back to front, so an earlier replacement cannot move a later offset.
      for (const c of cuts.reverse()) {
        const body = code.slice(c.start, c.end);
        let blank = '""';
        for (let i = 2; i < body.length; i++) blank += body[i] === "\n" ? "\n" : " ";
        out = out.slice(0, c.start) + blank + out.slice(c.end);
      }
      return { code: out, map: null };
    },
  };
}

// A site's own runtime dependencies (framer-motion for a mockup, say), from its package.json.
// See optimizeDeps below for why they have to be named rather than discovered.
const userDeps = (() => {
  const f = join(userRoot, "package.json");
  if (!existsSync(f)) return [];
  const deps = Object.keys(JSON.parse(readFileSync(f, "utf8")).dependencies ?? {});
  // Only what resolves to code: a types-only package (@types/node installed without -D) has no
  // entry, and naming it here stopped the dev server from starting at all.
  const req = createRequire(f);
  return deps.filter((d) => {
    if (d === "@brandmachine/slides" || d === "react" || d === "react-dom" || d.startsWith("@types/")) return false;
    try { req.resolve(d); return true; } catch { return false; }
  });
})();

export default defineConfig(({ command }) => ({
  // The entry HTML is the package's, so Vite's root is the package and the site is reached
  // through the aliases below plus this allowance to serve files from it.
  root,
  server: { fs: { allow: [root, userRoot] } },
  // Dependency discovery is OFF, which is not the default and not optional. Every alias here
  // resolves into node_modules once the package is installed, so discovery took @engine and
  // @site-mockups for third-party packages and pre-bundled a second copy of each, and the
  // reload that caused left two Reacts on the page. What discovery would have found for real
  // is named instead: React, and whatever the site itself depends on.
  optimizeDeps: {
    noDiscovery: true,
    include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", ...userDeps],
  },
  base: isAdmin ? "/_admin/" : command === "build" ? `/${slug}/` : "/",
  plugins: [lucideIcons(), react(), deckMedia(), stripJobs(), brandHtml()],
  define: {
    __EXPORT__: JSON.stringify(isExport),
    // The editor cannot draw deck-local scenes (see @deck-scenes below), so it needs to say
    // "custom slide" rather than "missing", which on a healthy deck would be a lie.
    __ADMIN__: JSON.stringify(isAdmin),
    // The deck's folder name, which is the client's, and the only human-readable name of a deck
    // that exists at runtime: the URL is a UUID and deck.ts holds copy rather than an identity.
    // It names a downloaded zip and is used for nothing else. Empty in the admin build, which
    // has no deck selected and never offers a download anyway.
    __DECK__: JSON.stringify(isAdmin ? "" : deck),
  },
  resolve: {
    alias: [
      // The package's own name imports the public surface (see src/engine/index.ts), the same
      // things @engine/types and friends reach. A regex for an exact match, so that
      // "@brandmachine/slides/netlify" is left to Node's resolution.
      { find: /^@brandmachine\/slides$/, replacement: join(root, "src/engine/index.ts") },
      ...Object.entries({
        "@engine": join(root, "src/engine"),
        "@deck": join(decksDir, deck, "deck.ts"),
        // A deck's own scenes: components that belong to ONE client rather than to the engine.
        //
        // Resolved per build, so one deck's bundle contains that deck's scenes and nobody else's.
        // A glob from the engine would have worked and would have put every deck's scene chunks in
        // every deck's dist/, which is one client's code sitting at another client's URL.
        //
        // The admin editor builds with no deck selected and gets the empty registry, so a
        // deck-local scene shows as a placeholder card there rather than a preview. That is the
        // price of /_admin/ being ONE public bundle that carries no deck content, and it is the
        // reason scenes lived in the engine until now. Copy stays editable either way, because
        // copy lives in deck.ts, not in the component.
        "@deck-scenes": !isAdmin && existsSync(join(decksDir, deck, "scenes", "index.ts"))
          ? join(decksDir, deck, "scenes", "index.ts")
          : join(root, "src/engine/scenes/none.ts"),
        // The site's mockup registry: driven embeds of some other interface, which belong to
        // whoever owns this repo rather than to the engine. Resolved rather than globbed so the
        // engine's own source tree is not the registry, which is what used to force a product UI
        // to live under src/.
        //
        // NOT conditioned on isAdmin, unlike @deck-scenes. A mockup is site-level, so there is
        // exactly one registry and the editor can draw it; a scene belongs to one deck and the
        // editor has no deck. That asymmetry is the whole reason the editor shows real mockup
        // thumbnails and a placeholder card for a deck-local scene.
        // Who this deck site belongs to: the wordmark, the gate copy, the page titles and the
        // live domain. One file, because these used to be nine literals spread across the engine,
        // build.mjs and the edge function, and there was no way to tell from any one of them that
        // the other eight existed. brand.json rather than brand.ts so build.mjs and the Netlify
        // edge function can read the same values without a TypeScript step.
        "@brand": brandFile,
        // Kept separate from @brand because it is an asset, not data: Vite has to fingerprint it
        // and hand back a URL, which it cannot do for a string sitting inside a JSON file.
        "@brand-logo": existsSync(join(userRoot, "brand", "logo.svg"))
          ? join(userRoot, "brand", "logo.svg")
          : join(root, "src/engine/assets/example-mark.svg"),
        "@site-mockups": existsSync(join(userRoot, "mockups", "index.ts"))
          ? join(userRoot, "mockups", "index.ts")
          : join(root, "src/engine/mockups-none.ts"),
        "@active-fonts": join(root, "src/engine", isExport ? "fonts-static.css" : "fonts-variable.css"),
        // The site's own tokens, loaded after the engine's so an override is a plain CSS rule.
        "@site-theme": existsSync(join(userRoot, "theme.css"))
          ? join(userRoot, "theme.css")
          : join(root, "src/engine/theme-none.css"),
        "@export-css": join(root, "src/engine", isExport ? "export.css" : "export-noop.css"),
      }).map(([find, replacement]) => ({ find, replacement })),
    ],
  },
  build: {
    outDir: isAdmin ? join(userRoot, "dist", "_admin") : join(userRoot, "dist", slug),
    emptyOutDir: true,
    // build.mjs needs the hashed asset filenames to write the editor's <script> and <link>
    // into the edge function.
    manifest: isAdmin,
    rollupOptions: isAdmin ? { input: join(root, "src/admin/index.html") } : {},
    // Both of these are already Vite's defaults. They are pinned because the privacy of a
    // deck depends on them, and a default is not a guarantee.
    //
    // Every deck.ts carries internal commentary: who a deck is for, what we deliberately do
    // not say on a slide, what we know about the client that they have not told us. Minifying
    // strips comments, so none of it ships. Sourcemaps would ship the original file, comments
    // and all, to a URL the client already has. scripts/check-leaks.mjs fails the build if
    // either protection is ever lost.
    minify: "esbuild",
    sourcemap: false,
  },
}));
