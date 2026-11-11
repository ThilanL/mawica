// Dev-only: builds the side-by-side visual review sheets from the BEFORE and AFTER screenshots (docs/screenshots/catalogue/{before,after}).
//   node scripts/catalogue-compare.mjs
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const D = "docs/screenshots/catalogue";
mkdirSync(`${D}/review`, { recursive: true });
const KEYS = { "snow-globe": "Christmas Snow Globe", "christmas-tree": "Magical Christmas Tree", "special-gift": "A Special Gift", "warm-wishes": "Warm Christmas Wishes", "new-year-2027": "New Year 2027", "new-year-celebration": "New Year Celebration" };
const label = (text, w, h = 34, bg = "#2a1b3d") => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${bg}"/><text x="14" y="${h * 0.68}" font-family="Helvetica, Arial, sans-serif" font-size="${h * 0.46}" font-weight="700" fill="#fff3d6">${text}</text></svg>`);

// 1) catalogue before | after (desktop and mobile)
for (const vp of ["desktop", "mobile"]) {
  const a = await sharp(`${D}/before/catalogue-${vp}.webp`).png().toBuffer(), b = await sharp(`${D}/after/catalogue-${vp}.webp`).png().toBuffer();
  const ma = await sharp(a).metadata(), mb = await sharp(b).metadata();
  const h = Math.max(ma.height, mb.height), W = ma.width + mb.width + 24;
  await sharp({ create: { width: W, height: h + 40, channels: 3, background: "#2a1b3d" } })
    .composite([{ input: label("BEFORE: flat vector thumbnails", ma.width), left: 0, top: 0 }, { input: label("AFTER: 3D-rendered thumbnails", mb.width), left: ma.width + 24, top: 0 }, { input: a, left: 0, top: 40 }, { input: b, left: ma.width + 24, top: 40 }])
    .webp({ quality: 82 }).toFile(`${D}/review/catalogue-before-after-${vp}.webp`);
}

// 2) per-card sheet: thumbnails, then the four moments after, then the four before
const BEFORE_TILE = { "snow-globe": [160, 80], "christmas-tree": [487, 80], "special-gift": [813, 80], "warm-wishes": [160, 424], "new-year-2027": [487, 424], "new-year-celebration": [813, 424] };
for (const [key, title] of Object.entries(KEYS)) {
  const [tx, ty] = BEFORE_TILE[key];
  const beforeThumb = await sharp(`${D}/before/catalogue-desktop.webp`).extract({ left: tx, top: ty, width: 306, height: 192 }).resize(512, 320).png().toBuffer();
  const afterThumb = await sharp(`public/art/catalogue/${key}-16x10-640.webp`).resize(512, 320).png().toBuffer();
  const W = 4 * 270 + 3 * 10, tiles = [];
  tiles.push({ input: label(`${title}`, W, 40), left: 0, top: 0 });
  tiles.push({ input: label("catalogue thumbnail: BEFORE", 512, 28, "#4b2f6c"), left: 0, top: 40 }, { input: beforeThumb, left: 0, top: 68 });
  tiles.push({ input: label("catalogue thumbnail: AFTER", 512, 28, "#4b2f6c"), left: 528, top: 40 }, { input: afterThumb, left: 528, top: 68 });
  let y = 68 + 320 + 16;
  for (const [row, dir] of [["AFTER", "after"], ["BEFORE", "before"]]) {
    tiles.push({ input: label(`${row}: opening · main animation · personalised greeting · final`, W, 28, row === "AFTER" ? "#2f6b4f" : "#6b2f4f"), left: 0, top: y }); y += 32;
    for (const [i, m] of ["1-opening", "2-main", "3-greeting", "4-final"].entries()) {
      const input = await sharp(`${D}/${dir}/${key}-${m}-mobile.webp`).resize({ width: 270 }).png().toBuffer();
      tiles.push({ input, left: i * 280, top: y });
    }
    y += Math.round(270 * (1688 / 780)) + 14;
  }
  await sharp({ create: { width: W, height: y, channels: 3, background: "#150c24" } }).composite(tiles).webp({ quality: 80 }).toFile(`${D}/review/${key}.webp`);
  console.log(`${D}/review/${key}.webp`);
}
