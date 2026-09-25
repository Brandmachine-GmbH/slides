// The deck index at /admin, behind a real password.
//
// This runs on Netlify's edge (Deno) before anything is served. The hub HTML never
// sits on the CDN at all: it is compiled into this function by build.mjs, so without
// a valid cookie there is nothing to fetch, view-source, or scrape. That is the whole
// difference from the client-side gate, where the content shipped and the check was
// decoration.
//
// FAILS CLOSED. Missing env vars, a bad token, any thrown error: deny. The one thing
// this must never do is serve the list by accident.
//
// Env vars (Netlify UI or `netlify env:set`):
//   ADMIN_PASSWORD  the passphrase you type
//   AUTH_SECRET     random string used to sign the session cookie
import { BRAND } from "./lib/brand.js";
import { HUB_HTML } from "./lib/hub.js";
import { editorHtml } from "./lib/editor.js";

// One shared password and no username, and the code saying so is public, so guessing is the
// attack. 30 a minute per IP is far above anyone clicking around the hub and far below a script.
export const config = {
  path: ["/admin", "/admin/*"],
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip", "domain"] },
};

const COOKIE = "bm_admin";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days, so it behaves like a bookmark
const enc = new TextEncoder();

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Constant-time compare. Only ever called on two HMACs, which are fixed length, so
 *  the early length return cannot leak anything about the password itself. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function issue(secret: string): Promise<string> {
  const exp = Date.now() + MAX_AGE * 1000;
  return `${exp}.${await hmac(secret, `admin|${exp}`)}`;
}

async function valid(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return same(sig, await hmac(secret, `admin|${exp}`));
}

function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
}

const setCookie = (v: string, age: number) =>
  `${COOKIE}=${v}; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;

const page = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...headers },
  });

function login(msg = ""): string {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${BRAND.name}</title><style>
html,body{height:100%;margin:0;display:grid;place-items:center;background:#fff;color:#181b1b;
 font-family:"Inter",system-ui,-apple-system,sans-serif}
form{width:min(90vw,340px);text-align:center}
p.m{font-weight:700;font-size:20px;letter-spacing:-.6px;margin:0 0 26px;text-transform:lowercase}
input{width:100%;padding:13px 15px;border:1px solid #dcdcdc;border-radius:12px;font:inherit;
 font-size:15px;text-align:center;outline:none}
input:focus{border-color:#181b1b}
p.h{color:#737373;font-size:13px;margin:14px 0 0}
p.e{color:#c62828;font-size:13px;margin:14px 0 0}
</style></head><body><form method="POST" action="/admin">
<p class="m">${BRAND.name}</p>
<input name="password" type="password" autocomplete="current-password" autofocus placeholder="Passcode">
${msg ? `<p class="e">${msg}</p>` : `<p class="h">Enter the passcode.</p>`}
</form></body></html>`;
}

export default async function handler(req: Request): Promise<Response> {
  try {
    const secret = Deno.env.get("AUTH_SECRET");
    const password = Deno.env.get("ADMIN_PASSWORD");
    // Fail closed: an unconfigured deploy serves nothing rather than everything.
    if (!secret || !password) {
      return page("<p>Not configured.</p>", 503);
    }

    const url = new URL(req.url);

    if (url.pathname === "/admin/logout") {
      return page("", 303, { Location: "/admin", "Set-Cookie": setCookie("", 0) });
    }

    if (req.method === "POST") {
      const form = await req.formData();
      const given = String(form.get("password") ?? "").trim();
      // Compare HMACs, not the raw strings: equal length regardless of input.
      const ok = same(await hmac(secret, `pw|${given}`), await hmac(secret, `pw|${password}`));
      if (!ok) return page(login("That passcode did not work."), 401);
      return page("", 303, { Location: "/admin", "Set-Cookie": setCookie(await issue(secret), MAX_AGE) });
    }

    if (!(await valid(readCookie(req, COOKIE), secret))) return page(login(), 401);

    // Past this line the request is authenticated.
    //
    // /admin/edit/<deck> serves the editor with that deck's full content inlined. It is one
    // more page behind the same cookie, so the deck copy it carries is no more exposed than
    // the passcodes the index already prints. The bundle it loads from /_admin/ is public
    // code and holds nothing.
    const edit = /^\/admin\/edit\/([a-z0-9-]+)\/?$/.exec(url.pathname);
    if (edit) {
      const html = editorHtml(edit[1]);
      return html ? page(html) : page("<p>No such deck.</p>", 404);
    }

    return page(HUB_HTML);
  } catch {
    // Never fall through to the origin, which would serve the list unprotected.
    return page("<p>Unavailable.</p>", 503);
  }
}
