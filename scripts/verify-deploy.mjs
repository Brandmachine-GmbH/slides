// Post-deploy safety check. Run after publishing:  node scripts/verify-deploy.mjs
//
// The point of this file: /admin is protected by an edge function, and if that function
// ever fails to attach, Netlify quietly serves whatever is behind it with no gate and
// nothing on screen would tell you. This asserts the gate is actually there.
//
// Exits non-zero on failure so it can gate a deploy in CI.
//
// The default comes from brand.json rather than a literal here, so a fork checks its own site
// instead of silently reporting that ours is healthy.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const brandFile = existsSync(join(repoRoot, "brand.json"))
  ? join(repoRoot, "brand.json")
  : join(repoRoot, "src", "engine", "brand.example.json");
const SITE = process.argv[2] || JSON.parse(readFileSync(brandFile, "utf8")).siteUrl;
let failed = 0;

const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};

console.log(`verifying ${SITE}\n`);

// 1. /admin must challenge, and must not leak the list to an unauthenticated caller.
const admin = await fetch(`${SITE}/admin`, { redirect: "manual" });
const adminBody = await admin.text();
check("/admin challenges", admin.status === 401 || admin.status === 503,
      `status ${admin.status}`);
check("/admin serves a login form", /name="password"/.test(adminBody));
check("/admin does not leak the deck list", !/passcode <b>/.test(adminBody));
check("/admin does not leak a slug", !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(adminBody));
check("/admin is not cached", (admin.headers.get("cache-control") || "").includes("no-store"),
      admin.headers.get("cache-control") || "none");

// 2. A wrong password must not hand out a session.
const bad = await fetch(`${SITE}/admin`, {
  method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: "password=definitely-not-the-password",
});
check("wrong password rejected", bad.status === 401 || bad.status === 503, `status ${bad.status}`);
check("wrong password sets no cookie", !bad.headers.get("set-cookie"));

// 3. The root must stay neutral.
const root = await fetch(SITE);
const rootBody = await root.text();
check("root reveals no slug", !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(rootBody));

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
