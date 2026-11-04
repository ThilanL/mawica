/** Validates supplied Batch 1 artwork against src/content/artManifest.ts. Usage: npm run art:check */
import { existsSync, statSync } from "node:fs";
import sharp from "sharp";
import { batch1 } from "../src/content/artManifest";

let missing = 0, bad = 0;
for (const a of batch1) {
  if (!existsSync(a.file)) { console.log(`MISSING  ${a.id}  ${a.file}  (${a.width}x${a.height}, ${a.alpha ? "alpha" : "opaque"}, <= ${a.maxKB} KB)`); missing++; continue; }
  const problems: string[] = [];
  const kb = statSync(a.file).size / 1024;
  const m = await sharp(a.file).metadata();
  if (m.format !== "webp") problems.push(`format ${m.format}, expected webp`);
  if (m.width !== a.width || m.height !== a.height) problems.push(`size ${m.width}x${m.height}, expected ${a.width}x${a.height}`);
  if (a.alpha && !m.hasAlpha) problems.push("no alpha channel");
  if (!a.alpha && m.hasAlpha) {
    const { channels } = await sharp(a.file).stats();
    if (channels[3] && channels[3].min < 255) problems.push("opaque asset contains transparent pixels");
  }
  if (kb > a.maxKB) problems.push(`${kb.toFixed(0)} KB over budget ${a.maxKB} KB`);
  if (problems.length) { console.log(`FAIL     ${a.id}  ${a.file}: ${problems.join("; ")}`); bad++; }
  else console.log(`OK       ${a.id}  ${a.file}  ${kb.toFixed(0)} KB`);
}
console.log(`\n${batch1.length - missing - bad} ok, ${bad} failing, ${missing} missing of ${batch1.length}`);
process.exit(bad ? 1 : 0);
