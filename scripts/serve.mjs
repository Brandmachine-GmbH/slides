// The whole site on localhost: every deck, /admin, and /admin/edit/<deck>.
//
// WHY THIS EXISTS. `npm run dev` serves exactly one deck, because a deck build is selected by
// VITE_DECK and the dev server is that build. So the two things you cannot see that way are the
// admin index and the copy editor, which are not part of any deck: they are an edge function
// whose HTML is compiled into netlify/edge-functions/lib/ at build time. `make admin` pulls the
// index out as a static file and `make admin-live` runs the real edge function, but that one
// needs the Netlify CLI installed globally. This needs nothing that is not already in the repo.
//
// WHAT IT IS NOT. There is no hot reload here. It serves dist/, so it shows you exactly what
// gets deployed, and a change means running it again. For writing slides, `make dev <deck>` is
// still the right tool: it reloads as you type and this does not.
//
// NO PASSWORD. Deliberately. In production /admin sits behind ADMIN_PASSWORD and this serves
// every deck and every internal note to whoever asks, which is why it binds to 127.0.0.1 and
// not to 0.0.0.0: nobody else on your network, in a cafe or an office, can reach it. If you
// want the real gate exercised, that is what `make admin-live` is for.
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { dirname, join, normalize, extname, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const port = Number(process.env.PORT) || 8888;

if (!existsSync(join(dist, "index.html"))) {
  console.error("\n  dist/ is empty or missing. Run `make build` first (or use `make serve`,\n"
    + "  which builds and then serves).\n");
  process.exit(1);
}

// The two generated modules the edge function serves from. They are built by build.mjs and are
// server-side only, which is exactly the role this process is playing.
const libDir = join(root, "netlify", "edge-functions", "lib");
const { HUB_HTML } = await import(pathToFileURL(join(libDir, "hub.js")).href);
const { editorHtml, EDITOR_DECKS } = await import(pathToFileURL(join(libDir, "editor.js")).href);

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml",
  ".mp4": "video/mp4", ".webm": "video/webm", ".woff2": "font/woff2",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon", ".txt": "text/plain",
};

const html = (body, status = 200) => ({ status, body,
  headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

const server = createServer((req, res) => {
  // Binding to 127.0.0.1 keeps other machines out but not a web page you have open: it can point
  // its own hostname at 127.0.0.1 (DNS rebinding) and read the hub with every slug and note.
  // Such a request still carries the attacker's hostname, so anything else is refused.
  const host = (req.headers.host ?? "").replace(/:\d+$/, "");
  if (host !== "localhost" && host !== "127.0.0.1") { res.writeHead(403); return res.end("no"); }
  try { handle(req, res); } catch { if (!res.headersSent) res.writeHead(400); res.end(); }
});

function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  const path = decodeURIComponent(url.pathname);

  // ---- the admin edge function, minus the password ----------------------------------------
  if (path === "/admin" || path === "/admin/") {
    const { status, body, headers } = html(HUB_HTML);
    res.writeHead(status, headers);
    return res.end(body);
  }
  const edit = /^\/admin\/edit\/([a-z0-9-]+)\/?$/.exec(path);
  if (edit) {
    const page = editorHtml(edit[1]);
    const r = page
      ? html(page)
      : html(`<p style="font:16px system-ui;padding:40px">No deck called <b>${edit[1]}</b>.`
        + ` Try: ${EDITOR_DECKS.join(", ")}</p>`, 404);
    res.writeHead(r.status, r.headers);
    return res.end(r.body);
  }

  // ---- everything else is a file in dist/ --------------------------------------------------
  let file = normalize(join(dist, path));
  if (file !== dist && !file.startsWith(dist + sep)) { res.writeHead(403); return res.end("no"); }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) {
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    return res.end(`<p style="font:16px system-ui;padding:40px">Not found. `
      + `<a href="/admin">Go to /admin</a></p>`);
  }

  const { size } = statSync(file);
  res.setHeader("Content-Type", MIME[extname(file).toLowerCase()] ?? "application/octet-stream");
  res.setHeader("Cache-Control", "no-store");

  // Range support, because Safari will not play an mp4 without it and seeking needs it in every
  // browser. Same rule the dev server's media plugin follows (see deckMedia in vite.config.ts).
  res.setHeader("Accept-Ranges", "bytes");
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (range) {
    const start = range[1] ? parseInt(range[1], 10) : 0;
    const end = range[2] ? parseInt(range[2], 10) : size - 1;
    res.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { "Content-Length": size });
  createReadStream(file).pipe(res);
}

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n  Port ${port} is already in use. Either stop what is on it, or:\n`
      + `      PORT=8899 make serve\n`);
    process.exit(1);
  }
  throw err;
});

// 127.0.0.1, not 0.0.0.0. See the note at the top: there is no password on any of this.
server.listen(port, "127.0.0.1", () => {
  const example = EDITOR_DECKS[0] ?? "<deck>";
  const pad = (s) => s.padEnd(Math.max(26, example.length + 13));
  console.log(`\n  Serving dist/ at http://localhost:${port}   (${EDITOR_DECKS.length} decks)\n`);
  console.log(`    ${pad("/admin")} the index: every deck, and Edit copy`);
  console.log(`    ${pad(`/admin/edit/${example}`)} straight into one deck's editor`);
  console.log(`\n  No password locally, and nothing outside this machine can reach it.`);
  console.log(`  This serves dist/ as built, so re-run after changing a deck.`);
  console.log(`  For writing slides with hot reload, use \`make dev <deck>\` instead.`);
  console.log(`\n  Ctrl-C to stop.\n`);
});
