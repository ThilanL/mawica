// Dev-only visual regression check for the snow globe: renders fixed, deterministic views of the real model (render-gallery.mjs, headless
// Chrome on the GPU) and compares them with the approved baselines in docs/screenshots/snow-globe/baseline/. Needs the dev server.
//   node scripts/globe/visual-regression.mjs            compare (exit code 1 if any view changed more than the threshold)
//   node scripts/globe/visual-regression.mjs --update   accept the current renders as the new baselines
// Every view is a pure function of its time (?t=, ?storm=), so differences mean the model or its lighting changed, not timing.
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const BASE_DIR = "docs/screenshots/snow-globe/baseline";
const VIEWS = ["01-front-hero", "02-front-three-quarter", "05-rear", "09-mobile-quality", "c06-storm-3s", "c09-reduced-motion"];
const THRESHOLD = Number(process.env.THRESHOLD || 1.5); // % of pixels allowed to differ (GPU rasterisation varies very slightly)
const update = process.argv.includes("--update");

const out = mkdtempSync(join(tmpdir(), "globe-vr-"));
execFileSync("node", ["scripts/globe/render-gallery.mjs", ...VIEWS], { env: { ...process.env, OUT: out }, stdio: "inherit" });
mkdirSync(BASE_DIR, { recursive: true });

/** Fraction of pixels whose colour moved by more than 24/255 in any channel, compared at 600 px wide. */
async function diff(a, b) {
  const load = (f) => sharp(f).resize({ width: 600 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const [x, y] = await Promise.all([load(a), load(b)]);
  if (x.info.height !== y.info.height) return 100;
  let changed = 0;
  for (let i = 0; i < x.data.length; i += 3) if (Math.max(Math.abs(x.data[i] - y.data[i]), Math.abs(x.data[i + 1] - y.data[i + 1]), Math.abs(x.data[i + 2] - y.data[i + 2])) > 24) changed++;
  return (changed / (x.data.length / 3)) * 100;
}

// baselines are stored at the comparison width (600 px, lossless PNG): small enough to keep in git, nothing lost for the check
const keep = (from, to) => sharp(from).resize({ width: 600 }).png({ compressionLevel: 9 }).toFile(to);

let failed = 0;
for (const v of VIEWS) {
  const now = join(out, `${v}.png`), base = join(BASE_DIR, `${v}.png`);
  if (update || !existsSync(base)) { await keep(now, base); console.log(`baseline ${base}`); continue; }
  const pct = await diff(now, base), ok = pct <= THRESHOLD;
  if (!ok) { failed++; await keep(now, join(BASE_DIR, `${v}.actual.png`)); }
  console.log(`${ok ? "ok  " : "FAIL"} ${v}: ${pct.toFixed(2)}% of pixels changed (limit ${THRESHOLD}%)`);
}
process.exit(failed ? 1 : 0);
