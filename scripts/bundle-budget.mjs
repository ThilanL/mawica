// Bundle guard: measures the JavaScript each page loads up front (gzip) against budgets, and checks that no AR code is in a card page's initial load.
// Run against a production build:  npm run build && npx next start -p 3030   then   BASE=http://localhost:3030 CARD=<published card slug> node scripts/bundle-budget.mjs
// Exits 1 if a budget is exceeded or AR code leaks into an initial bundle.
import { gzipSync } from "node:zlib";

const BASE = process.env.BASE || "http://localhost:3030";
// KB gzip. Set from the Phase 2E.3 / AR-1 measurements (/ 191.9, /create 222.4, /sign-in 185.5, card 181.5 after AR-1d) with ~1 KB headroom.
const BUDGET = { "/": 193, "/create": 223.5, "/sign-in": 186.5 };
const CARD_BUDGET = 182.5;
// Strings that only exist in the on-demand AR chunks (WebXR scene, USDZ export, wish panel). They must never be in a page's initial scripts.
const AR_ONLY = ["model/vnd.usdz+zip", "wish_panel", "mawica_ar_root", "requestHitTestSource"];

async function measure(path) {
  const html = await (await fetch(BASE + path)).text();
  const srcs = [...new Set([...html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/g)].map((m) => m[1]))];
  let gz = 0, leaks = [];
  for (const s of srcs) {
    const body = Buffer.from(await (await fetch(new URL(s, BASE))).arrayBuffer());
    gz += gzipSync(body).length;
    const text = body.toString("utf8");
    leaks.push(...AR_ONLY.filter((k) => text.includes(k)).map((k) => `${k} in ${s}`));
  }
  return { kb: gz / 1024, scripts: srcs.length, leaks };
}

let failed = false;
const pages = Object.entries(BUDGET);
if (process.env.CARD) pages.push([`/c/${process.env.CARD}`, CARD_BUDGET]);
else console.log("(set CARD=<published card slug> to also check a card page)");
for (const [path, budget] of pages) {
  const r = await measure(path);
  const ok = r.kb <= budget && r.leaks.length === 0;
  failed ||= !ok;
  console.log(`${ok ? "ok  " : "FAIL"} ${path.padEnd(18)} ${r.kb.toFixed(1)} KB gzip (budget ${budget}) · ${r.scripts} scripts${r.leaks.length ? ` · AR code in initial load: ${r.leaks.join(", ")}` : ""}`);
}
process.exit(failed ? 1 : 0);
